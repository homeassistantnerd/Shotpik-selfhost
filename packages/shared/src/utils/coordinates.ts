import { NormalizedPoint } from '../types/coordinates.js';

/**
 * Clamps a numeric value strictly within [0.0, 1.0].
 */
export function clampNormalized(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Normalizes absolute canvas pixel coordinates to relative unit vectors [0.0, 1.0].
 *
 * @param px Absolute X pixel coordinate
 * @param py Absolute Y pixel coordinate
 * @param width Current canvas/image pixel width
 * @param height Current canvas/image pixel height
 * @returns Normalized point with x, y in range [0.0, 1.0]
 */
export function normalizePoint(
  px: number,
  py: number,
  width: number,
  height: number
): NormalizedPoint {
  const safeWidth = width > 0 ? width : 1;
  const safeHeight = height > 0 ? height : 1;
  return {
    x: clampNormalized(px / safeWidth),
    y: clampNormalized(py / safeHeight),
  };
}

/**
 * Denormalizes relative unit vectors [0.0, 1.0] to absolute canvas pixel coordinates
 * for rendering on target display.
 *
 * @param point Normalized point
 * @param width Target canvas/image pixel width
 * @param height Target canvas/image pixel height
 * @returns Absolute X and Y pixel coordinates
 */
export function denormalizePoint(
  point: NormalizedPoint,
  width: number,
  height: number
): { x: number; y: number } {
  return {
    x: point.x * width,
    y: point.y * height,
  };
}

/**
 * Validates whether a point's coordinates fall within normalized unit bounds [0.0, 1.0].
 */
export function isPointNormalized(point: NormalizedPoint): boolean {
  return (
    typeof point.x === 'number' &&
    typeof point.y === 'number' &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1
  );
}
