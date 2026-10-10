import { resolve } from "node:path";

export interface PipelineConfig {
  /** SQLite database file. */
  dbPath: string;
  /** Root directory for immutable raw source artifacts. */
  rawDir: string;
  /** User-Agent used for web collection. */
  userAgent: string;
  /** Per-request timeout for web collection. */
  fetchTimeoutMs: number;
  /** Maximum bytes to download per document. */
  maxDownloadBytes: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Resolve runtime configuration from environment variables with sane defaults. */
export function loadConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    dbPath: overrides.dbPath ?? resolve(process.env.CHILDCARE_DB_PATH ?? "./data/childcare.db"),
    rawDir: overrides.rawDir ?? resolve(process.env.CHILDCARE_RAW_DIR ?? "./data/raw"),
    userAgent:
      overrides.userAgent ??
      process.env.CHILDCARE_USER_AGENT ??
      "childcare-agent/0.1 (+https://example.com/bot)",
    fetchTimeoutMs: overrides.fetchTimeoutMs ?? envInt("CHILDCARE_FETCH_TIMEOUT_MS", 30_000),
    maxDownloadBytes:
      overrides.maxDownloadBytes ?? envInt("CHILDCARE_MAX_DOWNLOAD_BYTES", 50 * 1024 * 1024),
  };
}
