/**
 * 本地 embedding 模型档案（静态定义，单一事实来源）。
 * 参考 chatlab 的本地向量模型设计：transformers.js 在本地跑 ONNX，
 * 远程模型只负责生成答复，向量检索完全在本机完成。
 */

export type EmbeddingPooling = "cls" | "mean" | "last_token";

export interface EmbeddingProfile {
  displayName: string;
  /** transformers.js / Hugging Face 的模型 id */
  modelId: string;
  /** 向量维度；未知模型为 null，运行时探测 */
  dim: number | null;
  pooling: EmbeddingPooling;
  normalize: boolean;
  dtype: "fp32" | "q8";
  /** 单文本字符上限 */
  maxTextChars: number;
  /** 检索 query 前缀（document 不加） */
  queryInstruction: string;
  /** 近似下载体积（MB），用于提示 */
  approxDownloadMB: number;
}

/** BGE 小号中文模型：默认选择，体积小、CPU 快、中文检索够用 */
export const BGE_SMALL_ZH: EmbeddingProfile = {
  displayName: "BGE small zh v1.5",
  modelId: "Xenova/bge-small-zh-v1.5",
  dim: 512,
  pooling: "cls",
  normalize: true,
  dtype: "fp32",
  maxTextChars: 1200,
  queryInstruction: "为这个句子生成表示以用于检索相关文章：",
  approxDownloadMB: 95,
};

/** BGE 中号中文模型：质量更高、下载更大 */
export const BGE_BASE_ZH: EmbeddingProfile = {
  displayName: "BGE base zh v1.5",
  modelId: "Xenova/bge-base-zh-v1.5",
  dim: 768,
  pooling: "cls",
  normalize: true,
  dtype: "fp32",
  maxTextChars: 1600,
  queryInstruction: "为这个句子生成表示以用于检索相关文章：",
  approxDownloadMB: 390,
};

/** Qwen3 通用向量模型：本机检索默认。比 bge-small 强，必须 batch=1（last_token pooling） */
export const QWEN3_EMBEDDING: EmbeddingProfile = {
  displayName: "Qwen3 Embedding 0.6B",
  modelId: "onnx-community/Qwen3-Embedding-0.6B-ONNX",
  dim: 1024,
  pooling: "last_token",
  normalize: true,
  dtype: "q8",
  maxTextChars: 2400,
  queryInstruction: "根据用户的照护问题，检索能够回答该问题的资料段落",
  approxDownloadMB: 593,
};

/** 默认检索模型。内存更小的机器可以改用 BGE。 */
export const DEFAULT_EMBED_MODEL = QWEN3_EMBEDDING.modelId;

const KNOWN_PROFILES: readonly EmbeddingProfile[] = [BGE_SMALL_ZH, BGE_BASE_ZH, QWEN3_EMBEDDING];

/** Resolve a profile for any model id; unknown models get safe runtime-detected defaults. */
export function resolveEmbeddingProfile(modelId: string): EmbeddingProfile {
  const known = KNOWN_PROFILES.find((profile) => profile.modelId === modelId);
  if (known) return known;
  return {
    displayName: modelId,
    modelId,
    dim: null,
    pooling: "cls",
    normalize: true,
    dtype: "fp32",
    maxTextChars: 1200,
    queryInstruction: "",
    approxDownloadMB: 0,
  };
}

export function knownEmbeddingProfiles(): readonly EmbeddingProfile[] {
  return KNOWN_PROFILES;
}
