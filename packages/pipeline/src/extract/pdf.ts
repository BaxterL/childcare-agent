import { readFile } from "node:fs/promises";
import { extractText as unpdfExtractText } from "unpdf";
import { normalizeText } from "./clean.js";
import type { ExtractedPage } from "./types.js";

/**
 * Extract text page-by-page from PDF bytes that carry a text layer. Scanned
 * pages produce empty text and are flagged `unknown` so the OCR queue can
 * pick them up later.
 */
export async function extractPdfBuffer(buffer: Uint8Array): Promise<ExtractedPage[]> {
  const { text } = await unpdfExtractText(Uint8Array.from(buffer), { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [text];
  return pageTexts.map((pageText, index) => {
    const normalized = normalizeText(pageText);
    return {
      pageNumber: index + 1,
      text: normalized,
      extractionMethod: normalized.length > 0 ? "text_layer" : "unknown",
    };
  });
}

export async function extractPdf(filePath: string): Promise<ExtractedPage[]> {
  return extractPdfBuffer(await readFile(filePath));
}
