import { loadConfig, type PipelineConfig } from "./config.js";
import { openDatabase, type DB } from "./db/database.js";
import { IngestionRunRepository } from "./repositories/ingestionRuns.js";
import { PageRepository } from "./repositories/pages.js";
import { SourceRepository } from "./repositories/sources.js";
import { VersionRepository } from "./repositories/versions.js";

export interface PipelineContext {
  config: PipelineConfig;
  db: DB;
  sources: SourceRepository;
  versions: VersionRepository;
  pages: PageRepository;
  runs: IngestionRunRepository;
}

/** Build a ready-to-use pipeline context (opens the DB and runs migrations). */
export function createContext(overrides: Partial<PipelineConfig> = {}): PipelineContext {
  const config = loadConfig(overrides);
  const db = openDatabase(config.dbPath);
  return {
    config,
    db,
    sources: new SourceRepository(db),
    versions: new VersionRepository(db),
    pages: new PageRepository(db),
    runs: new IngestionRunRepository(db),
  };
}
