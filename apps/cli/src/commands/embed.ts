import type { Command } from "commander";
import { createContext, embedVersionChunks } from "@childcare/pipeline";
import { loadEmbedder } from "../embedder.js";

export function registerEmbed(program: Command): void {
  program
    .command("embed")
    .description("为本机知识块生成或更新本地向量（语义检索）")
    .option("--force", "即使已有同一模型的向量也重建", false)
    .action(async (options: { force: boolean }) => {
      const ctx = createContext();
      try {
        const embedder = await loadEmbedder(ctx);
        if (!embedder) {
          console.log("未生成向量：本地向量模型不可用。");
          return;
        }
        const versions = ctx.versions.list().filter((version) => version.isActive);
        let versionsDone = 0;
        let vectors = 0;
        for (const version of versions) {
          if (ctx.chunks.countByVersion(version.id) === 0) continue;
          const count = await embedVersionChunks(ctx, embedder, version.id, { force: options.force });
          if (count > 0) {
            versionsDone += 1;
            vectors += count;
            console.log(`  已向量化  ${version.id}  ${version.originalFilename}  → ${count} 块`);
          }
        }
        console.log(`完成：模型 ${embedder.modelId}（${embedder.dim} 维），${versionsDone} 个版本，共 ${vectors} 条向量。`);
      } finally {
        ctx.db.close();
      }
    });
}
