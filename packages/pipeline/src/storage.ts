import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Make a filename safe to use as a single path segment. */
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180) || "document";
}

export interface StoredArtifact {
  path: string;
  byteSize: number;
}

/**
 * Persist an immutable copy of a raw source under a content-addressed
 * directory: `<rawDir>/<sha256>/<filename>`. Re-saving identical content is a
 * no-op.
 */
export async function storeRawArtifact(
  rawDir: string,
  sha256: string,
  filename: string,
  content: Buffer | string,
): Promise<StoredArtifact> {
  const dir = join(rawDir, sha256);
  await mkdir(dir, { recursive: true });
  const target = join(dir, safeName(filename));
  const buffer = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  await writeFile(target, buffer);
  return { path: target, byteSize: buffer.byteLength };
}
