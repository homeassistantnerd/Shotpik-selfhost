import fs from 'node:fs';
import path from 'node:path';
import { generateCleanKey } from '@shotpik/shared';

/**
 * Result structure for Lightroom and Capture One search queries.
 */
export interface LightroomExportResult {
  selectedCount: number;
  query: string;
  lightroomQuery: string;
  captureOneQuery: string;
  cleanKeys: string[];
}

/**
 * Result structure for local NAS server RAW file copy operation.
 */
export interface NasCopyResult {
  copiedCount: number;
  copiedFiles: string[];
  errors: string[];
}

/**
 * Common professional camera RAW file extensions.
 */
export const SUPPORTED_RAW_EXTENSIONS = [
  '.CR2',
  '.CR3',
  '.ARW',
  '.NEF',
  '.RAF',
  '.DNG',
  '.ORF',
  '.RW2',
] as const;

const RAW_EXT_SET = new Set(
  SUPPORTED_RAW_EXTENSIONS.map((ext) => ext.toLowerCase())
);

/**
 * Sanitizes and deduplicates an array of clean keys.
 */
function normalizeKeys(cleanKeys: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawKey of cleanKeys) {
    if (!rawKey) continue;
    const normalized = rawKey.trim().toLowerCase();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

/**
 * Generates search query strings for Adobe Lightroom Library filter and Capture One search.
 *
 * @param cleanKeys Array of normalized photo keys
 * @returns Query object formatted for instant pasting into editing software
 */
export function generateLightroomExport(cleanKeys: string[]): LightroomExportResult {
  const uniqueKeys = normalizeKeys(cleanKeys);

  // Adobe Lightroom Library Filter (Text -> Filename -> Contains): space-separated tokens
  const lightroomQuery = uniqueKeys.join(' ');

  // Capture One search bar: comma-separated or space-separated filenames
  const captureOneQuery = uniqueKeys.join(', ');

  return {
    selectedCount: uniqueKeys.length,
    query: lightroomQuery,
    lightroomQuery,
    captureOneQuery,
    cleanKeys: uniqueKeys,
  };
}

/**
 * Generates an executable Windows Batch (.bat) companion script.
 * When executed in the folder containing camera RAW files, it finds all matching
 * selections and copies them safely into a ./Selected_RAW/ subfolder.
 *
 * @param albumSlug Slug of the album used for folder naming and logging
 * @param cleanKeys Array of normalized clean keys
 * @returns Windows .bat file script content (with CRLF line endings)
 */
export function generateWindowsBatchScript(
  albumSlug: string,
  cleanKeys: string[]
): string {
  const uniqueKeys = normalizeKeys(cleanKeys);
  const keysList = uniqueKeys.map((k) => `    "${k}"`).join('\r\n');

  const script = [
    '@echo off',
    'chcp 65001 > nul',
    'setlocal enabledelayedexpansion',
    '',
    'echo ===================================================================',
    `echo   Shotpik RAW Exporter - Album: ${albumSlug}`,
    `echo   Total Selected Photos: ${uniqueKeys.length}`,
    'echo ===================================================================',
    'echo.',
    '',
    'if not exist "Selected_RAW" (',
    '    mkdir "Selected_RAW"',
    '    echo [+] Created folder: .\\Selected_RAW\\',
    ')',
    '',
    'set "COPIED=0"',
    'set "MISSING=0"',
    '',
    'echo [*] Scanning directory for matching RAW files...',
    'echo.',
    '',
    'for %%K in (',
    keysList,
    ') do (',
    '    set "KEY_FOUND=0"',
    '    for %%E in (.CR2 .CR3 .ARW .NEF .RAF .DNG .ORF .RW2 .cr2 .cr3 .arw .nef .raf .dng .orf .rw2) do (',
    '        if exist "%%~K%%E" (',
    '            copy /y "%%~K%%E" "Selected_RAW\\" > nul',
    '            echo   [OK] Copied: %%~K%%E',
    '            set "KEY_FOUND=1"',
    '        )',
    '    )',
    '    if "!KEY_FOUND!"=="0" (',
    '        for /f "delims=" %%F in (\'dir /b /a-d "%%~K.*" 2^>nul\') do (',
    '            for %%E in (.CR2 .CR3 .ARW .NEF .RAF .DNG .ORF .RW2 .cr2 .cr3 .arw .nef .raf .dng .orf .rw2) do (',
    '                if /i "%%~xF"=="%%E" (',
    '                    copy /y "%%F" "Selected_RAW\\" > nul',
    '                    echo   [OK] Copied: %%F',
    '                    set "KEY_FOUND=1"',
    '                )',
    '            )',
    '        )',
    '    )',
    '    if "!KEY_FOUND!"=="1" (',
    '        set /a COPIED+=1',
    '    ) else (',
    '        echo   [MISSING] No RAW file found for key: %%~K',
    '        set /a MISSING+=1',
    '    )',
    ')',
    '',
    'echo.',
    'echo ===================================================================',
    'echo   Export Summary',
    'echo   Copied files : !COPIED!',
    'echo   Missing files: !MISSING!',
    'echo   Destination  : .\\Selected_RAW\\',
    'echo ===================================================================',
    'pause',
    '',
  ].join('\r\n');

  return script;
}

/**
 * Generates an executable POSIX Shell (.sh) script for macOS and Linux users.
 * Supports case-insensitive matching for various camera RAW formats.
 *
 * @param albumSlug Slug of the album used for script logging
 * @param cleanKeys Array of normalized clean keys
 * @returns Bash shell script content (with LF line endings)
 */
export function generatePosixShellScript(
  albumSlug: string,
  cleanKeys: string[]
): string {
  const uniqueKeys = normalizeKeys(cleanKeys);
  const keysList = uniqueKeys.map((k) => `  "${k}"`).join('\n');

  const script = [
    '#!/usr/bin/env bash',
    `# Shotpik RAW File Exporter - Album: ${albumSlug}`,
    '# Copies selected camera RAW files into ./Selected_RAW/ subfolder',
    '',
    'set -euo pipefail',
    '',
    'TARGET_DIR="./Selected_RAW"',
    'mkdir -p "$TARGET_DIR"',
    '',
    'echo "==================================================================="',
    `echo "  Shotpik RAW Exporter - Album: ${albumSlug}"`,
    `echo "  Total Selected Photos: ${uniqueKeys.length}"`,
    'echo "==================================================================="',
    'echo ""',
    '',
    'RAW_EXTS=("cr2" "cr3" "arw" "nef" "raf" "dng" "orf" "rw2" "CR2" "CR3" "ARW" "NEF" "RAF" "DNG" "ORF" "RW2")',
    'CLEAN_KEYS=(',
    keysList,
    ')',
    '',
    'COPIED_COUNT=0',
    'MISSING_COUNT=0',
    '',
    'for key in "${CLEAN_KEYS[@]}"; do',
    '  found=false',
    '  for ext in "${RAW_EXTS[@]}"; do',
    '    # Find matching file in current folder with case-insensitive comparison',
    '    while IFS= read -r -d \'\' match; do',
    '      if [ -f "$match" ]; then',
    '        cp -p "$match" "$TARGET_DIR/"',
    '        echo "  [OK] Copied: $(basename "$match")"',
    '        found=true',
    '        COPIED_COUNT=$((COPIED_COUNT + 1))',
    '        break 2',
    '      fi',
    '    done < <(find . -maxdepth 1 -type f -iname "${key}.${ext}" -print0 2>/dev/null)',
    '  done',
    '',
    '  if [ "$found" = false ]; then',
    '    echo "  [MISSING] No RAW file found for: $key"',
    '    MISSING_COUNT=$((MISSING_COUNT + 1))',
    '  fi',
    'done',
    '',
    'echo ""',
    'echo "==================================================================="',
    'echo "  Export Completed"',
    'echo "  Copied files : $COPIED_COUNT"',
    'echo "  Missing files: $MISSING_COUNT"',
    'echo "  Destination  : $TARGET_DIR"',
    'echo "==================================================================="',
    '',
  ].join('\n');

  return script;
}

/**
 * Directly copies matching RAW files from a mounted local or NAS path into a Selected_RAW subdirectory.
 *
 * @param serverMountPath Local filesystem directory path where photographer stores raw files
 * @param cleanKeys Array of normalized clean keys
 * @returns Object summarizing copy statistics, copied filenames, and any errors encountered
 */
export function copyLocalNasRawFiles(
  serverMountPath: string,
  cleanKeys: string[]
): NasCopyResult {
  const result: NasCopyResult = {
    copiedCount: 0,
    copiedFiles: [],
    errors: [],
  };

  if (!serverMountPath || !fs.existsSync(serverMountPath)) {
    result.errors.push(`Server mount path does not exist: "${serverMountPath}"`);
    return result;
  }

  const targetDir = path.join(serverMountPath, 'Selected_RAW');
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  } catch (mkdirError) {
    const msg = mkdirError instanceof Error ? mkdirError.message : String(mkdirError);
    result.errors.push(`Failed to create target directory "${targetDir}": ${msg}`);
    return result;
  }

  // Scan serverMountPath and build cleanKey index
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(serverMountPath, { withFileTypes: true });
  } catch (readDirError) {
    const msg =
      readDirError instanceof Error ? readDirError.message : String(readDirError);
    result.errors.push(`Failed reading directory "${serverMountPath}": ${msg}`);
    return result;
  }

  const rawFilesByKey = new Map<string, string[]>();

  for (const entry of entries) {
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (RAW_EXT_SET.has(ext)) {
        const key = generateCleanKey(entry.name);
        if (!rawFilesByKey.has(key)) {
          rawFilesByKey.set(key, []);
        }
        rawFilesByKey.get(key)!.push(entry.name);
      }
    }
  }

  const uniqueKeys = normalizeKeys(cleanKeys);

  for (const key of uniqueKeys) {
    const matchingFiles = rawFilesByKey.get(key);

    if (!matchingFiles || matchingFiles.length === 0) {
      result.errors.push(`Missing RAW file for key: "${key}"`);
      continue;
    }

    for (const fileName of matchingFiles) {
      const sourcePath = path.join(serverMountPath, fileName);
      const destinationPath = path.join(targetDir, fileName);

      try {
        fs.copyFileSync(sourcePath, destinationPath);
        result.copiedFiles.push(fileName);
        result.copiedCount += 1;
      } catch (copyError) {
        const msg =
          copyError instanceof Error ? copyError.message : String(copyError);
        result.errors.push(`Failed copying "${fileName}": ${msg}`);
      }
    }
  }

  return result;
}
