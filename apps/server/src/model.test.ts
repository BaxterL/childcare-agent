import { describe, expect, it } from "vitest";
import { answerRequest, resolveProviderOrder } from "./model.js";

describe("模型提供方选择", () => {
  it("回答只用 DeepSeek", () => {
    expect(resolveProviderOrder({ DEEPSEEK_API_KEY: "sk-x" })).toEqual(["deepseek"]);
  });

  it("没有联网 key 时不调用回答模型", () => {
    expect(resolveProviderOrder({ DEEPSEEK_API_KEY: "" })).toEqual([]);
  });

  it("回答请求不开放工具", () => {
    const body = answerRequest("deepseek-chat", [{ role: "user", content: "午睡怎么安排" }], { max_tokens: 100 });
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
    expect(body).not.toHaveProperty("functions");
  });

});
