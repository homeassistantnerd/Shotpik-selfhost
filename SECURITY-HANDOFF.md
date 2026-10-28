# Security Audit Handoff: Vulnerabilities & Remediation Plan

This document serves as an actionable engineering handoff detailing the security vulnerabilities identified during the formal security audit of **Shotpik Local Clone** (`@shotpik-app`), along with concrete surgical code fixes and regression test procedures.

---

## 1. Quick Reference: Identified Vulnerabilities

| Priority | Severity | Vulnerability | Affected File | Line(s) | Fix Effort |
| :---: | :---: | :--- | :--- | :---: | :---: |
| **P0** | **CRITICAL** | Admin Master API Key Bundled in Client JavaScript | `packages/frontend/src/pages/AdminDashboard.tsx` | 37–49 | Small |
| **P1** | **HIGH** | Comment Deletion Authorization Bypass (IDOR) | `packages/backend/src/routes/client.ts` | 436–449 | Small |
| **P2** | **HIGH** | Unauthenticated Album Selection Lockout (DoS) | `packages/backend/src/routes/client.ts` | 578–609 | Medium |
| **P3** | **MEDIUM** | Event Loop Blocking & Symlink Dereference in RAW Exporter | `packages/backend/src/services/rawExporter.ts` | 435–448 | Medium |
| **P4** | **LOW** | Admin Secret Leaked via URL Query Parameters | `packages/backend/src/middleware/auth.ts` | 51–55 | Small |

---

## 2. Detailed Problem Breakdown & Surgical Fixes

---

### Issue 1: Admin Master Key Bundled in Client JavaScript
- **Severity**: **CRITICAL**
- **File**: [`packages/frontend/src/pages/AdminDashboard.tsx:37-49`](packages/frontend/src/pages/AdminDashboard.tsx:37)
- **Root Cause**:
  The frontend code reads `import.meta.env.VITE_ADMIN_API_KEY` as a fallback credential. In Vite, any variable prefixed with `VITE_` is statically replaced with its literal value during `vite build`, baking the studio master administrative secret into publicly downloadable `.js` chunks in `dist/assets/`.
- **Security Impact**:
  Any web visitor can inspect the public JavaScript assets, extract the administrative key, and gain full administrative control over all studio albums, settings, and file exports.
- **Surgical Fix**:
  Remove all references to `VITE_ADMIN_API_KEY` from `AdminDashboard.tsx`. Require administrators to enter the key into an input field stored strictly in `localStorage`.

```typescript
// File: packages/frontend/src/pages/AdminDashboard.tsx

// BEFORE:
const getAdminHeaders = (): Record<string, string> => {
  const key =
    localStorage.getItem('shotpik_admin_key') ||
    ((import.meta as any).env?.VITE_ADMIN_API_KEY as string | undefined);
  return key ? { 'x-admin-key': key } : {};
};

const getAdminKeyQuery = (): string => {
  const key =
    localStorage.getItem('shotpik_admin_key') ||
    ((import.meta as any).env?.VITE_ADMIN_API_KEY as string | undefined);
  return key ? `&adminKey=${encodeURIComponent(key)}` : '';
};

// AFTER:
const getAdminHeaders = (): Record<string, string> => {
  const key = localStorage.getItem('shotpik_admin_key');
  return key ? { 'x-admin-key': key } : {};
};

const getAdminKeyQuery = (): string => {
  const key = localStorage.getItem('shotpik_admin_key');
  return key ? `&adminKey=${encodeURIComponent(key)}` : '';
};
```

---

### Issue 2: Comment Deletion Authorization Bypass (IDOR)
- **Severity**: **HIGH**
- **File**: [`packages/backend/src/routes/client.ts:436-449`](packages/backend/src/routes/client.ts:436)
- **Root Cause**:
  `DELETE /api/client/albums/:slug/comments/:commentId` attempts to enforce ownership by comparing `requesterChooserId` against `targetComment.chooserId`. However, the check is wrapped inside `if (requesterChooserId && ...)`. If a caller omits both `?chooserId=` in the query and `x-chooser-id` in the headers, `requesterChooserId` is falsy, causing the check to be skipped completely. The comment is deleted without any identity verification.
- **Security Impact**:
  Any anonymous visitor with the album URL can delete any client's comments, feedback, or editing notes across the entire album.
- **Surgical Fix**:
  Enforce that `requesterChooserId` must be present and must match `targetComment.chooserId`. If missing, reject with HTTP 401 Unauthorized.

```typescript
// File: packages/backend/src/routes/client.ts (lines 436-449)

// BEFORE:
const requesterChooserId =
  (req.query.chooserId as string) ||
  (req.headers['x-chooser-id'] as string);

if (
  requesterChooserId &&
  targetComment.chooserId &&
  targetComment.chooserId !== requesterChooserId
) {
  return res.status(403).json({ error: 'You can only delete your own comments' });
}

await db.delete(comments).where(eq(comments.id, commentId));
return res.json({ success: true });

// AFTER:
const requesterChooserId =
  (req.query.chooserId as string)?.trim() ||
  (req.headers['x-chooser-id'] as string)?.trim();

if (!requesterChooserId) {
  return res.status(401).json({
    error: 'Chooser identity is required to delete comments',
  });
}

if (targetComment.chooserId && targetComment.chooserId !== requesterChooserId) {
  return res.status(403).json({
    error: 'You can only delete your own comments',
  });
}

await db.delete(comments).where(eq(comments.id, commentId));
return res.json({ success: true });
```

---

### Issue 3: Unauthenticated Album Selection Lockout (DoS)
- **Severity**: **HIGH**
- **File**: [`packages/backend/src/routes/client.ts:578-609`](packages/backend/src/routes/client.ts:578)
- **Root Cause**:
  `POST /api/client/albums/:slug/finish` accepts an empty request body without any authentication token, admin key, or chooser session identity. It unconditionally updates the album in SQLite setting `isLocked = true`. Once locked, all subsequent selection toggles (`/select`), comments, and brush annotations are blocked with HTTP 403 `Album is locked`.
- **Security Impact**:
  Anyone navigating to a public proofing link can permanently lock out the client and freeze the selection process, causing immediate denial of service.
- **Surgical Fix**:
  Require either admin authorization or a validated chooser session belonging to the album before locking.

```typescript
// File: packages/backend/src/routes/client.ts (lines 578-609)

// AFTER:
clientRouter.post('/albums/:slug/finish', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const chooserId =
      (req.body.chooserId as string)?.trim() ||
      (req.headers['x-chooser-id'] as string)?.trim();

    if (!chooserId) {
      return res.status(401).json({
        error: 'Chooser identity is required to finalize album selection',
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

    // Verify chooser belongs to this album
    const chooserRecord = await db
      .select({ id: choosers.id })
      .from(choosers)
      .where(and(eq(choosers.id, chooserId), eq(choosers.albumId, album.id)))
      .limit(1);

    if (chooserRecord.length === 0) {
      return res.status(403).json({
        error: 'Chooser does not belong to this album',
      });
    }

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
```

---

### Issue 4: Synchronous Event Loop Starvation & Symlink Dereference in Local RAW Exporter
- **Severity**: **MEDIUM**
- **File**: [`packages/backend/src/services/rawExporter.ts:435-448`](packages/backend/src/services/rawExporter.ts:435)
- **Root Cause**:
  `copyServerRawFiles` performs file copying using synchronous `fs.copyFileSync` inside a `for` loop. Camera RAW files are large binary files (20MB to 60MB each). Synchronously copying 50–100 photos blocks the Node.js single-threaded event loop for tens of seconds, causing all concurrent HTTP connections to time out. Additionally, `fs.copyFileSync` follows symlinks without verifying `lstat`, potentially reading files outside the mount directory.
- **Security Impact**:
  Complete service freeze and denial of service for all users during RAW file exports.
- **Surgical Fix**:
  Convert `copyServerRawFiles` to asynchronous non-blocking file copying using `fs.promises.lstat` and `fs.promises.copyFile`.

```typescript
// File: packages/backend/src/services/rawExporter.ts (lines 435-448)

// AFTER:
for (const fileName of matchingFiles) {
  const safeFileName = path.basename(fileName);
  const sourcePath = path.join(safeMountPath, safeFileName);
  const destinationPath = path.join(targetDir, safeFileName);

  try {
    const stat = await fs.promises.lstat(sourcePath);
    if (stat.isSymbolicLink()) {
      result.errors.push(`Skipping symlink: ${safeFileName}`);
      continue;
    }

    await fs.promises.copyFile(sourcePath, destinationPath);
    result.copiedFiles.push(safeFileName);
    result.copiedCount += 1;
  } catch (copyError: any) {
    result.errors.push(
      `Failed to copy ${safeFileName}: ${copyError.message}`
    );
  }
}
```

---

### Issue 5: Admin Secret Leaked via URL Query Parameters
- **Severity**: **LOW**
- **File**: [`packages/backend/src/middleware/auth.ts:51-55`](packages/backend/src/middleware/auth.ts:51)
- **Root Cause**:
  `adminAuthMiddleware` extracts authentication keys from `req.query.adminKey` and `req.query.apiKey`. Passing sensitive administrative API tokens in query strings leaks them into server access logs, reverse proxy logs, browser history, and HTTP `Referer` headers.
- **Surgical Fix**:
  Deprecate query string authentication for static admin master keys. Require credentials in `x-admin-key` or `Authorization: Bearer <key>` headers.

```typescript
// File: packages/backend/src/middleware/auth.ts (lines 41-56)

// AFTER:
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
```

---

## 3. Important Architectural Invariants to Preserve

When applying fixes, make sure not to break these 4 core project invariants:
1. **Direct Google Drive CDN**: Do not proxy large image binaries through the Express backend; continue resolving thumbnails directly to Google Drive edge CDN (`sz=w600` and `sz=w2048`).
2. **Atomic Quota Transaction**: Keep the SQLite transaction (`db.transaction`) in `client.ts:236-304` enforcing distinct liked `photoId` count against `album.maxSelections`.
3. **Normalized Brush Vectors**: Drawing points must remain normalized `[0.0, 1.0]` unit vectors.
4. **Filename Sanitization**: Do not alter `normalizeKeys` in `rawExporter.ts:275`; its strict allowlist regex prevents shell command injection.

---

## 4. Full Audit Artifacts Location

The complete formal audit artifacts, including raw JSON schemas, coverage ledgers, and formal reports, are located at:
`C:\Users\Shiro\security-audit-skill\shotpik-app\run-1\`
- `run-metadata.json`
- `architecture.md`
- `coverage-ledger.json`
- `findings.json`
- `REPORT.md`
- `FINDINGS-DETAIL.md`
- `NEEDS-VALIDATION.md`
