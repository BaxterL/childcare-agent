import mammoth from "mammoth";
import { normalizeText } from "./clean.js";
import type { ExtractedPage } from "./types.js";

/** DOCX has no fixed pagination, so the whole document becomes one page. */
export async function extractDocx(filePath: string): Promise<ExtractedPage[]> {
  const result = await mammoth.extractRawText({ path: filePath });
  return [
    {
      pageNumber: 1,
      text: normalizeText(result.value),
      extractionMethod: "docx",
    },
  ];
}
