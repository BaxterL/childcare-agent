/**
 * Versioned migrations. Each entry is appended to the array; the SQLite
 * `user_version` pragma tracks how many have been applied. Never edit a
 * migration that has shipped — add a new one instead.
 */
export const migrations: string[] = [
  /* 001 — source, version, page and ingestion-run tables (PROJECT_PLAN 7.1-7.5) */
  `
  CREATE TABLE knowledge_sources (
    id                   TEXT PRIMARY KEY,
    canonical_title      TEXT NOT NULL,
    source_type          TEXT NOT NULL,
    issuing_org          TEXT,
    document_no          TEXT,
    jurisdiction         TEXT,
    authority_level      TEXT NOT NULL,
    normative_status     TEXT,
    access_level         TEXT NOT NULL DEFAULT 'internal',
    source_url           TEXT,
    copyright_owner      TEXT,
    license_type         TEXT,
    license_expiry       TEXT,
    can_store_full_text  INTEGER NOT NULL DEFAULT 0,
    can_show_excerpt     INTEGER NOT NULL DEFAULT 1,
    can_export           INTEGER NOT NULL DEFAULT 0,
    purchase_record      TEXT,
    notes                TEXT,
    created_at           TEXT NOT NULL
  );

  CREATE TABLE knowledge_versions (
    id                    TEXT PRIMARY KEY,
    source_id             TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    version_label         TEXT NOT NULL,
    sha256                TEXT NOT NULL,
    file_path             TEXT NOT NULL,
    original_filename     TEXT NOT NULL,
    mime_type             TEXT,
    byte_size             INTEGER NOT NULL,
    source_url            TEXT,
    published_at          TEXT,
    effective_from        TEXT,
    effective_to          TEXT,
    legal_status          TEXT NOT NULL DEFAULT 'unknown',
    is_active             INTEGER NOT NULL DEFAULT 1,
    supersedes_version_id TEXT REFERENCES knowledge_versions(id),
    verified_at           TEXT,
    verified_by           TEXT,
    ingestion_run_id      TEXT,
    created_at            TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_versions_source_sha ON knowledge_versions(source_id, sha256);
  CREATE INDEX idx_versions_source ON knowledge_versions(source_id);
  CREATE INDEX idx_versions_sha ON knowledge_versions(sha256);

  CREATE TABLE knowledge_pages (
    id                TEXT PRIMARY KEY,
    version_id        TEXT NOT NULL REFERENCES knowledge_versions(id) ON DELETE CASCADE,
    page_number       INTEGER NOT NULL,
    raw_text          TEXT NOT NULL,
    clean_text        TEXT NOT NULL,
    extraction_method TEXT NOT NULL DEFAULT 'unknown',
    ocr_confidence    REAL,
    is_empty          INTEGER NOT NULL DEFAULT 0,
    char_count        INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX idx_pages_version_page ON knowledge_pages(version_id, page_number);

  CREATE TABLE ingestion_runs (
    id          TEXT PRIMARY KEY,
    status      TEXT NOT NULL,
    input_path  TEXT,
    input_url   TEXT,
    source_id   TEXT,
    version_id  TEXT,
    page_count  INTEGER NOT NULL DEFAULT 0,
    char_count  INTEGER NOT NULL DEFAULT 0,
    error       TEXT,
    notes       TEXT,
    started_at  TEXT NOT NULL,
    finished_at TEXT
  );
  CREATE INDEX idx_runs_started ON ingestion_runs(started_at);
  `,
];
