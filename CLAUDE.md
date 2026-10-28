# Shotpik Local Clone Service

## 1. Workspace Structure
This project is an npm workspaces monorepo containing:
- `packages/shared`: Shared TypeScript domain models, Zod validation schemas, API contracts, and coordinate normalization utilities (`@shotpik/shared`).
- `packages/backend`: Node.js 20 LTS Express API server, SQLite 3 with WAL mode via `better-sqlite3` and Drizzle ORM, Google Drive crawler, and RAW file companion script generators (`@shotpik/backend`).
- `packages/frontend`: Vite 6 + React SPA, Tailwind CSS v3, PhotoSwipe v5 lightbox, and canvas brush annotations (`@shotpik/frontend`).

## 2. Build & Check Commands
- `npm run build -w @shotpik/shared`: Compiles shared TypeScript declarations and JavaScript outputs.
- `npm run build -w @shotpik/backend`: Compiles backend Express application.
- `npm run build -w @shotpik/frontend`: Bundles frontend Vite production assets.
- `npm run build`: Sequentially builds all workspaces in dependency order (`shared` -> `backend` -> `frontend`).
- `npm run dev:backend`: Starts backend development server with hot-reloading via `tsx watch`.
- `npm run dev:frontend`: Starts Vite development server for frontend.
- `npm run start`: Runs compiled backend production server (`dist/index.js`).

## 3. Five Immutable Project Rules
1. **Direct Google Drive CDN**:
   The backend NEVER proxies or streams raw multi-megabyte image binaries. All thumbnails and preview requests resolve directly to Google Drive's edge CDN:
   - Grid thumbnails: `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`
   - Fullscreen lightbox: `https://drive.google.com/thumbnail?id=${fileId}&sz=w2048`
2. **Atomic Quota Check**:
   Album selection quota (`maxSelections`) is strictly enforced at the database level across the distinct `Set` of liked `photoId`s across all choosers in an album. If limit is reached, like requests return HTTP 400 with `limitReached: true`.
3. **Normalized Brush Coordinates**:
   Canvas drawing annotations (`BrushNote`) must store coordinates strictly as normalized `[0.0, 1.0]` unit vectors (`touchX / width`, `touchY / height`). Coordinates are re-multiplied by current image width and height upon rendering, ensuring flawless scaling across mobile, tablet, and 4K displays.
4. **Clean Key Matching**:
   Filenames across formats (`_MG_8695.JPG`, `_MG_8695.CR3`, `_mg_8695.arw`) must be normalized using `generateCleanKey(fileName)` (strip extension, trim, and lowercase) to guarantee instant matching against offline RAW files in Adobe Lightroom, Capture One, and companion scripts.
5. **PhotoSwipe Pointer Events**:
   To preserve native swipe and pinch-to-zoom gestures, `.pswp__custom-overlay-backdrop` must declare `pointer-events: none`, while interactive dynamic captions (`.pswp__dynamic-caption`) and custom action toolbars declare `pointer-events: auto`.

## 4. Engineering & Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
