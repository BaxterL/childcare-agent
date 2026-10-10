import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { normalizeText } from "./clean.js";
import type { ExtractedPage } from "./types.js";

export interface HtmlExtraction {
  page: ExtractedPage;
  title?: string;
}

/**
 * Extract the main article content from an HTML page. Uses Mozilla Readability
 * first (best signal for policy/news pages) and falls back to raw body text.
 */
export function extractHtml(html: string, url?: string): HtmlExtraction {
  const dom = new JSDOM(html, url ? { url } : undefined);
  const document = dom.window.document;

  let content = "";
  let title: string | undefined;
  try {
    const article = new Readability(document).parse();
    if (article) {
      content = article.textContent ?? "";
      title = article.title ?? undefined;
    }
  } catch {
    // fall through to body text
  }

  if (content.trim().length === 0) {
    content = document.body?.textContent ?? "";
    title = title ?? document.title ?? undefined;
  }

  return {
    page: {
      pageNumber: 1,
      text: normalizeText(content),
      extractionMethod: "html",
    },
    title: title?.trim() || undefined,
  };
}
