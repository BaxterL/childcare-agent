import { randomUUID } from "node:crypto";
import type { KnowledgeChunk } from "@childcare/core";
import type { DB } from "../db/database.js";
import type { DraftChunk } from "../chunk/chunker.js";

interface ChunkRow {
  id: string;
  version_id: string;
  chunk_index: number;
  page_start: number;
  page_end: number;
  section_path: string | null;
  article_number: string | null;
  paragraph_number: number | null;
  content_type: string;
  text: string;
  normalized_text: string;
  chunk_hash: string;
  char_count: number;
  previous_chunk_id: string | null;
  next_chunk_id: string | null;
  embedding_model: string | null;
  created_at: string;
}

export interface EmbeddingEntry {
  chunkIndex: number;
  vector: Float32Array;
}

/** Columns returned by listByVersion — everything except the embedding blob. */
const CHUNK_COLUMNS = `id, version_id, chunk_index, page_start, page_end, section_path, article_number,
  paragraph_number, content_type, text, normalized_text, chunk_hash, char_count,
  previous_chunk_id, next_chunk_id, embedding_model, created_at`;

function map(row: ChunkRow): KnowledgeChunk {
  return {
    id: row.id,
    versionId: row.version_id,
    chunkIndex: row.chunk_index,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    sectionPath: row.section_path,
    articleNumber: row.article_number,
    paragraphNumber: row.paragraph_number,
    contentType: row.content_type,
    text: row.text,
    normalizedText: row.normalized_text,
    chunkHash: row.chunk_hash,
    charCount: row.char_count,
    previousChunkId: row.previous_chunk_id,
    nextChunkId: row.next_chunk_id,
    embeddingModel: row.embedding_model,
    createdAt: row.created_at,
  };
}

export class ChunkRepository {
  constructor(private readonly db: DB) {}

  /**
   * Rebuild every chunk for one version, linking neighbours in order. Existing
   * chunks for the version are removed first so ingestion and reindex are
   * idempotent.
   */
  replaceForVersion(versionId: string, drafts: DraftChunk[]): number {
    const ids = drafts.map(() => randomUUID());
    const createdAt = new Date().toISOString();
    const statement = this.db.prepare(
      `INSERT INTO knowledge_chunks (
         id, version_id, chunk_index, page_start, page_end, section_path, article_number,
         paragraph_number, content_type, text, normalized_text, chunk_hash, char_count,
         previous_chunk_id, next_chunk_id, created_at
       ) VALUES (
         @id, @version_id, @chunk_index, @page_start, @page_end, @section_path, @article_number,
         @paragraph_number, @content_type, @text, @normalized_text, @chunk_hash, @char_count,
         @previous_chunk_id, @next_chunk_id, @created_at
       )`,
    );
    const replace = this.db.transaction((rows: DraftChunk[]) => {
      this.db.prepare("DELETE FROM knowledge_chunks WHERE version_id = ?").run(versionId);
      rows.forEach((draft, position) => {
        statement.run({
          id: ids[position],
          version_id: versionId,
          chunk_index: draft.chunkIndex,
          page_start: draft.pageStart,
          page_end: draft.pageEnd,
          section_path: draft.sectionPath,
          article_number: draft.articleNumber,
          paragraph_number: draft.paragraphNumber,
          content_type: draft.contentType,
          text: draft.text,
          normalized_text: draft.normalizedText,
          chunk_hash: draft.chunkHash,
          char_count: draft.charCount,
          previous_chunk_id: position > 0 ? ids[position - 1] : null,
          next_chunk_id: position < ids.length - 1 ? ids[position + 1] : null,
          created_at: createdAt,
        });
      });
      return rows.length;
    });
    return replace(drafts);
  }

  /** Persist embedding vectors for a version's chunks and tag them with the model id. */
  updateEmbeddings(versionId: string, modelId: string, entries: EmbeddingEntry[]): number {
    if (entries.length === 0) return 0;
    const statement = this.db.prepare(
      "UPDATE knowledge_chunks SET embedding = @embedding, embedding_model = @model WHERE version_id = @version AND chunk_index = @index",
    );
    const update = this.db.transaction((rows: EmbeddingEntry[]) => {
      for (const entry of rows) {
        const vector = entry.vector;
        statement.run({
          embedding: Buffer.from(vector.buffer.slice(vector.byteOffset, vector.byteOffset + vector.byteLength)),
          model: modelId,
          version: versionId,
          index: entry.chunkIndex,
        });
      }
      return rows.length;
    });
    return update(entries);
  }

  listByVersion(versionId: string): KnowledgeChunk[] {
    const rows = this.db
      .prepare(`SELECT ${CHUNK_COLUMNS} FROM knowledge_chunks WHERE version_id = ? ORDER BY chunk_index ASC`)
      .all(versionId) as ChunkRow[];
    return rows.map(map);
  }

  countByVersion(versionId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM knowledge_chunks WHERE version_id = ?")
      .get(versionId) as { n: number };
    return row.n;
  }

  countAll(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM knowledge_chunks").get() as { n: number };
    return row.n;
  }

  /** Number of chunks that carry a vector for the given model. */
  countEmbedded(modelId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM knowledge_chunks WHERE embedding_model = ? AND embedding IS NOT NULL")
      .get(modelId) as { n: number };
    return row.n;
  }
}
