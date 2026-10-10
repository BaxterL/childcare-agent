import type { PipelineConfig } from "../config.js";

export interface FetchedDocument {
  /** Requested URL. */
  url: string;
  /** URL after redirects. */
  finalUrl: string;
  status: number;
  contentType: string | null;
  body: Buffer;
}

export class FetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

/**
 * Fetch a public document with a configurable User-Agent, timeout and size
 * cap. Uses the platform `fetch` (undici) — good enough for static
 * government/standard pages.
 */
export async function fetchDocument(url: string, config: PipelineConfig): Promise<FetchedDocument> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.fetchTimeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": config.userAgent,
        accept: "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });
    if (!response.ok) {
      throw new FetchError(`request failed with status ${response.status}`, response.status);
    }

    const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declaredLength) && declaredLength > config.maxDownloadBytes) {
      throw new FetchError(
        `document exceeds max size (${declaredLength} > ${config.maxDownloadBytes})`,
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > config.maxDownloadBytes) {
      throw new FetchError(
        `document exceeds max size (${buffer.byteLength} > ${config.maxDownloadBytes})`,
      );
    }

    return {
      url,
      finalUrl: response.url || url,
      status: response.status,
      contentType: response.headers.get("content-type"),
      body: buffer,
    };
  } catch (error) {
    if (error instanceof FetchError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new FetchError(`request timed out after ${config.fetchTimeoutMs}ms`);
    }
    throw new FetchError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}
