import type { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createContext } from "@childcare/pipeline";
import { fail, printJson } from "../util.js";

export function registerInspect(program: Command): void {
  program
    .command("versions")
    .description("列出知识源版本")
    .option("--source <id>", "只看某个知识源的版本")
    .option("--json", "以 JSON 输出", false)
    .action((options: { source?: string; json: boolean }) => {
      const ctx = createContext();
      const list = options.source
        ? ctx.versions.listBySource(options.source)
        : ctx.versions.list();
      ctx.db.close();
      if (options.json) {
        printJson(list);
        return;
      }
      if (list.length === 0) {
        console.log("暂无版本记录。");
        return;
      }
      for (const version of list) {
        console.log(
          `${version.id}  ${version.versionLabel}  active=${version.isActive}  效力=${version.legalStatus}  sha=${version.sha256.slice(0, 12)}  ${version.originalFilename}`,
        );
      }
    });

  program
    .command("show")
    .description("查看某个版本的页级原文")
    .argument("<versionId>", "版本 id")
    .option("--page <n>", "只显示指定页码")
    .action((versionId: string, options: { page?: string }) => {
      const ctx = createContext();
      const version = ctx.versions.findById(versionId);
      if (!version) {
        ctx.db.close();
        fail(`版本不存在：${versionId}`);
      }
      const pages = ctx.pages.listByVersion(versionId);
      ctx.db.close();

      console.log(`版本 ${version.id}  ${version.versionLabel}`);
      console.log(`  文件      ${version.originalFilename} (${version.byteSize} bytes, sha ${version.sha256.slice(0, 12)})`);
      console.log(`  效力      ${version.legalStatus}  active=${version.isActive}`);
      console.log(`  页数      ${pages.length}`);

      const selected = options.page
        ? pages.filter((page) => page.pageNumber === Number(options.page))
        : pages;
      for (const page of selected) {
        console.log(`\n--- page ${page.pageNumber} (${page.extractionMethod}, ${page.charCount} chars) ---`);
        console.log(page.cleanText);
      }
    });

  program
    .command("chunks")
    .description("查看某个版本的知识块（分块与章节/条款标注）")
    .argument("<versionId>", "版本 id")
    .option("--limit <n>", "最多显示块数", "20")
    .option("--json", "以 JSON 输出", false)
    .action((versionId: string, options: { limit: string; json: boolean }) => {
      const ctx = createContext();
      const chunks = ctx.chunks.listByVersion(versionId);
      ctx.db.close();
      if (options.json) {
        printJson(chunks);
        return;
      }
      if (chunks.length === 0) {
        console.log("该版本暂无知识块。可运行 `childcare reindex` 回填。");
        return;
      }
      const limit = Number(options.limit);
      for (const chunk of chunks.slice(0, limit)) {
        const label = [chunk.sectionPath, chunk.articleNumber].filter(Boolean).join(" · ") || "正文";
        console.log(`#${chunk.chunkIndex}  [${chunk.contentType}]  第${chunk.pageStart}页  ${label}`);
        console.log(`   ${chunk.text.slice(0, 120).replace(/\n/g, " ")}${chunk.text.length > 120 ? "…" : ""}`);
      }
      console.log(`共 ${chunks.length} 块。`);
    });

  program
    .command("runs")
    .description("查看最近的导入 / 采集运行记录")
    .option("--limit <n>", "返回条数", "20")
    .option("--json", "以 JSON 输出", false)
    .action((options: { limit: string; json: boolean }) => {
      const ctx = createContext();
      const list = ctx.runs.list(Number(options.limit));
      ctx.db.close();
      if (options.json) {
        printJson(list);
        return;
      }
      if (list.length === 0) {
        console.log("暂无运行记录。");
        return;
      }
      for (const run of list) {
        const target = run.inputUrl ?? run.inputPath ?? "-";
        const detail = [
          `pages=${run.pageCount}`,
          `chars=${run.charCount}`,
          run.error ? `error=${run.error}` : "",
          run.notes ? `notes=${run.notes}` : "",
        ]
          .filter(Boolean)
          .join(" ");
        console.log(`${run.startedAt}  ${run.status.padEnd(9)}  ${target}`);
        console.log(`   ${detail}`);
      }
    });

  program
    .command("export-md")
    .description("将已采集版本导出为带来源元数据的 Markdown")
    .option("--source <id>", "只导出指定知识源")
    .option("--out <directory>", "Markdown 输出目录", "./data/collected/markdown")
    .action(async (options: { source?: string; out: string }) => {
      const ctx = createContext();
      try {
        const sources = options.source
          ? [ctx.sources.findById(options.source)].filter((source) => source !== null)
          : ctx.sources.list();
        if (options.source && sources.length === 0) fail(`知识源不存在：${options.source}`);

        const outputDir = resolve(options.out);
        await mkdir(outputDir, { recursive: true });
        let exported = 0;
        for (const source of sources) {
          if (source.licenseType && !source.canExport) {
            console.log(`  跳过导出（版权限制：${source.licenseType}）：${source.canonicalTitle}`);
            continue;
          }
          for (const version of ctx.versions.listBySource(source.id)) {
            const pages = ctx.pages.listByVersion(version.id);
            const frontmatter = [
              "---",
              `source_id: ${JSON.stringify(source.id)}`,
              `version_id: ${JSON.stringify(version.id)}`,
              `title: ${JSON.stringify(source.canonicalTitle)}`,
              `issuing_org: ${JSON.stringify(source.issuingOrg ?? "")}`,
              `document_no: ${JSON.stringify(source.documentNo ?? "")}`,
              `source_url: ${JSON.stringify(version.sourceUrl ?? source.sourceUrl ?? "")}`,
              `published_at: ${JSON.stringify(version.publishedAt ?? "")}`,
              `effective_from: ${JSON.stringify(version.effectiveFrom ?? "")}`,
              `effective_to: ${JSON.stringify(version.effectiveTo ?? "")}`,
              `legal_status: ${JSON.stringify(version.legalStatus)}`,
              `authority: ${JSON.stringify(source.authorityLevel)}`,
              `jurisdiction: ${JSON.stringify(source.jurisdiction ?? "")}`,
              `sha256: ${JSON.stringify(version.sha256)}`,
              `extraction_pages: ${pages.length}`,
              "---",
              "",
              `# ${source.canonicalTitle}`,
              "",
              `> 来源：${version.sourceUrl ?? source.sourceUrl ?? "未登记"}  `,
              `> 文号：${source.documentNo ?? "未登记"}  `,
              `> 采集版本：${version.versionLabel}；效力状态：${version.legalStatus}`,
              "",
            ];
            const body = pages
              .map((page) => `<!-- page:${page.pageNumber} -->\n\n${page.cleanText.trim()}`)
              .join("\n\n---\n\n");
            const filePath = join(outputDir, `${source.id}-${version.id}.md`);
            await writeFile(filePath, `${frontmatter.join("\n")}\n${body}\n`, "utf8");
            exported += 1;
            console.log(`  已导出 ${source.canonicalTitle} → ${filePath}`);
          }
        }
        console.log(`完成：导出 ${exported} 份 Markdown 到 ${outputDir}`);
      } finally {
        ctx.db.close();
      }
    });
}
