import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

/**
 * Studio Settings Table
 * Single-row table configuring studio branding, contact info, and watermark preferences.
 */
export const studioSettings = sqliteTable('studio_settings', {
  id: text('id').primaryKey().$default(() => 'default'),
  studioName: text('studio_name').notNull(),
  slogan: text('slogan'),
  phone: text('phone'),
  email: text('email'),
  logoUrl: text('logo_url'),
  watermarkText: text('watermark_text'),
  customDomain: text('custom_domain'),
});

/**
 * Albums Table
 * Stores proofing albums linked to Google Drive folders with quotas and status locks.
 */
export const albums = sqliteTable('albums', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  customerName: text('customer_name').notNull(),
  gdriveFolderId: text('gdrive_folder_id').notNull(),
  gdriveFolderUrl: text('gdrive_folder_url').notNull(),
  maxSelections: integer('max_selections').notNull().default(30),
  isLocked: integer('is_locked', { mode: 'boolean' }).notNull().default(false),
  selectionFinishedAt: text('selection_finished_at'),
  deadlineAt: text('deadline_at'),
  passwordHash: text('password_hash'),
  serverMountPath: text('server_mount_path'),
  createdAt: text('created_at').notNull(),
});

/**
 * Photos Table
 * Indexed photos from Google Drive folder crawls with CDN thumbnail links.
 */
export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  albumId: text('album_id')
    .notNull()
    .references(() => albums.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  cleanKey: text('clean_key').notNull(),
  gdriveFileId: text('gdrive_file_id').notNull(),
  thumbUrl: text('thumb_url').notNull(),
  fullUrl: text('full_url').notNull(),
  subGallery: text('sub_gallery').notNull().default('All'),
  width: integer('width').notNull().default(0),
  height: integer('height').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
});

/**
 * Choosers Table
 * People participating in the album selection process (e.g. bride, groom, parents).
 */
export const choosers = sqliteTable('choosers', {
  id: text('id').primaryKey(),
  albumId: text('album_id')
    .notNull()
    .references(() => albums.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#e11d48'),
  createdAt: text('created_at').notNull(),
});

/**
 * Selections Table
 * Like/selection records connecting photos to specific choosers.
 */
export const selections = sqliteTable('selections', {
  id: text('id').primaryKey(),
  photoId: text('photo_id')
    .notNull()
    .references(() => photos.id, { onDelete: 'cascade' }),
  chooserId: text('chooser_id')
    .notNull()
    .references(() => choosers.id, { onDelete: 'cascade' }),
  likedAt: text('liked_at').notNull(),
});

/**
 * Comments Table
 * Notes left on specific photos by choosers with optional retouch tags.
 */
export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  photoId: text('photo_id')
    .notNull()
    .references(() => photos.id, { onDelete: 'cascade' }),
  chooserId: text('chooser_id')
    .notNull()
    .references(() => choosers.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  tag: text('tag'),
  createdAt: text('created_at').notNull(),
});

/**
 * Brush Notes Table
 * Freehand drawing annotations over photos with normalized vector coordinates.
 */
export const brushNotes = sqliteTable('brush_notes', {
  id: text('id').primaryKey(),
  photoId: text('photo_id')
    .notNull()
    .references(() => photos.id, { onDelete: 'cascade' }),
  chooserId: text('chooser_id')
    .notNull()
    .references(() => choosers.id, { onDelete: 'cascade' }),
  pathsJson: text('paths_json').notNull(),
  createdAt: text('created_at').notNull(),
});

// Relations
export const albumsRelations = relations(albums, ({ many }) => ({
  photos: many(photos),
  choosers: many(choosers),
}));

export const photosRelations = relations(photos, ({ one, many }) => ({
  album: one(albums, {
    fields: [photos.albumId],
    references: [albums.id],
  }),
  selections: many(selections),
  comments: many(comments),
  brushNotes: many(brushNotes),
}));

export const choosersRelations = relations(choosers, ({ one, many }) => ({
  album: one(albums, {
    fields: [choosers.albumId],
    references: [albums.id],
  }),
  selections: many(selections),
  comments: many(comments),
  brushNotes: many(brushNotes),
}));

export const selectionsRelations = relations(selections, ({ one }) => ({
  photo: one(photos, {
    fields: [selections.photoId],
    references: [photos.id],
  }),
  chooser: one(choosers, {
    fields: [selections.chooserId],
    references: [choosers.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  photo: one(photos, {
    fields: [comments.photoId],
    references: [photos.id],
  }),
  chooser: one(choosers, {
    fields: [comments.chooserId],
    references: [choosers.id],
  }),
}));

export const brushNotesRelations = relations(brushNotes, ({ one }) => ({
  photo: one(photos, {
    fields: [brushNotes.photoId],
    references: [photos.id],
  }),
  chooser: one(choosers, {
    fields: [brushNotes.chooserId],
    references: [choosers.id],
  }),
}));

// Inferred TypeScript Model Types
export type StudioSettingsTable = typeof studioSettings.$inferSelect;
export type InsertStudioSettingsTable = typeof studioSettings.$inferInsert;

export type AlbumTable = typeof albums.$inferSelect;
export type InsertAlbumTable = typeof albums.$inferInsert;

export type PhotoTable = typeof photos.$inferSelect;
export type InsertPhotoTable = typeof photos.$inferInsert;

export type ChooserTable = typeof choosers.$inferSelect;
export type InsertChooserTable = typeof choosers.$inferInsert;

export type SelectionTable = typeof selections.$inferSelect;
export type InsertSelectionTable = typeof selections.$inferInsert;

export type CommentTable = typeof comments.$inferSelect;
export type InsertCommentTable = typeof comments.$inferInsert;

export type BrushNoteTable = typeof brushNotes.$inferSelect;
export type InsertBrushNoteTable = typeof brushNotes.$inferInsert;
