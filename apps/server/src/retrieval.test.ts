import { afterEach, describe, expect, it } from "vitest";
import { sha256Text } from "@childcare/core";
import { chunkPages, createContext, type PipelineContext } from "@childcare/pipeline";
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
  context.chunks.replaceForVersion(version.id, chunkPages([{ pageNumber: 1, text }]));
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

  it("把章节和条款号带进引用", () => {
    const context = makeContext();
    addPage(
      context,
      "托育机构设置标准",
      "第二章 设置要求\n第十二条 托育机构的场地应当远离污染源，满足抗震、防火、疏散等要求。",
    );

    const result = searchEvidence(context, "托育机构场地防火和疏散要求");

    expect(result[0]?.section).toContain("第二章");
    expect(result[0]?.section).toContain("第十二条");
    expect(result[0]?.articleNumber).toBe("第十二条");
    expect(result[0]?.chunkId).toBeTruthy();
  });

  it("只检索当前生效版本，忽略已替代的历史版本", () => {
    const context = makeContext();
    const source = context.sources.create({
      canonicalTitle: "托育机构午睡管理制度",
      sourceType: "institution_policy",
      authorityLevel: "institution_policy",
      issuingOrg: "某托育机构",
      accessLevel: "public",
      canShowExcerpt: true,
    });
    const addVersion = (label: string, text: string) => {
      const version = context.versions.create({
        sourceId: source.id,
        versionLabel: label,
        sha256: sha256Text(`${label}\n${text}`),
        filePath: "sop.pdf",
        originalFilename: "sop.pdf",
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
      context.chunks.replaceForVersion(version.id, chunkPages([{ pageNumber: 1, text }]));
      return version;
    };

    const oldVersion = addVersion("v1", "旧版：托育机构午睡巡视每三十分钟一次，记录呼吸和睡姿。");
    const newVersion = addVersion("v2", "新版：托育机构午睡巡视每十五分钟一次，记录呼吸和睡姿。");
    context.versions.setActiveExclusive(newVersion.id, oldVersion.id);

    expect(context.versions.getActiveBySource(source.id)?.id).toBe(newVersion.id);
    const texts = searchEvidence(context, "托育机构午睡巡视时间").map((hit) => hit.text).join(" ");
    expect(texts).toContain("十五分钟");
    expect(texts).not.toContain("三十分钟");
  });

  it("混合检索：语义命中的块即使没有词面重合也会被召回", () => {
    const context = makeContext();
    const source = context.sources.create({
      canonicalTitle: "托育机构照护规范",
      sourceType: "institution_policy",
      authorityLevel: "institution_policy",
      accessLevel: "public",
      canShowExcerpt: true,
    });
    const version = context.versions.create({
      sourceId: source.id,
      versionLabel: "v1",
      sha256: sha256Text("v1"),
      filePath: "sop.pdf",
      originalFilename: "sop.pdf",
      byteSize: 1,
      legalStatus: "in_force",
    });
    context.chunks.replaceForVersion(
      version.id,
      chunkPages([
        { pageNumber: 1, text: "托育机构午睡巡视记录要求，需要记录呼吸和睡姿变化。" },
        { pageNumber: 2, text: "婴幼儿膳食营养搭配建议，注意食物多样和进餐环境。" },
      ]),
    );
    const queryVector = new Float32Array([1, 0, 0]);
    context.chunks.updateEmbeddings(version.id, "test-model", [
      { chunkIndex: 0, vector: new Float32Array([0, 1, 0]) },
      { chunkIndex: 1, vector: new Float32Array([1, 0, 0]) },
    ]);

    const hits = searchEvidence(context, "午睡巡视", 5, queryVector);
    const combined = hits.map((hit) => hit.text).join(" ");

    expect(combined).toContain("膳食营养");
    expect(combined).toContain("午睡巡视");
  });

  it("没有向量时退回纯 BM25 检索", () => {
    const context = makeContext();
    addPage(context, "托育机构保育指导大纲", "托育机构应当合理安排婴幼儿睡眠和一日生活。");

    const hits = searchEvidence(context, "托育机构睡眠安排", 5, null);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.title).toContain("保育指导大纲");
  });
});
