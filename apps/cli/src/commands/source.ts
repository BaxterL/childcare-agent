import type { Command } from "commander";
import { ACCESS_LEVELS, AUTHORITY_LEVELS, SOURCE_TYPES } from "@childcare/core";
import { createContext } from "@childcare/pipeline";
import { parseEnum, printJson } from "../util.js";

interface AddOptions {
  title: string;
  type: string;
  authority: string;
  org?: string;
  docNo?: string;
  jurisdiction?: string;
  url?: string;
  access: string;
  copyrightOwner?: string;
  licenseType?: string;
  canStoreFullText: boolean;
  canExport: boolean;
  excerpt: boolean;
  notes?: string;
  json: boolean;
}

export function registerSource(program: Command): void {
  const source = program.command("source").description("管理逻辑知识源（登记资料元数据）");

  source
    .command("add")
    .description("登记一个逻辑知识源")
    .requiredOption("--title <title>", "知识源标题（如《托育机构管理办法》）")
    .option("--type <type>", `资料类别 ${SOURCE_TYPES.join("|")}`, "other")
    .option(
      "--authority <level>",
      `权威等级 ${AUTHORITY_LEVELS.join("|")}`,
      "expert_education_material",
    )
    .option("--org <org>", "来源机构")
    .option("--doc-no <no>", "文号 / 标准号")
    .option("--jurisdiction <region>", "适用地区，如 national / 北京市")
    .option("--url <url>", "来源网址")
    .option("--access <level>", `访问级别 ${ACCESS_LEVELS.join("|")}`, "internal")
    .option("--copyright-owner <owner>", "版权方")
    .option("--license-type <type>", "授权类型")
    .option("--can-store-full-text", "允许保存全文", false)
    .option("--can-export", "允许导出", false)
    .option("--no-excerpt", "不允许展示引用原文")
    .option("--notes <text>", "备注")
    .option("--json", "以 JSON 输出", false)
    .action((options: AddOptions) => {
      const ctx = createContext();
      const created = ctx.sources.create({
        canonicalTitle: options.title,
        sourceType: parseEnum(SOURCE_TYPES, options.type, "type"),
        authorityLevel: parseEnum(AUTHORITY_LEVELS, options.authority, "authority"),
        issuingOrg: options.org ?? null,
        documentNo: options.docNo ?? null,
        jurisdiction: options.jurisdiction ?? null,
        sourceUrl: options.url ?? null,
        accessLevel: parseEnum(ACCESS_LEVELS, options.access, "access"),
        copyrightOwner: options.copyrightOwner ?? null,
        licenseType: options.licenseType ?? null,
        canStoreFullText: options.canStoreFullText,
        canShowExcerpt: options.excerpt,
        canExport: options.canExport,
        notes: options.notes ?? null,
      });
      ctx.db.close();
      if (options.json) {
        printJson(created);
        return;
      }
      console.log(`已登记知识源 ${created.id}`);
      console.log(`  标题      ${created.canonicalTitle}`);
      console.log(`  类别/权威 ${created.sourceType} / ${created.authorityLevel}`);
      console.log(`  地区/文号 ${created.jurisdiction ?? "-"} / ${created.documentNo ?? "-"}`);
    });

  source
    .command("list")
    .description("列出已登记的知识源")
    .option("--json", "以 JSON 输出", false)
    .action((options: { json: boolean }) => {
      const ctx = createContext();
      const list = ctx.sources.list();
      ctx.db.close();
      if (options.json) {
        printJson(list);
        return;
      }
      if (list.length === 0) {
        console.log("暂无知识源。可运行 `childcare source add` 或直接 `childcare import`。");
        return;
      }
      for (const item of list) {
        console.log(`${item.id}  ${item.canonicalTitle}`);
        console.log(
          `   类别=${item.sourceType} 权威=${item.authorityLevel} 地区=${item.jurisdiction ?? "-"} 文号=${item.documentNo ?? "-"}`,
        );
      }
    });
}
