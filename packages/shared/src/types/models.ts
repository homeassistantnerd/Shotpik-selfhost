/**
 * Photography studio branding and contact configuration.
 */
export interface StudioSettings {
  id: string;
  studioName: string;
  slogan?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  watermarkText?: string | null;
  customDomain?: string | null;
}

/**
 * Album record containing customer info, Google Drive links, and quota configurations.
 */
export interface Album {
  id: string;
  slug: string;
  title: string;
  customerName: string;
  gdriveFolderId: string;
  gdriveFolderUrl: string;
  maxSelections: number;
  isLocked: boolean;
  selectionFinishedAt?: string | null;
  deadlineAt?: string | null;
  passwordHash?: string | null;
  serverMountPath?: string | null;
  createdAt: string;
}

/**
 * Individual photo indexed from Google Drive with dynamic edge CDN URLs.
 */
export interface Photo {
  id: string;
  albumId: string;
  fileName: string;
  cleanKey: string;
  gdriveFileId: string;
  thumbUrl: string;
  fullUrl: string;
  subGallery?: string | null;
  width?: number | null;
  height?: number | null;
  sortOrder?: number | null;
}

/**
 * Client chooser identity in a multi-person session (e.g. Cô dâu, Chú rể, Bố mẹ).
 */
export interface Chooser {
  id: string;
  albumId: string;
  name: string;
  color?: string | null;
  createdAt: string;
}

/**
 * Photo selection / like relationship mapped to a chooser and photo.
 */
export interface Selection {
  id: string;
  photoId: string;
  chooserId: string;
  likedAt: string;
}

/**
 * Text comment on a photo with optional retouch category tag.
 */
export interface Comment {
  id: string;
  photoId: string;
  chooserId: string;
  text: string;
  tag?: string | null;
  createdAt: string;
}

/**
 * Freehand brush drawing annotation over a photo with normalized vector paths.
 */
export interface BrushNote {
  id: string;
  photoId: string;
  chooserId: string;
  pathsJson: string;
  createdAt: string;
}
