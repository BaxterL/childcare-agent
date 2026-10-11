import DOMPurify from "dompurify";
import { marked } from "marked";
import type { ChatMessage } from "./types";

export function statusLabel(status: string): string {
  return ({ in_force: "现行有效", superseded: "已被替代", withdrawn: "已撤回", draft: "草案", unknown: "效力待核" } as Record<string, string>)[status] ?? status;
}

export function statusTone(status: string): string {
  if (status === "in_force") return "is-ok";
  if (status === "superseded" || status === "withdrawn") return "is-warn";
  return "is-mute";
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

/**
 * Finds the passage an excerpt came from inside a full page of text, ignoring
 * whitespace differences. The excerpt is truncated with "…" by the server.
 */
export function locateExcerpt(text: string, excerpt: string): [number, number] | null {
  const needle = excerpt.replace(/…+$/u, "").replace(/\s+/g, "");
  if (needle.length < 8) return null;
  const positions: number[] = [];
  let flat = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (/\s/.test(char)) continue;
    positions.push(i);
    flat += char;
  }
  let start = flat.indexOf(needle);
  let length = needle.length;
  if (start < 0) {
    start = flat.indexOf(needle.slice(0, 20));
    if (start < 0) return null;
    length = Math.min(needle.length, flat.length - start);
  }
  return [positions[start]!, positions[start + length - 1]! + 1];
}

/* ---------- Answer rendering ---------- */

const answerCache = new Map<string, string>();

/**
 * When answer generation is unavailable the server replies with a plain list of
 * retrieved passages whose wording is meant for operators. Readers get a
 * product-appropriate version of that same list instead.
 */
const OPERATOR_WORDING = /Ollama|模型服务|联网模型|本机模型/;

export function friendlyContent(message: Pick<ChatMessage, "content" | "sources">): string {
  if (!OPERATOR_WORDING.test(message.content)) return message.content;
  const passages = (message.sources ?? []).slice(0, 3).map((source) => {
    const text = source.excerpt.replace(/\s+/g, " ").trim();
    const clipped = text.length > 110 ? `${text.slice(0, 110)}…` : text;
    return `- 《${source.title}》第${source.pageNumber}页：${clipped} [${source.index}]`;
  });
  return [
    "这个问题的完整答复暂时没能整理出来，先为你找到了最相关的几处原文，可以对照核对：",
    "",
    ...passages,
    "",
    "稍后重试一次，即可获得整理好的答复。",
  ].join("\n");
}

export function renderAnswer(message: ChatMessage): string {
  const content = friendlyContent(message);
  const key = `${message.id}:${content.length}:${message.sources?.length ?? 0}`;
  const cached = answerCache.get(key);
  if (cached !== undefined) return cached;
  const raw = marked.parse(content, { async: false }) as string;
  const clean = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  const html = linkCitations(clean, message);
  if (answerCache.size > 300) answerCache.clear();
  answerCache.set(key, html);
  return html;
}

/** Turns "[1]" markers in the sanitized answer into clickable seal-style citations. */
function linkCitations(html: string, message: ChatMessage): string {
  const byIndex = new Map((message.sources ?? []).map((source) => [source.index, source]));
  if (!byIndex.size || !/\[\d{1,2}\]/.test(html)) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (/\[\d{1,2}\]/.test(node.nodeValue ?? "") && !node.parentElement?.closest("code, pre")) targets.push(node as Text);
  }
  for (const node of targets) {
    const text = node.nodeValue ?? "";
    const fragment = doc.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(/\[(\d{1,2})\]/g)) {
      const index = Number(match[1]);
      const source = byIndex.get(index);
      if (!source) continue;
      const start = match.index ?? 0;
      fragment.append(text.slice(last, start));
      const mark = doc.createElement("sup");
      mark.className = "cite";
      mark.dataset.cite = String(index);
      mark.tabIndex = 0;
      mark.setAttribute("role", "button");
      mark.setAttribute("aria-label", `查看引用 ${index}：${source.title}第${source.pageNumber}页`);
      mark.textContent = String(index);
      fragment.append(mark);
      last = start + match[0].length;
    }
    fragment.append(text.slice(last));
    node.replaceWith(fragment);
  }
  return doc.body.innerHTML;
}
