import { createLocalEmbedder, type Embedder, type PipelineContext } from "@childcare/pipeline";

/**
 * Load the local embedding model for CLI use, downloading weights on first run.
 * Returns null (with a warning) when embedding is disabled or the model cannot
 * be loaded, so callers can continue with BM25-only behaviour.
 */
export async function loadEmbedder(ctx: PipelineContext): Promise<Embedder | null> {
  if (!ctx.config.embedEnabled) {
    console.warn("本地向量检索已关闭（CHILDCARE_EMBED_ENABLED=0），跳过向量构建。");
    return null;
  }
  const embedder = createLocalEmbedder({
    modelId: ctx.config.embedModel,
    cacheDir: ctx.config.embedCacheDir,
    downloadSource: ctx.config.embedDownloadSource,
  });
  try {
    await embedder.preload();
    return embedder;
  } catch (error) {
    console.warn(`本地向量模型不可用，跳过向量构建：${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
