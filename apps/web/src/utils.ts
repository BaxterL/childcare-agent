import DOMPurify from "dompurify";
import { marked } from "marked";
import type { ChatMessage, SourceRecord, SourceRef } from "./types";

/** Where a citation should open. PDF files land on the cited page; other sources use the publisher URL. */
export function originalHref(source: SourceRef | SourceRecord): string | null {
  const page = "pageNumber" in source && source.pageNumber > 0 ? source.pageNumber : 1;
  const id = "sourceId" in source ? source.sourceId : source.id;
  if (source.preview === "pdf") return `/api/sources/${encodeURIComponent(id)}/file#page=${page}`;
  const link = "sourceUrl" in source ? source.sourceUrl : source.source_url;
  if ((source.preview === "link" || source.preview == null) && link && /^https?:\/\//i.test(link)) return link;
  return null;
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

/* ---------- Answer rendering ---------- */

const answerCache = new Map<string, string>();

/**
 * When answer generation is unavailable the server replies with a plain list of
 * retrieved passages whose wording is meant for operators. Readers get a
 * product-appropriate version of that same list instead.
 */
const OPERATOR_WORDING = /Ollama|模型服务|联网模型|本机模型/;

export function friendlyContent(message: Pick<ChatMessage, "content">): string {
  if (!OPERATOR_WORDING.test(message.content)) return message.content;
  return "完整答复暂时没能整理出来。下面的条目可以打开原文核对，稍后重试一次即可获得整理好的答复。";
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
