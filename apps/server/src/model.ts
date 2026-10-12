export type ProviderId = "deepseek";

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

const MODEL_TIMEOUT_MS = 180_000;
const MAX_OUTPUT_TOKENS = 1100;

/**
 * Body sent to an answer model. No tools, tool_choice, or function calling —
 * the model only writes from the messages it is given, the same limit tps-ai uses.
 */
export function answerRequest(
  model: string,
  messages: ChatMessage[],
  extra: { max_tokens?: number } = {},
): Record<string, unknown> {
  return { model, messages, stream: true, temperature: 0.2, ...extra };
}

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

/** Answer provider. Retrieval uses the local embedding model and never this list. */
export function resolveProviderOrder(
  env: { DEEPSEEK_API_KEY?: string } = process.env,
): ProviderId[] {
  return env.DEEPSEEK_API_KEY && env.DEEPSEEK_API_KEY.trim() ? ["deepseek"] : [];
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
    body: JSON.stringify(answerRequest(config.model, messages, { max_tokens: MAX_OUTPUT_TOKENS })),
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

/** Stream a DeepSeek answer. Retrieval stays on the local embedding model. */
export async function streamChat(
  messages: ChatMessage[],
  signal: AbortSignal,
  onToken: (text: string) => void,
): Promise<AnswerResult> {
  if (resolveProviderOrder().length === 0) throw new Error("没有可用的模型提供方");
  return streamDeepSeek(messages, signal, onToken);
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
  const config = deepseekConfig();
  const connected = await probeDeepSeek(config);
  return { provider: "deepseek", connected, installed: true, model: config.model, url: config.baseUrl };
}
