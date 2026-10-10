import type { Command } from "commander";
import { collectLocalFiles, createContext, ingestFile, type IngestResult } from "@childcare/pipeline";
import { addSourceMetadataOptions, toIngestOptions, type SourceMetadataOptions } from "../options.js";
import { fail, printJson } from "../util.js";

interface ImportOptions extends SourceMetadataOptions {
  dryRun: boolean;
  json: boolean;
}

export function registerImport(program: Command): void {
  const command = addSourceMetadataOptions(
    program
      .command("import")
      .description("导入本地文件或目录（PDF / DOCX / MD / TXT / HTML）")
      .argument("<path>", "本地文件或目录")
      .option("--dry-run", "仅列出将要导入的文件", false)
      .option("--json", "以 JSON 输出", false),
  );

  command.action(async (inputPath: string, options: ImportOptions) => {
    const ctx = createContext();
    try {
      const files = await collectLocalFiles(inputPath);
      if (files.length === 0) {
        ctx.db.close();
        fail(`没有找到可导入的文件：${inputPath}`);
      }
      if (options.dryRun) {
        console.log(`将导入 ${files.length} 个文件：`);
        for (const file of files) console.log(`  ${file}`);
        return;
      }

      const ingestOptions = toIngestOptions(options);
      const results: Array<{ file: string } & IngestResult> = [];
      let ok = 0;
      let skipped = 0;
      let failed = 0;

      for (const file of files) {
        try {
          const result = await ingestFile(ctx, file, ingestOptions);
          results.push({ file, ...result });
          if (result.deduplicated) {
            skipped += 1;
            console.log(`  跳过(重复)  ${file}`);
          } else {
            ok += 1;
            console.log(`  已导入      ${file}  →  ${result.pageCount} 页 / ${result.charCount} 字`);
          }
        } catch (error) {
          failed += 1;
          console.error(`  失败        ${file}: ${error instanceof Error ? error.message : error}`);
        }
      }

      if (options.json) printJson(results);
      else console.log(`完成：成功 ${ok}，跳过 ${skipped}，失败 ${failed}`);
    } finally {
      ctx.db.close();
    }
  });
}
