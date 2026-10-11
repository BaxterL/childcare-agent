import type { Command } from "commander";
import { createContext, embedVersionChunks, indexVersionChunks } from "@childcare/pipeline";
import { loadEmbedder } from "../embedder.js";

export function registerReindex(program: Command): void {
  program
    .command("reindex")
    .description("重建知识块索引（分块与本地向量）；升级或回填历史版本时使用")
    .option("--force", "即使已有知识块或向量也重建", false)
    .action(async (options: { force: boolean }) => {
      const ctx = createContext();
      try {
        const versions = ctx.versions.list().filter((version) => version.isActive);

        let rebuilt = 0;
        let skipped = 0;
        let chunkTotal = 0;
        for (const version of versions) {
          const pages = ctx.pages.listByVersion(version.id);
          if (pages.length === 0) {
            skipped += 1;
            continue;
          }
          if (!options.force && ctx.chunks.countByVersion(version.id) > 0) {
            skipped += 1;
            continue;
          }
          const count = indexVersionChunks(
            ctx.chunks,
            version.id,
            pages.map((page) => ({ pageNumber: page.pageNumber, text: page.cleanText })),
          );
          rebuilt += 1;
          chunkTotal += count;
          console.log(`  已重建  ${version.id}  ${version.originalFilename}  → ${count} 块`);
        }
        console.log(`分块：重建 ${rebuilt} 个版本，共 ${chunkTotal} 块，跳过 ${skipped} 个。`);

        const embedder = await loadEmbedder(ctx);
        if (!embedder) {
          console.log("未生成向量：本地向量模型不可用。");
          return;
        }
        let vectorTotal = 0;
        for (const version of versions) {
          if (ctx.chunks.countByVersion(version.id) === 0) continue;
          const count = await embedVersionChunks(ctx, embedder, version.id, { force: options.force });
          if (count > 0) {
            vectorTotal += count;
            console.log(`  已向量化 ${version.id}  ${version.originalFilename}  → ${count} 块`);
          }
        }
        console.log(`向量：模型 ${embedder.modelId}（${embedder.dim} 维），共 ${vectorTotal} 条。`);
      } finally {
        ctx.db.close();
      }
    });
}
