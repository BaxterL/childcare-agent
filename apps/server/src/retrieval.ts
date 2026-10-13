import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { bufferToVector, cosineSimilarity, type PipelineContext } from "@childcare/pipeline";

export interface Evidence {
  index: number;
  chunkId: string;
  sourceId: string;
  versionId: string;
  title: string;
  organization: string;
  documentNo: string | null;
  sourceUrl: string | null;
  legalStatus: string;
  /** How a reader can open this source. Full text is never sent to the client. */
  preview: "pdf" | "link" | null;
  publishedAt: string | null;
  pageNumber: number;
  section: string;
  articleNumber: string | null;
  text: string;
  score: number;
  /** Server-only. national / international are general; a place name is local. */
  jurisdiction: string | null;
}

interface Candidate {
  chunkId: string;
  sourceId: string;
  versionId: string;
  title: string;
  organization: string;
  documentNo: string | null;
  sourceUrl: string | null;
  legalStatus: string;
  preview: "pdf" | "link" | null;
  publishedAt: string | null;
  pageNumber: number;
  sectionPath: string | null;
  articleNumber: string | null;
  text: string;
  /** national / international are general. A place name means a local document. */
  jurisdiction: string | null;
  terms: Map<string, number>;
  vector: Float32Array | null;
}

const STOP = new Set("什么 哪些 怎么 如何 有哪些 可以 需要 规定 要求 关于 以及 这个 那个 一下 请问 托育机构 婴幼儿".split(" "));
const PER_SOURCE_LIMIT = 2;
const BM25_THRESHOLD = 0.55;
const RRF_K = 60;

export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  const terms = new Set<string>();
  for (const match of normalized.matchAll(/[\u3400-\u9fff]+/g)) {
    const run = match[0];
    if (run.length === 1) terms.add(run);
    for (let i = 0; i < run.length - 1; i += 1) terms.add(run.slice(i, i + 2));
    if (run.length >= 5) {
      for (let i = 0; i < run.length - 2; i += 1) terms.add(run.slice(i, i + 3));
    }
  }
  for (const match of normalized.matchAll(/[a-z0-9][a-z0-9._/-]{1,}/g)) terms.add(match[0]);
  for (const item of [...terms]) if (STOP.has(item)) terms.delete(item);
  return [...terms];
}

function termFrequency(text: string): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const term of tokenize(text)) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  return frequencies;
}

/** Human-readable section label for a chunk: chapter/section plus article. */
export function previewKind(mime: string | null, filename: string, sourceUrl: string | null): "pdf" | "link" | null {
  const pdf = (mime ?? "").toLowerCase() === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
  if (pdf) return "pdf";
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) return "link";
  return null;
}

export function sectionLabel(sectionPath: string | null, articleNumber: string | null): string {
  const parts = [sectionPath, articleNumber].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length ? parts.join(" · ") : "正文";
}

/**
 * Load every chunk allowed into evidence: active versions of sources whose
 * licence permits excerpting, including any stored embedding vector.
 */
export function loadCandidates(context: PipelineContext): Candidate[] {
  const rows = context.db.prepare(`
    SELECT c.id AS chunk_id, c.version_id, c.text, c.section_path, c.article_number, c.page_start,
           c.embedding,
           s.id AS source_id, s.canonical_title, s.issuing_org, s.document_no, s.jurisdiction,
           COALESCE(NULLIF(s.source_url, ''), v.source_url) AS source_url,
           v.legal_status, v.published_at, v.mime_type, v.original_filename
    FROM knowledge_chunks c
    JOIN knowledge_versions v ON v.id = c.version_id AND v.is_active = 1
    JOIN knowledge_sources s ON s.id = v.source_id
    WHERE s.can_show_excerpt = 1 AND s.access_level != 'restricted' AND c.char_count > 0
    ORDER BY v.published_at DESC, s.created_at ASC, c.chunk_index ASC
  `).all() as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const text = String(row.text ?? "");
    return {
      chunkId: String(row.chunk_id),
      sourceId: String(row.source_id),
      versionId: String(row.version_id),
      title: String(row.canonical_title),
      organization: String(row.issuing_org ?? "未登记"),
      documentNo: row.document_no ? String(row.document_no) : null,
      sourceUrl: row.source_url ? String(row.source_url) : null,
      legalStatus: String(row.legal_status),
      preview: previewKind(
        row.mime_type ? String(row.mime_type) : null,
        String(row.original_filename ?? ""),
        row.source_url ? String(row.source_url) : null,
      ),
      publishedAt: row.published_at ? String(row.published_at) : null,
      pageNumber: Number(row.page_start),
      sectionPath: row.section_path ? String(row.section_path) : null,
      articleNumber: row.article_number ? String(row.article_number) : null,
      text,
      jurisdiction: row.jurisdiction ? String(row.jurisdiction) : null,
      terms: termFrequency(text),
      vector: row.embedding ? bufferToVector(row.embedding as Uint8Array) : null,
    };
  });
}

interface Scored {
  candidate: Candidate;
  score: number;
}

/** Lexical BM25 score plus exact-document-number, title and phrase bonuses. */
function scoreBm25(candidates: Candidate[], question: string): Scored[] {
  const queryTerms = tokenize(question);
  if (!queryTerms.length) return [];
  const documentFrequency = new Map<string, number>();
  for (const candidate of candidates) {
    for (const term of candidate.terms.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const averageLength =
    candidates.reduce((sum, item) => sum + [...item.terms.values()].reduce((a, b) => a + b, 0), 0) /
      candidates.length || 1;
  const normalizedQuestion = question.toLowerCase().replace(/[\s，。！？、]/g, "");

  return candidates.map((candidate) => {
    const length = [...candidate.terms.values()].reduce((a, b) => a + b, 0);
    let score = 0;
    for (const term of queryTerms) {
      const frequency = candidate.terms.get(term) ?? 0;
      if (!frequency) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (candidates.length - df + 0.5) / (df + 0.5));
      score += idf * ((frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * length / averageLength)));
    }
    const normalizedText = candidate.text.toLowerCase().replace(/[\s，。！？、]/g, "");
    if (normalizedQuestion.length >= 4 && normalizedText.includes(normalizedQuestion)) score += 3;
    if (candidate.documentNo && question.includes(candidate.documentNo)) score += 4;
    if (candidate.title && question.includes(candidate.title)) score += 2;
    return { candidate, score };
  });
}

const GENERAL_JURISDICTIONS = new Set(["", "national", "international", "全国", "中国"]);
/** Finer places named in a title when the stored jurisdiction is only the province. */
const TITLE_PLACES = ["成都", "万盛", "丰都"];

function isGeneralJurisdiction(value: string | null): boolean {
  return GENERAL_JURISDICTIONS.has((value ?? "").trim().toLowerCase());
}

/** Province and city names a local document applies to. */
function placeTokens(jurisdiction: string, title: string): string[] {
  const fromAdmin = jurisdiction
    .replace(/维吾尔自治区|壮族自治区|回族自治区|自治区/g, " ")
    .replace(/特别行政区/g, " ")
    .replace(/[省市州盟区县]/g, " ")
    .split(/\s+/)
    .filter((part) => part.length >= 2);
  const fromTitle = TITLE_PLACES.filter((name) => title.includes(name));
  return [...new Set([...fromAdmin, ...fromTitle])];
}

function matchesRegion(candidate: Candidate, question: string): boolean {
  if (isGeneralJurisdiction(candidate.jurisdiction)) return false;
  return placeTokens(candidate.jurisdiction ?? "", candidate.title).some((token) => question.includes(token));
}

/**
 * General documents stay in front. A local document is only eligible when the
 * question names its place, and then it takes at most the last citation slot.
 */
function preferGeneral(ranked: Scored[], question: string, limit: number): Scored[] {
  const general = ranked.filter((item) => isGeneralJurisdiction(item.candidate.jurisdiction));
  const regional = ranked.filter((item) => matchesRegion(item.candidate, question));
  const head = selectDiverse(general, limit);
  const local = selectDiverse(regional, 1);
  if (!local.length) return head;
  if (head.length >= limit) return [...head.slice(0, Math.max(0, limit - 1)), local[0]!];
  return [...head, ...local].slice(0, limit);
}

function selectDiverse(sorted: Scored[], limit: number): Scored[] {
  const selected: Scored[] = [];
  const sourceCount = new Map<string, number>();
  for (const item of sorted) {
    const count = sourceCount.get(item.candidate.sourceId) ?? 0;
    if (count >= PER_SOURCE_LIMIT) continue;
    selected.push(item);
    sourceCount.set(item.candidate.sourceId, count + 1);
    if (selected.length >= Math.max(1, Math.min(limit, 8))) break;
  }
  return selected;
}

/**
 * Reciprocal-rank fusion of lexical and semantic rankings. Rank-based fusion
 * avoids having to calibrate BM25 and cosine on a shared scale.
 */
function fuseHybrid(scored: Scored[], queryVector: Float32Array): Scored[] {
  const lexicalRank = new Map<string, number>();
  scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .forEach((item, index) => lexicalRank.set(item.candidate.chunkId, index + 1));

  const semanticRank = new Map<string, number>();
  scored
    .map((item) => ({
      candidate: item.candidate,
      cosine: item.candidate.vector ? cosineSimilarity(queryVector, item.candidate.vector) : -1,
    }))
    .filter((item) => item.cosine > 0)
    .sort((a, b) => b.cosine - a.cosine)
    .forEach((item, index) => semanticRank.set(item.candidate.chunkId, index + 1));

  return scored
    .map((item) => {
      const lexical = lexicalRank.get(item.candidate.chunkId);
      const semantic = semanticRank.get(item.candidate.chunkId);
      const score = (lexical ? 1 / (RRF_K + lexical) : 0) + (semantic ? 1 / (RRF_K + semantic) : 0);
      return { candidate: item.candidate, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.sourceId.localeCompare(b.candidate.sourceId));
}

/**
 * Retrieve evidence for a question. With a query vector, lexical and local
 * semantic rankings are fused; without one (no local model available) it falls
 * back to pure BM25.
 */
export function searchEvidence(
  context: PipelineContext,
  question: string,
  limit = 5,
  queryVector: Float32Array | null = null,
): Evidence[] {
  const candidates = loadCandidates(context);
  if (!candidates.length) return [];
  const scored = scoreBm25(candidates, question);
  if (!scored.length) return [];

  const ranked = queryVector
    ? fuseHybrid(scored, queryVector)
    : scored
        .filter((item) => item.score >= BM25_THRESHOLD)
        .sort((a, b) => b.score - a.score || a.candidate.sourceId.localeCompare(b.candidate.sourceId));
  const selected = preferGeneral(ranked, question, limit);

  return selected.map(({ candidate, score }, index) => ({
    index: index + 1,
    chunkId: candidate.chunkId,
    sourceId: candidate.sourceId,
    versionId: candidate.versionId,
    title: candidate.title,
    organization: candidate.organization,
    documentNo: candidate.documentNo,
    sourceUrl: candidate.sourceUrl,
    legalStatus: candidate.legalStatus,
    preview: candidate.preview,
    publishedAt: candidate.publishedAt,
    pageNumber: candidate.pageNumber,
    section: sectionLabel(candidate.sectionPath, candidate.articleNumber),
    articleNumber: candidate.articleNumber,
    text: candidate.text,
    score: Number(score.toFixed(4)),
    jurisdiction: candidate.jurisdiction,
  }));
}

export function getVisibleSources(context: PipelineContext): Array<Record<string, unknown>> {
  const rows = context.db.prepare(`
    SELECT s.id, s.canonical_title AS title, s.issuing_org AS organization,
           s.document_no AS document_no,
           COALESCE(NULLIF(s.source_url, ''), v.source_url) AS source_url,
           s.authority_level AS authority, s.notes,
           v.id AS version_id, v.sha256 AS content_hash, v.published_at, v.effective_from,
           v.effective_to, v.mime_type, v.original_filename,
           COUNT(DISTINCT p.id) AS page_count
    FROM knowledge_sources s
    JOIN knowledge_versions v ON v.source_id = s.id AND v.is_active = 1
    LEFT JOIN knowledge_pages p ON p.version_id = v.id
    WHERE s.can_show_excerpt = 1 AND s.access_level != 'restricted'
    GROUP BY s.id, v.id
    ORDER BY v.published_at DESC, s.created_at ASC, s.canonical_title ASC
  `).all() as Array<Record<string, unknown>>;
  const unique = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = String(row.content_hash ?? row.version_id);
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()].map((row) => {
    const sourceUrl = row.source_url ? String(row.source_url) : null;
    const { mime_type: mimeType, original_filename: filename, ...rest } = row;
    return {
      ...rest,
      source_url: sourceUrl,
      preview: previewKind(mimeType ? String(mimeType) : null, String(filename ?? ""), sourceUrl),
    };
  });
}

/** Original PDF for inline preview. Anything outside the raw directory is refused. */
export function getSourcePdf(context: PipelineContext, sourceId: string): { path: string; filename: string } | null {
  const row = context.db.prepare(`
    SELECT v.file_path, v.mime_type, v.original_filename
    FROM knowledge_sources s
    JOIN knowledge_versions v ON v.source_id = s.id AND v.is_active = 1
    WHERE s.id = ? AND s.can_show_excerpt = 1 AND s.access_level != 'restricted'
    ORDER BY v.created_at DESC LIMIT 1
  `).get(sourceId) as { file_path: string; mime_type: string | null; original_filename: string } | undefined;
  if (!row || previewKind(row.mime_type, row.original_filename, null) !== "pdf") return null;
  if (!existsSync(context.config.rawDir) || !existsSync(row.file_path)) return null;
  const root = realpathSync(context.config.rawDir);
  const file = realpathSync(resolve(row.file_path));
  const rel = relative(root, file);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return { path: file, filename: row.original_filename || "document.pdf" };
}

/** Count searchable chunks and the active versions they cover, for health. */
export function getChunkStats(context: PipelineContext): { chunkCount: number; activeVersionCount: number } {
  const chunkRow = context.db.prepare("SELECT COUNT(*) AS n FROM knowledge_chunks").get() as { n: number };
  const versionRow = context.db.prepare("SELECT COUNT(*) AS n FROM knowledge_versions WHERE is_active = 1").get() as { n: number };
  return { chunkCount: chunkRow.n, activeVersionCount: versionRow.n };
}
