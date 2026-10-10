import { randomUUID } from "node:crypto";
import type { KnowledgeSource } from "@childcare/core";
import type { DB } from "../db/database.js";

interface SourceRow {
  id: string;
  canonical_title: string;
  source_type: string;
  issuing_org: string | null;
  document_no: string | null;
  jurisdiction: string | null;
  authority_level: string;
  normative_status: string | null;
  access_level: string;
  source_url: string | null;
  copyright_owner: string | null;
  license_type: string | null;
  license_expiry: string | null;
  can_store_full_text: number;
  can_show_excerpt: number;
  can_export: number;
  purchase_record: string | null;
  notes: string | null;
  created_at: string;
}

/** Fields accepted when registering a new logical knowledge source. */
export interface NewSource {
  canonicalTitle: string;
  sourceType: string;
  authorityLevel: string;
  issuingOrg?: string | null;
  documentNo?: string | null;
  jurisdiction?: string | null;
  normativeStatus?: string | null;
  accessLevel?: string;
  sourceUrl?: string | null;
  copyrightOwner?: string | null;
  licenseType?: string | null;
  licenseExpiry?: string | null;
  canStoreFullText?: boolean;
  canShowExcerpt?: boolean;
  canExport?: boolean;
  purchaseRecord?: string | null;
  notes?: string | null;
}

function map(row: SourceRow): KnowledgeSource {
  return {
    id: row.id,
    canonicalTitle: row.canonical_title,
    sourceType: row.source_type,
    issuingOrg: row.issuing_org,
    documentNo: row.document_no,
    jurisdiction: row.jurisdiction,
    authorityLevel: row.authority_level,
    normativeStatus: row.normative_status,
    accessLevel: row.access_level,
    sourceUrl: row.source_url,
    copyrightOwner: row.copyright_owner,
    licenseType: row.license_type,
    licenseExpiry: row.license_expiry,
    canStoreFullText: row.can_store_full_text === 1,
    canShowExcerpt: row.can_show_excerpt === 1,
    canExport: row.can_export === 1,
    purchaseRecord: row.purchase_record,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class SourceRepository {
  constructor(private readonly db: DB) {}

  create(input: NewSource): KnowledgeSource {
    const source: KnowledgeSource = {
      id: randomUUID(),
      canonicalTitle: input.canonicalTitle,
      sourceType: input.sourceType,
      issuingOrg: input.issuingOrg ?? null,
      documentNo: input.documentNo ?? null,
      jurisdiction: input.jurisdiction ?? null,
      authorityLevel: input.authorityLevel,
      normativeStatus: input.normativeStatus ?? null,
      accessLevel: input.accessLevel ?? "internal",
      sourceUrl: input.sourceUrl ?? null,
      copyrightOwner: input.copyrightOwner ?? null,
      licenseType: input.licenseType ?? null,
      licenseExpiry: input.licenseExpiry ?? null,
      canStoreFullText: input.canStoreFullText ?? false,
      canShowExcerpt: input.canShowExcerpt ?? true,
      canExport: input.canExport ?? false,
      purchaseRecord: input.purchaseRecord ?? null,
      notes: input.notes ?? null,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO knowledge_sources (
           id, canonical_title, source_type, issuing_org, document_no, jurisdiction,
           authority_level, normative_status, access_level, source_url,
           copyright_owner, license_type, license_expiry, can_store_full_text,
           can_show_excerpt, can_export, purchase_record, notes, created_at
         ) VALUES (
           @id, @canonical_title, @source_type, @issuing_org, @document_no, @jurisdiction,
           @authority_level, @normative_status, @access_level, @source_url,
           @copyright_owner, @license_type, @license_expiry, @can_store_full_text,
           @can_show_excerpt, @can_export, @purchase_record, @notes, @created_at
         )`,
      )
      .run({
        id: source.id,
        canonical_title: source.canonicalTitle,
        source_type: source.sourceType,
        issuing_org: source.issuingOrg,
        document_no: source.documentNo,
        jurisdiction: source.jurisdiction,
        authority_level: source.authorityLevel,
        normative_status: source.normativeStatus,
        access_level: source.accessLevel,
        source_url: source.sourceUrl,
        copyright_owner: source.copyrightOwner,
        license_type: source.licenseType,
        license_expiry: source.licenseExpiry,
        can_store_full_text: source.canStoreFullText ? 1 : 0,
        can_show_excerpt: source.canShowExcerpt ? 1 : 0,
        can_export: source.canExport ? 1 : 0,
        purchase_record: source.purchaseRecord,
        notes: source.notes,
        created_at: source.createdAt,
      });
    return source;
  }

  findById(id: string): KnowledgeSource | null {
    const row = this.db
      .prepare("SELECT * FROM knowledge_sources WHERE id = ?")
      .get(id) as SourceRow | undefined;
    return row ? map(row) : null;
  }

  findByTitle(canonicalTitle: string): KnowledgeSource | null {
    const row = this.db
      .prepare("SELECT * FROM knowledge_sources WHERE canonical_title = ? LIMIT 1")
      .get(canonicalTitle) as SourceRow | undefined;
    return row ? map(row) : null;
  }

  list(): KnowledgeSource[] {
    const rows = this.db
      .prepare("SELECT * FROM knowledge_sources ORDER BY created_at DESC")
      .all() as SourceRow[];
    return rows.map(map);
  }
}
