import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

let hasWarnedMissingKey = false;

/**
 * Middleware protecting admin routes.
 * When ADMIN_API_KEY is configured in the environment, validates requests
 * using timing-safe string comparison against the x-admin-key header
 * or Authorization: Bearer <key>.
 *
 * If ADMIN_API_KEY is not configured:
 * - In production: rejects requests with HTTP 500.
 * - In development: warns once and allows access for easy local setup.
 */
export function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const adminApiKey = process.env.ADMIN_API_KEY?.trim();

  if (!adminApiKey) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({
        error:
          'ADMIN_API_KEY is not configured on the server. Admin access is disabled in production.',
      });
    }

    if (!hasWarnedMissingKey) {
      console.warn(
        '[Security Warning] ADMIN_API_KEY is not configured. Admin routes are operating in unauthenticated development mode. Configure ADMIN_API_KEY in .env for production.'
      );
      hasWarnedMissingKey = true;
    }

    return next();
  }

  // Extract key from x-admin-key header or Authorization: Bearer <token>
  let providedKey: string | undefined;
  const headerKey = req.headers['x-admin-key'];
  if (typeof headerKey === 'string') {
    providedKey = headerKey.trim();
  } else if (req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      providedKey = parts[1].trim();
    }
  }

  if (!providedKey) {
    return res.status(401).json({
      error: 'Unauthorized: Admin authentication key is required',
    });
  }

  // Timing-safe comparison to prevent timing side-channel attacks
  const expectedBuffer = Buffer.from(adminApiKey, 'utf-8');
  const providedBuffer = Buffer.from(providedKey, 'utf-8');

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return res.status(403).json({
      error: 'Forbidden: Invalid admin authentication key',
    });
  }

  return next();
}
