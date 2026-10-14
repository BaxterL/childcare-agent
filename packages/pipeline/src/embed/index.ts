import type { PipelineContext } from "../context.js";
import { cosineSimilarity, type Embedder } from "./embedder.js";

export * from "./profiles.js";
export * from "./embedder.js";

export { cosineSimilarity };

/** Serialise a vector for SQLite BLOB storage. */
export function vectorToBuffer(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer.slice(vector.byteOffset, vector.byteOffset + vector.byteLength));
}

/** Rebuild a Float32Array from a stored BLOB (copying so it does not alias a pooled buffer). */
export function bufferToVector(buffer: Uint8Array): Float32Array {
  if (buffer.byteLength === 0 || buffer.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) return new Float32Array();
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return new Float32Array(copy.buffer);
}

/**
 * Embed a version's chunks and persist the vectors. Only chunks whose stored
 * model differs from the current one are re-embedded unless `force` is set.
 */
export async function embedVersionChunks(
  ctx: PipelineContext,
  embedder: Embedder,
  versionId: string,
  options: { force?: boolean } = {},
): Promise<number> {
  const chunks = ctx.chunks.listByVersion(versionId);
  const pending = options.force ? chunks : chunks.filter((chunk) => chunk.embeddingModel !== embedder.modelId);
  if (pending.length === 0) return 0;

  const vectors = await embedder.embedDocuments(pending.map((chunk) => chunk.text));
  const entries = pending.flatMap((chunk, index) => {
    const vector = vectors[index];
    return vector ? [{ chunkIndex: chunk.chunkIndex, vector }] : [];
  });
  ctx.chunks.updateEmbeddings(versionId, embedder.modelId, entries);
  return entries.length;
}
