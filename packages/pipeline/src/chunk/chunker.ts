import { sha256Text, type ChunkContentType } from "@childcare/core";

/** A page handed to the chunker. Text is expected to be already normalised. */
export interface ChunkSourcePage {
  pageNumber: number;
  text: string;
}

/** A chunk before ids, ordering links and persistence are assigned. */
export interface DraftChunk {
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  sectionPath: string | null;
  articleNumber: string | null;
  paragraphNumber: number | null;
  contentType: ChunkContentType;
  text: string;
  normalizedText: string;
  chunkHash: string;
  charCount: number;
}

const MAX_CHUNK_CHARS = 700;
const MIN_BODY_CHARS = 12;
const MAX_HEADING_CHARS = 24;

const CHAPTER_RE = /^第\s*[一二三四五六七八九十百零〇]+\s*章/;
const SECTION_RE = /^第\s*[一二三四五六七八九十百零〇]+\s*节/;
const ARTICLE_RE = /^第\s*([一二三四五六七八九十百零〇]+)\s*条/;
const ITEM_RE = /^[一二三四五六七八九十]{1,3}、/;
const LIST_RE = /^(（[一二三四五六七八九十\d]+）|\([一二三四五六七八九十\d]+\)|[一二三四五六七八九十]{1,3}、|\d+[.、]|[-*•·]|[①-⑳])/;

/** Whitespace-collapsed, lower-cased form used for matching and hashing. */
export function normalizeForSearch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

interface Heading {
  kind: "chapter" | "section" | "item";
  title: string;
}

/** Treat a short, non-sentence line as a structural heading. */
function detectHeading(line: string): Heading | null {
  const bare = line.trim();
  if (!bare || bare.length > MAX_HEADING_CHARS || /[。；;]$/.test(bare)) return null;
  if (CHAPTER_RE.test(bare)) return { kind: "chapter", title: bare };
  if (SECTION_RE.test(bare)) return { kind: "section", title: bare };
  if (ITEM_RE.test(bare)) return { kind: "item", title: bare };
  return null;
}

function classifyBody(text: string): ChunkContentType {
  const first = text.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
  return LIST_RE.test(first) ? "list" : "body";
}

/** Split page text into paragraphs on blank lines and single newlines. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function buildDraft(
  index: number,
  pageNumber: number,
  text: string,
  contentType: ChunkContentType,
  section: { chapter: string | null; section: string | null; article: string | null },
  paragraphNumber: number,
  articleOverride?: string | null,
): DraftChunk | null {
  const trimmed = text.trim();
  if (contentType !== "heading" && trimmed.length < MIN_BODY_CHARS) return null;
  const normalizedText = normalizeForSearch(trimmed);
  const sectionPath = [section.chapter, section.section].filter(Boolean).join(" > ") || null;
  return {
    chunkIndex: index,
    pageStart: pageNumber,
    pageEnd: pageNumber,
    sectionPath,
    articleNumber: articleOverride ?? section.article,
    paragraphNumber,
    contentType,
    text: trimmed,
    normalizedText,
    chunkHash: sha256Text(normalizedText),
    charCount: trimmed.length,
  };
}

/**
 * Chunk pages into retrieval units while preserving document structure.
 * Chapter/section/article state carries across page boundaries (so a PDF page
 * that continues 第十二条 is still labelled correctly), and chunks themselves
 * never span pages so every citation keeps a single page number.
 */
export function chunkPages(pages: ChunkSourcePage[]): DraftChunk[] {
  const drafts: DraftChunk[] = [];
  const state: { chapter: string | null; section: string | null; article: string | null } = {
    chapter: null,
    section: null,
    article: null,
  };
  let paragraphNumber = 0;
  let index = 0;

  const push = (text: string, pageNumber: number, type: ChunkContentType, articleOverride?: string | null): void => {
    const draft = buildDraft(index, pageNumber, text, type, state, paragraphNumber, articleOverride);
    if (draft) {
      drafts.push(draft);
      index += 1;
    }
  };

  for (const page of pages) {
    const paragraphs = splitParagraphs(page.text);
    let buffer: string[] = [];
    let bufferLength = 0;
    let bufferArticle: string | null = null;

    const flush = (): void => {
      if (buffer.length === 0) return;
      const text = buffer.join("\n");
      push(text, page.pageNumber, classifyBody(text), bufferArticle ?? state.article);
      buffer = [];
      bufferLength = 0;
      bufferArticle = null;
    };

    for (const paragraph of paragraphs) {
      const heading = detectHeading(paragraph);
      if (heading) {
        flush();
        if (heading.kind === "chapter") {
          state.chapter = heading.title;
          state.section = null;
          state.article = null;
        } else {
          state.section = heading.title;
          state.article = null;
        }
        paragraphNumber += 1;
        push(heading.title, page.pageNumber, "heading");
        continue;
      }

      const article = paragraph.match(ARTICLE_RE);
      if (article) state.article = `第${article[1]}条`;

      if (buffer.length > 0 && bufferLength + paragraph.length + 1 > MAX_CHUNK_CHARS) flush();
      if (buffer.length === 0) bufferArticle = state.article;
      buffer.push(paragraph);
      bufferLength += paragraph.length + 1;
    }

    flush();
    // A page boundary ends the current chunk so citations never span pages.
    paragraphNumber += 1;
  }

  return drafts;
}
