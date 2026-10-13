import { describe, expect, it } from "vitest";
import { composePrepared } from "./prepared.js";
import type { Evidence } from "./retrieval.js";

function hit(partial: Partial<Evidence> & Pick<Evidence, "title" | "text" | "section">): Evidence {
  return {
    index: 2,
    chunkId: "c1",
    sourceId: "s1",
    versionId: "v1",
    organization: "国家卫生健康委",
    documentNo: null,
    sourceUrl: null,
    legalStatus: "unknown",
    preview: null,
    publishedAt: null,
    pageNumber: 1,
    articleNumber: null,
    score: 1,
    jurisdiction: "national",
    ...partial,
  };
}

describe("预制问答", () => {
  it("高频睡眠问题绑到保育指导大纲，并把对应资料排到第一", () => {
    const prepared = composePrepared("托育机构午睡怎么安排？", [
      hit({ title: "其他文件", text: "无关", section: "总则" }),
      hit({ title: "托育机构保育指导大纲（试行）", text: "获得充足睡眠", section: "二、睡眠" }),
    ]);
    expect(prepared?.hits[0]?.title).toContain("保育指导大纲");
    expect(prepared?.hits[0]?.index).toBe(1);
    expect(prepared?.answer).toContain("独自入睡");
    expect(prepared?.answer).toContain("[1]");
  });

  it("对不上资料时不使用预制答复", () => {
    expect(composePrepared("托育机构怎么备案", [
      hit({ title: "新闻稿", text: "促进婴幼儿照护", section: "概要" }),
    ])).toBeNull();
  });

  it("短追问不走预制答复", () => {
    expect(composePrepared("然后呢", [
      hit({ title: "保育指导大纲", text: "睡眠", section: "睡眠" }),
    ])).toBeNull();
  });
});