import { readFile } from "node:fs/promises";
import { normalizeText } from "./clean.js";
import type { ExtractedPage } from "./types.js";

export async function extractMarkdown(filePath: string): Promise<ExtractedPage[]> {
  const raw = await readFile(filePath, "utf8");
  return [
    {
      pageNumber: 1,
      text: normalizeText(raw),
      extractionMethod: "markdown",
    },
  ];
}

export async function extractPlainText(filePath: string): Promise<ExtractedPage[]> {
  const raw = await readFile(filePath, "utf8");
  return [
    {
      pageNumber: 1,
      text: normalizeText(raw),
      extractionMethod: "plain_text",
    },
  ];
}
