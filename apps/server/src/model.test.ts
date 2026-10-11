import { describe, expect, it } from "vitest";
import { resolveProviderOrder } from "./model.js";

describe("模型提供方选择", () => {
  it("配置联网 key 时优先 DeepSeek，本机 Ollama 作为降级", () => {
    expect(resolveProviderOrder({ CHILDCARE_MODEL_PROVIDER: "auto", DEEPSEEK_API_KEY: "sk-x" })).toEqual([
      "deepseek",
      "ollama",
    ]);
  });

  it("没有联网 key 时只用本机 Ollama", () => {
    expect(resolveProviderOrder({ CHILDCARE_MODEL_PROVIDER: "auto", DEEPSEEK_API_KEY: "" })).toEqual(["ollama"]);
  });

  it("可以强制使用本机 Ollama", () => {
    expect(resolveProviderOrder({ CHILDCARE_MODEL_PROVIDER: "ollama", DEEPSEEK_API_KEY: "sk-x" })).toEqual(["ollama"]);
  });

  it("强制 DeepSeek 但缺少 key 时降级本机", () => {
    expect(resolveProviderOrder({ CHILDCARE_MODEL_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "" })).toEqual(["ollama"]);
  });
});
