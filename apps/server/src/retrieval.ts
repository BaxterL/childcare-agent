import type { PipelineContext } from "@childcare/pipeline";

export interface Evidence {
  index: number;
  sourceId: string;
  versionId: string;
  title: string;
  organization: string;
  documentNo: string | null;
  sourceUrl: string | null;
  legalStatus: string;
  publishedAt: string | null;
  pageNumber: number;
  section: string;
  text: string;
  score: number;
}

interface Candidate {
  contentHash: string;
  sourceId: string;
  versionId: string;
  title: string;
  organization: string;
  documentNo: string | null;
  sourceUrl: string | null;
  legalStatus: string;
  publishedAt: string | null;
  pageNumber: number;
  text: string;
  terms: Map<string, number>;
}

const STOP = new Set("什么 哪些 怎么 如何 有哪些 可以 需要 规定 要求 关于 以及 这个 那个 一下 请问 托育机构 婴幼儿".split(" "));
const MAX_CHUNK = 620;
const CHUNK_OVERLAP = 90;

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

function makeChunks(text: string): string[] {
  const clean = text.replace(/\r/g, "").replace(/[\t ]+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + MAX_CHUNK);
    if (end < clean.length) {
      const boundary = Math.max(
        clean.lastIndexOf("。", end),
        clean.lastIndexOf("；", end),
        clean.lastIndexOf("\n", end),
      );
      if (boundary > start + MAX_CHUNK * 0.55) end = boundary + 1;
    }
    const chunk = clean.slice(start, end).trim();
    if (chunk.length >= 24) chunks.push(chunk);
    if (end >= clean.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

export function loadCandidates(context: PipelineContext): Candidate[] {
  const rows = context.db.prepare(`
    SELECT v.sha256 AS content_hash, s.id AS source_id, s.canonical_title, s.issuing_org, s.document_no,
           s.source_url, s.access_level, s.can_show_excerpt,
           v.id AS version_id, v.legal_status, v.published_at, p.page_number, p.clean_text
    FROM knowledge_sources s
    JOIN knowledge_versions v ON v.source_id = s.id AND v.is_active = 1
    JOIN knowledge_pages p ON p.version_id = v.id
    WHERE s.can_show_excerpt = 1 AND s.access_level != 'restricted'
      AND p.is_empty = 0
    ORDER BY v.published_at DESC, s.created_at ASC, p.page_number ASC
  `).all() as Array<Record<string, unknown>>;

  const candidates: Candidate[] = [];
  const seenPages = new Set<string>();
  for (const row of rows) {
    const pageText = String(row.clean_text ?? "");
    const contentHash = String(row.content_hash ?? row.version_id);
    const pageKey = `${contentHash}:${row.page_number}`;
    if (seenPages.has(pageKey)) continue;
    seenPages.add(pageKey);
    for (const text of makeChunks(pageText)) {
      candidates.push({
        contentHash,
        sourceId: String(row.source_id),
        versionId: String(row.version_id),
        title: String(row.canonical_title),
        organization: String(row.issuing_org ?? "未登记"),
        documentNo: row.document_no ? String(row.document_no) : null,
        sourceUrl: row.source_url ? String(row.source_url) : null,
        legalStatus: String(row.legal_status),
        publishedAt: row.published_at ? String(row.published_at) : null,
        pageNumber: Number(row.page_number),
        text,
        terms: termFrequency(text),
      });
    }
  }
  return candidates;
}

function termFrequency(text: string): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const term of tokenize(text)) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  return frequencies;
}

export function searchEvidence(context: PipelineContext, question: string, limit = 5): Evidence[] {
  const queryTerms = tokenize(question);
  if (!queryTerms.length) return [];
  const candidates = loadCandidates(context);
  if (!candidates.length) return [];

  const documentFrequency = new Map<string, number>();
  for (const candidate of candidates) {
    for (const term of candidate.terms.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const averageLength = candidates.reduce((sum, item) => sum + [...item.terms.values()].reduce((a, b) => a + b, 0), 0) / candidates.length || 1;
  const normalizedQuestion = question.toLowerCase().replace(/[\s，。！？、]/g, "");

  const scored = candidates.map((candidate) => {
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
  }).filter((item) => item.score >= 0.55)
    .sort((a, b) => b.score - a.score || a.candidate.sourceId.localeCompare(b.candidate.sourceId));

  const selected: typeof scored = [];
  const sourceCount = new Map<string, number>();
  for (const item of scored) {
    const count = sourceCount.get(item.candidate.sourceId) ?? 0;
    if (count >= 2) continue;
    selected.push(item);
    sourceCount.set(item.candidate.sourceId, count + 1);
    if (selected.length >= Math.max(1, Math.min(limit, 8))) break;
  }

  return selected.map(({ candidate, score }, index) => ({
    index: index + 1,
    sourceId: candidate.sourceId,
    versionId: candidate.versionId,
    title: candidate.title,
    organization: candidate.organization,
    documentNo: candidate.documentNo,
    sourceUrl: candidate.sourceUrl,
    legalStatus: candidate.legalStatus,
    publishedAt: candidate.publishedAt,
    pageNumber: candidate.pageNumber,
    section: findSection(candidate.text),
    text: candidate.text,
    score: Number(score.toFixed(3)),
  }));
}

function findSection(text: string): string {
  const heading = text.match(/(?:第[一二三四五六七八九十百]+章[^\n。]{0,40}|第[一二三四五六七八九十百]+条|[一二三四五六七八九十]+、[^\n。]{0,30})/);
  return heading?.[0] ?? "正文";
}

export function getVisibleSources(context: PipelineContext): Array<Record<string, unknown>> {
  const rows = context.db.prepare(`
    SELECT s.id, s.canonical_title AS title, s.issuing_org AS organization,
           s.document_no AS document_no, s.source_url AS source_url,
           s.authority_level AS authority, s.notes,
           v.id AS version_id, v.sha256 AS content_hash, v.published_at, v.effective_from,
           v.effective_to, v.legal_status,
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
  return [...unique.values()];
}

export function getVisiblePage(context: PipelineContext, sourceId: string, pageNumber: number): Record<string, unknown> | null {
  return context.db.prepare(`
    SELECT s.id AS source_id, s.canonical_title AS title, s.issuing_org AS organization,
           s.document_no AS document_no, s.source_url AS source_url,
           v.id AS version_id, v.legal_status, p.page_number, p.clean_text
    FROM knowledge_sources s
    JOIN knowledge_versions v ON v.source_id = s.id AND v.is_active = 1
    JOIN knowledge_pages p ON p.version_id = v.id
    WHERE s.id = ? AND s.can_show_excerpt = 1 AND s.access_level != 'restricted'
      AND p.page_number = ?
    ORDER BY v.created_at DESC LIMIT 1
  `).get(sourceId, pageNumber) as Record<string, unknown> | undefined ?? null;
}
