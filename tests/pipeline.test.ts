import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Text } from "@childcare/core";
import {
  createContext,
  ingestFile,
  sourceEntrySchema,
  type PipelineContext,
} from "@childcare/pipeline";

const contexts: PipelineContext[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const ctx of contexts.splice(0)) ctx.db.close();
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function makeContext(): Promise<{ ctx: PipelineContext; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "childcare-test-"));
  tempDirs.push(dir);
  const ctx = createContext({ dbPath: ":memory:", rawDir: join(dir, "raw") });
  contexts.push(ctx);
  return { ctx, dir };
}

const source = {
  canonicalTitle: "测试制度",
  sourceType: "institution_policy",
  authorityLevel: "institution_policy",
} as const;

describe("sha256Text", () => {
  it("matches the known digest for a short string", () => {
    expect(sha256Text("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("sourceEntrySchema", () => {
  it("retains copyright and reuse restrictions from a source manifest", () => {
    const entry = sourceEntrySchema.parse({
      title: "WHO guideline",
      url: "https://example.org/guideline.pdf",
      copyrightOwner: "World Health Organization",
      licenseType: "CC BY-NC-SA 3.0 IGO",
      canStoreFullText: true,
      canShowExcerpt: false,
      canExport: false,
    });

    expect(entry.licenseType).toBe("CC BY-NC-SA 3.0 IGO");
    expect(entry.canStoreFullText).toBe(true);
    expect(entry.canShowExcerpt).toBe(false);
    expect(entry.canExport).toBe(false);
  });
});

describe("ingestFile", () => {
  it("imports a markdown file and stores its pages", async () => {
    const { ctx, dir } = await makeContext();
    const file = join(dir, "doc.md");
    await writeFile(file, "# 标题\n\n托育机构应当建立安全管理制度。", "utf8");

    const result = await ingestFile(ctx, file, { source });

    expect(result.deduplicated).toBe(false);
    expect(result.pageCount).toBe(1);
    expect(result.charCount).toBeGreaterThan(0);

    const pages = ctx.pages.listByVersion(result.versionId!);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.cleanText).toContain("安全管理制度");
  });

  it("skips identical content for the same source (SHA256 dedup)", async () => {
    const { ctx, dir } = await makeContext();
    const file = join(dir, "doc.md");
    await writeFile(file, "重复内容。", "utf8");

    const first = await ingestFile(ctx, file, { source });
    const second = await ingestFile(ctx, file, { source });

    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.versionId).toBe(first.versionId);
  });
});
