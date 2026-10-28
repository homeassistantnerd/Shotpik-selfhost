/**
 * Extract folder ID from various Google Drive folder URL formats or bare IDs.
 *
 * Supported formats:
 * - https://drive.google.com/drive/folders/1a2b3c4d5e...
 * - https://drive.google.com/drive/u/0/folders/1a2b3c4d5e...
 * - https://drive.google.com/open?id=1a2b3c4d5e...
 * - Bare folder ID string (alphanumeric with underscores/dashes, 25+ chars)
 */
export function extractFolderId(urlOrId: string): string | null {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  const trimmed = urlOrId.trim();

  const patterns = [
    /folders\/([a-zA-Z0-9_-]{25,})/,
    /[?&]id=([a-zA-Z0-9_-]{25,})/,
    /^([a-zA-Z0-9_-]{25,})$/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Alias for extractFolderId matching the shared package specification.
 */
export const extractGDriveFolderId = extractFolderId;

/**
 * Generates thumbnail URL for Google Drive file (sz=w600).
 */
export function buildGDriveThumbUrl(fileId: string): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
}

/**
 * Generates high-resolution lightbox URL for Google Drive file (sz=w2048).
 */
export function buildGDriveFullUrl(fileId: string): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2048`;
}

/**
 * Returns dynamic edge CDN thumbnail URLs served by Google Drive.
 * Zero proxying through Node.js backend.
 *
 * @param fileId Google Drive file ID
 * @returns Object with sz=w600 (grid thumbnail) and sz=w2048 (lightbox retina preview)
 */
export function getGoogleThumbnailUrls(fileId: string): { thumbUrl: string; fullUrl: string } {
  return {
    thumbUrl: buildGDriveThumbUrl(fileId),
    fullUrl: buildGDriveFullUrl(fileId),
  };
}
