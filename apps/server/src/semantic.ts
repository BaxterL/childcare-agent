import { createLocalEmbedder, type Embedder, type PipelineConfig } from "@childcare/pipeline";

export interface EmbeddingState {
  /** Whether the local embedding model finished loading. */
  ready: boolean;
  /** Whether loading has been attempted. */
  started: boolean;
  /** Vector dimension once known (0 before load). */
  dim: number;
  /** Last load/usage error, if any. */
  error: string | null;
}

const RETRY_AFTER_MS = 5 * 60_000;

const state: EmbeddingState = { ready: false, started: false, dim: 0, error: null };
let embedderRef: Embedder | null = null;
let loadPromise: Promise<Embedder | null> | null = null;
let retryAfter = 0;

export function embeddingState(): EmbeddingState {
  return { ...state };
}

/**
 * Load the local embedding model once (lazily, downloading weights on first
 * use). A failure disables semantic retrieval and is retried only after a
 * cooldown so health checks and chat requests never hammer a broken download.
 */
export function startEmbedder(config: PipelineConfig): Promise<Embedder | null> {
  if (!config.embedEnabled) {
    state.error = "本地向量检索已关闭";
    return Promise.resolve(null);
  }
  if (embedderRef) return Promise.resolve(embedderRef);
  if (loadPromise) return loadPromise;
  if (Date.now() < retryAfter) return Promise.resolve(null);

  state.started = true;
  loadPromise = (async () => {
    try {
      const embedder = createLocalEmbedder({
        modelId: config.embedModel,
        cacheDir: config.embedCacheDir,
        downloadSource: config.embedDownloadSource,
      });
      await embedder.preload();
      embedderRef = embedder;
      state.ready = true;
      state.dim = embedder.dim;
      state.error = null;
      return embedder;
    } catch (error) {
      state.ready = false;
      state.error = error instanceof Error ? error.message : String(error);
      retryAfter = Date.now() + RETRY_AFTER_MS;
      console.error(`本地向量模型不可用，检索降级为 BM25：${state.error}`);
      return null;
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

/** Embed a search query; returns null (BM25-only retrieval) if the model is unavailable. */
export async function embedQuery(config: PipelineConfig, text: string): Promise<Float32Array | null> {
  const embedder = await startEmbedder(config);
  if (!embedder) return null;
  try {
    return await embedder.embedQuery(text);
  } catch (error) {
    console.error(`查询向量化失败，本次改用 BM25：${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
