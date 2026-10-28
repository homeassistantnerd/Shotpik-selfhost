import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

/**
 * Resolves the SQLite database file path.
 * Checks process.env.DATABASE_PATH first, then searches for the workspace data directory.
 */
function resolveDatabasePath(): string {
  if (process.env.DATABASE_PATH) {
    return path.resolve(process.env.DATABASE_PATH);
  }

  let currentDir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const dataDir = path.join(currentDir, 'data');
    const packagesDir = path.join(currentDir, 'packages');
    if (fs.existsSync(dataDir) && fs.existsSync(packagesDir)) {
      return path.join(dataDir, 'shotpik.db');
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const fallbackRoot = path.resolve(moduleDir, '../../../../');
  return path.join(fallbackRoot, 'data', 'shotpik.db');
}

const dbPath = resolveDatabasePath();
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

/**
 * Raw better-sqlite3 database instance with WAL mode and foreign key constraints enabled.
 */
export const sqlite: DatabaseType = new Database(dbPath);

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Initialize database schema and default studio settings record
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS studio_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    studio_name TEXT NOT NULL,
    slogan TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    watermark_text TEXT,
    custom_domain TEXT
  );

  CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    gdrive_folder_id TEXT NOT NULL,
    gdrive_folder_url TEXT NOT NULL,
    max_selections INTEGER NOT NULL DEFAULT 30,
    is_locked INTEGER NOT NULL DEFAULT 0,
    selection_finished_at TEXT,
    deadline_at TEXT,
    password_hash TEXT,
    server_mount_path TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    clean_key TEXT NOT NULL,
    gdrive_file_id TEXT NOT NULL,
    thumb_url TEXT NOT NULL,
    full_url TEXT NOT NULL,
    sub_gallery TEXT NOT NULL DEFAULT 'All',
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS choosers (
    id TEXT PRIMARY KEY,
    album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#e11d48',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS selections (
    id TEXT PRIMARY KEY,
    photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    chooser_id TEXT NOT NULL REFERENCES choosers(id) ON DELETE CASCADE,
    liked_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    chooser_id TEXT NOT NULL REFERENCES choosers(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    tag TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS brush_notes (
    id TEXT PRIMARY KEY,
    photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    chooser_id TEXT NOT NULL REFERENCES choosers(id) ON DELETE CASCADE,
    paths_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_photos_album_id ON photos(album_id);
  CREATE INDEX IF NOT EXISTS idx_photos_clean_key ON photos(clean_key);
  CREATE INDEX IF NOT EXISTS idx_choosers_album_id ON choosers(album_id);
  CREATE INDEX IF NOT EXISTS idx_selections_photo_id ON selections(photo_id);
  CREATE INDEX IF NOT EXISTS idx_selections_chooser_id ON selections(chooser_id);
  CREATE INDEX IF NOT EXISTS idx_comments_photo_id ON comments(photo_id);
  CREATE INDEX IF NOT EXISTS idx_brush_notes_photo_id ON brush_notes(photo_id);

  INSERT OR IGNORE INTO studio_settings (id, studio_name, slogan, watermark_text)
  VALUES ('default', 'Shotpik Studio', 'Professional Photo Selection & Proofing', 'Shotpik Studio');
`);

/**
 * Drizzle ORM instance wrapping the better-sqlite3 connection with full typed schema.
 */
export const db = drizzle(sqlite, { schema });

export * from './schema.js';
