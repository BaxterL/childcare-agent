import { reactive, ref } from "vue";
import type { SourceRecord, SourceRef } from "./types";

/* ---------- Hash router (no extra dependency, back button just works) ---------- */

export type RouteName = "home" | "chat" | "library";

function parseRoute(): RouteName {
  const name = location.hash.replace(/^#\/?/, "").split(/[?/]/)[0];
  return name === "chat" || name === "library" ? name : "home";
}

export const route = ref<RouteName>(parseRoute());
window.addEventListener("hashchange", () => {
  route.value = parseRoute();
});

export function go(name: RouteName): void {
  location.hash = name === "home" ? "#/" : `#/${name}`;
}

/** A question typed on the home page, picked up by the chat view when it activates. */
export const pendingQuestion = ref("");

export const SUGGESTIONS = [
  { tag: "日常保育", text: "托育机构日常保育工作包括哪些内容？" },
  { tag: "喂养照护", text: "7—12个月婴儿添加辅食有哪些照护要点？" },
  { tag: "机构管理", text: "托育机构设置和管理有哪些基本要求？" },
  { tag: "健康观察", text: "发现婴幼儿身体不适，机构应怎样观察和联系家长？" },
];

/** Everyday questions shown on the home page; each one is covered by the library. */
export const TOPICS = [
  { tag: "日常保育", text: "托育机构日常保育工作包括哪些内容？" },
  { tag: "喂养照护", text: "7—12个月婴儿添加辅食有哪些照护要点？" },
  { tag: "睡眠照护", text: "婴幼儿睡眠照护有哪些要点？" },
  { tag: "健康观察", text: "发现婴幼儿身体不适，机构应怎样观察和联系家长？" },
  { tag: "机构管理", text: "托育机构设置和管理有哪些基本要求？" },
  { tag: "人员要求", text: "托育机构保育人员需要具备哪些条件？" },
];

export function askFromHome(text: string): void {
  const value = text.trim();
  if (!value) return;
  pendingQuestion.value = value;
  go("chat");
}

/* ---------- Service state ---------- */

/** Models, retrieval and deployment are the backend's concern; the UI only knows reachable or not. */
export const serviceState = ref<"checking" | "online" | "offline">("checking");
export const sources = ref<SourceRecord[]>([]);
export const sourcesLoaded = ref(false);

export async function refreshStatus(): Promise<void> {
  try {
    const response = await fetch("/api/health");
    serviceState.value = response.ok ? "online" : "offline";
  } catch {
    serviceState.value = "offline";
  }
}

export async function loadSources(): Promise<void> {
  try {
    const response = await fetch("/api/sources");
    const data = await response.json() as { sources: SourceRecord[] };
    sources.value = data.sources ?? [];
  } catch {
    sources.value = [];
  } finally {
    sourcesLoaded.value = true;
  }
}

/* ---------- Source reader (drawer) ---------- */

export const reader = reactive({
  open: false,
  source: null as SourceRef | SourceRecord | null,
  siblings: [] as SourceRef[],
  page: 1,
  text: "",
  loading: false,
});

let pageToken = 0;

export function sourceIdOf(source: SourceRef | SourceRecord): string {
  return "sourceId" in source ? source.sourceId : source.id;
}

export function pageCountOf(source: SourceRef | SourceRecord | null): number {
  if (!source) return 0;
  const id = sourceIdOf(source);
  return sources.value.find((item) => item.id === id)?.page_count ?? 0;
}

export async function openReader(source: SourceRef | SourceRecord, siblings: SourceRef[] = []): Promise<void> {
  reader.open = true;
  reader.source = source;
  reader.siblings = siblings;
  reader.page = Math.max(1, "pageNumber" in source ? source.pageNumber : 1);
  await loadReaderPage();
}

export function closeReader(): void {
  reader.open = false;
}

export async function flipReaderPage(delta: number): Promise<void> {
  if (!reader.source) return;
  const next = reader.page + delta;
  const max = pageCountOf(reader.source) || Number.POSITIVE_INFINITY;
  if (next < 1 || next > max) return;
  reader.page = next;
  await loadReaderPage();
}

async function loadReaderPage(): Promise<void> {
  if (!reader.source) return;
  const token = ++pageToken;
  const id = sourceIdOf(reader.source);
  reader.loading = true;
  reader.text = "";
  try {
    const response = await fetch(`/api/sources/${encodeURIComponent(id)}/pages/${reader.page}`);
    const data = await response.json() as { page?: { clean_text: string } };
    if (token === pageToken) reader.text = data.page?.clean_text ?? "没有可展示的页级文本。";
  } catch {
    if (token === pageToken) reader.text = "原文暂时无法加载。";
  } finally {
    if (token === pageToken) reader.loading = false;
  }
}
