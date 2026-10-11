import { resolve } from "node:path";
import { deployPlan, resolveDeployProfile } from "./deploy.js";
import { DEFAULT_EMBED_MODEL, type EmbedDownloadSource } from "./embed/index.js";

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
  /** Whether local embedding-based semantic retrieval is available. */
  embedEnabled: boolean;
  /** Local embedding model id (transformers.js / Hugging Face). */
  embedModel: string;
  /** Project-local cache directory for downloaded ONNX weights. */
  embedCacheDir: string;
  /** Where to download embedding model files from. */
  embedDownloadSource: EmbedDownloadSource;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return !["0", "false", "off", "no"].includes(raw.trim().toLowerCase());
}

function envChoice<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = process.env[name]?.trim() as T | undefined;
  return raw && allowed.includes(raw) ? raw : fallback;
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
    embedEnabled:
      overrides.embedEnabled ??
      envBool("CHILDCARE_EMBED_ENABLED", deployPlan(resolveDeployProfile(process.env.CHILDCARE_DEPLOY)).embedEnabled),
    embedModel: overrides.embedModel ?? process.env.CHILDCARE_EMBED_MODEL ?? DEFAULT_EMBED_MODEL,
    embedCacheDir: overrides.embedCacheDir ?? resolve(process.env.CHILDCARE_EMBED_CACHE_DIR ?? "./data/models"),
    embedDownloadSource:
      overrides.embedDownloadSource ?? envChoice("CHILDCARE_EMBED_SOURCE", ["huggingface", "hf-mirror"], "hf-mirror"),
  };
}
