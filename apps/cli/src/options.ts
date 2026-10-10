import type { Command } from "commander";
import type { IngestOptions } from "@childcare/pipeline";
import {
  ACCESS_LEVELS,
  AUTHORITY_LEVELS,
  LEGAL_STATUSES,
  SOURCE_TYPES,
  type LegalStatus,
} from "@childcare/core";
import { parseDate, parseEnum } from "./util.js";

export interface SourceMetadataOptions {
  source?: string;
  title?: string;
  type?: string;
  authority?: string;
  org?: string;
  docNo?: string;
  jurisdiction?: string;
  access?: string;
  publishDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  legalStatus?: string;
  notes?: string;
}

/** Register the CLI flags shared by `import` and `collect` for source metadata. */
export function addSourceMetadataOptions(command: Command): Command {
  return command
    .option("--source <id>", "复用已登记的知识源 (source id)")
    .option("--title <title>", "知识源标题（未指定 --source 时使用）")
    .option("--type <type>", `资料类别 (${SOURCE_TYPES.join("|")})`)
    .option("--authority <level>", `权威等级 (${AUTHORITY_LEVELS.join("|")})`)
    .option("--org <org>", "来源机构")
    .option("--doc-no <no>", "文号 / 标准号")
    .option("--jurisdiction <region>", "适用地区，如 national / 北京市")
    .option("--access <level>", `访问级别 (${ACCESS_LEVELS.join("|")})`)
    .option("--publish-date <date>", "发布日期 YYYY-MM-DD")
    .option("--effective-from <date>", "生效日期 YYYY-MM-DD")
    .option("--effective-to <date>", "废止日期 YYYY-MM-DD")
    .option("--legal-status <status>", `效力状态 (${LEGAL_STATUSES.join("|")})`)
    .option("--notes <text>", "备注");
}

/** Convert shared CLI flags into pipeline `IngestOptions`. */
export function toIngestOptions(options: SourceMetadataOptions): IngestOptions {
  const ingest: IngestOptions = {};
  if (options.source) ingest.sourceId = options.source;

  const source = {
    ...(options.title ? { canonicalTitle: options.title } : {}),
    ...(options.type ? { sourceType: parseEnum(SOURCE_TYPES, options.type, "type") } : {}),
    ...(options.authority
      ? { authorityLevel: parseEnum(AUTHORITY_LEVELS, options.authority, "authority") }
      : {}),
    ...(options.org ? { issuingOrg: options.org } : {}),
    ...(options.docNo ? { documentNo: options.docNo } : {}),
    ...(options.jurisdiction ? { jurisdiction: options.jurisdiction } : {}),
    ...(options.access
      ? { accessLevel: parseEnum(ACCESS_LEVELS, options.access, "access") }
      : {}),
  };
  if (Object.keys(source).length > 0) ingest.source = source;

  ingest.publishedAt = parseDate(options.publishDate, "publish-date");
  ingest.effectiveFrom = parseDate(options.effectiveFrom, "effective-from");
  ingest.effectiveTo = parseDate(options.effectiveTo, "effective-to");
  if (options.legalStatus) {
    ingest.legalStatus = parseEnum(LEGAL_STATUSES, options.legalStatus, "legal-status") as LegalStatus;
  }
  if (options.notes) ingest.notes = options.notes;

  return ingest;
}
