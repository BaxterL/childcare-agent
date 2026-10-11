import mammoth from "mammoth";
import { normalizeText } from "./clean.js";
import type { ExtractedPage } from "./types.js";

function pageFromDocx(value: string): ExtractedPage[] {
  return [
    {
      pageNumber: 1,
      text: normalizeText(value),
      extractionMethod: "docx",
    },
  ];
}

/** DOCX has no fixed pagination, so the whole document becomes one page. */
export async function extractDocx(filePath: string): Promise<ExtractedPage[]> {
  const result = await mammoth.extractRawText({ path: filePath });
  return pageFromDocx(result.value);
}

export async function extractDocxBuffer(data: Uint8Array): Promise<ExtractedPage[]> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
  return pageFromDocx(result.value);
}
