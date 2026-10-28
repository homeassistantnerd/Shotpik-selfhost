/**
 * Generates a normalized clean key for cross-format RAW and JPEG file matching.
 * Solves cross-format file matching: `_MG_8695.JPG`, `_MG_8695.CR3`, `_mg_8695.arw`
 * all normalize to `_mg_8695`.
 *
 * @param fileName Original photo filename (e.g. "_MG_8695.CR3")
 * @returns Clean normalized key (e.g. "_mg_8695")
 */
export function generateCleanKey(fileName: string): string {
  if (!fileName) return '';
  return fileName.replace(/\.[^/.]+$/, '').trim().toLowerCase();
}
