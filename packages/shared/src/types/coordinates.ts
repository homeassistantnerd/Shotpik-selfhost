/**
 * Normalized point where coordinates are relative unit vectors [0.0, 1.0].
 * x: 0.0 (left edge) to 1.0 (right edge)
 * y: 0.0 (top edge) to 1.0 (bottom edge)
 */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/**
 * Brush drawing stroke containing an ordered sequence of normalized points
 * and stroke styling parameters.
 */
export interface Stroke {
  points: NormalizedPoint[];
  color?: string;
  width?: number;
}
