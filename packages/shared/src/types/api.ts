import { Album, StudioSettings, Photo, Chooser, Selection, Comment, BrushNote } from './models.js';
import { Stroke } from './coordinates.js';

/**
 * System healthcheck payload
 */
export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
}

/**
 * Full hydrated album view for client gallery
 */
export interface ClientAlbumResponse {
  album: Album;
  studio: StudioSettings | null;
  photos: Photo[];
  choosers: Chooser[];
  selections: Selection[];
  comments: Comment[];
  brushNotes: BrushNote[];
}

/**
 * Create or select chooser request/response
 */
export interface CreateChooserRequest {
  name: string;
  color?: string;
}

export interface CreateChooserResponse {
  chooser: Chooser;
}

/**
 * Toggle photo like selection request/response
 */
export interface ToggleSelectRequest {
  photoId: string;
  chooserId: string;
}

export interface ToggleSelectResponse {
  selected: boolean;
  selection?: Selection;
  selectionId?: string;
  limitReached?: boolean;
  maxSelections?: number;
  error?: string;
}

/**
 * Add photo comment request/response
 */
export interface CreateCommentRequest {
  photoId: string;
  chooserId: string;
  text: string;
  tag?: string | null;
}

export interface CreateCommentResponse {
  comment: Comment;
}

/**
 * Save brush annotation request/response
 */
export interface SaveBrushRequest {
  photoId: string;
  chooserId: string;
  pathsJson: string | Stroke[];
}

export interface SaveBrushResponse {
  brushNote: BrushNote;
}

/**
 * Finalize album selections response
 */
export interface FinishAlbumResponse {
  success: boolean;
  finishedAt: string;
}

/**
 * Studio admin album summary with computed metrics
 */
export interface AdminAlbumSummary extends Album {
  totalPhotos: number;
  selectedPhotosCount: number;
  choosersCount?: number;
}

export interface AdminAlbumsResponse {
  albums: AdminAlbumSummary[];
}

/**
 * Detailed album view for studio admin dashboard
 */
export interface AdminAlbumDetailResponse {
  album: Album;
  photos: Photo[];
  choosers: Chooser[];
  selections: Selection[];
  comments: Comment[];
  brushNotes: BrushNote[];
  selectedCleanKeys: string[];
  totalPhotos?: number;
  selectedPhotosCount?: number;
  choosersCount?: number;
}

/**
 * Create album from Google Drive link request/response
 */
export interface CreateAlbumRequest {
  title: string;
  customerName: string;
  gdriveFolderUrl: string;
  slug?: string;
  maxSelections?: number;
  serverMountPath?: string;
}

export interface CreateAlbumResponse {
  album: Album;
  importedPhotosCount: number;
}

/**
 * Update album metadata request/response
 */
export interface UpdateAlbumRequest {
  title?: string;
  maxSelections?: number;
  isLocked?: boolean;
  deadlineAt?: string | null;
  serverMountPath?: string | null;
}

export interface UpdateAlbumResponse {
  success: boolean;
}

/**
 * Google Drive re-crawl sync response
 */
export interface SyncAlbumResponse {
  success: boolean;
  totalPhotos: number;
  newPhotosAdded: number;
}

/**
 * Lightroom query export response
 */
export interface LightroomExportResponse {
  selectedCount: number;
  query: string;
}

/**
 * Server mounted RAW file copy request/response
 */
export interface CopyServerRawRequest {
  targetDir: string;
}

export interface CopyServerRawResponse {
  success: boolean;
  copied: number;
  total: number;
  files: string[];
}
