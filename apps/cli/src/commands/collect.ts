import type { Command } from "commander";
import {
  createContext,
  ingestFile,
  ingestUrl,
  loadSourcesConfig,
  type IngestOptions,
  type IngestResult,
} from "@childcare/pipeline";
import { addSourceMetadataOptions, toIngestOptions, type SourceMetadataOptions } from "../options.js";
import { fail, printJson } from "../util.js";

interface CollectOptions extends SourceMetadataOptions {
  config?: string;
  dryRun: boolean;
  json: boolean;
}

interface CollectJob {
  target: string;
  kind: "url" | "file";
  options: IngestOptions;
}

export function registerCollect(program: Command): void {
  const command = addSourceMetadataOptions(
    program
      .command("collect")
      .description("从 URL 或采集清单（sources.yaml）采集公开资料")
      .argument("[urls...]", "要采集的 URL")
      .option("-c, --config <file>", "采集清单 YAML/JSON 文件")
      .option("--dry-run", "仅显示将要采集的条目", false)
      .option("--json", "以 JSON 输出", false),
  );

  command.action(async (urls: string[], options: CollectOptions) => {
    const ctx = createContext();
    try {
      const jobs: CollectJob[] = [];

      if (options.config) {
        const entries = await loadSourcesConfig(options.config);
        for (const entry of entries) {
          const ingest: IngestOptions = {
            source: {
              canonicalTitle: entry.title,
              sourceType: entry.type,
              authorityLevel: entry.authority,
              issuingOrg: entry.org ?? null,
              documentNo: entry.docNo ?? null,
              jurisdiction: entry.jurisdiction ?? null,
              accessLevel: entry.access,
              sourceUrl: entry.url ?? null,
              copyrightOwner: entry.copyrightOwner ?? null,
              licenseType: entry.licenseType ?? null,
              canStoreFullText: entry.canStoreFullText,
              canShowExcerpt: entry.canShowExcerpt,
              canExport: entry.canExport,
            },
            publishedAt: entry.publishedAt ?? null,
            effectiveFrom: entry.effectiveFrom ?? null,
            effectiveTo: entry.effectiveTo ?? null,
            legalStatus: entry.legalStatus,
            notes: entry.notes,
          };
          if (entry.url) jobs.push({ target: entry.url, kind: "url", options: ingest });
          else if (entry.path) jobs.push({ target: entry.path, kind: "file", options: ingest });
        }
      }

      const baseOptions = toIngestOptions(options);
      for (const url of urls) {
        jobs.push({ target: url, kind: "url", options: baseOptions });
      }

      if (jobs.length === 0) {
        ctx.db.close();
        fail("没有采集目标：请提供 URL 或使用 -c/--config <sources.yaml>。");
      }

      if (options.dryRun) {
        console.log(`将采集 ${jobs.length} 个目标：`);
        for (const job of jobs) console.log(`  [${job.kind}] ${job.target}`);
        return;
      }

      const results: Array<{ target: string } & IngestResult> = [];
      let ok = 0;
      let skipped = 0;
      let failed = 0;

      for (const job of jobs) {
        try {
          const result =
            job.kind === "url"
              ? await ingestUrl(ctx, job.target, job.options)
              : await ingestFile(ctx, job.target, job.options);
          results.push({ target: job.target, ...result });
          if (result.deduplicated) {
            skipped += 1;
            console.log(`  跳过(重复)  ${job.target}`);
          } else {
            ok += 1;
            console.log(`  已采集      ${job.target}  →  ${result.pageCount} 页 / ${result.charCount} 字`);
          }
        } catch (error) {
          failed += 1;
          console.error(
            `  失败        ${job.target}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      if (options.json) printJson(results);
      else console.log(`完成：成功 ${ok}，跳过 ${skipped}，失败 ${failed}`);
    } finally {
      ctx.db.close();
    }
  });
}
