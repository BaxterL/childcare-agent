import { describe, expect, it } from "vitest";
import { resolveProviderOrder } from "./model.js";

describe("模型提供方选择", () => {
  it("回答只用 DeepSeek，不把本机对话模型拿来生成答复", () => {
    expect(resolveProviderOrder({ CHILDCARE_MODEL_PROVIDER: "auto", DEEPSEEK_API_KEY: "sk-x" })).toEqual(["deepseek"]);
    expect(resolveProviderOrder({ CHILDCARE_DEPLOY: "local", DEEPSEEK_API_KEY: "sk-x" })).toEqual(["deepseek"]);
    expect(resolveProviderOrder({ CHILDCARE_DEPLOY: "linux-2g", DEEPSEEK_API_KEY: "sk-x" })).toEqual(["deepseek"]);
    expect(resolveProviderOrder({ CHILDCARE_DEPLOY: "linux-4g", DEEPSEEK_API_KEY: "sk-x" })).toEqual(["deepseek"]);
  });

  it("没有联网 key 时不改用 Ollama 编答案", () => {
    expect(resolveProviderOrder({ CHILDCARE_MODEL_PROVIDER: "auto", DEEPSEEK_API_KEY: "" })).toEqual([]);
    expect(resolveProviderOrder({ CHILDCARE_MODEL_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "" })).toEqual([]);
  });

  it("只有显式指定时才走本机 Ollama", () => {
    expect(resolveProviderOrder({ CHILDCARE_MODEL_PROVIDER: "ollama", DEEPSEEK_API_KEY: "sk-x" })).toEqual(["ollama"]);
  });
});
