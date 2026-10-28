import { Router, Request, Response } from 'express';
import { eq, desc, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';
import {
  extractGDriveFolderId,
  createAlbumSchema,
  updateAlbumSchema,
  type AdminAlbumSummary,
  type AdminAlbumsResponse,
  type AdminAlbumDetailResponse,
  type LightroomExportResponse,
  type Stroke,
} from '@shotpik/shared';
import { db } from '../db/index.js';
import {
  albums,
  photos,
  choosers,
  selections,
  comments,
  brushNotes,
  studioSettings,
  type BrushNoteTable,
} from '../db/schema.js';
import { crawlGDriveFolder, type CrawledPhoto } from '../services/gdrive.js';
import {
  generateLightroomExport,
  generateWindowsBatchScript,
  generatePosixShellScript,
  copyLocalNasRawFiles,
  validateNasMountPath,
} from '../services/rawExporter.js';

export const adminRouter = Router();

/**
 * Normalizes text to a URL-friendly slug.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

/**
 * GET /api/admin/albums
 * Lists all studio albums sorted newest first with computed metrics.
 */
adminRouter.get('/albums', async (_req: Request, res: Response) => {
  try {
    const allAlbums = await db
      .select()
      .from(albums)
      .orderBy(desc(albums.createdAt));

    const allPhotos = await db
      .select({ id: photos.id, albumId: photos.albumId })
      .from(photos);

    const allSelections = await db
      .select({ photoId: selections.photoId })
      .from(selections);

    const allChoosers = await db
      .select({ id: choosers.id, albumId: choosers.albumId })
      .from(choosers);

    const albumSummaries: AdminAlbumSummary[] = allAlbums.map((album) => {
      const albumPhotos = allPhotos.filter((p) => p.albumId === album.id);
      const photoIdSet = new Set(albumPhotos.map((p) => p.id));
      const distinctSelected = new Set(
        allSelections
          .filter((s) => photoIdSet.has(s.photoId))
          .map((s) => s.photoId)
      );
      const albumChoosers = allChoosers.filter((c) => c.albumId === album.id);

      return {
        ...album,
        totalPhotos: albumPhotos.length,
        selectedPhotosCount: distinctSelected.size,
        choosersCount: albumChoosers.length,
      };
    });

    const response: AdminAlbumsResponse = { albums: albumSummaries };
    return res.json(response);
  } catch (err: any) {
    console.error('[Admin] Get albums error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/albums
 * Creates a new album, extracts Google Drive folder ID, generates unique slug,
 * crawls Google Drive to index photos, and returns the created AdminAlbumSummary.
 */
adminRouter.post('/albums', async (req: Request, res: Response) => {
  try {
    const validation = createAlbumSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: validation.error.errors[0]?.message || 'Dữ liệu album không hợp lệ',
      });
    }

    const {
      title,
      customerName,
      gdriveFolderUrl,
      slug: customSlug,
      maxSelections,
      serverMountPath,
    } = validation.data;

    let validatedServerMountPath: string | null = null;
    if (serverMountPath && serverMountPath.trim()) {
      const mountValidation = validateNasMountPath(serverMountPath);
      if (!mountValidation.valid) {
        return res.status(400).json({
          error: mountValidation.error || 'Đường dẫn thư mục NAS không hợp lệ',
        });
      }
      validatedServerMountPath = mountValidation.resolvedPath;
    }

    const gdriveFolderId = extractGDriveFolderId(gdriveFolderUrl);
    if (!gdriveFolderId) {
      return res.status(400).json({
        error: 'Link hoặc ID thư mục Google Drive không hợp lệ',
      });
    }

    // Generate guaranteed unique URL slug
    let baseSlug = (customSlug ? slugify(customSlug) : slugify(title)) || `album-${Date.now()}`;
    let finalSlug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await db
        .select({ id: albums.id })
        .from(albums)
        .where(eq(albums.slug, finalSlug))
        .limit(1);
      if (existing.length === 0) break;
      finalSlug = `${baseSlug}-${counter++}`;
    }

    const newAlbumId = crypto.randomUUID();
    const newAlbum = {
      id: newAlbumId,
      slug: finalSlug,
      title: title.trim(),
      customerName: customerName.trim(),
      gdriveFolderId,
      gdriveFolderUrl: gdriveFolderUrl.trim(),
      maxSelections: maxSelections ?? 30,
      isLocked: false,
      selectionFinishedAt: null,
      deadlineAt: null,
      passwordHash: null,
      serverMountPath: validatedServerMountPath,
      createdAt: new Date().toISOString(),
    };

    await db.insert(albums).values(newAlbum);

    // Crawl Google Drive folder for photos
    let crawledPhotos: CrawledPhoto[] = [];
    try {
      crawledPhotos = await crawlGDriveFolder(gdriveFolderId);
    } catch (crawlErr: any) {
      console.warn(
        `[Admin] Google Drive crawl error for folder ${gdriveFolderId}:`,
        crawlErr?.message || crawlErr
      );
    }

    if (crawledPhotos.length > 0) {
      const photoRecords = crawledPhotos.map((photo, index) => ({
        id: photo.id || crypto.randomUUID(),
        albumId: newAlbumId,
        fileName: photo.fileName,
        cleanKey: photo.cleanKey,
        gdriveFileId: photo.gdriveFileId,
        thumbUrl: photo.thumbUrl,
        fullUrl: photo.fullUrl,
        subGallery: photo.subGallery || 'All',
        width: photo.width || 0,
        height: photo.height || 0,
        sortOrder: photo.sortOrder ?? index,
      }));

      // Batch insert in chunks of 100 to respect SQLite parameter limits
      for (let i = 0; i < photoRecords.length; i += 100) {
        await db.insert(photos).values(photoRecords.slice(i, i + 100));
      }
    }

    const createdSummary: AdminAlbumSummary = {
      ...newAlbum,
      totalPhotos: crawledPhotos.length,
      selectedPhotosCount: 0,
      choosersCount: 0,
    };

    return res.status(201).json({
      ...createdSummary,
      album: newAlbum,
      importedPhotosCount: crawledPhotos.length,
    });
  } catch (err: any) {
    console.error('[Admin] Create album error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/albums/:id
 * Retrieves detailed album view including computed selectedCleanKeys.
 */
adminRouter.get('/albums/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const albumList = await db
      .select()
      .from(albums)
      .where(eq(albums.id, id))
      .limit(1);

    if (albumList.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const album = albumList[0];
    const albumPhotos = await db
      .select()
      .from(photos)
      .where(eq(photos.albumId, album.id))
      .orderBy(photos.sortOrder);

    const albumChoosers = await db
      .select()
      .from(choosers)
      .where(eq(choosers.albumId, album.id));

    const photoIds = albumPhotos.map((p) => p.id);
    const photoIdSet = new Set(photoIds);
    const photoMap = new Map(albumPhotos.map((p) => [p.id, p]));

    let albumSelections: typeof selections.$inferSelect[] = [];
    let albumComments: typeof comments.$inferSelect[] = [];
    let rawBrushNotes: BrushNoteTable[] = [];

    if (photoIds.length > 0) {
      albumSelections = await db
        .select()
        .from(selections)
        .where(inArray(selections.photoId, photoIds));

      albumComments = await db
        .select()
        .from(comments)
        .where(inArray(comments.photoId, photoIds));

      rawBrushNotes = await db
        .select()
        .from(brushNotes)
        .where(inArray(brushNotes.photoId, photoIds));
    }

    const parsedBrushNotes = rawBrushNotes.map((b) => {
      let strokes: Stroke[] = [];
      try {
        const parsed = JSON.parse(b.pathsJson);
        strokes = Array.isArray(parsed) ? parsed : [];
      } catch {
        strokes = [];
      }
      return {
        ...b,
        strokes,
      };
    });

    const distinctSelectedPhotoIds = new Set(
      albumSelections.map((s) => s.photoId)
    );

    const selectedCleanKeys = Array.from(distinctSelectedPhotoIds)
      .map((pid) => photoMap.get(pid)?.cleanKey)
      .filter((key): key is string => Boolean(key));

    const response: AdminAlbumDetailResponse = {
      album,
      photos: albumPhotos,
      choosers: albumChoosers,
      selections: albumSelections,
      comments: albumComments,
      brushNotes: parsedBrushNotes,
      selectedCleanKeys,
      totalPhotos: albumPhotos.length,
      selectedPhotosCount: distinctSelectedPhotoIds.size,
      choosersCount: albumChoosers.length,
    };

    return res.json(response);
  } catch (err: any) {
    console.error('[Admin] Get album detail error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/admin/albums/:id
 * Updates album metadata, quota, and lock status.
 */
adminRouter.patch('/albums/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validation = updateAlbumSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: validation.error.errors[0]?.message || 'Dữ liệu cập nhật không hợp lệ',
      });
    }

    const albumList = await db
      .select()
      .from(albums)
      .where(eq(albums.id, id))
      .limit(1);

    if (albumList.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const updates: Partial<typeof albums.$inferInsert> = {};
    const { title, maxSelections, isLocked, deadlineAt, serverMountPath } =
      validation.data;

    if (title !== undefined) updates.title = title.trim();
    if (maxSelections !== undefined) updates.maxSelections = maxSelections;
    if (isLocked !== undefined) updates.isLocked = isLocked;
    if (deadlineAt !== undefined) updates.deadlineAt = deadlineAt;
    if (serverMountPath !== undefined) {
      if (serverMountPath && serverMountPath.trim()) {
        const mountValidation = validateNasMountPath(serverMountPath);
        if (!mountValidation.valid) {
          return res.status(400).json({
            error: mountValidation.error || 'Đường dẫn thư mục NAS không hợp lệ',
          });
        }
        updates.serverMountPath = mountValidation.resolvedPath;
      } else {
        updates.serverMountPath = null;
      }
    }

    if (req.body.customerName && typeof req.body.customerName === 'string') {
      updates.customerName = req.body.customerName.trim();
    }

    await db.update(albums).set(updates).where(eq(albums.id, id));

    const updatedList = await db
      .select()
      .from(albums)
      .where(eq(albums.id, id))
      .limit(1);

    return res.json({
      success: true,
      album: updatedList[0],
    });
  } catch (err: any) {
    console.error('[Admin] Update album error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/albums/:id/sync
 * Re-runs Google Drive folder crawler, adding new photos and updating existing
 * ones by gdriveFileId without wiping user selections, comments, or brush annotations.
 */
adminRouter.post('/albums/:id/sync', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const albumList = await db
      .select()
      .from(albums)
      .where(eq(albums.id, id))
      .limit(1);

    if (albumList.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const album = albumList[0];
    const crawledPhotos = await crawlGDriveFolder(album.gdriveFolderId);
    const existingPhotos = await db
      .select()
      .from(photos)
      .where(eq(photos.albumId, album.id));

    const existingByGdriveId = new Map(
      existingPhotos.map((p) => [p.gdriveFileId, p])
    );

    const newPhotosToInsert: typeof photos.$inferInsert[] = [];
    let updatedPhotosCount = 0;

    for (const crawled of crawledPhotos) {
      const existing = existingByGdriveId.get(crawled.gdriveFileId);

      if (existing) {
        // Update photo metadata preserving primary key id
        await db
          .update(photos)
          .set({
            fileName: crawled.fileName,
            cleanKey: crawled.cleanKey,
            thumbUrl: crawled.thumbUrl,
            fullUrl: crawled.fullUrl,
            subGallery: crawled.subGallery,
            width: crawled.width,
            height: crawled.height,
            sortOrder: crawled.sortOrder,
          })
          .where(eq(photos.id, existing.id));
        updatedPhotosCount += 1;
      } else {
        newPhotosToInsert.push({
          id: crawled.id || crypto.randomUUID(),
          albumId: album.id,
          fileName: crawled.fileName,
          cleanKey: crawled.cleanKey,
          gdriveFileId: crawled.gdriveFileId,
          thumbUrl: crawled.thumbUrl,
          fullUrl: crawled.fullUrl,
          subGallery: crawled.subGallery,
          width: crawled.width,
          height: crawled.height,
          sortOrder: crawled.sortOrder,
        });
      }
    }

    if (newPhotosToInsert.length > 0) {
      for (let i = 0; i < newPhotosToInsert.length; i += 100) {
        await db.insert(photos).values(newPhotosToInsert.slice(i, i + 100));
      }
    }

    const totalCount = existingPhotos.length + newPhotosToInsert.length;

    return res.json({
      success: true,
      totalPhotos: totalCount,
      newPhotosAdded: newPhotosToInsert.length,
      photosUpdated: updatedPhotosCount,
    });
  } catch (err: any) {
    console.error('[Admin] Sync album error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/albums/:id
 * Deletes the album and cascades child records (photos, choosers, selections, etc.).
 */
adminRouter.delete('/albums/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const albumList = await db
      .select()
      .from(albums)
      .where(eq(albums.id, id))
      .limit(1);

    if (albumList.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    await db.delete(albums).where(eq(albums.id, id));
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[Admin] Delete album error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/albums/:id/export/lightroom
 * Generates search query for Adobe Lightroom and Capture One across distinct selected photos.
 */
adminRouter.get('/albums/:id/export/lightroom', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const format = (req.query.format as string) || 'comma';

    const albumList = await db
      .select()
      .from(albums)
      .where(eq(albums.id, id))
      .limit(1);

    if (albumList.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const albumPhotos = await db
      .select()
      .from(photos)
      .where(eq(photos.albumId, id));
    const photoMap = new Map(albumPhotos.map((p) => [p.id, p]));
    const photoIds = albumPhotos.map((p) => p.id);

    let distinctSelectedPhotoIds = new Set<string>();
    if (photoIds.length > 0) {
      const albumSelections = await db
        .select({ photoId: selections.photoId })
        .from(selections)
        .where(inArray(selections.photoId, photoIds));
      distinctSelectedPhotoIds = new Set(
        albumSelections.map((s) => s.photoId)
      );
    }

    const cleanKeys = Array.from(distinctSelectedPhotoIds)
      .map((pid) => photoMap.get(pid)?.cleanKey)
      .filter((k): k is string => Boolean(k));

    const exportResult = generateLightroomExport(cleanKeys);
    const query =
      format === 'space'
        ? exportResult.lightroomQuery
        : exportResult.captureOneQuery;

    const response: LightroomExportResponse & {
      lightroomQuery: string;
      captureOneQuery: string;
      cleanKeys: string[];
    } = {
      selectedCount: exportResult.selectedCount,
      query,
      lightroomQuery: exportResult.lightroomQuery,
      captureOneQuery: exportResult.captureOneQuery,
      cleanKeys: exportResult.cleanKeys,
    };

    return res.json(response);
  } catch (err: any) {
    console.error('[Admin] Lightroom export error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/albums/:id/export/script
 * Generates and downloads a companion script (.bat or .sh) for offline RAW file copying.
 */
adminRouter.get('/albums/:id/export/script', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const osType =
      (req.query.os as string) || (req.query.type as string) || 'win';

    const albumList = await db
      .select()
      .from(albums)
      .where(eq(albums.id, id))
      .limit(1);

    if (albumList.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const album = albumList[0];
    const albumPhotos = await db
      .select()
      .from(photos)
      .where(eq(photos.albumId, id));
    const photoMap = new Map(albumPhotos.map((p) => [p.id, p]));
    const photoIds = albumPhotos.map((p) => p.id);

    let distinctSelectedPhotoIds = new Set<string>();
    if (photoIds.length > 0) {
      const albumSelections = await db
        .select({ photoId: selections.photoId })
        .from(selections)
        .where(inArray(selections.photoId, photoIds));
      distinctSelectedPhotoIds = new Set(
        albumSelections.map((s) => s.photoId)
      );
    }

    const cleanKeys = Array.from(distinctSelectedPhotoIds)
      .map((pid) => photoMap.get(pid)?.cleanKey)
      .filter((k): k is string => Boolean(k));

    if (osType.toLowerCase() === 'mac' || osType.toLowerCase() === 'sh') {
      const script = generatePosixShellScript(album.slug, cleanKeys);
      res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="copy_raw_${album.slug}.sh"`
      );
      return res.send(script);
    } else {
      const script = generateWindowsBatchScript(album.slug, cleanKeys);
      res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="copy_raw_${album.slug}.bat"`
      );
      return res.send(script);
    }
  } catch (err: any) {
    console.error('[Admin] Script export error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/albums/:id/export/nas-copy
 * Directly copies matching RAW files on a mounted NAS or local filesystem path.
 */
adminRouter.post('/albums/:id/export/nas-copy', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const albumList = await db
      .select()
      .from(albums)
      .where(eq(albums.id, id))
      .limit(1);

    if (albumList.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const album = albumList[0];
    const rawMountPath = req.body.serverMountPath || album.serverMountPath;

    if (!rawMountPath) {
      return res.status(400).json({
        error: 'Album does not have a serverMountPath configured',
      });
    }

    const mountValidation = validateNasMountPath(rawMountPath);
    if (!mountValidation.valid) {
      return res.status(400).json({
        error: mountValidation.error || 'Đường dẫn thư mục NAS không hợp lệ',
      });
    }

    const mountPath = mountValidation.resolvedPath;

    const albumPhotos = await db
      .select()
      .from(photos)
      .where(eq(photos.albumId, id));
    const photoMap = new Map(albumPhotos.map((p) => [p.id, p]));
    const photoIds = albumPhotos.map((p) => p.id);

    let distinctSelectedPhotoIds = new Set<string>();
    if (photoIds.length > 0) {
      const albumSelections = await db
        .select({ photoId: selections.photoId })
        .from(selections)
        .where(inArray(selections.photoId, photoIds));
      distinctSelectedPhotoIds = new Set(
        albumSelections.map((s) => s.photoId)
      );
    }

    const cleanKeys = Array.from(distinctSelectedPhotoIds)
      .map((pid) => photoMap.get(pid)?.cleanKey)
      .filter((k): k is string => Boolean(k));

    const copyResult = await copyLocalNasRawFiles(mountPath, cleanKeys);

    return res.json({
      success: copyResult.errors.length === 0,
      serverMountPath: mountPath,
      copiedCount: copyResult.copiedCount,
      copiedFiles: copyResult.copiedFiles,
      errors: copyResult.errors,
    });
  } catch (err: any) {
    console.error('[Admin] NAS copy error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/settings
 * Reads the studio settings configuration.
 */
adminRouter.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settingsList = await db
      .select()
      .from(studioSettings)
      .where(eq(studioSettings.id, 'default'))
      .limit(1);

    return res.json({ settings: settingsList[0] || null });
  } catch (err: any) {
    console.error('[Admin] Get settings error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/settings
 * Updates studio branding, contact info, and watermark text.
 */
adminRouter.post('/settings', async (req: Request, res: Response) => {
  try {
    const {
      studioName,
      slogan,
      phone,
      email,
      logoUrl,
      watermarkText,
      customDomain,
    } = req.body;

    const valuesToUpdate = {
      studioName: studioName?.trim() || 'Shotpik Studio',
      slogan: slogan !== undefined ? slogan : null,
      phone: phone !== undefined ? phone : null,
      email: email !== undefined ? email : null,
      logoUrl: logoUrl !== undefined ? logoUrl : null,
      watermarkText: watermarkText !== undefined ? watermarkText : null,
      customDomain: customDomain !== undefined ? customDomain : null,
    };

    await db
      .insert(studioSettings)
      .values({ id: 'default', ...valuesToUpdate })
      .onConflictDoUpdate({
        target: studioSettings.id,
        set: valuesToUpdate,
      });

    const updated = await db
      .select()
      .from(studioSettings)
      .where(eq(studioSettings.id, 'default'))
      .limit(1);

    return res.json({
      success: true,
      settings: updated[0] || null,
    });
  } catch (err: any) {
    console.error('[Admin] Update settings error:', err);
    return res.status(500).json({ error: err.message });
  }
});
