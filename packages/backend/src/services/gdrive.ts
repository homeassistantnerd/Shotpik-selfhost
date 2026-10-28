import crypto from 'node:crypto';
import {
  generateCleanKey,
  buildGDriveThumbUrl,
  buildGDriveFullUrl,
} from '@shotpik/shared';

/**
 * Representation of a crawled photo ready for database insertion.
 */
export interface CrawledPhoto {
  id: string;
  fileName: string;
  cleanKey: string;
  gdriveFileId: string;
  thumbUrl: string;
  fullUrl: string;
  subGallery: string;
  width: number;
  height: number;
  sortOrder: number;
}

interface GDriveApiFile {
  id: string;
  name: string;
  mimeType: string;
  imageMediaMetadata?: {
    width?: number;
    height?: number;
    rotation?: number;
  };
}

interface GDriveApiResponse {
  nextPageToken?: string;
  files?: GDriveApiFile[];
}

const SUPPORTED_IMAGE_REGEX = /\.(jpe?g|png|webp|heic)$/i;

/**
 * Performs natural sorting on photo objects based on fileName.
 */
function naturalSortPhotos<T extends { fileName: string }>(photos: T[]): T[] {
  return [...photos].sort((a, b) =>
    a.fileName.localeCompare(b.fileName, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

/**
 * Queries the official Google Drive API v3 for files matching a query,
 * iterating through all pages using nextPageToken.
 */
async function fetchAllDriveFiles(
  query: string,
  apiKey: string,
  fields = 'nextPageToken, files(id, name, mimeType, imageMediaMetadata)'
): Promise<GDriveApiFile[]> {
  const allFiles: GDriveApiFile[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('q', query);
    url.searchParams.set('fields', fields);
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');

    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Drive API returned HTTP ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as GDriveApiResponse;
    if (Array.isArray(data.files)) {
      allFiles.push(...data.files);
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/**
 * Crawls a Google Drive folder using the Google Drive API v3 with an API key.
 * Crawls direct images in folderId and 1-level child folders mapped to subGallery.
 */
export async function crawlViaGoogleDriveApi(
  folderId: string,
  apiKey: string
): Promise<CrawledPhoto[]> {
  // Query root folder contents
  const rootItems = await fetchAllDriveFiles(
    `'${folderId}' in parents and trashed = false`,
    apiKey
  );

  const directImages: GDriveApiFile[] = [];
  const childFolders: GDriveApiFile[] = [];

  for (const item of rootItems) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      childFolders.push(item);
    } else if (
      item.mimeType.startsWith('image/') ||
      SUPPORTED_IMAGE_REGEX.test(item.name)
    ) {
      directImages.push(item);
    }
  }

  const rawDiscovered: Array<{
    fileName: string;
    gdriveFileId: string;
    subGallery: string;
    width: number;
    height: number;
  }> = [];

  // Add direct images under 'All'
  for (const img of directImages) {
    rawDiscovered.push({
      fileName: img.name,
      gdriveFileId: img.id,
      subGallery: 'All',
      width: img.imageMediaMetadata?.width ?? 0,
      height: img.imageMediaMetadata?.height ?? 0,
    });
  }

  // Crawl 1-level child folders for sub-galleries
  for (const folder of childFolders) {
    const subGalleryName = folder.name.trim() || 'All';
    try {
      const folderImages = await fetchAllDriveFiles(
        `'${folder.id}' in parents and trashed = false and (mimeType contains 'image/' or name contains '.jpg' or name contains '.jpeg' or name contains '.png' or name contains '.webp' or name contains '.heic')`,
        apiKey
      );

      for (const img of folderImages) {
        if (
          img.mimeType !== 'application/vnd.google-apps.folder' &&
          (img.mimeType.startsWith('image/') || SUPPORTED_IMAGE_REGEX.test(img.name))
        ) {
          rawDiscovered.push({
            fileName: img.name,
            gdriveFileId: img.id,
            subGallery: subGalleryName,
            width: img.imageMediaMetadata?.width ?? 0,
            height: img.imageMediaMetadata?.height ?? 0,
          });
        }
      }
    } catch (childError) {
      console.warn(
        `[gdrive-service] Failed crawling child folder "${folder.name}" (${folder.id}):`,
        childError
      );
    }
  }

  // Natural sort by fileName
  const sorted = naturalSortPhotos(rawDiscovered);

  return sorted.map((photo, index) => ({
    id: crypto.randomUUID(),
    fileName: photo.fileName,
    cleanKey: generateCleanKey(photo.fileName),
    gdriveFileId: photo.gdriveFileId,
    thumbUrl: buildGDriveThumbUrl(photo.gdriveFileId),
    fullUrl: buildGDriveFullUrl(photo.gdriveFileId),
    subGallery: photo.subGallery,
    width: photo.width,
    height: photo.height,
    sortOrder: index,
  }));
}

/**
 * Parses embedded folderview HTML to extract file IDs and image filenames.
 */
export function parseEmbeddedFolderHtml(
  html: string
): Array<{ id: string; name: string }> {
  const discovered: Array<{ id: string; name: string }> = [];
  const seenIds = new Set<string>();

  // Pattern 1: Google Drive JSON array payload ["<id>",null,"<name>",...
  const jsonPattern =
    /\[\s*["']([a-zA-Z0-9_-]{25,})["']\s*,\s*null\s*,\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = jsonPattern.exec(html)) !== null) {
    const [, id, rawName] = match;
    const name = rawName.trim();
    if (SUPPORTED_IMAGE_REGEX.test(name) && !seenIds.has(id)) {
      seenIds.add(id);
      discovered.push({ id, name });
    }
  }

  // Pattern 2: data-id attributes paired with title attribute
  const dataIdPattern =
    /data-id=["']([a-zA-Z0-9_-]{25,})["'][^>]*?title=["']([^"']+)["']/g;
  while ((match = dataIdPattern.exec(html)) !== null) {
    const [, id, rawName] = match;
    const name = rawName.trim();
    if (SUPPORTED_IMAGE_REGEX.test(name) && !seenIds.has(id)) {
      seenIds.add(id);
      discovered.push({ id, name });
    }
  }

  // Pattern 3: Standard Google Drive file viewer anchor tags /file/d/<id>/view
  const anchorPattern =
    /\/file\/d\/([a-zA-Z0-9_-]{25,})[^>]*?>([^<]+)</g;
  while ((match = anchorPattern.exec(html)) !== null) {
    const [, id, rawName] = match;
    const name = rawName.trim();
    if (SUPPORTED_IMAGE_REGEX.test(name) && !seenIds.has(id)) {
      seenIds.add(id);
      discovered.push({ id, name });
    }
  }

  // Pattern 4: Generalized window._DRIVE_ivd entry pattern: ["<id>","<name>",...
  const ivdPattern =
    /\[\s*["']([a-zA-Z0-9_-]{25,})["']\s*,\s*["']([^"']+\.(?:jpe?g|png|webp|heic))["']/gi;
  while ((match = ivdPattern.exec(html)) !== null) {
    const [, id, rawName] = match;
    const name = rawName.trim();
    if (SUPPORTED_IMAGE_REGEX.test(name) && !seenIds.has(id)) {
      seenIds.add(id);
      discovered.push({ id, name });
    }
  }

  // Pattern 5: Google Drive embedded list view flip-entry elements
  // e.g. <div class="flip-entry" id="entry-<id>" ...> ... <div class="flip-entry-title">photo.jpg</div>
  const flipPattern =
    /class="flip-entry"[^>]*?id="entry-([a-zA-Z0-9_-]{25,})"[^>]*?>[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
  while ((match = flipPattern.exec(html)) !== null) {
    const [, id, rawName] = match;
    const name = rawName.trim();
    if (SUPPORTED_IMAGE_REGEX.test(name) && !seenIds.has(id)) {
      seenIds.add(id);
      discovered.push({ id, name });
    }
  }

  // Pattern 6: Google Drive viewer anchors with nested flip-entry-title
  const flipAnchorPattern =
    /\/file\/d\/([a-zA-Z0-9_-]{25,})\/view[^"']*["'][\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
  while ((match = flipAnchorPattern.exec(html)) !== null) {
    const [, id, rawName] = match;
    const name = rawName.trim();
    if (SUPPORTED_IMAGE_REGEX.test(name) && !seenIds.has(id)) {
      seenIds.add(id);
      discovered.push({ id, name });
    }
  }

  return discovered;
}

/**
 * Fallback crawler that fetches the public embedded view of a Google Drive folder
 * and extracts image file IDs and names.
 */
export async function crawlViaPublicEmbedded(folderId: string): Promise<CrawledPhoto[]> {
  const embeddedUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;

  const response = await fetch(embeddedUrl, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Public embedded view request failed with status ${response.status} for folder ID ${folderId}`
    );
  }

  const html = await response.text();
  const parsedItems = parseEmbeddedFolderHtml(html);

  const mapped = parsedItems.map((item) => ({
    fileName: item.name,
    gdriveFileId: item.id,
    subGallery: 'All',
    width: 0,
    height: 0,
  }));

  const sorted = naturalSortPhotos(mapped);

  return sorted.map((photo, index) => ({
    id: crypto.randomUUID(),
    fileName: photo.fileName,
    cleanKey: generateCleanKey(photo.fileName),
    gdriveFileId: photo.gdriveFileId,
    thumbUrl: buildGDriveThumbUrl(photo.gdriveFileId),
    fullUrl: buildGDriveFullUrl(photo.gdriveFileId),
    subGallery: photo.subGallery,
    width: photo.width,
    height: photo.height,
    sortOrder: index,
  }));
}

/**
 * Primary entry point: crawls a Google Drive folder and returns photo objects ready for DB insertion.
 * Uses official API v3 if GOOGLE_DRIVE_API_KEY is present, with automatic fallback to public embedded crawler.
 */
export async function crawlGDriveFolder(folderId: string): Promise<CrawledPhoto[]> {
  if (!folderId || typeof folderId !== 'string') {
    throw new Error('Valid Google Drive folder ID is required for crawling');
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim();

  if (apiKey) {
    try {
      const results = await crawlViaGoogleDriveApi(folderId, apiKey);
      if (results.length > 0) {
        return results;
      }
      console.warn(
        `[gdrive-service] Google Drive API v3 returned 0 items for folder ${folderId}, attempting fallback...`
      );
    } catch (apiError) {
      console.warn(
        `[gdrive-service] Google Drive API v3 crawl failed for folder ${folderId}, switching to fallback:`,
        apiError
      );
    }
  }

  return await crawlViaPublicEmbedded(folderId);
}
