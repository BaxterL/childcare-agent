import { deployPlan, resolveDeployProfile } from "@childcare/pipeline";

export type ProviderId = "deepseek" | "ollama";

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ModelStatus {
  provider: ProviderId;
  connected: boolean;
  installed: boolean;
  model: string;
  url: string;
}

export interface AnswerResult {
  provider: ProviderId;
  model: string;
}

interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface OllamaConfig {
  baseUrl: string;
  model: string;
  contextTokens: number;
}

const MODEL_TIMEOUT_MS = 180_000;
const MAX_OUTPUT_TOKENS = 1100;

function envText(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function deepseekConfig(): DeepSeekConfig {
  return {
    apiKey: envText("DEEPSEEK_API_KEY", ""),
    baseUrl: envText("DEEPSEEK_BASE_URL", "https://api.deepseek.com").replace(/\/$/, ""),
    model: envText("DEEPSEEK_MODEL", "deepseek-chat"),
  };
}

function ollamaConfig(): OllamaConfig {
  const parsed = Number.parseInt(process.env.OLLAMA_CONTEXT_TOKENS ?? "", 10);
  return {
    baseUrl: envText("OLLAMA_BASE_URL", "http://127.0.0.1:11434").replace(/\/$/, ""),
    model: envText("OLLAMA_MODEL", "qwen3:8b"),
    contextTokens: Number.isFinite(parsed) ? Math.max(4096, Math.min(16384, parsed)) : 8192,
  };
}

/**
 * Answer providers only. Retrieval uses the local embedding model and never
 * this list. Ollama is off unless CHILDCARE_MODEL_PROVIDER=ollama.
 */
export function resolveProviderOrder(
  env: { CHILDCARE_MODEL_PROVIDER?: string; DEEPSEEK_API_KEY?: string; CHILDCARE_DEPLOY?: string } = process.env,
): ProviderId[] {
  const preferred = (env.CHILDCARE_MODEL_PROVIDER ?? "auto").trim().toLowerCase();
  const hasDeepSeek = Boolean(env.DEEPSEEK_API_KEY && env.DEEPSEEK_API_KEY.trim());
  const ollamaFallback = deployPlan(resolveDeployProfile(env.CHILDCARE_DEPLOY)).ollamaFallback;
  const ordered: ProviderId[] = [];
  const push = (id: ProviderId): void => {
    if (!ordered.includes(id)) ordered.push(id);
  };

  if (preferred === "ollama") {
    push("ollama");
    return ordered;
  }
  if (preferred === "deepseek") {
    if (hasDeepSeek) push("deepseek");
    else if (ollamaFallback) push("ollama");
    return ordered;
  }
  if (hasDeepSeek) push("deepseek");
  if (ollamaFallback) push("ollama");
  return ordered;
}

/** Read an OpenAI-compatible SSE body, forwarding each `data:` payload. */
async function readSseStream(body: ReadableStream<Uint8Array>, onData: (data: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    onData(trimmed.slice(5).trim());
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
      if (done) break;
    }
    if (buffer.trim()) handleLine(buffer);
  } finally {
    reader.releaseLock();
  }
}

async function streamDeepSeek(
  messages: ChatMessage[],
  signal: AbortSignal,
  onToken: (text: string) => void,
): Promise<AnswerResult> {
  const config = deepseekConfig();
  if (!config.apiKey) throw new Error("DEEPSEEK_API_KEY 未配置");
  const combined = AbortSignal.any([signal, AbortSignal.timeout(MODEL_TIMEOUT_MS)]);
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: 0.2,
      max_tokens: MAX_OUTPUT_TOKENS,
    }),
    signal: combined,
  });
  if (!response.ok || !response.body) throw new Error(`DeepSeek HTTP ${response.status}`);

  await readSseStream(response.body, (data) => {
    if (!data || data === "[DONE]") return;
    let event: { choices?: Array<{ delta?: { content?: string } }>; error?: { message?: string } };
    try {
      event = JSON.parse(data) as typeof event;
    } catch {
      return;
    }
    if (event.error?.message) throw new Error(event.error.message);
    const text = event.choices?.[0]?.delta?.content;
    if (text) onToken(text);
  });
  return { provider: "deepseek", model: config.model };
}

async function streamOllama(
  messages: ChatMessage[],
  signal: AbortSignal,
  onToken: (text: string) => void,
): Promise<AnswerResult> {
  const config = ollamaConfig();
  const combined = AbortSignal.any([signal, AbortSignal.timeout(MODEL_TIMEOUT_MS)]);
  const response = await fetch(`${config.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      think: false,
      keep_alive: "10m",
      options: { temperature: 0.2, num_ctx: config.contextTokens, num_predict: MAX_OUTPUT_TOKENS },
    }),
    signal: combined,
  });
  if (!response.ok || !response.body) throw new Error(`Ollama HTTP ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as { message?: { content?: string }; error?: string };
        if (event.error) throw new Error(event.error);
        if (event.message?.content) onToken(event.message.content);
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const event = JSON.parse(buffer) as { message?: { content?: string }; error?: string };
      if (event.error) throw new Error(event.error);
      if (event.message?.content) onToken(event.message.content);
    }
  } finally {
    reader.releaseLock();
  }
  return { provider: "ollama", model: config.model };
}

/**
 * Stream an answer, trying providers in order. A provider that fails before
 * emitting any token falls through to the next one; once output has started we
 * never retry, so the user is not shown two partial answers.
 */
export async function streamChat(
  messages: ChatMessage[],
  signal: AbortSignal,
  onToken: (text: string) => void,
): Promise<AnswerResult> {
  const order = resolveProviderOrder();
  if (order.length === 0) throw new Error("没有可用的模型提供方");
  let lastError: unknown;
  for (const provider of order) {
    let emitted = false;
    const wrapped = (text: string): void => {
      emitted = true;
      onToken(text);
    };
    try {
      return provider === "deepseek"
        ? await streamDeepSeek(messages, signal, wrapped)
        : await streamOllama(messages, signal, wrapped);
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
      if (emitted) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("模型服务不可用");
}

async function probeOllama(config: OllamaConfig): Promise<{ connected: boolean; installed: boolean }> {
  try {
    const response = await fetch(`${config.baseUrl}/api/tags`, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return { connected: false, installed: false };
    const body = (await response.json()) as { models?: Array<{ name?: string }> };
    const installed = (body.models ?? []).some(
      (model) => model.name === config.model || model.name?.startsWith(`${config.model}:`),
    );
    return { connected: true, installed };
  } catch {
    return { connected: false, installed: false };
  }
}

async function probeDeepSeek(config: DeepSeekConfig): Promise<boolean> {
  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function modelStatus(): Promise<ModelStatus> {
  const preferred = (process.env.CHILDCARE_MODEL_PROVIDER ?? "auto").trim().toLowerCase();
  const primary = preferred === "ollama" ? "ollama" : "deepseek";
  if (primary === "deepseek") {
    const config = deepseekConfig();
    const connected = await probeDeepSeek(config);
    return { provider: "deepseek", connected, installed: true, model: config.model, url: config.baseUrl };
  }
  const config = ollamaConfig();
  const probe = await probeOllama(config);
  return { provider: "ollama", connected: probe.connected, installed: probe.installed, model: config.model, url: config.baseUrl };
}
