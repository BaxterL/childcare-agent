import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .nullable()
  .optional();

const isoDateTime = z.string().datetime({ offset: true });

/** 逻辑知识源（PROJECT_PLAN 7.1），并合入版权/授权登记字段（6.4）。 */
export const knowledgeSourceSchema = z.object({
  id: z.string().uuid(),
  canonicalTitle: z.string().min(1),
  sourceType: z.string().min(1),
  issuingOrg: z.string().nullable().optional(),
  documentNo: z.string().nullable().optional(),
  jurisdiction: z.string().nullable().optional(),
  authorityLevel: z.string().min(1),
  normativeStatus: z.string().nullable().optional(),
  accessLevel: z.string().min(1),
  sourceUrl: z.string().url().nullable().optional(),
  // 版权与商用授权（6.4）
  copyrightOwner: z.string().nullable().optional(),
  licenseType: z.string().nullable().optional(),
  licenseExpiry: isoDate,
  canStoreFullText: z.boolean().default(false),
  canShowExcerpt: z.boolean().default(true),
  canExport: z.boolean().default(false),
  purchaseRecord: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: isoDateTime,
});

export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

/** 知识源版本（PROJECT_PLAN 7.2），一份物理资料对应一个版本。 */
export const knowledgeVersionSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  versionLabel: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  filePath: z.string().min(1),
  originalFilename: z.string().min(1),
  mimeType: z.string().nullable().optional(),
  byteSize: z.number().int().nonnegative(),
  sourceUrl: z.string().url().nullable().optional(),
  publishedAt: isoDate,
  effectiveFrom: isoDate,
  effectiveTo: isoDate,
  legalStatus: z.string().min(1),
  isActive: z.boolean(),
  supersedesVersionId: z.string().uuid().nullable().optional(),
  verifiedAt: isoDate,
  verifiedBy: z.string().nullable().optional(),
  ingestionRunId: z.string().uuid().nullable().optional(),
  createdAt: isoDateTime,
});

export type KnowledgeVersion = z.infer<typeof knowledgeVersionSchema>;

/** 页级原文（PROJECT_PLAN 7.3）。 */
export const knowledgePageSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
  pageNumber: z.number().int().positive(),
  rawText: z.string(),
  cleanText: z.string(),
  extractionMethod: z.string().min(1),
  ocrConfidence: z.number().min(0).max(1).nullable().optional(),
  isEmpty: z.boolean(),
  charCount: z.number().int().nonnegative(),
});

export type KnowledgePage = z.infer<typeof knowledgePageSchema>;

/** 知识块（PROJECT_PLAN 7.4），页级原文按章节和条款切分后的检索单元。 */
export const knowledgeChunkSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
  chunkIndex: z.number().int().nonnegative(),
  pageStart: z.number().int().positive(),
  pageEnd: z.number().int().positive(),
  sectionPath: z.string().nullable().optional(),
  articleNumber: z.string().nullable().optional(),
  paragraphNumber: z.number().int().positive().nullable().optional(),
  contentType: z.string().min(1),
  text: z.string(),
  normalizedText: z.string(),
  chunkHash: z.string().regex(/^[0-9a-f]{64}$/),
  charCount: z.number().int().nonnegative(),
  previousChunkId: z.string().uuid().nullable().optional(),
  nextChunkId: z.string().uuid().nullable().optional(),
  embeddingModel: z.string().nullable().optional(),
  createdAt: isoDateTime,
});

export type KnowledgeChunk = z.infer<typeof knowledgeChunkSchema>;

/** 导入运行记录（PROJECT_PLAN 7.5）。 */
export const ingestionRunSchema = z.object({
  id: z.string().uuid(),
  status: z.string().min(1),
  inputPath: z.string().nullable().optional(),
  inputUrl: z.string().nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  versionId: z.string().uuid().nullable().optional(),
  pageCount: z.number().int().nonnegative().default(0),
  charCount: z.number().int().nonnegative().default(0),
  error: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  startedAt: isoDateTime,
  finishedAt: isoDateTime.nullable().optional(),
});

export type IngestionRun = z.infer<typeof ingestionRunSchema>;

export const isoDateSchema = isoDate;
export const isoDateTimeSchema = isoDateTime;
