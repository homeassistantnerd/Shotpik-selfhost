import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import crypto from 'node:crypto';
import {
  createChooserSchema,
  toggleSelectSchema,
  createCommentSchema,
  saveBrushSchema,
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

export const clientRouter = Router();

/**
 * GET /api/client/albums/:slug
 * Retrieves full hydrated client album state without sensitive hashes.
 */
clientRouter.get('/albums/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const albumList = await db
      .select()
      .from(albums)
      .where(eq(albums.slug, slug))
      .limit(1);

    if (albumList.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const album = albumList[0];
    const { passwordHash: _, ...safeAlbum } = album;

    const albumPhotos = await db
      .select()
      .from(photos)
      .where(eq(photos.albumId, album.id))
      .orderBy(photos.sortOrder);

    const albumChoosers = await db
      .select()
      .from(choosers)
      .where(eq(choosers.albumId, album.id));

    const studioList = await db
      .select()
      .from(studioSettings)
      .where(eq(studioSettings.id, 'default'))
      .limit(1);
    const studio = studioList[0] || null;

    const photoIds = albumPhotos.map((p) => p.id);
    const photoIdSet = new Set(photoIds);

    let albumSelections: typeof selections.$inferSelect[] = [];
    let albumComments: typeof comments.$inferSelect[] = [];
    let rawBrushNotes: BrushNoteTable[] = [];

    if (photoIds.length > 0) {
      const allSelections = await db.select().from(selections);
      albumSelections = allSelections.filter((s) => photoIdSet.has(s.photoId));

      const allComments = await db.select().from(comments);
      albumComments = allComments.filter((c) => photoIdSet.has(c.photoId));

      const allBrushNotes = await db.select().from(brushNotes);
      rawBrushNotes = allBrushNotes.filter((b) => photoIdSet.has(b.photoId));
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

    return res.json({
      album: safeAlbum,
      studio,
      photos: albumPhotos,
      choosers: albumChoosers,
      selections: albumSelections,
      comments: albumComments,
      brushNotes: parsedBrushNotes,
    });
  } catch (err: any) {
    console.error('[Client] Get album error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/client/albums/:slug/choosers
 * Registers a chooser identity or returns existing one if case-insensitive name matches.
 */
clientRouter.post('/albums/:slug/choosers', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const validation = createChooserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: validation.error.errors[0]?.message || 'Dữ liệu người chọn không hợp lệ',
      });
    }

    const { name, color } = validation.data;

    const albumList = await db
      .select()
      .from(albums)
      .where(eq(albums.slug, slug))
      .limit(1);

    if (albumList.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const album = albumList[0];
    const albumChoosers = await db
      .select()
      .from(choosers)
      .where(eq(choosers.albumId, album.id));

    const existing = albumChoosers.find(
      (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase()
    );

    if (existing) {
      return res.status(200).json({ chooser: existing });
    }

    const newChooser = {
      id: crypto.randomUUID(),
      albumId: album.id,
      name: name.trim(),
      color: color || '#e11d48',
      createdAt: new Date().toISOString(),
    };

    await db.insert(choosers).values(newChooser);
    return res.status(201).json({ chooser: newChooser });
  } catch (err: any) {
    console.error('[Client] Create chooser error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/client/albums/:slug/select
 * Toggles like on a photo with atomic quota enforcement inside a SQLite transaction.
 */
clientRouter.post('/albums/:slug/select', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const validation = toggleSelectSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        selected: false,
        error: validation.error.errors[0]?.message || 'Dữ liệu chọn ảnh không hợp lệ',
      });
    }

    const { photoId, chooserId } = validation.data;

    const albumList = await db
      .select()
      .from(albums)
      .where(eq(albums.slug, slug))
      .limit(1);

    if (albumList.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const album = albumList[0];
    if (album.isLocked) {
      return res.status(403).json({
        selected: false,
        error: 'Album is locked. Selections can no longer be modified.',
      });
    }

    // Run inside a SQLite transaction for atomic quota protection
    const txResult = db.transaction((tx) => {
      const existing = tx
        .select()
        .from(selections)
        .where(
          and(
            eq(selections.photoId, photoId),
            eq(selections.chooserId, chooserId)
          )
        )
        .all();

      if (existing.length > 0) {
        tx.delete(selections).where(eq(selections.id, existing[0].id)).run();
        return {
          statusCode: 200,
          payload: { selected: false, selectionId: existing[0].id },
        };
      }

      // Check distinct photo quota across the whole album
      const albumPhotos = tx
        .select({ id: photos.id })
        .from(photos)
        .where(eq(photos.albumId, album.id))
        .all();
      const photoIdSet = new Set(albumPhotos.map((p) => p.id));

      const allSelections = tx.select().from(selections).all();
      const existingAlbumSelections = allSelections.filter((s) =>
        photoIdSet.has(s.photoId)
      );

      const distinctLikedPhotoIds = new Set(
        existingAlbumSelections.map((s) => s.photoId)
      );

      if (
        !distinctLikedPhotoIds.has(photoId) &&
        distinctLikedPhotoIds.size >= album.maxSelections
      ) {
        return {
          statusCode: 400,
          payload: {
            selected: false,
            error: `Package limit reached (${album.maxSelections} photos)`,
            limitReached: true,
          },
        };
      }

      const newSelection = {
        id: crypto.randomUUID(),
        photoId,
        chooserId,
        likedAt: new Date().toISOString(),
      };

      tx.insert(selections).values(newSelection).run();
      return {
        statusCode: 201,
        payload: { selected: true, selection: newSelection },
      };
    });

    return res.status(txResult.statusCode).json(txResult.payload);
  } catch (err: any) {
    console.error('[Client] Toggle select error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/client/albums/:slug/comments
 * Adds a new comment on a photo.
 */
clientRouter.post('/albums/:slug/comments', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const validation = createCommentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: validation.error.errors[0]?.message || 'Dữ liệu bình luận không hợp lệ',
      });
    }

    const albumList = await db
      .select()
      .from(albums)
      .where(eq(albums.slug, slug))
      .limit(1);

    if (albumList.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const album = albumList[0];
    if (album.isLocked) {
      return res.status(403).json({ error: 'Album is locked' });
    }

    const { photoId, chooserId, text, tag } = validation.data;
    const newComment = {
      id: crypto.randomUUID(),
      photoId,
      chooserId,
      text: text.trim(),
      tag: tag || null,
      createdAt: new Date().toISOString(),
    };

    await db.insert(comments).values(newComment);
    return res.status(201).json({ comment: newComment });
  } catch (err: any) {
    console.error('[Client] Add comment error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/client/albums/:slug/comments/:commentId
 * Deletes a comment if the album is not locked.
 */
clientRouter.delete(
  '/albums/:slug/comments/:commentId',
  async (req: Request, res: Response) => {
    try {
      const { slug, commentId } = req.params;

      const albumList = await db
        .select()
        .from(albums)
        .where(eq(albums.slug, slug))
        .limit(1);

      if (albumList.length === 0) {
        return res.status(404).json({ error: 'Album not found' });
      }

      const album = albumList[0];
      if (album.isLocked) {
        return res.status(403).json({ error: 'Album is locked' });
      }

      const existingComment = await db
        .select()
        .from(comments)
        .where(eq(comments.id, commentId))
        .limit(1);

      if (existingComment.length === 0) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      await db.delete(comments).where(eq(comments.id, commentId));
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[Client] Delete comment error:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/client/albums/:slug/brush
 * Upserts normalized brush drawing note for (photoId, chooserId).
 * If strokes array is empty, deletes the note.
 */
clientRouter.post('/albums/:slug/brush', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const validation = saveBrushSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: validation.error.errors[0]?.message || 'Dữ liệu nét vẽ không hợp lệ',
      });
    }

    const albumList = await db
      .select()
      .from(albums)
      .where(eq(albums.slug, slug))
      .limit(1);

    if (albumList.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const album = albumList[0];
    if (album.isLocked) {
      return res.status(403).json({ error: 'Album is locked' });
    }

    const { photoId, chooserId, pathsJson } = validation.data;
    const strokes: Stroke[] =
      typeof pathsJson === 'string' ? JSON.parse(pathsJson) : pathsJson;

    // If strokes is empty, delete the brush note
    if (!strokes || strokes.length === 0) {
      await db
        .delete(brushNotes)
        .where(
          and(
            eq(brushNotes.photoId, photoId),
            eq(brushNotes.chooserId, chooserId)
          )
        );
      return res.json({ success: true, deleted: true, brushNote: null });
    }

    const jsonString = JSON.stringify(strokes);

    const existingList = await db
      .select()
      .from(brushNotes)
      .where(
        and(
          eq(brushNotes.photoId, photoId),
          eq(brushNotes.chooserId, chooserId)
        )
      )
      .limit(1);

    let savedNote: BrushNoteTable;

    if (existingList.length > 0) {
      await db
        .update(brushNotes)
        .set({ pathsJson: jsonString })
        .where(eq(brushNotes.id, existingList[0].id));
      savedNote = {
        ...existingList[0],
        pathsJson: jsonString,
      };
    } else {
      savedNote = {
        id: crypto.randomUUID(),
        photoId,
        chooserId,
        pathsJson: jsonString,
        createdAt: new Date().toISOString(),
      };
      await db.insert(brushNotes).values(savedNote);
    }

    return res.status(201).json({
      brushNote: {
        ...savedNote,
        strokes,
      },
    });
  } catch (err: any) {
    console.error('[Client] Save brush error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/client/albums/:slug/finish
 * Finalizes album selection, locking it against further changes.
 */
clientRouter.post('/albums/:slug/finish', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const albumList = await db
      .select()
      .from(albums)
      .where(eq(albums.slug, slug))
      .limit(1);

    if (albumList.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const album = albumList[0];
    const finishedAt = new Date().toISOString();

    await db
      .update(albums)
      .set({ isLocked: true, selectionFinishedAt: finishedAt })
      .where(eq(albums.id, album.id));

    const updatedAlbumList = await db
      .select()
      .from(albums)
      .where(eq(albums.id, album.id))
      .limit(1);

    return res.json({
      success: true,
      finishedAt,
      album: updatedAlbumList[0],
    });
  } catch (err: any) {
    console.error('[Client] Finish album error:', err);
    return res.status(500).json({ error: err.message });
  }
});
