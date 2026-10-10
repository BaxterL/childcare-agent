import { randomUUID } from "node:crypto";
import type { IngestionRun, IngestionStatus } from "@childcare/core";
import type { DB } from "../db/database.js";

interface RunRow {
  id: string;
  status: string;
  input_path: string | null;
  input_url: string | null;
  source_id: string | null;
  version_id: string | null;
  page_count: number;
  char_count: number;
  error: string | null;
  notes: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface NewRun {
  inputPath?: string | null;
  inputUrl?: string | null;
  sourceId?: string | null;
  notes?: string | null;
}

export interface FinishRun {
  status: IngestionStatus;
  versionId?: string | null;
  pageCount?: number;
  charCount?: number;
  error?: string | null;
  notes?: string | null;
}

function map(row: RunRow): IngestionRun {
  return {
    id: row.id,
    status: row.status,
    inputPath: row.input_path,
    inputUrl: row.input_url,
    sourceId: row.source_id,
    versionId: row.version_id,
    pageCount: row.page_count,
    charCount: row.char_count,
    error: row.error,
    notes: row.notes,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export class IngestionRunRepository {
  constructor(private readonly db: DB) {}

  start(input: NewRun): IngestionRun {
    const run: IngestionRun = {
      id: randomUUID(),
      status: "running",
      inputPath: input.inputPath ?? null,
      inputUrl: input.inputUrl ?? null,
      sourceId: input.sourceId ?? null,
      versionId: null,
      pageCount: 0,
      charCount: 0,
      error: null,
      notes: input.notes ?? null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.db
      .prepare(
        `INSERT INTO ingestion_runs (
           id, status, input_path, input_url, source_id, version_id,
           page_count, char_count, error, notes, started_at, finished_at
         ) VALUES (
           @id, @status, @input_path, @input_url, @source_id, @version_id,
           @page_count, @char_count, @error, @notes, @started_at, @finished_at
         )`,
      )
      .run({
        id: run.id,
        status: run.status,
        input_path: run.inputPath,
        input_url: run.inputUrl,
        source_id: run.sourceId,
        version_id: run.versionId,
        page_count: run.pageCount,
        char_count: run.charCount,
        error: run.error,
        notes: run.notes,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
      });
    return run;
  }

  finish(runId: string, result: FinishRun): void {
    this.db
      .prepare(
        `UPDATE ingestion_runs SET
           status = @status, version_id = @version_id, page_count = @page_count,
           char_count = @char_count, error = @error, notes = @notes, finished_at = @finished_at
         WHERE id = @id`,
      )
      .run({
        id: runId,
        status: result.status,
        version_id: result.versionId ?? null,
        page_count: result.pageCount ?? 0,
        char_count: result.charCount ?? 0,
        error: result.error ?? null,
        notes: result.notes ?? null,
        finished_at: new Date().toISOString(),
      });
  }

  findById(id: string): IngestionRun | null {
    const row = this.db
      .prepare("SELECT * FROM ingestion_runs WHERE id = ?")
      .get(id) as RunRow | undefined;
    return row ? map(row) : null;
  }

  list(limit = 50): IngestionRun[] {
    const rows = this.db
      .prepare("SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT ?")
      .all(limit) as RunRow[];
    return rows.map(map);
  }
}
