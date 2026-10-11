import type { ChunkRepository } from "../repositories/chunks.js";
import { chunkPages, type DraftChunk } from "./chunker.js";

export * from "./chunker.js";

export interface ChunkablePage {
  pageNumber: number;
  text: string;
}

/** Chunk a version's pages and replace its persisted chunks in one step. */
export function indexVersionChunks(
  chunks: ChunkRepository,
  versionId: string,
  pages: ChunkablePage[],
): number {
  const drafts: DraftChunk[] = chunkPages(pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })));
  return chunks.replaceForVersion(versionId, drafts);
}
