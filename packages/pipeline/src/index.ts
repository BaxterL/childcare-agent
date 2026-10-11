export { loadConfig, type PipelineConfig } from "./config.js";
export { resolveDeployProfile, deployPlan, type DeployProfile, type DeployPlan } from "./deploy.js";
export { openDatabase, type DB } from "./db/database.js";
export { createContext, type PipelineContext } from "./context.js";
export { ingestFile, ingestUrl, type IngestOptions, type IngestResult } from "./ingest.js";
export { collectLocalFiles } from "./collect/local.js";
export { loadSourcesConfig, sourceEntrySchema, type SourceEntry } from "./collect/sourcesConfig.js";
export { fetchDocument, FetchError, type FetchedDocument } from "./collect/web.js";
export { storeRawArtifact } from "./storage.js";
export * from "./extract/index.js";
export { chunkPages, indexVersionChunks, normalizeForSearch, type ChunkSourcePage, type DraftChunk } from "./chunk/index.js";
export {
  createLocalEmbedder,
  embedVersionChunks,
  cosineSimilarity,
  vectorToBuffer,
  bufferToVector,
  resolveEmbeddingProfile,
  DEFAULT_EMBED_MODEL,
  type Embedder,
  type EmbedderConfig,
  type EmbedDownloadSource,
  type EmbeddingProfile,
} from "./embed/index.js";
export { SourceRepository, type NewSource } from "./repositories/sources.js";
export { VersionRepository, type NewVersion } from "./repositories/versions.js";
export { PageRepository, type NewPage } from "./repositories/pages.js";
export { ChunkRepository } from "./repositories/chunks.js";
export { IngestionRunRepository } from "./repositories/ingestionRuns.js";
