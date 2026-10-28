import { z } from 'zod';

/**
 * Chooser creation validation schema
 */
export const createChooserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Tên người chọn không được để trống')
    .max(50, 'Tên người chọn tối đa 50 ký tự'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Mã màu phải ở định dạng hex #RRGGBB')
    .optional()
    .default('#e11d48'),
});

export type CreateChooserInput = z.infer<typeof createChooserSchema>;

/**
 * Photo selection / like toggle validation schema
 */
export const toggleSelectSchema = z.object({
  photoId: z.string().min(1, 'photoId là bắt buộc'),
  chooserId: z.string().min(1, 'chooserId là bắt buộc'),
});

export type ToggleSelectInput = z.infer<typeof toggleSelectSchema>;

/**
 * Photo comment creation validation schema
 */
export const createCommentSchema = z.object({
  photoId: z.string().min(1, 'photoId là bắt buộc'),
  chooserId: z.string().min(1, 'chooserId là bắt buộc'),
  text: z
    .string()
    .trim()
    .min(1, 'Nội dung ghi chú không được để trống')
    .max(500, 'Nội dung ghi chú tối đa 500 ký tự'),
  tag: z.string().trim().max(50, 'Tag tối đa 50 ký tự').optional().nullable(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

/**
 * Normalized point vector validation schema [0.0, 1.0]
 */
export const normalizedPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

/**
 * Stroke vector validation schema
 */
export const strokeSchema = z.object({
  points: z.array(normalizedPointSchema).min(1).max(2000),
  color: z.string().max(50).optional(),
  width: z.number().positive().max(100).optional(),
});

/**
 * Save brush annotation validation schema
 * Accepts either a JSON string of strokes or an array of Stroke objects
 */
export const saveBrushSchema = z.object({
  photoId: z.string().min(1, 'photoId là bắt buộc'),
  chooserId: z.string().min(1, 'chooserId là bắt buộc'),
  pathsJson: z.union([
    z
      .string()
      .max(500_000, 'pathsJson vượt quá độ dài tối đa cho phép')
      .refine((val) => {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) && parsed.length <= 200;
        } catch {
          return false;
        }
      }, 'pathsJson phải là chuỗi JSON hợp lệ của mảng tối đa 200 nét vẽ'),
    z.array(strokeSchema).max(200, 'Tối đa 200 nét vẽ trên mỗi ảnh'),
  ]),
});

export type SaveBrushInput = z.infer<typeof saveBrushSchema>;

/**
 * Create album validation schema
 */
export const createAlbumSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Tiêu đề album là bắt buộc')
    .max(150, 'Tiêu đề tối đa 150 ký tự'),
  customerName: z
    .string()
    .trim()
    .min(1, 'Tên khách hàng là bắt buộc')
    .max(100, 'Tên khách hàng tối đa 100 ký tự'),
  gdriveFolderUrl: z
    .string()
    .trim()
    .min(1, 'Link hoặc ID thư mục Google Drive là bắt buộc'),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang')
    .optional(),
  maxSelections: z
    .number()
    .int('Số lượng chọn phải là số nguyên')
    .positive('Số lượng chọn phải lớn hơn 0')
    .optional()
    .default(30),
  serverMountPath: z.string().trim().optional(),
});

export type CreateAlbumInput = z.infer<typeof createAlbumSchema>;

/**
 * Update album validation schema
 */
export const updateAlbumSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  maxSelections: z.number().int().positive().optional(),
  isLocked: z.boolean().optional(),
  deadlineAt: z.string().datetime().optional().nullable(),
  serverMountPath: z.string().trim().optional().nullable(),
});

export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>;

/**
 * Server RAW file copy validation schema
 */
export const copyServerRawSchema = z.object({
  targetDir: z.string().trim().min(1, 'Thư mục đích không được để trống'),
});

export type CopyServerRawInput = z.infer<typeof copyServerRawSchema>;
