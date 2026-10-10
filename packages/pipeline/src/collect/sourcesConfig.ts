import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  accessLevelSchema,
  ageRangeSchema,
  authorityLevelSchema,
  isoDateSchema,
  legalStatusSchema,
  sourceTypeSchema,
} from "@childcare/core";

/** One entry in a collection manifest: a URL or a local path plus registration metadata. */
export const sourceEntrySchema = z
  .object({
    title: z.string().min(1),
    url: z.string().url().optional(),
    path: z.string().optional(),
    type: sourceTypeSchema.default("other"),
    authority: authorityLevelSchema.default("expert_education_material"),
    org: z.string().optional(),
    docNo: z.string().optional(),
    jurisdiction: z.string().optional(),
    publishedAt: isoDateSchema,
    effectiveFrom: isoDateSchema,
    effectiveTo: isoDateSchema,
    legalStatus: legalStatusSchema.optional(),
    access: accessLevelSchema.optional(),
    ageRanges: z.array(ageRangeSchema).optional(),
    copyrightOwner: z.string().optional(),
    licenseType: z.string().optional(),
    canStoreFullText: z.boolean().optional(),
    canShowExcerpt: z.boolean().optional(),
    canExport: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .refine((entry) => Boolean(entry.url) || Boolean(entry.path), {
    message: "entry must have either `url` or `path`",
  });

export type SourceEntry = z.infer<typeof sourceEntrySchema>;

export const sourcesConfigSchema = z.object({
  sources: z.array(sourceEntrySchema).min(1),
});

export type SourcesConfig = z.infer<typeof sourcesConfigSchema>;

/** Read and validate a sources manifest (YAML or JSON — YAML is a superset). */
export async function loadSourcesConfig(filePath: string): Promise<SourceEntry[]> {
  const raw = await readFile(filePath, "utf8");
  const data = parseYaml(raw) as unknown;
  const parsed = sourcesConfigSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`invalid sources manifest:\n${issues}`);
  }
  return parsed.data.sources;
}
