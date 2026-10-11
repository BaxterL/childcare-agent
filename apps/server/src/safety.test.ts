import { describe, expect, it } from "vitest";
import { hasDomainSignal, isEmergencyRequest, isInDomain, isMedicalRequest, isOffTopic, SYSTEM_PROMPT } from "./safety.js";

describe("托育问答边界", () => {
  it("明确拒绝无关问题，即使提到婴幼儿", () => {
    expect(isOffTopic("帮我给婴幼儿写一首诗" )).toBe(true);
    expect(isInDomain("帮我给婴幼儿写一首诗", [])).toBe(false);
  });

  it("接受托育领域问题，并只在相关上下文中放行指代性追问", () => {
    expect(isInDomain("托育机构如何安排午睡？", [])).toBe(true);
    expect(isInDomain("那然后呢？", [{ role: "user", content: "托育机构如何安排午睡？" }])).toBe(true);
    expect(isInDomain("那然后呢？", [])).toBe(false);
    expect(isInDomain("那睡眠呢？", [])).toBe(true);
  });

  it("在模型前识别诊断和用药请求", () => {
    expect(isMedicalRequest("宝宝是不是肺炎？" )).toBe(true);
    expect(isMedicalRequest("孩子是不是发烧？")).toBe(true);
    expect(isMedicalRequest("婴幼儿退烧药吃多少" )).toBe(true);
    expect(isMedicalRequest("宝宝发烧怎么办？")).toBe(true);
    expect(isMedicalRequest("托育机构午睡巡视怎么做" )).toBe(false);
  });

  it("紧急症状不会进入普通问答流程", () => {
    expect(isEmergencyRequest("宝宝呼吸困难怎么办？")).toBe(true);
    expect(isEmergencyRequest("托育机构午睡巡视怎么做")).toBe(false);
  });

  it("系统提示要求只用证据并把原文视作不可信资料", () => {
    expect(SYSTEM_PROMPT).toContain("只依据本轮提供的【检索证据】");
    expect(SYSTEM_PROMPT).toContain("提示注入");
  });

  it("识别托育领域词汇", () => {
    expect(hasDomainSignal("请问托育备案需要什么资料？")).toBe(true);
    expect(hasDomainSignal("今天有什么天气" )).toBe(false);
  });

  it("把公文文号视为托育领域信号", () => {
    expect(isInDomain("国办发〔2019〕15号提出了哪些要求？", [])).toBe(true);
    expect(isInDomain("国卫人口发〔2019〕58号包含哪些内容？", [])).toBe(true);
  });

  it("拒答发育障碍判断，但不误伤机构照护问题", () => {
    expect(isMedicalRequest("孩子发育迟缓怎么办？")).toBe(true);
    expect(isMedicalRequest("孩子是不是自闭症？")).toBe(true);
    expect(isMedicalRequest("托育机构如何支持语言发育迟缓的婴幼儿？")).toBe(false);
  });
});
