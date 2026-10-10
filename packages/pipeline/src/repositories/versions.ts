import { randomUUID } from "node:crypto";
import type { KnowledgeVersion } from "@childcare/core";
import { toBool, type DB } from "../db/database.js";

interface VersionRow {
  id: string;
  source_id: string;
  version_label: string;
  sha256: string;
  file_path: string;
  original_filename: string;
  mime_type: string | null;
  byte_size: number;
  source_url: string | null;
  published_at: string | null;
  effective_from: string | null;
  effective_to: string | null;
  legal_status: string;
  is_active: number;
  supersedes_version_id: string | null;
  verified_at: string | null;
  verified_by: string | null;
  ingestion_run_id: string | null;
  created_at: string;
}

export interface NewVersion {
  sourceId: string;
  versionLabel: string;
  sha256: string;
  filePath: string;
  originalFilename: string;
  mimeType?: string | null;
  byteSize: number;
  sourceUrl?: string | null;
  publishedAt?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  legalStatus?: string;
  isActive?: boolean;
  supersedesVersionId?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  ingestionRunId?: string | null;
}

function map(row: VersionRow): KnowledgeVersion {
  return {
    id: row.id,
    sourceId: row.source_id,
    versionLabel: row.version_label,
    sha256: row.sha256,
    filePath: row.file_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    legalStatus: row.legal_status,
    isActive: toBool(row.is_active),
    supersedesVersionId: row.supersedes_version_id,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    ingestionRunId: row.ingestion_run_id,
    createdAt: row.created_at,
  };
}

export class VersionRepository {
  constructor(private readonly db: DB) {}

  create(input: NewVersion): KnowledgeVersion {
    const version: KnowledgeVersion = {
      id: randomUUID(),
      sourceId: input.sourceId,
      versionLabel: input.versionLabel,
      sha256: input.sha256,
      filePath: input.filePath,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType ?? null,
      byteSize: input.byteSize,
      sourceUrl: input.sourceUrl ?? null,
      publishedAt: input.publishedAt ?? null,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveTo: input.effectiveTo ?? null,
      legalStatus: input.legalStatus ?? "unknown",
      isActive: input.isActive ?? true,
      supersedesVersionId: input.supersedesVersionId ?? null,
      verifiedAt: input.verifiedAt ?? null,
      verifiedBy: input.verifiedBy ?? null,
      ingestionRunId: input.ingestionRunId ?? null,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO knowledge_versions (
           id, source_id, version_label, sha256, file_path, original_filename, mime_type,
           byte_size, source_url, published_at, effective_from, effective_to, legal_status,
           is_active, supersedes_version_id, verified_at, verified_by, ingestion_run_id, created_at
         ) VALUES (
           @id, @source_id, @version_label, @sha256, @file_path, @original_filename, @mime_type,
           @byte_size, @source_url, @published_at, @effective_from, @effective_to, @legal_status,
           @is_active, @supersedes_version_id, @verified_at, @verified_by, @ingestion_run_id, @created_at
         )`,
      )
      .run({
        id: version.id,
        source_id: version.sourceId,
        version_label: version.versionLabel,
        sha256: version.sha256,
        file_path: version.filePath,
        original_filename: version.originalFilename,
        mime_type: version.mimeType,
        byte_size: version.byteSize,
        source_url: version.sourceUrl,
        published_at: version.publishedAt,
        effective_from: version.effectiveFrom,
        effective_to: version.effectiveTo,
        legal_status: version.legalStatus,
        is_active: version.isActive ? 1 : 0,
        supersedes_version_id: version.supersedesVersionId,
        verified_at: version.verifiedAt,
        verified_by: version.verifiedBy,
        ingestion_run_id: version.ingestionRunId,
        created_at: version.createdAt,
      });
    return version;
  }

  findById(id: string): KnowledgeVersion | null {
    const row = this.db
      .prepare("SELECT * FROM knowledge_versions WHERE id = ?")
      .get(id) as VersionRow | undefined;
    return row ? map(row) : null;
  }

  findBySourceAndSha(sourceId: string, sha256: string): KnowledgeVersion | null {
    const row = this.db
      .prepare("SELECT * FROM knowledge_versions WHERE source_id = ? AND sha256 = ?")
      .get(sourceId, sha256) as VersionRow | undefined;
    return row ? map(row) : null;
  }

  listBySource(sourceId: string): KnowledgeVersion[] {
    const rows = this.db
      .prepare("SELECT * FROM knowledge_versions WHERE source_id = ? ORDER BY created_at DESC")
      .all(sourceId) as VersionRow[];
    return rows.map(map);
  }

  list(): KnowledgeVersion[] {
    const rows = this.db
      .prepare("SELECT * FROM knowledge_versions ORDER BY created_at DESC")
      .all() as VersionRow[];
    return rows.map(map);
  }
}
