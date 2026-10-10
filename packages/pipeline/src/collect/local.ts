import { stat, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isSupportedFile } from "../extract/index.js";

/**
 * Resolve a path to the list of importable files. A single supported file
 * returns itself; a directory is walked recursively.
 */
export async function collectLocalFiles(inputPath: string): Promise<string[]> {
  const root = resolve(inputPath);
  const info = await stat(root);
  if (info.isFile()) {
    return isSupportedFile(root) ? [root] : [];
  }
  if (!info.isDirectory()) {
    return [];
  }
  const files: string[] = [];
  await walk(root, files);
  return files.sort();
}

async function walk(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      await walk(full, out);
    } else if (entry.isFile() && isSupportedFile(full)) {
      out.push(full);
    }
  }
}
