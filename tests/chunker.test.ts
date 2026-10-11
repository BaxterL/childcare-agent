import { afterEach, describe, expect, it } from "vitest";
import {
  bufferToVector,
  createContext,
  chunkPages,
  indexVersionChunks,
  vectorToBuffer,
  type PipelineContext,
} from "@childcare/pipeline";

const contexts: PipelineContext[] = [];

afterEach(() => {
  for (const context of contexts.splice(0)) context.db.close();
});

describe("结构感知分块", () => {
  it("标注章节与条款号", () => {
    const drafts = chunkPages([
      {
        pageNumber: 1,
        text: "第一章 总则\n第一条 为规范托育机构管理，制定本标准。\n第二章 设置要求\n第十二条 托育机构场地应当满足抗震、防火和疏散要求。",
      },
    ]);

    const chapter = drafts.find((draft) => draft.contentType === "heading" && draft.text.includes("第一章"));
    expect(chapter?.sectionPath).toContain("第一章");

    const article = drafts.find((draft) => draft.articleNumber === "第十二条");
    expect(article).toBeTruthy();
    expect(article?.sectionPath).toContain("第二章");
    expect(article?.text).toContain("防火");
  });

  it("把一、级标题识别为章节，列表内容标为 list", () => {
    const drafts = chunkPages([
      { pageNumber: 1, text: "第二章 目标与要求\n一、营养与喂养\n（一）目标。\n1.获取安全、营养的食物。" },
    ]);

    const itemHeading = drafts.find((draft) => draft.contentType === "heading" && draft.text.includes("一、营养与喂养"));
    expect(itemHeading?.sectionPath).toContain("第二章");
    expect(itemHeading?.sectionPath).toContain("一、营养与喂养");

    const list = drafts.find((draft) => draft.contentType === "list");
    expect(list?.text).toContain("目标");
  });

  it("为同一版本的知识块建立前后链接", () => {
    const context = createContext({ dbPath: ":memory:" });
    contexts.push(context);
    const source = context.sources.create({
      canonicalTitle: "测试制度",
      sourceType: "institution_policy",
      authorityLevel: "institution_policy",
    });
    const version = context.versions.create({
      sourceId: source.id,
      versionLabel: "v1",
      sha256: "a".repeat(64),
      filePath: "a.pdf",
      originalFilename: "a.pdf",
      byteSize: 1,
    });

    const count = indexVersionChunks(context.chunks, version.id, [
      { pageNumber: 1, text: "第一章 总则\n第一条 为规范托育机构管理，制定本标准。" },
      { pageNumber: 2, text: "第十二条 托育机构场地应当满足抗震、防火和疏散要求，并定期检查。" },
    ]);

    const chunks = context.chunks.listByVersion(version.id);
    expect(chunks).toHaveLength(count);
    expect(chunks[0]?.previousChunkId).toBeNull();
    expect(chunks[0]?.nextChunkId).toBe(chunks[1]?.id);
    expect(chunks.at(-1)?.nextChunkId).toBeNull();
    expect(chunks.at(-1)?.pageStart).toBe(2);
  });

  it("向量的序列化与反序列化保持一致", () => {
    const vector = new Float32Array([0.5, -1.25, 3, 0.001]);
    expect(Array.from(bufferToVector(vectorToBuffer(vector)))).toEqual(Array.from(vector));
  });

  it("为知识块保存本地向量并登记模型", () => {
    const context = createContext({ dbPath: ":memory:" });
    contexts.push(context);
    const source = context.sources.create({
      canonicalTitle: "测试制度",
      sourceType: "institution_policy",
      authorityLevel: "institution_policy",
    });
    const version = context.versions.create({
      sourceId: source.id,
      versionLabel: "v1",
      sha256: "b".repeat(64),
      filePath: "b.pdf",
      originalFilename: "b.pdf",
      byteSize: 1,
    });
    indexVersionChunks(context.chunks, version.id, [
      { pageNumber: 1, text: "托育机构应当建立安全管理制度，明确责任人和检查频次。" },
    ]);

    const saved = context.chunks.updateEmbeddings(version.id, "Xenova/bge-small-zh-v1.5", [
      { chunkIndex: 0, vector: new Float32Array([1, 2, 3]) },
    ]);

    expect(saved).toBe(1);
    expect(context.chunks.countEmbedded("Xenova/bge-small-zh-v1.5")).toBe(1);
    expect(context.chunks.listByVersion(version.id)[0]?.embeddingModel).toBe("Xenova/bge-small-zh-v1.5");
  });
});
