import { z } from "zod";

/** 资料类别（PROJECT_PLAN 6.1） */
export const SOURCE_TYPES = [
  "policy_regulation",
  "institution_policy",
  "safety_management",
  "hygiene_infection",
  "nutrition_feeding",
  "sleep_activity_environment",
  "role_sop",
  "industry_standard",
  "training_material",
  "faq",
  "other",
] as const;
export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export type SourceType = z.infer<typeof sourceTypeSchema>;

/** 权威等级（PROJECT_PLAN 7.6），与效力状态分开 */
export const AUTHORITY_LEVELS = [
  "law_or_regulation",
  "department_regulation",
  "national_mandatory_standard",
  "national_recommended_standard",
  "local_regulation",
  "industry_standard",
  "local_standard",
  "institution_policy",
  "institution_sop",
  "expert_education_material",
  "curated_faq",
] as const;
export const authorityLevelSchema = z.enum(AUTHORITY_LEVELS);
export type AuthorityLevel = z.infer<typeof authorityLevelSchema>;

/** 效力状态（PROJECT_PLAN 7.6） */
export const LEGAL_STATUSES = [
  "in_force",
  "superseded",
  "draft",
  "unknown",
  "withdrawn",
] as const;
export const legalStatusSchema = z.enum(LEGAL_STATUSES);
export type LegalStatus = z.infer<typeof legalStatusSchema>;

/** 适用年龄段（PROJECT_PLAN 7.7） */
export const AGE_RANGES = [
  "0-6_months",
  "6-12_months",
  "1-2_years",
  "2-3_years",
  "0-3_years",
  "all",
] as const;
export const ageRangeSchema = z.enum(AGE_RANGES);
export type AgeRange = z.infer<typeof ageRangeSchema>;

/** 主题分类（PROJECT_PLAN 7.7） */
export const TOPICS = [
  "safety",
  "hygiene",
  "infection_prevention",
  "nutrition",
  "feeding",
  "sleep",
  "activity",
  "environment",
  "staffing",
  "emergency",
  "parent_communication",
  "institution_management",
  "child_development",
  "health_boundary",
] as const;
export const topicSchema = z.enum(TOPICS);
export type Topic = z.infer<typeof topicSchema>;

/** 适用岗位（PROJECT_PLAN 7.7） */
export const APPLICABLE_ROLES = [
  "caregiver",
  "nursery_teacher",
  "manager",
  "nurse",
  "kitchen_staff",
  "parent",
  "regulator",
] as const;
export const applicableRoleSchema = z.enum(APPLICABLE_ROLES);
export type ApplicableRole = z.infer<typeof applicableRoleSchema>;

/** 风险等级（PROJECT_PLAN 7.7） */
export const RISK_LEVELS = ["low", "medium", "high", "medical", "emergency"] as const;
export const riskLevelSchema = z.enum(RISK_LEVELS);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

/** 访问级别 */
export const ACCESS_LEVELS = ["public", "internal", "restricted"] as const;
export const accessLevelSchema = z.enum(ACCESS_LEVELS);
export type AccessLevel = z.infer<typeof accessLevelSchema>;

/** 页级提取方式（PROJECT_PLAN 7.3） */
export const EXTRACTION_METHODS = [
  "text_layer",
  "ocr",
  "manual",
  "html",
  "docx",
  "markdown",
  "plain_text",
  "unknown",
] as const;
export const extractionMethodSchema = z.enum(EXTRACTION_METHODS);
export type ExtractionMethod = z.infer<typeof extractionMethodSchema>;

/** 导入运行状态（PROJECT_PLAN 7.5） */
export const INGESTION_STATUSES = ["running", "succeeded", "failed"] as const;
export const ingestionStatusSchema = z.enum(INGESTION_STATUSES);
export type IngestionStatus = z.infer<typeof ingestionStatusSchema>;

/** 知识块内容类型（PROJECT_PLAN 7.4），用于区分正文、标题、列表和表格。 */
export const CHUNK_CONTENT_TYPES = ["heading", "body", "list", "table", "attachment"] as const;
export const chunkContentTypeSchema = z.enum(CHUNK_CONTENT_TYPES);
export type ChunkContentType = z.infer<typeof chunkContentTypeSchema>;
