import { ref } from "vue";
import type { SourceRecord, SourceRef } from "./types";
import { originalHref } from "./utils";

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
  // Put the question in the hash. The chat page reads it on mount, so the
  // first visit still sends even when the page was not kept alive yet.
  location.hash = `#/chat?q=${encodeURIComponent(value)}`;
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

/** Opens the publisher page, or the stored PDF at the cited page. Does nothing when neither exists. */
export function openOriginal(source: SourceRef | SourceRecord): void {
  const href = originalHref(source);
  if (!href) return;
  window.open(href, "_blank", "noopener,noreferrer");
}
