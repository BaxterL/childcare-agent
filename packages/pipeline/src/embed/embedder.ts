import { resolveEmbeddingProfile, type EmbeddingProfile } from "./profiles.js";

export type EmbedDownloadSource = "huggingface" | "hf-mirror";

export interface EmbedderConfig {
  modelId: string;
  /** Local cache directory for downloaded ONNX weights. */
  cacheDir: string;
  downloadSource: EmbedDownloadSource;
  dtype?: "fp32" | "q8";
}

export interface Embedder {
  readonly modelId: string;
  readonly dim: number;
  embedDocuments(texts: string[]): Promise<Float32Array[]>;
  embedQuery(text: string): Promise<Float32Array>;
  preload(): Promise<void>;
}

interface FeatureTensor {
  tolist(): number[][];
}
type FeatureExtractor = (
  texts: string[],
  options: { pooling: EmbeddingProfile["pooling"]; normalize: boolean },
) => Promise<FeatureTensor>;

/** Keep ONNX sessions single-threaded: retrieval latency matters more than peak throughput here. */
const SESSION_OPTIONS = { intraOpNumThreads: 1, interOpNumThreads: 1 };

const NON_LAST_TOKEN_BATCH = 8;

/** Match chatlab: a trailing colon is a raw prefix; otherwise wrap as Instruct/Query. */
function applyQueryInstruction(instruction: string, query: string): string {
  const trimmed = instruction.trim();
  if (!trimmed) return query;
  if (trimmed.endsWith(":") || trimmed.endsWith("：")) return `${trimmed}${query}`;
  return `Instruct: ${trimmed}\nQuery: ${query}`;
}

/**
 * Local ONNX embedding via transformers.js. The model is downloaded once into
 * `cacheDir` (project-local, never the system drive) and then runs fully
 * offline on CPU — the "local model for retrieval" role.
 */
export class LocalEmbedder implements Embedder {
  private readonly profile: EmbeddingProfile;
  private readonly config: EmbedderConfig;
  private extractorPromise: Promise<FeatureExtractor> | null = null;
  private detectedDim: number;

  constructor(config: EmbedderConfig) {
    this.config = config;
    this.profile = resolveEmbeddingProfile(config.modelId);
    this.detectedDim = this.profile.dim ?? 0;
  }

  get modelId(): string {
    return this.config.modelId;
  }

  get dim(): number {
    return this.detectedDim;
  }

  private async createExtractor(): Promise<FeatureExtractor> {
    const transformers = await import("@huggingface/transformers");
    transformers.env.remoteHost =
      this.config.downloadSource === "hf-mirror" ? "https://hf-mirror.com/" : "https://huggingface.co/";
    transformers.env.cacheDir = this.config.cacheDir;
    transformers.env.allowRemoteModels = true;

    const pipe = (await transformers.pipeline("feature-extraction", this.config.modelId, {
      dtype: this.config.dtype ?? this.profile.dtype,
      session_options: SESSION_OPTIONS,
    } as never)) as unknown as (texts: string[], options: Record<string, unknown>) => Promise<FeatureTensor>;

    return (texts, options) => pipe(texts, options);
  }

  private getExtractor(): Promise<FeatureExtractor> {
    if (!this.extractorPromise) {
      this.extractorPromise = this.createExtractor().catch((error: unknown) => {
        this.extractorPromise = null;
        throw error;
      });
    }
    return this.extractorPromise;
  }

  private clamp(text: string): string {
    const max = this.profile.maxTextChars;
    return max > 0 && text.length > max ? text.slice(0, max) : text;
  }

  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const extractor = await this.getExtractor();
    const batchSize = this.profile.pooling === "last_token" ? 1 : NON_LAST_TOKEN_BATCH;
    const vectors: Float32Array[] = [];
    for (let start = 0; start < texts.length; start += batchSize) {
      const batch = texts.slice(start, start + batchSize).map((text) => this.clamp(text));
      const tensor = await extractor(batch, { pooling: this.profile.pooling, normalize: this.profile.normalize });
      for (const row of tensor.tolist()) {
        if (this.detectedDim === 0) this.detectedDim = row.length;
        vectors.push(Float32Array.from(row));
      }
    }
    return vectors;
  }

  async embedQuery(text: string): Promise<Float32Array> {
    const [vector] = await this.embedDocuments([applyQueryInstruction(this.profile.queryInstruction, text)]);
    if (!vector) throw new Error("embedding returned no vector");
    return vector;
  }

  async preload(): Promise<void> {
    await this.getExtractor();
  }
}

export function createLocalEmbedder(config: EmbedderConfig): LocalEmbedder {
  return new LocalEmbedder(config);
}

/** Cosine similarity; inputs are expected to be normalised, so this is a dot product. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
