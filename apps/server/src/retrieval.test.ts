import { afterEach, describe, expect, it } from "vitest";
import { sha256Text } from "@childcare/core";
import { createContext, type PipelineContext } from "@childcare/pipeline";
import { searchEvidence } from "./retrieval.js";

const contexts: PipelineContext[] = [];

afterEach(() => {
  for (const context of contexts.splice(0)) context.db.close();
});

function makeContext(): PipelineContext {
  const context = createContext({ dbPath: ":memory:" });
  contexts.push(context);
  return context;
}

function addPage(
  context: PipelineContext,
  title: string,
  text: string,
  permissions: { canShowExcerpt?: boolean; accessLevel?: string } = {},
): string {
  const source = context.sources.create({
    canonicalTitle: title,
    sourceType: "policy_regulation",
    authorityLevel: "department_regulation",
    issuingOrg: "国家卫生健康委员会",
    accessLevel: permissions.accessLevel ?? "public",
    canShowExcerpt: permissions.canShowExcerpt ?? true,
  });
  const version = context.versions.create({
    sourceId: source.id,
    versionLabel: "test",
    sha256: sha256Text(`${title}\n${text}`),
    filePath: "test.pdf",
    originalFilename: "test.pdf",
    byteSize: 1,
    legalStatus: "in_force",
  });
  context.pages.insertMany([{
    versionId: version.id,
    pageNumber: 1,
    rawText: text,
    cleanText: text,
    extractionMethod: "text_layer",
  }]);
  return source.id;
}

describe("本地证据检索", () => {
  it("按中文词项匹配，并返回来源和页码", () => {
    const context = makeContext();
    const title = "托育机构保育指导大纲";
    addPage(context, title, "托育机构应当根据婴幼儿身心发展特点和规律，制订科学的保育方案，合理安排饮食、饮水、如厕、盥洗、睡眠、游戏等一日生活和活动。");

    const result = searchEvidence(context, "托育机构如何安排婴幼儿睡眠和日常生活？");

    expect(result[0]?.title).toBe(title);
    expect(result[0]?.pageNumber).toBe(1);
    expect(result[0]?.text).toContain("睡眠");
  });

  it("不会检索禁止展示摘录或受限访问的来源", () => {
    const context = makeContext();
    addPage(context, "限制摘录资料", "托育机构婴幼儿睡眠管理需要观察呼吸和睡姿。", { canShowExcerpt: false });
    addPage(context, "限制访问资料", "托育机构婴幼儿睡眠管理需要保护儿童安全。", { accessLevel: "restricted" });

    expect(searchEvidence(context, "托育机构婴幼儿睡眠管理")).toEqual([]);
  });
});
