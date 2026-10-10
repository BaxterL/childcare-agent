import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { extractDocx } from "./docx.js";
import { extractHtml } from "./html.js";
import { extractMarkdown, extractPlainText } from "./markdown.js";
import { extractPdf } from "./pdf.js";
import type { ExtractionResult } from "./types.js";

export * from "./types.js";
export { normalizeText } from "./clean.js";
export { extractHtml } from "./html.js";
export { extractPdfBuffer } from "./pdf.js";

/** File extensions the collection pipeline can parse today. */
export const SUPPORTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".md",
  ".markdown",
  ".txt",
  ".html",
  ".htm",
] as const;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".html": "text/html",
  ".htm": "text/html",
};

export function isSupportedFile(filePath: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extname(filePath).toLowerCase());
}

export function mimeTypeForPath(filePath: string): string | undefined {
  return MIME_BY_EXTENSION[extname(filePath).toLowerCase()];
}

/** Extract pages from a local file, dispatching on its extension. */
export async function extractFile(filePath: string): Promise<ExtractionResult> {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".pdf":
      return { pages: await extractPdf(filePath), mimeType: MIME_BY_EXTENSION[".pdf"] };
    case ".docx":
      return { pages: await extractDocx(filePath), mimeType: MIME_BY_EXTENSION[".docx"] };
    case ".md":
    case ".markdown":
      return { pages: await extractMarkdown(filePath), mimeType: MIME_BY_EXTENSION[".md"] };
    case ".txt":
      return { pages: await extractPlainText(filePath), mimeType: MIME_BY_EXTENSION[".txt"] };
    case ".html":
    case ".htm": {
      const html = await readFile(filePath, "utf8");
      const { page, title } = extractHtml(html);
      return { pages: [page], mimeType: MIME_BY_EXTENSION[".html"], title };
    }
    default:
      throw new Error(`unsupported file type: ${ext || "(no extension)"}`);
  }
}
