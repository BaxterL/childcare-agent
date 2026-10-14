<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import {
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  FileText,
  House,
  Library,
  Lock,
  Menu,
  Paperclip,
  Plus,
  ShieldAlert,
  Square,
  Trash2,
  X,
} from "lucide-vue-next";
import { openOriginal, pendingQuestion, serviceState, SUGGESTIONS } from "../state";
import { formatTime, friendlyContent, originalHref, renderAnswer } from "../utils";
import type { ChatMessage, ChatSession, SourceRef } from "../types";

const STORAGE_KEY = "childcare.sessions.v1";
const STEPS = ["理解问题", "查找资料", "组织答复"];
const QUESTION_LIMIT = 3000;
const ATTACHMENT_LIMIT = 8000;
const FILE_LIMIT = 3;
const FILE_BYTE_LIMIT = 8 * 1024 * 1024;
const FILE_ACCEPT = ".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

// randomUUID is only available in secure contexts. The public site is plain HTTP,
// where the function is missing or throws, and that used to abort sending.
function newId(): string {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Insecure origin. Fall through to a local id.
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
const READABLE = new Set(["pdf", "docx", "txt", "md", "markdown"]);

interface PendingFile {
  id: string;
  name: string;
  text: string;
}

const busy = ref(false);
const step = ref(0);
const question = ref("");
const sessions = ref<ChatSession[]>(loadSessions());
const activeId = ref(sessions.value[0]?.id ?? "");
const railOpen = ref(false);
const copiedId = ref("");
const messageList = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);
const fileEl = ref<HTMLInputElement | null>(null);
const files = ref<PendingFile[]>([]);
const fileNote = ref("");
const readingFiles = ref(false);
const dragging = ref(false);
const pop = reactive({ show: false, x: 0, y: 0, above: true, source: null as SourceRef | null });
let controller: AbortController | null = null;
let pinned = true;

const activeSession = computed(() => sessions.value.find((item) => item.id === activeId.value) ?? null);
const activeMessages = computed(() => activeSession.value?.messages ?? []);
const lastMessageId = computed(() => activeMessages.value[activeMessages.value.length - 1]?.id ?? "");
const overQuestion = computed(() => question.value.length > QUESTION_LIMIT);
const limitDetail = computed(() => {
  if (!overQuestion.value) return fileNote.value;
  return `问题已超过 ${QUESTION_LIMIT} 字（现为 ${question.value.length} 字），请删减后再发送。`;
});
const canSend = computed(() => Boolean(question.value.trim()) && !overQuestion.value && !readingFiles.value);

const service = computed(() => {
  if (serviceState.value === "offline") return { tone: "is-offline", title: "服务暂时不可用", note: "请稍后再试，你无需做任何设置" };
  if (serviceState.value === "checking") return { tone: "is-checking", title: "正在连接服务…", note: "无需安装或配置，打开即用" };
  return { tone: "is-online", title: "服务运行中", note: "无需安装或配置，打开即用" };
});

const groupedSessions = computed(() => {
  const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = dayStart(new Date());
  const groups: { label: string; items: ChatSession[] }[] = [
    { label: "今天", items: [] },
    { label: "昨天", items: [] },
    { label: "近 7 天", items: [] },
    { label: "更早", items: [] },
  ];
  for (const session of sessions.value) {
    const diff = Math.round((today - dayStart(new Date(session.updatedAt))) / 86_400_000);
    groups[diff <= 0 ? 0 : diff === 1 ? 1 : diff <= 7 ? 2 : 3]!.items.push(session);
  }
  return groups.filter((group) => group.items.length);
});

watch(sessions, saveSessions, { deep: true });
watch(question, () => void nextTick(autosize));

function questionFromLocation(): string {
  const query = location.hash.split("?")[1] ?? "";
  return new URLSearchParams(query).get("q")?.trim() ?? "";
}

function consumePendingQuestion(): void {
  if (busy.value) return;
  const fromHash = questionFromLocation();
  const text = fromHash || pendingQuestion.value.trim();
  if (!text) return;
  pendingQuestion.value = "";
  if (fromHash) history.replaceState(null, "", `${location.pathname}${location.search}#/chat`);
  startNew();
  question.value = text;
  void sendQuestion();
}

onMounted(() => {
  window.addEventListener("keydown", onWindowKey);
  consumePendingQuestion();
  void scrollToBottom(true);
});

// KeepAlive: also catch a question sent while this page was cached in the background.
onActivated(() => {
  if (questionFromLocation() || pendingQuestion.value.trim()) consumePendingQuestion();
  else void nextTick(() => inputEl.value?.focus());
});

onBeforeUnmount(() => window.removeEventListener("keydown", onWindowKey));

function onWindowKey(event: KeyboardEvent): void {
  if (event.key === "Escape") railOpen.value = false;
}

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

function makeSession(): string {
  const session: ChatSession = { id: newId(), title: "新咨询", updatedAt: new Date().toISOString(), messages: [] };
  sessions.value = [session, ...sessions.value].slice(0, 30);
  activeId.value = session.id;
  return session.id;
}

function startNew(): void {
  if (busy.value) return;
  // Reuse an untouched session instead of piling up empty ones.
  const empty = sessions.value.find((item) => !item.messages.length);
  if (empty) activeId.value = empty.id;
  else makeSession();
  railOpen.value = false;
  question.value = "";
  files.value = [];
  fileNote.value = "";
  void nextTick(() => inputEl.value?.focus());
}

function touchSession(session: ChatSession): void {
  session.updatedAt = new Date().toISOString();
  sessions.value = [session, ...sessions.value.filter((item) => item.id !== session.id)].slice(0, 30);
}

function selectSession(id: string): void {
  if (busy.value) return;
  activeId.value = id;
  railOpen.value = false;
  void scrollToBottom(true);
}

function deleteSession(id: string): void {
  if (busy.value) return;
  sessions.value = sessions.value.filter((item) => item.id !== id);
  if (activeId.value === id) activeId.value = sessions.value[0]?.id ?? "";
}

/* ---------- Citations ---------- */

function citeTarget(event: Event): { el: HTMLElement; message: ChatMessage; source: SourceRef } | null {
  const el = (event.target as HTMLElement | null)?.closest<HTMLElement>(".cite");
  if (!el) return null;
  const host = el.closest<HTMLElement>("[data-msg]");
  const message = activeMessages.value.find((item) => item.id === host?.dataset.msg);
  const source = message?.sources?.find((item) => item.index === Number(el.dataset.cite));
  return message && source ? { el, message, source } : null;
}

function onListClick(event: MouseEvent): void {
  const hit = citeTarget(event);
  if (!hit) return;
  pop.show = false;
  openOriginal(hit.source);
}

function onListKey(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  const hit = citeTarget(event);
  if (!hit) return;
  event.preventDefault();
  openOriginal(hit.source);
}

function onListOver(event: MouseEvent): void {
  const hit = citeTarget(event);
  if (!hit) {
    pop.show = false;
    return;
  }
  const rect = hit.el.getBoundingClientRect();
  const width = Math.min(340, window.innerWidth - 24);
  pop.x = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12));
  pop.above = rect.top > 200;
  pop.y = pop.above ? rect.top - 10 : rect.bottom + 10;
  pop.source = hit.source;
  pop.show = true;
}

function onListScroll(): void {
  pop.show = false;
  const el = messageList.value;
  if (el) pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
}

/* ---------- Composer ---------- */

function autosize(): void {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 188)}px`;
}

function onEnter(event: KeyboardEvent): void {
  // Enter that confirms an IME candidate must not send the message.
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  void sendQuestion();
}

function sendSuggestion(value: string): void {
  question.value = value;
  void sendQuestion();
}

function extensionOf(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
}

function pickFiles(): void {
  if (busy.value || readingFiles.value) return;
  if (files.value.length >= FILE_LIMIT) {
    fileNote.value = "一次最多 3 个文件。";
    return;
  }
  fileEl.value?.click();
}

async function addFiles(list: File[]): Promise<void> {
  if (!list.length || busy.value) return;
  const room = FILE_LIMIT - files.value.length;
  if (room <= 0) {
    fileNote.value = "一次最多 3 个文件。";
    return;
  }
  const incoming = list.slice(0, room);
  fileNote.value = list.length > room ? "一次最多 3 个文件。" : "";
  readingFiles.value = true;
  try {
    for (const file of incoming) {
      const ext = extensionOf(file.name);
      if (ext === "doc") {
        fileNote.value = "暂不支持旧版 Word（.doc），请另存为 .docx 后再上传。";
        continue;
      }
      if (!READABLE.has(ext)) {
        fileNote.value = "请上传 PDF、Word（.docx）或文本文件。";
        continue;
      }
      if (file.size > FILE_BYTE_LIMIT) {
        fileNote.value = `《${file.name}》超过 8 MB，请换一份更小的文件。`;
        continue;
      }
      const body = new FormData();
      body.append("file", file, file.name);
      const response = await fetch("/api/chat/files", { method: "POST", body });
      const data = (await response.json()) as { files?: { name: string; text: string }[]; message?: string };
      const extracted = data.files?.[0];
      if (!response.ok || !extracted) {
        fileNote.value = data.message || "文件暂时读不出来，请换一份后再试。";
        continue;
      }
      const next = files.value.reduce((sum, item) => sum + item.text.length, 0) + extracted.text.length;
      if (next > ATTACHMENT_LIMIT) {
        fileNote.value = `附件文字已超过 ${ATTACHMENT_LIMIT} 字（现为 ${next} 字），请删减后再发送。`;
        continue;
      }
      files.value = [...files.value, { id: newId(), name: extracted.name, text: extracted.text }];
    }
  } catch {
    fileNote.value = "文件暂时读不出来，请换一份后再试。";
  } finally {
    readingFiles.value = false;
  }
}

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement;
  const list = [...(input.files ?? [])];
  input.value = "";
  void addFiles(list);
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  void addFiles([...(event.dataTransfer?.files ?? [])]);
}

function onDragLeave(event: DragEvent): void {
  const next = event.relatedTarget;
  if (next instanceof Node && (event.currentTarget as Node).contains(next)) return;
  dragging.value = false;
}

function removeFile(id: string): void {
  files.value = files.value.filter((file) => file.id !== id);
  fileNote.value = "";
}

async function sendQuestion(): Promise<void> {
  const text = question.value.trim();
  if (!text || busy.value || readingFiles.value || question.value.length > QUESTION_LIMIT) return;
  const sessionId = activeSession.value?.id ?? makeSession();
  // Work on the reactive proxy so streamed text re-renders live.
  const session = sessions.value.find((item) => item.id === sessionId)!;
  const history = session.messages.map(({ role, content }) => ({ role, content })).slice(-8);
  const attachments = files.value.map(({ name, text: fileText }) => ({ name, text: fileText }));
  session.messages.push(
    {
      id: newId(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      attachments: attachments.map(({ name }) => ({ name })),
    },
    { id: newId(), role: "assistant", content: "", createdAt: new Date().toISOString(), sources: [] },
  );
  const reply = session.messages[session.messages.length - 1]!;
  if (session.title === "新咨询") session.title = text.length > 28 ? `${text.slice(0, 28)}…` : text;
  touchSession(session);
  question.value = "";
  files.value = [];
  fileNote.value = "";
  busy.value = true;
  step.value = 0;
  controller = new AbortController();
  await scrollToBottom(true);

  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ question: text, history, attachments }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error("服务暂时不可用，请稍后再试。");
    await readEventStream(response.body, (event, data) => {
      if (event === "status") step.value = data.stage === "retrieving" ? 1 : data.stage === "answering" ? 2 : 0;
      if (event === "sources") reply.sources = Array.isArray(data) ? data as unknown as SourceRef[] : [];
      if (event === "delta") reply.content += String(data.text ?? "");
      if (event === "warning" && data.code === "model_unavailable" && reply.content.trim()) {
        reply.content += "\n\n答复在这里中断了，可以再问一次。";
      }
      if (event === "error") reply.error = String(data.message ?? "本次答复失败，请稍后再试。");
      void scrollToBottom();
    });
    // Keep stored history (and the context sent with follow-ups) free of operator wording.
    reply.content = friendlyContent(reply);
  } catch (caught) {
    if ((caught as Error).name === "AbortError") return;
    reply.error = caught instanceof TypeError ? "服务暂时不可用，请稍后再试。" : caught instanceof Error ? caught.message : "本次答复失败，请稍后再试。";
  } finally {
    busy.value = false;
    controller = null;
    touchSession(session);
    await scrollToBottom();
    inputEl.value?.focus();
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

async function copyAnswer(message: ChatMessage): Promise<void> {
  try {
    await navigator.clipboard.writeText(friendlyContent(message));
    copiedId.value = message.id;
    window.setTimeout(() => {
      if (copiedId.value === message.id) copiedId.value = "";
    }, 1600);
  } catch {
    // Clipboard access can be denied; the text stays selectable.
  }
}

async function scrollToBottom(force = false): Promise<void> {
  await nextTick();
  const el = messageList.value;
  if (!el || (!force && !pinned)) return;
  el.scrollTo({ top: el.scrollHeight });
  pinned = true;
}

function isStreaming(message: ChatMessage): boolean {
  return busy.value && message.id === lastMessageId.value;
}
</script>

<template>
  <div class="chat" :class="{ 'rail-open': railOpen }">
    <div v-if="railOpen" class="scrim" @click="railOpen = false"></div>

    <!-- ===== Rail: brand, history, navigation ===== -->
    <aside class="rail" aria-label="咨询记录">
      <div class="brand">
        <a class="brand-link" href="#/" aria-label="回到托育知护首页">
          <img class="brand-mark" src="/logo.svg" alt="" width="38" height="38" />
          <span class="brand-text">
            <span class="brand-name">托育知护</span>
            <span class="brand-sub">婴幼儿照护知识问答</span>
          </span>
        </a>
        <button class="icon-btn rail-close" type="button" aria-label="关闭菜单" @click="railOpen = false"><X :size="18" /></button>
      </div>

      <button class="new-chat" type="button" :disabled="busy" @click="startNew"><Plus :size="16" :stroke-width="2" />新建咨询</button>

      <nav class="history" aria-label="最近咨询">
        <template v-for="group in groupedSessions" :key="group.label">
          <h3 class="history-label">{{ group.label }}</h3>
          <div v-for="session in group.items" :key="session.id" class="history-item" :class="{ active: session.id === activeId }">
            <button class="history-open" type="button" :aria-current="session.id === activeId ? 'true' : undefined" @click="selectSession(session.id)">{{ session.title }}</button>
            <button class="history-del" type="button" aria-label="删除这条咨询" title="删除" @click="deleteSession(session.id)"><Trash2 :size="14" /></button>
          </div>
        </template>
        <p v-if="!sessions.length" class="history-empty">还没有咨询记录。<br />提出第一个问题后，会自动保存在这里。</p>
      </nav>

      <div class="rail-foot">
        <nav class="rail-nav" aria-label="站点导航">
          <a href="#/"><House :size="15" />产品首页</a>
          <a href="#/library"><Library :size="15" />资料库</a>
        </nav>
        <div class="service" :class="service.tone">
          <span class="status-dot"></span>
          <span class="service-text"><strong>{{ service.title }}</strong><small>{{ service.note }}</small></span>
        </div>
        <p class="privacy"><Lock :size="12" />对话记录保存在当前浏览器</p>
      </div>
    </aside>

    <!-- ===== Conversation ===== -->
    <main class="stage">
      <header class="stage-head">
        <button class="icon-btn menu" type="button" aria-label="打开菜单" @click="railOpen = true"><Menu :size="20" /></button>
        <div class="stage-title">
          <span class="eyebrow">照护问答 · 全国 · 0—3岁</span>
          <h1>{{ activeMessages.length ? activeSession?.title : "新咨询" }}</h1>
        </div>
      </header>

      <div ref="messageList" class="scroll" role="log" aria-label="对话" @click="onListClick" @keydown="onListKey" @mouseover="onListOver" @mouseleave="pop.show = false" @scroll.passive="onListScroll">
        <!-- Opening + quick questions -->
        <section v-if="!activeMessages.length" class="hello">
          <img class="hello-mark rise" style="--d: 0" src="/logo.svg" alt="" width="56" height="56" />
          <h2 class="rise" style="--d: 1">你好，我是托育知护</h2>
          <p class="rise" style="--d: 2">我会依据资料库回答婴幼儿照护与托育机构管理的问题，并标明每条依据的出处。你可以直接提问，也可以从下面开始。</p>
          <div class="quick rise" style="--d: 3">
            <button v-for="item in SUGGESTIONS" :key="item.text" type="button" @click="sendSuggestion(item.text)">
              <span class="quick-tag">{{ item.tag }}</span>
              <span class="quick-text">{{ item.text }}</span>
            </button>
          </div>
        </section>

        <div v-else class="thread">
          <template v-for="message in activeMessages" :key="message.id">
            <section v-if="message.role === 'user'" class="ask">
              <p class="ask-meta"><span class="seal-dot"></span>咨询<time>{{ formatTime(message.createdAt) }}</time></p>
              <p class="ask-text">{{ message.content }}</p>
              <ul v-if="message.attachments?.length" class="ask-files">
                <li v-for="(file, index) in message.attachments" :key="`${file.name}-${index}`"><FileText :size="14" />{{ file.name }}</li>
              </ul>
            </section>

            <section v-else class="reply" :data-msg="message.id">
              <header class="reply-head">
                <img class="reply-mark" src="/logo.svg" alt="" width="22" height="22" />
                <span class="reply-name">照护答复</span>
                <ol v-if="isStreaming(message)" class="steps" aria-label="答复进度">
                  <li v-for="(label, i) in STEPS" :key="label" :class="{ done: i < step, current: i === step }">
                    <Check v-if="i < step" :size="12" :stroke-width="2.4" /><span v-else class="step-dot"></span>{{ label }}
                  </li>
                </ol>
              </header>

              <div v-if="isStreaming(message) && !message.content && !message.error" class="skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
              <div v-if="message.content" class="answer" :class="{ 'is-streaming': isStreaming(message) }" v-html="renderAnswer(message)"></div>
              <p v-if="message.error" class="message-error"><ShieldAlert :size="15" />{{ message.error }}</p>

              <footer v-if="(message.sources?.length || message.content) && !isStreaming(message)" class="reply-foot">
                <div v-if="message.sources?.length" class="refs">
                  <span class="refs-label"><BookOpen :size="14" />参考资料 <b>{{ message.sources.length }}</b></span>
                  <button v-for="source in message.sources" :key="`${source.chunkId}-${source.index}`" class="ref" type="button" :disabled="!originalHref(source)" :title="source.documentNo || source.title" @click="openOriginal(source)">
                    <span class="seal">{{ source.index }}</span>
                    <span class="ref-title">{{ source.title }}</span>
                    <span class="ref-page">第{{ source.pageNumber }}页</span>
                  </button>
                </div>
                <div v-if="message.content" class="reply-actions">
                  <button type="button" class="ghost-btn" @click="copyAnswer(message)">
                    <Check v-if="copiedId === message.id" :size="14" /><Copy v-else :size="14" />{{ copiedId === message.id ? "已复制" : "复制答复" }}
                  </button>
                </div>
              </footer>
            </section>
          </template>
        </div>
      </div>

      <form class="dock" @submit.prevent="sendQuestion">
        <p v-if="serviceState === 'offline'" class="notice" role="status"><ShieldAlert :size="14" />服务暂时不可用，稍后会自动重试。</p>
        <p v-if="limitDetail" class="composer-alert" role="status">{{ limitDetail }}</p>
        <div
          class="composer"
          :class="{ 'is-busy': busy, 'is-over': Boolean(limitDetail), 'is-drag': dragging }"
          @dragenter.prevent="dragging = true"
          @dragover.prevent="dragging = true"
          @dragleave="onDragLeave"
          @drop.prevent="onDrop"
        >
          <ul v-if="files.length" class="file-row">
            <li v-for="file in files" :key="file.id" class="file-chip">
              <FileText :size="14" />
              <span>{{ file.name }}</span>
              <button type="button" :aria-label="`移除${file.name}`" :disabled="busy" @click="removeFile(file.id)"><X :size="14" /></button>
            </li>
          </ul>
          <textarea ref="inputEl" v-model="question" rows="1" :disabled="busy" placeholder="输入问题" aria-label="输入问题" @keydown.enter.exact="onEnter"></textarea>
          <div class="composer-bar">
            <button class="attach" type="button" aria-label="添加文件" title="添加文件" :disabled="busy || readingFiles" @click="pickFiles"><Paperclip :size="18" /></button>
            <input ref="fileEl" class="file-input" type="file" multiple :accept="FILE_ACCEPT" @change="onPick" />
            <span class="composer-hint"><kbd>Enter</kbd> 发送<i></i><kbd>Shift</kbd> + <kbd>Enter</kbd> 换行</span>
            <button v-if="busy" class="send stop" type="button" aria-label="停止生成" title="停止生成" @click="stopGeneration"><Square :size="13" fill="currentColor" /></button>
            <button v-else class="send" type="submit" :disabled="!canSend" aria-label="发送问题" title="发送"><ArrowUp :size="18" :stroke-width="2.2" /></button>
          </div>
        </div>
        <p class="scope-note"><ShieldAlert :size="13" />不提供疾病诊断、检查解读及用药治疗建议</p>
      </form>
    </main>

    <!-- Hover preview for an inline citation -->
    <div v-if="pop.show && pop.source" class="cite-pop" :class="{ 'is-above': pop.above }" :style="{ left: `${pop.x}px`, top: `${pop.y}px` }" aria-hidden="true">
      <strong>{{ pop.source.title }}</strong>
      <span class="pop-meta">{{ pop.source.documentNo || pop.source.organization }} · 第{{ pop.source.pageNumber }}页</span>
      <span class="pop-hint">{{ originalHref(pop.source) ? "打开原文" : "暂无原文链接" }}</span>
    </div>
  </div>
</template>

<style scoped>
.chat { display: grid; height: 100%; grid-template-columns: 268px minmax(0, 1fr); background: var(--paper); }

/* ==========================================================================
   Rail
   ========================================================================== */
.rail {
  position: relative; z-index: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 24px 14px 14px; overflow: hidden; color: #f6f1e6;
  background: radial-gradient(120% 55% at 0% 0%, #2c5c4966, transparent 62%), linear-gradient(180deg, var(--moss-900), var(--moss-950));
}
.rail::before {
  content: ""; position: absolute; left: -96px; bottom: -88px; width: 380px; height: 380px; pointer-events: none;
  background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='380' height='380' viewBox='0 0 380 380' fill='none' stroke='%23f6f1e6' stroke-opacity='.075'><circle cx='190' cy='190' r='44'/><circle cx='190' cy='190' r='88'/><circle cx='190' cy='190' r='132'/><circle cx='190' cy='190' r='176'/></svg>") center / contain no-repeat;
}
.rail > * { position: relative; }
.brand { display: flex; align-items: center; gap: 8px; padding: 0 6px 22px; }
.brand-link { display: flex; align-items: center; gap: 12px; min-width: 0; color: inherit; text-decoration: none; }
.brand-mark { flex: none; border-radius: 10px; box-shadow: 0 0 0 1px #f6f1e61f, 0 8px 20px -6px #00000080; }
.brand-text { display: grid; gap: 3px; min-width: 0; }
.brand-name { font: 650 20px/1 var(--serif); letter-spacing: .1em; }
.brand-sub { color: #f6f1e69e; font-size: 11.5px; letter-spacing: .04em; }
.rail-close { display: none; margin-left: auto; color: #f6f1e6b3; }
.rail-close:hover { color: #fff; background: #ffffff1a; }

.new-chat { display: flex; align-items: center; justify-content: center; gap: 8px; height: 42px; color: var(--moss-950); background: #f6f1e6; border: 0; border-radius: 9px; font-size: 14px; font-weight: 600; letter-spacing: .04em; box-shadow: 0 8px 20px -10px #000000a0; transition: background .2s, transform .2s var(--ease); }
.new-chat:hover:not(:disabled) { background: #fff; transform: translateY(-1px); }
.new-chat:disabled { opacity: .5; }

.history { flex: 1; min-height: 0; margin: 22px -6px 0; padding: 0 6px; overflow-y: auto; }
.history { scrollbar-color: #ffffff2e transparent; }
.history-label { margin: 18px 8px 8px; color: #f6f1e68c; font: 500 10.5px/1 var(--mono); letter-spacing: .16em; }
.history-label:first-child { margin-top: 2px; }
.history-item { position: relative; display: flex; align-items: center; border-radius: 8px; transition: background .2s; }
.history-item:hover { background: #ffffff12; }
.history-item.active { background: #f6f1e61a; }
.history-item.active::before { content: ""; position: absolute; left: 0; top: 11px; bottom: 11px; width: 2.5px; background: var(--seal); border-radius: 2px; }
.history-open { flex: 1; min-width: 0; height: 40px; padding: 0 8px 0 14px; overflow: hidden; color: #f6f1e6d1; text-align: left; text-overflow: ellipsis; white-space: nowrap; background: none; border: 0; font-size: 13.5px; }
.history-item.active .history-open { color: #fff; font-weight: 600; }
.history-del { display: grid; width: 28px; height: 28px; margin-right: 6px; flex: none; place-items: center; color: #f6f1e69e; background: none; border: 0; border-radius: 6px; opacity: 0; transition: opacity .2s, background .2s, color .2s; }
.history-item:hover .history-del, .history-del:focus-visible { opacity: 1; }
.history-del:hover { color: #ffb4a3; background: #ffffff1a; }
.history-empty { padding: 4px 8px; color: #f6f1e68c; font-size: 12.5px; line-height: 1.9; }

.rail-foot { display: grid; gap: 12px; padding-top: 14px; border-top: 1px solid #f6f1e61c; }
.rail-nav { display: grid; gap: 2px; }
.rail-nav a { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px; color: #f6f1e6c7; border-radius: 8px; font-size: 13.5px; text-decoration: none; transition: background .2s, color .2s; }
.rail-nav a:hover { color: #fff; background: #ffffff14; }
.service { display: flex; align-items: flex-start; gap: 10px; padding: 11px 12px; background: #ffffff0d; border: 1px solid #f6f1e61a; border-radius: 9px; }
.service-text { display: grid; gap: 4px; min-width: 0; }
.service-text strong { font-size: 12.5px; font-weight: 600; line-height: 1.2; }
.service-text small { color: #f6f1e6a8; font-size: 11.5px; line-height: 1.5; }
.status-dot { width: 8px; height: 8px; margin-top: 4px; flex: none; background: #e69a3a; border-radius: 50%; box-shadow: 0 0 0 3px #e69a3a2e; }
.is-online .status-dot { background: #5fd1a0; box-shadow: 0 0 0 3px #5fd1a02e; }
.is-checking .status-dot { animation: pulse 1.1s ease-in-out infinite; }
.privacy { display: flex; align-items: center; gap: 6px; padding: 0 4px; color: #f6f1e68c; font-size: 11.5px; }

/* ==========================================================================
   Stage
   ========================================================================== */
.stage { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-width: 0; min-height: 0; background: radial-gradient(70% 50% at 100% 0%, #fff8e6 0%, transparent 70%), var(--paper); }
.stage-head { display: flex; align-items: center; gap: 10px; min-height: 72px; padding: 0 clamp(20px, 4vw, 56px); border-bottom: 1px solid var(--rule-soft); }
.menu { display: none; }
.stage-title { display: grid; flex: 1; gap: 7px; min-width: 0; }
.stage-title h1 { overflow: hidden; font: 600 18px/1.25 var(--serif); letter-spacing: .01em; text-overflow: ellipsis; white-space: nowrap; }
.scroll { min-height: 0; padding: 0 clamp(20px, 4vw, 56px); overflow-y: auto; overscroll-behavior: contain; }

/* Opening */
.hello { position: relative; width: min(720px, 100%); margin: 0 auto; padding: clamp(36px, 10vh, 100px) 0 40px; }
.hello::before { content: ""; position: absolute; top: clamp(0px, 3vh, 36px); right: -140px; width: 340px; height: 340px; pointer-events: none; background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='340' height='340' viewBox='0 0 340 340' fill='none' stroke='%2327503f' stroke-opacity='.11'><circle cx='170' cy='170' r='40'/><circle cx='170' cy='170' r='80'/><circle cx='170' cy='170' r='120'/><circle cx='170' cy='170' r='160'/></svg>") center / contain no-repeat; }
.hello > * { position: relative; }
.hello-mark { display: block; border-radius: 15px; box-shadow: 0 10px 24px -8px #14291f99; }
.hello h2 { margin-top: 24px; font: 700 clamp(30px, 4.4vw, 44px)/1.3 var(--serif); letter-spacing: .02em; }
.hello p { max-width: 32em; margin-top: 16px; color: var(--ink-2); font-size: 16px; line-height: 1.95; text-wrap: pretty; }
.quick { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 36px; }
.quick button { display: grid; align-content: start; gap: 8px; min-height: 92px; padding: 16px 18px; text-align: left; background: #fffdf8b3; border: 1px solid var(--rule); border-radius: 10px; transition: border-color .25s, background .25s, transform .3s var(--ease), box-shadow .3s; }
.quick button:hover { background: var(--sheet); border-color: var(--moss-500); transform: translateY(-2px); box-shadow: 0 14px 28px -18px #2a24129e; }
.quick-tag { color: var(--seal-ink); font-size: 11.5px; font-weight: 650; letter-spacing: .14em; }
.quick-text { font: 500 15.5px/1.6 var(--serif); }

/* Thread */
.thread { width: min(720px, 100%); margin: 0 auto; padding: 32px 0 44px; }
.ask { margin: 52px 0 24px; animation: rise .6s var(--ease) both; }
.thread > .ask:first-child { margin-top: 12px; }
.ask-meta { display: flex; align-items: center; gap: 9px; color: var(--ink-3); font: 500 11px/1 var(--mono); letter-spacing: .12em; }
.ask-meta time { margin-left: 4px; letter-spacing: .04em; }
.ask-text { margin-top: 14px; font: 600 25px/1.5 var(--serif); letter-spacing: .01em; text-wrap: balance; overflow-wrap: anywhere; white-space: pre-wrap; }
.ask-files { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.ask-files li { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; height: 32px; padding: 0 10px; color: var(--ink-2); background: var(--sheet); border: 1px solid var(--rule); border-radius: 8px; font-size: 13px; }
.ask-files svg { flex: none; color: var(--seal); }

.reply { animation: rise .6s var(--ease) both; }
.reply-head { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; margin-bottom: 14px; }
.reply-mark { flex: none; border-radius: 6px; }
.reply-name { font-size: 13px; font-weight: 650; letter-spacing: .08em; }
.steps { display: flex; align-items: center; gap: 4px; margin-left: auto; color: var(--ink-3); font-size: 12px; }
.steps li { display: inline-flex; align-items: center; gap: 6px; }
.steps li + li::before { content: ""; width: 14px; height: 1px; margin-right: 4px; background: var(--rule); }
.step-dot { width: 6px; height: 6px; border: 1.5px solid #b8ae96; border-radius: 50%; }
.steps .done { color: var(--moss-700); }
.steps .current { color: var(--ink); font-weight: 600; }
.steps .current .step-dot { background: var(--seal); border-color: var(--seal); animation: pulse 1.1s ease-in-out infinite; }

/* Answer prose */
.answer { color: var(--ink); font-size: 16px; line-height: 1.98; overflow-wrap: anywhere; text-wrap: pretty; }
.answer :deep(> :first-child) { margin-top: 0; }
.answer :deep(p) { margin: 0 0 1.05em; }
.answer :deep(p:last-child) { margin-bottom: 0; }
.answer :deep(h1), .answer :deep(h2), .answer :deep(h3), .answer :deep(h4) { margin: 1.7em 0 .5em; font-family: var(--serif); font-weight: 700; line-height: 1.5; letter-spacing: .02em; }
.answer :deep(h1), .answer :deep(h2) { font-size: 20px; }
.answer :deep(h3), .answer :deep(h4) { font-size: 17px; }
.answer :deep(strong) { padding: 0 .08em; font-weight: 650; background: linear-gradient(transparent 62%, #f4de9399 62%); }
.answer :deep(ul), .answer :deep(ol) { margin: .4em 0 1.1em; padding-left: 1.5em; list-style: revert; }
.answer :deep(li) { margin: .3em 0; padding-left: .2em; }
.answer :deep(li::marker) { color: var(--seal); font-weight: 600; }
.answer :deep(blockquote) { margin: 1.2em 0; padding: .2em 0 .2em 1.1em; color: var(--ink-2); border-left: 2px solid var(--seal); font-family: var(--serif); }
.answer :deep(code) { padding: .1em .4em; background: var(--paper-sunk); border-radius: 4px; font: 13px var(--mono); }
.answer :deep(pre) { margin: 1.2em 0; padding: 14px 16px; overflow-x: auto; color: #eaf2ec; background: var(--moss-900); border-radius: 8px; }
.answer :deep(pre code) { padding: 0; color: inherit; background: none; }
.answer :deep(hr) { margin: 1.8em 0; border: 0; border-top: 1px solid var(--rule); }
.answer :deep(table) { width: 100%; margin: 1.2em 0; border-collapse: collapse; font-size: 14.5px; line-height: 1.7; }
.answer :deep(th), .answer :deep(td) { padding: 9px 12px; text-align: left; border-bottom: 1px solid var(--rule); }
.answer :deep(th) { color: var(--ink-3); font-size: 12px; font-weight: 600; letter-spacing: .08em; border-bottom-color: var(--ink-3); }
.answer :deep(a) { color: var(--moss-700); text-decoration-color: var(--moss-line); text-underline-offset: 3px; }
.answer :deep(.cite) {
  position: relative; top: -.55em; display: inline-flex; align-items: center; justify-content: center; min-width: 15px; height: 15px; margin: 0 .16em; padding: 0 3px;
  color: #fff; background: var(--seal); border-radius: 2px; font: 600 10.5px/1 var(--mono); cursor: pointer; transform: rotate(-3deg);
  transition: transform .2s var(--ease), background .2s;
}
.answer :deep(.cite:hover), .answer :deep(.cite:focus-visible) { background: var(--seal-ink); transform: rotate(0) scale(1.18); }
.answer.is-streaming :deep(> :last-child:not(ul):not(ol)::after),
.answer.is-streaming :deep(> :is(ul, ol):last-child > li:last-child::after) {
  content: ""; display: inline-block; width: 8px; height: 1.05em; margin-left: 4px; vertical-align: -.18em; background: var(--moss-700); border-radius: 1.5px; animation: caret 1s steps(1) infinite;
}
@keyframes caret { 50% { opacity: 0; } }
.message-error { display: flex; align-items: flex-start; gap: 8px; margin-top: 10px; padding: 12px 14px; color: var(--seal-ink); background: var(--seal-tint); border-radius: 8px; font-size: 14px; line-height: 1.7; }
.message-error svg { flex: none; margin-top: 4px; }

/* Sources under the answer */
.reply-foot { display: grid; gap: 10px; margin-top: 24px; }
.refs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-top: 16px; border-top: 1px solid var(--rule); }
.refs-label { display: inline-flex; align-items: center; gap: 6px; margin-right: 6px; color: var(--ink-3); font-size: 12.5px; font-weight: 600; letter-spacing: .08em; }
.refs-label b { color: var(--seal-ink); font: 600 12.5px var(--mono); }
.ref { display: inline-flex; align-items: center; gap: 9px; max-width: 100%; height: 36px; padding: 0 12px 0 8px; background: var(--sheet); border: 1px solid var(--rule); border-radius: 8px; transition: border-color .2s, transform .25s var(--ease), box-shadow .25s; }
.ref:hover { border-color: #bdb398; transform: translateY(-1px); box-shadow: 0 10px 20px -14px #2a24129e; }
.ref-title { max-width: 260px; overflow: hidden; font: 500 13.5px/1 var(--serif); text-overflow: ellipsis; white-space: nowrap; }
.ref:disabled { cursor: default; opacity: .72; }
.ref-page { flex: none; color: var(--ink-3); font: 500 11.5px/1 var(--mono); }
.reply-actions { display: flex; margin-left: -10px; }

/* Citation hover preview */
.cite-pop { position: fixed; z-index: 30; display: grid; gap: 7px; width: min(340px, calc(100vw - 24px)); padding: 14px 16px; pointer-events: none; background: var(--moss-900); color: #f6f1e6; border-radius: 10px; box-shadow: 0 24px 48px -16px #0f2018cc; animation: fade .15s ease both; }
.cite-pop.is-above { transform: translateY(-100%); }
.cite-pop strong { font: 600 14px/1.5 var(--serif); }
.pop-meta { color: #f6f1e6a8; font: 500 11.5px/1.5 var(--mono); }
.cite-pop q { display: -webkit-box; overflow: hidden; padding-left: 10px; color: #f6f1e6d9; border-left: 2px solid var(--seal); font: 12.5px/1.8 var(--serif); quotes: none; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; }
.pop-hint { color: #f6f1e68c; font-size: 11px; }

/* Composer */
.dock { padding: 14px clamp(20px, 4vw, 56px) 16px; background: linear-gradient(180deg, #f6f1e600, var(--paper) 36%); }
.notice { display: flex; align-items: center; gap: 7px; width: min(720px, 100%); margin: 0 auto 10px; padding: 9px 12px; color: var(--seal-ink); background: var(--seal-tint); border-radius: 8px; font-size: 13px; }
.composer-alert { width: min(720px, 100%); margin: 0 auto 8px; color: var(--seal-ink); font-size: 13px; line-height: 1.6; }
.composer { width: min(720px, 100%); margin: 0 auto; background: var(--sheet); border: 1px solid var(--rule); border-radius: 14px; box-shadow: 0 1px 0 #fff inset, 0 18px 40px -22px #2a24127a, 0 2px 6px #2a24120f; transition: border-color .25s, box-shadow .25s; }
.composer:focus-within, .composer.is-drag { border-color: var(--moss-700); box-shadow: 0 1px 0 #fff inset, 0 0 0 4px #27503f1c, 0 18px 40px -22px #2a24127a; }
.composer.is-over { border-color: var(--seal); }
.file-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 12px 14px 0; }
.file-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; height: 32px; padding: 0 4px 0 10px; color: var(--ink-2); background: var(--paper); border: 1px solid var(--rule); border-radius: 8px; font-size: 13px; }
.file-chip svg { flex: none; color: var(--seal); }
.file-chip span { overflow: hidden; max-width: 220px; text-overflow: ellipsis; white-space: nowrap; }
.file-chip button { display: grid; width: 24px; height: 24px; place-items: center; color: var(--ink-3); background: none; border: 0; border-radius: 6px; }
.file-chip button:hover { color: var(--seal-ink); background: var(--seal-tint); }
.composer textarea { display: block; width: 100%; min-height: 58px; max-height: 188px; padding: 17px 20px 6px; resize: none; color: var(--ink); background: transparent; border: 0; outline: 0; font-size: 16px; line-height: 1.7; }
.composer textarea::placeholder { color: #8b8672; }
.composer textarea:disabled { opacity: .6; }
.composer-bar { display: flex; align-items: center; gap: 8px; padding: 4px 10px 10px 12px; }
.attach { display: grid; width: 34px; height: 34px; flex: none; place-items: center; color: var(--ink-3); background: none; border: 0; border-radius: 8px; }
.attach:hover:not(:disabled) { color: var(--ink); background: var(--paper-sunk); }
.attach:disabled { opacity: .45; }
.file-input { display: none; }
.composer-hint { display: flex; align-items: center; gap: 6px; margin-right: auto; color: #7d7966; font-size: 12px; }
.composer-hint i { width: 3px; height: 3px; margin: 0 6px; background: #c4b99f; border-radius: 50%; }
.composer-hint kbd { padding: 2px 5px; color: var(--ink-3); background: var(--paper); border: 1px solid var(--rule); border-radius: 4px; font: 500 10.5px/1 var(--mono); }
.send { display: grid; width: 38px; height: 38px; flex: none; place-items: center; color: #f6f1e6; background: var(--moss-800); border: 0; border-radius: 10px; box-shadow: 0 6px 14px -6px #14291f99; transition: background .2s, transform .2s var(--ease); }
.send:hover:not(:disabled) { background: var(--moss-700); transform: translateY(-1px); }
.send:disabled { color: #a79f88; background: var(--paper-sunk); box-shadow: none; }
.send.stop { color: var(--seal-ink); background: var(--seal-tint); box-shadow: none; }
.scope-note { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 10px; color: #7d7966; font-size: 12px; }
.scope-note svg { color: var(--seal); }

.scrim { display: none; }

/* ==========================================================================
   Responsive
   ========================================================================== */
@media (max-width: 820px) {
  .chat { grid-template-columns: minmax(0, 1fr); }
  .menu, .rail-close { display: inline-grid; }
  .rail { position: fixed; z-index: 30; top: 0; bottom: 0; left: 0; width: min(304px, 86vw); visibility: hidden; transform: translateX(-102%); box-shadow: 30px 0 70px -24px #0f2018aa; transition: transform .45s var(--ease), visibility 0s .45s; }
  .rail-open .rail { visibility: visible; transform: none; transition-delay: 0s; }
  .scrim { display: block; position: fixed; inset: 0; z-index: 20; background: #0f201873; backdrop-filter: blur(2px); animation: fade .3s ease both; }
  .stage-head { min-height: 60px; gap: 6px; padding: 0 12px; }
  .menu { margin-left: -6px; }
  .stage-title h1 { font-size: 16px; }
  .scroll { padding: 0 18px; }
  .hello::before { right: -200px; opacity: .6; }
  .quick { grid-template-columns: minmax(0, 1fr); }
  .quick button { min-height: 0; }
  .ask { margin-top: 40px; }
  .ask-text { font-size: 21px; }
  .answer { font-size: 15.5px; }
  .steps { margin-left: 0; width: 100%; }
  .dock { padding: 10px 14px 12px; }
  .composer-hint { display: none; }
  .composer-bar { justify-content: flex-end; }
  .attach { margin-right: auto; }
  .scope-note { font-size: 11.5px; }
}
</style>
