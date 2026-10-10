<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  Baby,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  ExternalLink,
  FileText,
  History,
  Plus,
  Send,
  ShieldAlert,
  Square,
  X,
} from "lucide-vue-next";
import type { ChatMessage, ChatSession, ModelStatus, SourceRecord, SourceRef } from "./types";

const STORAGE_KEY = "childcare.sessions.v1";
const SUGGESTIONS = [
  "托育机构日常保育工作包括哪些内容？",
  "7—12个月婴儿添加辅食有哪些照护要点？",
  "托育机构设置和管理有哪些基本要求？",
  "发现婴幼儿身体不适，机构应怎样观察和联系家长？",
];
const busy = ref(false);
const stage = ref("");
const question = ref("");
const sessions = ref<ChatSession[]>(loadSessions());
const activeId = ref(sessions.value[0]?.id ?? "");
const sources = ref<SourceRecord[]>([]);
const model = ref<ModelStatus>({ connected: false, installed: false, model: "qwen3:8b", url: "http://127.0.0.1:11434" });
const setupOpen = ref(false);
const catalogOpen = ref(false);
const selectedSource = ref<SourceRef | SourceRecord | null>(null);
const selectedPage = ref("");
const pageLoading = ref(false);
const error = ref("");
const messageList = ref<HTMLElement | null>(null);
let controller: AbortController | null = null;

const activeSession = computed(() => sessions.value.find((item) => item.id === activeId.value) ?? null);
const activeMessages = computed(() => activeSession.value?.messages ?? []);
const latestAssistant = computed(() => [...activeMessages.value].reverse().find((item) => item.role === "assistant") ?? null);
const panelSources = computed(() => latestAssistant.value?.sources ?? []);

watch(sessions, saveSessions, { deep: true });

onMounted(() => {
  void refreshStatus();
  void loadSources();
  window.setInterval(() => void refreshStatus(), 15000);
});

function loadSessions(): ChatSession[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as ChatSession[];
    return Array.isArray(parsed) ? parsed.slice(0, 30) : [];
  } catch {
    return [];
  }
}

function saveSessions(value: ChatSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value.slice(0, 30)));
  } catch {
    // Local history is optional when browser storage is unavailable.
  }
}

function makeSession(): ChatSession {
  const session: ChatSession = {
    id: crypto.randomUUID(),
    title: "新咨询",
    updatedAt: new Date().toISOString(),
    messages: [],
  };
  sessions.value = [session, ...sessions.value].slice(0, 30);
  activeId.value = session.id;
  selectedSource.value = null;
  selectedPage.value = "";
  error.value = "";
  return session;
}

function touchSession(session: ChatSession): void {
  session.updatedAt = new Date().toISOString();
  sessions.value = [session, ...sessions.value.filter((item) => item.id !== session.id)].slice(0, 30);
}

function selectSession(id: string): void {
  if (busy.value) return;
  activeId.value = id;
  selectedSource.value = null;
  selectedPage.value = "";
}

async function refreshStatus(): Promise<void> {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error();
    const data = await response.json() as { model: ModelStatus };
    model.value = data.model;
  } catch {
    model.value = { ...model.value, connected: false, installed: false };
  }
}

async function loadSources(): Promise<void> {
  try {
    const response = await fetch("/api/sources");
    const data = await response.json() as { sources: SourceRecord[] };
    sources.value = data.sources ?? [];
  } catch {
    sources.value = [];
  }
}

function renderMarkdown(value: string): string {
  const html = marked.parse(value, { async: false }) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

function sendSuggestion(value: string): void {
  question.value = value;
  void sendQuestion();
}

async function sendQuestion(): Promise<void> {
  const text = question.value.trim();
  if (!text || busy.value) return;
  let session = activeSession.value ?? makeSession();
  const history = session.messages.map(({ role, content }) => ({ role, content })).slice(-8);
  const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text, createdAt: new Date().toISOString() };
  const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "", createdAt: new Date().toISOString(), sources: [] };
  session.messages.push(userMessage, assistantMessage);
  if (session.title === "新咨询") session.title = text.length > 28 ? `${text.slice(0, 28)}…` : text;
  touchSession(session);
  question.value = "";
  error.value = "";
  busy.value = true;
  stage.value = "正在理解问题";
  controller = new AbortController();
  await scrollToBottom();

  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ question: text, history }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error("问答服务暂时不可用，请确认本地服务已启动。");
    await readEventStream(response.body, (event, data) => {
      if (event === "status") stage.value = data.stage === "retrieving" ? "正在查找资料" : data.stage === "answering" ? "正在组织答复" : "正在理解问题";
      if (event === "sources") assistantMessage.sources = data as unknown as SourceRef[];
      if (event === "delta") assistantMessage.content += String(data.text ?? "");
      if (event === "warning") model.value = { ...model.value, connected: false };
      if (event === "error") assistantMessage.error = String(data.message ?? "本次答复失败。");
      void scrollToBottom();
    });
  } catch (caught) {
    if ((caught as Error).name !== "AbortError") assistantMessage.error = caught instanceof Error ? caught.message : "本次答复失败。";
  } finally {
    busy.value = false;
    stage.value = "";
    controller = null;
    touchSession(session);
    await scrollToBottom();
  }
}

async function readEventStream(stream: ReadableStream<Uint8Array>, onEvent: (event: string, data: Record<string, unknown>) => void): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) dispatchBlock(block, onEvent);
      if (done) break;
    }
    if (buffer.trim()) dispatchBlock(buffer, onEvent);
  } finally {
    reader.releaseLock();
  }
}

function dispatchBlock(block: string, onEvent: (event: string, data: Record<string, unknown>) => void): void {
  const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
  const payload = block.match(/^data:\s*(.+)$/m)?.[1];
  if (!event || !payload) return;
  try {
    onEvent(event, JSON.parse(payload) as Record<string, unknown>);
  } catch {
    // Ignore malformed stream events; the next event may still be valid.
  }
}

function stopGeneration(): void {
  controller?.abort();
}

async function openPage(source: SourceRef | SourceRecord): Promise<void> {
  selectedSource.value = source;
  selectedPage.value = "正在读取原文…";
  pageLoading.value = true;
  try {
    const sourceId = "sourceId" in source ? source.sourceId : source.id;
    const pageNumber = "pageNumber" in source ? source.pageNumber : 1;
    const response = await fetch(`/api/sources/${encodeURIComponent(sourceId)}/pages/${pageNumber}`);
    const data = await response.json() as { page?: { clean_text: string } };
    selectedPage.value = data.page?.clean_text ?? "没有可展示的页级文本。";
  } catch {
    selectedPage.value = "原文暂时无法加载。";
  } finally {
    pageLoading.value = false;
  }
}

async function scrollToBottom(): Promise<void> {
  await nextTick();
  if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight;
}

function statusLabel(status: string): string {
  return ({ in_force: "有效", superseded: "已替代", withdrawn: "已撤回", draft: "草案", unknown: "效力待核" } as Record<string, string>)[status] ?? status;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-lockup">
        <span class="brand-mark"><Baby :size="19" :stroke-width="1.8" /></span>
        <span class="brand-name">托育知护</span>
        <span class="brand-divider"></span>
        <span class="brand-subtitle">婴幼儿照护知识问答</span>
      </div>
      <button class="model-status" :class="model.installed ? 'is-ready' : 'is-offline'" type="button" @click="setupOpen = true">
        <span class="status-dot"></span>
        {{ model.installed ? model.model : "本地模型未就绪" }}
        <ChevronDown :size="14" />
      </button>
    </header>

    <main class="workspace">
      <aside class="left-rail">
        <button class="new-chat" type="button" @click="makeSession"><Plus :size="16" />新建咨询</button>
        <div class="rail-section-head"><History :size="14" /><span>最近咨询</span></div>
        <nav class="session-list" aria-label="最近咨询">
          <button v-for="session in sessions" :key="session.id" class="session-item" :class="{ active: session.id === activeId }" type="button" @click="selectSession(session.id)">
            <span>{{ session.title }}</span>
            <time>{{ formatTime(session.updatedAt) }}</time>
          </button>
          <p v-if="!sessions.length" class="empty-history">新建咨询后会保存在本机浏览器。</p>
        </nav>
        <div class="rail-foot">
          <span class="privacy-line"><ShieldAlert :size="14" />对话记录仅保存在本机</span>
          <button class="catalog-toggle" type="button" @click="catalogOpen = !catalogOpen"><Database :size="15" />知识来源<span>{{ sources.length }}</span></button>
        </div>
      </aside>

      <section class="chat-column" aria-label="托育问答">
        <div class="chat-heading">
          <div>
            <h1>照护问答</h1>
            <p>全国 · 0—3岁 · 以可追溯资料为依据</p>
          </div>
          <button class="icon-button mobile-catalog" type="button" aria-label="知识来源" title="知识来源" @click="catalogOpen = true"><BookOpen :size="18" /></button>
        </div>

        <div ref="messageList" class="message-list" aria-live="polite">
          <section v-if="!activeMessages.length" class="welcome-state">
            <div class="welcome-glyph"><Baby :size="25" :stroke-width="1.6" /></div>
            <div class="welcome-copy">
              <h2>你好，今天需要处理哪项照护问题？</h2>
            </div>
            <div class="suggestion-list">
              <button v-for="item in SUGGESTIONS" :key="item" type="button" @click="sendSuggestion(item)">
                <span>{{ item }}</span><ChevronRight :size="16" />
              </button>
            </div>
          </section>

          <template v-for="message in activeMessages" :key="message.id">
            <article class="message-row" :class="message.role">
              <div v-if="message.role === 'assistant'" class="assistant-avatar"><Baby :size="16" /></div>
              <div class="message-body">
                <div v-if="message.role === 'user'" class="user-bubble">{{ message.content }}</div>
                <template v-else>
                  <p v-if="busy && !message.content" class="thinking-status"><span class="loading-pulse"></span>{{ stage }}</p>
                  <div v-if="message.content" class="answer-markdown" v-html="renderMarkdown(message.content)"></div>
                  <p v-if="busy && message.content" class="thinking-status answer-status"><span class="loading-pulse"></span>{{ stage }}</p>
                  <p v-if="message.error" class="message-error">{{ message.error }}</p>
                  <div v-if="message.sources?.length" class="inline-sources">
                    <button v-for="source in message.sources" :key="`${source.sourceId}-${source.pageNumber}-${source.index}`" type="button" @click="openPage(source)">
                      <FileText :size="14" /><span>[{{ source.index }}] {{ source.title }} · 第{{ source.pageNumber }}页</span><ChevronRight :size="13" />
                    </button>
                  </div>
                </template>
              </div>
            </article>
          </template>
          <p v-if="error" class="global-error">{{ error }}</p>
        </div>

        <form class="composer-area" @submit.prevent="sendQuestion">
          <div class="scope-note"><ShieldAlert :size="13" /><span>不提供疾病诊断、检查解读及用药治疗建议</span></div>
          <div class="composer">
            <textarea v-model="question" rows="1" maxlength="3000" :disabled="busy" placeholder="输入托育或婴幼儿照护问题…" aria-label="输入问题" @keydown.enter.exact.prevent="sendQuestion"></textarea>
            <div class="composer-actions">
              <span class="input-hint">{{ question.length }}/3000</span>
              <button v-if="busy" class="send-button stop-button" type="button" aria-label="停止生成" title="停止生成" @click="stopGeneration"><Square :size="14" fill="currentColor" /></button>
              <button v-else class="send-button" type="submit" :disabled="!question.trim()" aria-label="发送问题" title="发送问题"><Send :size="16" /></button>
            </div>
          </div>
        </form>
      </section>

      <aside class="right-rail" :class="{ 'is-open': catalogOpen || selectedSource }">
        <div v-if="selectedSource" class="detail-panel">
          <div class="panel-heading">
            <div><span class="eyebrow">原文定位</span><h2>资料摘录</h2></div>
            <button class="icon-button" type="button" aria-label="关闭资料面板" @click="selectedSource = null"><X :size="17" /></button>
          </div>
          <h3 class="detail-title">{{ selectedSource.title }}</h3>
          <p class="detail-meta">{{ 'organization' in selectedSource ? selectedSource.organization : '' }}</p>
          <p v-if="'documentNo' in selectedSource && selectedSource.documentNo" class="detail-meta">{{ selectedSource.documentNo }}</p>
          <div class="page-excerpt" :class="{ loading: pageLoading }">{{ selectedPage }}</div>
          <a v-if="'sourceUrl' in selectedSource && selectedSource.sourceUrl" class="source-link" :href="selectedSource.sourceUrl" target="_blank" rel="noreferrer">打开发布页面<ExternalLink :size="14" /></a>
        </div>
        <template v-else>
          <div class="panel-heading">
            <div><span class="eyebrow">可追溯资料</span><h2>{{ catalogOpen ? "资料目录" : "本轮依据" }}</h2></div>
            <button v-if="catalogOpen" class="icon-button mobile-close" type="button" aria-label="关闭资料目录" @click="catalogOpen = false"><X :size="17" /></button>
          </div>
          <template v-if="!catalogOpen && panelSources.length">
            <button v-for="source in panelSources" :key="`${source.sourceId}-${source.pageNumber}-${source.index}`" class="evidence-card" type="button" @click="openPage(source)">
              <span class="evidence-number">{{ source.index }}</span>
              <span class="evidence-content"><strong>{{ source.title }}</strong><small>{{ source.organization }}<template v-if="source.documentNo"> · {{ source.documentNo }}</template></small><span>第{{ source.pageNumber }}页 · {{ source.section }}</span></span>
              <ChevronRight :size="15" />
            </button>
          </template>
          <template v-else>
            <div class="catalog-tools"><span>{{ sources.length }} 份资料</span><span>全国范围</span></div>
            <button v-for="source in sources" :key="source.version_id" class="catalog-row" type="button" @click="openPage(source)">
              <FileText :size="16" />
              <span><strong>{{ source.title }}</strong><small>{{ source.organization }} · {{ statusLabel(source.legal_status) }}</small></span>
            </button>
            <p v-if="!sources.length" class="catalog-empty">知识库还没有可展示的资料。请运行采集清单导入资料。</p>
          </template>
          <div class="panel-foot"><span class="status-check"><Check :size="14" />引用仅来自可展示许可的资料</span></div>
        </template>
      </aside>
    </main>

    <div v-if="setupOpen" class="modal-backdrop" @click.self="setupOpen = false">
      <section class="setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <button class="icon-button modal-close" type="button" aria-label="关闭" @click="setupOpen = false"><X :size="18" /></button>
        <div class="setup-icon"><CircleHelp :size="23" /></div>
        <span class="eyebrow">本机推理</span>
        <h2 id="setup-title">{{ model.installed ? "本地模型已就绪" : "连接本地模型" }}</h2>
        <p>问答默认使用 {{ model.model }}。安装 Ollama 后，在终端执行：</p>
        <pre><code>ollama pull qwen3:8b</code></pre>
        <p class="setup-note">首次下载约 5.2 GB。下载并启动后，本页面会自动检测；资料和对话均留在本机。</p>
        <a class="download-link" href="https://ollama.com/download/windows" target="_blank" rel="noreferrer">下载 Ollama for Windows <ExternalLink :size="15" /></a>
        <button class="retry-button" type="button" @click="refreshStatus">重新检测</button>
      </section>
    </div>
  </div>
</template>
