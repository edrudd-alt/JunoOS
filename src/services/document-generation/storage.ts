/**
 * Converts a human-facing display filename into a Supabase Storage-safe key.
 * Keeps the display filename (with em dashes) in documents.filename unchanged;
 * only the storage path uses this sanitised form.
 *
 * "2026-05-12 — Bob Bigballs — Cyclr — Transaction Statement.pdf"
 *   → "2026-05-12-Bob_Bigballs-Cyclr-Transaction_Statement.pdf"
 */
export function sanitiseStorageKey(filename: string): string {
  return filename
    .replace(/\s*[–—]\s*/g, '-')  // en/em dash (with surrounding spaces) → single hyphen
    .replace(/\s+/g, '_')          // remaining whitespace → underscore
    .replace(/[^\w.\-]/g, '')      // strip anything not word-char, dot, or hyphen
}
