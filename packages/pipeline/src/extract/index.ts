import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { normalizeText } from "./clean.js";
import { extractDocx, extractDocxBuffer } from "./docx.js";
import { extractHtml } from "./html.js";
import { extractMarkdown, extractPlainText } from "./markdown.js";
import { extractPdf, extractPdfBuffer } from "./pdf.js";
import type { ExtractionResult } from "./types.js";

export * from "./types.js";
export { normalizeText } from "./clean.js";
export { extractHtml } from "./html.js";
export { extractPdfBuffer } from "./pdf.js";
export { extractDocxBuffer } from "./docx.js";

/** Thrown when an uploaded file is a type this product does not read. */
export class UploadExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadExtractError";
  }
}

/**
 * Read one user upload into plain text. PDF and Word stay on the formats the
 * knowledge pipeline already understands; legacy .doc is refused in words.
 */
export async function extractUpload(filename: string, data: Uint8Array): Promise<string> {
  const ext = extname(filename).toLowerCase();
  if (ext === ".pdf") {
    const pages = await extractPdfBuffer(data);
    return pages.map((page) => page.text).filter(Boolean).join("\n\n").trim();
  }
  if (ext === ".docx") {
    const pages = await extractDocxBuffer(data);
    return pages.map((page) => page.text).filter(Boolean).join("\n\n").trim();
  }
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
    return normalizeText(Buffer.from(data).toString("utf8"));
  }
  if (ext === ".doc") {
    throw new UploadExtractError("暂不支持旧版 Word（.doc），请另存为 .docx 后再上传。");
  }
  throw new UploadExtractError("请上传 PDF、Word（.docx）或文本文件。");
}

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
