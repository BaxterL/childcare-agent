/**
 * Light, lossless-ish normalisation applied to extracted text before it is
 * stored. Structural cleaning (headers/footers, tables, section detection)
 * happens in a later chunking stage.
 */
export function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
