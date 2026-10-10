import type { ExtractionMethod } from "@childcare/core";

/** A single extracted page (or a synthetic single page for non-paginated formats). */
export interface ExtractedPage {
  pageNumber: number;
  text: string;
  extractionMethod: ExtractionMethod;
  ocrConfidence?: number | null;
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  mimeType?: string;
  title?: string;
}
