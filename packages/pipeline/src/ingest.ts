import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { sha256File, sha256Text, type KnowledgeSource, type KnowledgeVersion, type LegalStatus } from "@childcare/core";
import { indexVersionChunks } from "./chunk/index.js";
import { fetchDocument } from "./collect/web.js";
import type { PipelineContext } from "./context.js";
import {
  extractFile,
  extractHtml,
  extractPdfBuffer,
  mimeTypeForPath,
  type ExtractedPage,
} from "./extract/index.js";
import type { NewSource } from "./repositories/sources.js";
import { storeRawArtifact } from "./storage.js";

export interface IngestOptions {
  /** Reuse an existing source by id. Takes precedence over `source`. */
  sourceId?: string;
  /** Register (or reuse by title) a source with this metadata. */
  source?: Partial<NewSource> & { canonicalTitle?: string };
  versionLabel?: string;
  legalStatus?: LegalStatus;
  publishedAt?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  sourceUrl?: string | null;
  notes?: string;
}

export interface IngestResult {
  runId: string;
  sourceId: string;
  versionId: string | null;
  pageCount: number;
  charCount: number;
  /** Identical content already existed for this source; nothing was written. */
  deduplicated: boolean;
  skipped: boolean;
  message: string;
}

const DEFAULT_SOURCE: Pick<NewSource, "sourceType" | "authorityLevel"> = {
  sourceType: "other",
  authorityLevel: "expert_education_material",
};

function resolveSource(
  ctx: PipelineContext,
  opts: IngestOptions,
  fallbackTitle: string,
  fallbackUrl?: string,
): KnowledgeSource {
  if (opts.sourceId) {
    const existing = ctx.sources.findById(opts.sourceId);
    if (!existing) throw new Error(`source not found: ${opts.sourceId}`);
    return existing;
  }
  const title = opts.source?.canonicalTitle?.trim() || fallbackTitle;
  const found = ctx.sources.findByTitle(title);
  if (found) return found;
  return ctx.sources.create({
    canonicalTitle: title,
    sourceType: opts.source?.sourceType ?? DEFAULT_SOURCE.sourceType,
    authorityLevel: opts.source?.authorityLevel ?? DEFAULT_SOURCE.authorityLevel,
    issuingOrg: opts.source?.issuingOrg ?? null,
    documentNo: opts.source?.documentNo ?? null,
    jurisdiction: opts.source?.jurisdiction ?? null,
    accessLevel: opts.source?.accessLevel,
    sourceUrl: opts.source?.sourceUrl ?? opts.sourceUrl ?? fallbackUrl ?? null,
    copyrightOwner: opts.source?.copyrightOwner,
    licenseType: opts.source?.licenseType,
    licenseExpiry: opts.source?.licenseExpiry,
    canStoreFullText: opts.source?.canStoreFullText,
    canShowExcerpt: opts.source?.canShowExcerpt,
    canExport: opts.source?.canExport,
    purchaseRecord: opts.source?.purchaseRecord,
    notes: opts.source?.notes ?? opts.notes ?? null,
  });
}

function persistPages(
  ctx: PipelineContext,
  versionId: string,
  pages: ExtractedPage[],
): { pageCount: number; charCount: number } {
  const rows = pages.map((page) => ({
    versionId,
    pageNumber: page.pageNumber,
    rawText: page.text,
    cleanText: page.text,
    extractionMethod: page.extractionMethod,
    ocrConfidence: page.ocrConfidence ?? null,
  }));
  const pageCount = ctx.pages.insertMany(rows);
  const charCount = rows.reduce((sum, row) => sum + row.cleanText.trim().length, 0);
  return { pageCount, charCount };
}

function defaultVersionLabel(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Promote a version to be the source's only active version. Called after a new
 * version is written, and when re-importing content that had been superseded.
 */
function activateVersion(ctx: PipelineContext, sourceId: string, version: KnowledgeVersion): void {
  const current = ctx.versions.getActiveBySource(sourceId);
  if (current?.id === version.id) return;
  ctx.versions.setActiveExclusive(version.id, current?.id ?? null);
}

function filenameFromUrl(url: string, fallback: string): string {
  try {
    const name = basename(new URL(url).pathname);
    return name.includes(".") ? name : fallback;
  } catch {
    return fallback;
  }
}

/** Import a single local file: hash → dedup → extract → store raw → persist. */
export async function ingestFile(
  ctx: PipelineContext,
  inputPath: string,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const absPath = resolve(inputPath);
  const originalFilename = basename(absPath);
  const run = ctx.runs.start({ inputPath: absPath, notes: opts.notes ?? null });
  try {
    const source = resolveSource(ctx, opts, originalFilename);
    const sha256 = await sha256File(absPath);

    const existing = ctx.versions.findBySourceAndSha(source.id, sha256);
    if (existing) {
      if (!existing.isActive) activateVersion(ctx, source.id, existing);
      ctx.runs.finish(run.id, {
        status: "succeeded",
        versionId: existing.id,
        notes: "duplicate content, skipped",
      });
      return {
        runId: run.id,
        sourceId: source.id,
        versionId: existing.id,
        pageCount: ctx.pages.countByVersion(existing.id),
        charCount: 0,
        deduplicated: true,
        skipped: true,
        message: `identical content already registered (version ${existing.id})`,
      };
    }

    const extraction = await extractFile(absPath);
    const artifact = await storeRawArtifact(
      ctx.config.rawDir,
      sha256,
      originalFilename,
      await readFile(absPath),
    );
    const version = ctx.versions.create({
      sourceId: source.id,
      versionLabel: opts.versionLabel ?? defaultVersionLabel("import"),
      sha256,
      filePath: artifact.path,
      originalFilename,
      mimeType: extraction.mimeType ?? mimeTypeForPath(absPath) ?? null,
      byteSize: artifact.byteSize,
      sourceUrl: opts.sourceUrl ?? source.sourceUrl ?? null,
      publishedAt: opts.publishedAt ?? null,
      effectiveFrom: opts.effectiveFrom ?? null,
      effectiveTo: opts.effectiveTo ?? null,
      legalStatus: opts.legalStatus ?? "unknown",
      isActive: false,
      ingestionRunId: run.id,
    });
    const { pageCount, charCount } = persistPages(ctx, version.id, extraction.pages);
    indexVersionChunks(ctx.chunks, version.id, extraction.pages);
    activateVersion(ctx, source.id, version);
    ctx.runs.finish(run.id, { status: "succeeded", versionId: version.id, pageCount, charCount });
    return {
      runId: run.id,
      sourceId: source.id,
      versionId: version.id,
      pageCount,
      charCount,
      deduplicated: false,
      skipped: false,
      message: `ingested ${pageCount} page(s), ${charCount} chars`,
    };
  } catch (error) {
    ctx.runs.finish(run.id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/** Collect a public URL (HTML or PDF): fetch → hash → dedup → extract → persist. */
export async function ingestUrl(
  ctx: PipelineContext,
  url: string,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const run = ctx.runs.start({ inputUrl: url, notes: opts.notes ?? null });
  try {
    const doc = await fetchDocument(url, ctx.config);
    const sha256 = sha256Text(doc.body);
    const contentType = doc.contentType ?? "";
    const isPdf = contentType.includes("pdf") || /\.pdf($|\?)/i.test(doc.finalUrl);

    let pages: ExtractedPage[];
    let pageTitle: string | undefined;
    let artifactFilename: string;
    let mimeType: string | null;

    if (isPdf) {
      artifactFilename = filenameFromUrl(doc.finalUrl, "document.pdf");
      pages = await extractPdfBuffer(doc.body);
      mimeType = "application/pdf";
    } else {
      artifactFilename = filenameFromUrl(doc.finalUrl, "index.html");
      const extracted = extractHtml(doc.body.toString("utf8"), doc.finalUrl);
      pages = [extracted.page];
      pageTitle = extracted.title;
      mimeType = contentType || "text/html";
    }

    const source = resolveSource(
      ctx,
      opts,
      opts.source?.canonicalTitle?.trim() || pageTitle || doc.finalUrl,
      doc.finalUrl,
    );

    const existing = ctx.versions.findBySourceAndSha(source.id, sha256);
    if (existing) {
      if (!existing.isActive) activateVersion(ctx, source.id, existing);
      ctx.runs.finish(run.id, {
        status: "succeeded",
        versionId: existing.id,
        notes: "duplicate content, skipped",
      });
      return {
        runId: run.id,
        sourceId: source.id,
        versionId: existing.id,
        pageCount: ctx.pages.countByVersion(existing.id),
        charCount: 0,
        deduplicated: true,
        skipped: true,
        message: `identical content already registered (version ${existing.id})`,
      };
    }

    const artifact = await storeRawArtifact(
      ctx.config.rawDir,
      sha256,
      artifactFilename,
      doc.body,
    );
    const version = ctx.versions.create({
      sourceId: source.id,
      versionLabel: opts.versionLabel ?? defaultVersionLabel("collect"),
      sha256,
      filePath: artifact.path,
      originalFilename: artifactFilename,
      mimeType,
      byteSize: artifact.byteSize,
      sourceUrl: doc.finalUrl,
      publishedAt: opts.publishedAt ?? null,
      effectiveFrom: opts.effectiveFrom ?? null,
      effectiveTo: opts.effectiveTo ?? null,
      legalStatus: opts.legalStatus ?? "unknown",
      isActive: false,
      ingestionRunId: run.id,
    });
    const { pageCount, charCount } = persistPages(ctx, version.id, pages);
    indexVersionChunks(ctx.chunks, version.id, pages);
    activateVersion(ctx, source.id, version);
    ctx.runs.finish(run.id, { status: "succeeded", versionId: version.id, pageCount, charCount });
    return {
      runId: run.id,
      sourceId: source.id,
      versionId: version.id,
      pageCount,
      charCount,
      deduplicated: false,
      skipped: false,
      message: `collected ${pageCount} page(s), ${charCount} chars`,
    };
  } catch (error) {
    ctx.runs.finish(run.id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
