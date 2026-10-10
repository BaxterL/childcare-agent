import { randomUUID } from "node:crypto";
import type { ExtractionMethod, KnowledgePage } from "@childcare/core";
import { toBool, type DB } from "../db/database.js";

interface PageRow {
  id: string;
  version_id: string;
  page_number: number;
  raw_text: string;
  clean_text: string;
  extraction_method: string;
  ocr_confidence: number | null;
  is_empty: number;
  char_count: number;
}

export interface NewPage {
  versionId: string;
  pageNumber: number;
  rawText: string;
  cleanText: string;
  extractionMethod: ExtractionMethod;
  ocrConfidence?: number | null;
}

function map(row: PageRow): KnowledgePage {
  return {
    id: row.id,
    versionId: row.version_id,
    pageNumber: row.page_number,
    rawText: row.raw_text,
    cleanText: row.clean_text,
    extractionMethod: row.extraction_method,
    ocrConfidence: row.ocr_confidence,
    isEmpty: toBool(row.is_empty),
    charCount: row.char_count,
  };
}

export class PageRepository {
  constructor(private readonly db: DB) {}

  /** Insert many pages for one version inside a single transaction. */
  insertMany(pages: NewPage[]): number {
    const statement = this.db.prepare(
      `INSERT INTO knowledge_pages (
         id, version_id, page_number, raw_text, clean_text, extraction_method,
         ocr_confidence, is_empty, char_count
       ) VALUES (
         @id, @version_id, @page_number, @raw_text, @clean_text, @extraction_method,
         @ocr_confidence, @is_empty, @char_count
       )`,
    );
    const insertAll = this.db.transaction((rows: NewPage[]) => {
      for (const page of rows) {
        const cleanText = page.cleanText.trim();
        statement.run({
          id: randomUUID(),
          version_id: page.versionId,
          page_number: page.pageNumber,
          raw_text: page.rawText,
          clean_text: cleanText,
          extraction_method: page.extractionMethod,
          ocr_confidence: page.ocrConfidence ?? null,
          is_empty: cleanText.length === 0 ? 1 : 0,
          char_count: cleanText.length,
        });
      }
      return rows.length;
    });
    return insertAll(pages);
  }

  listByVersion(versionId: string): KnowledgePage[] {
    const rows = this.db
      .prepare("SELECT * FROM knowledge_pages WHERE version_id = ? ORDER BY page_number ASC")
      .all(versionId) as PageRow[];
    return rows.map(map);
  }

  countByVersion(versionId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM knowledge_pages WHERE version_id = ?")
      .get(versionId) as { n: number };
    return row.n;
  }
}
