/**
 * File reader for Git → Notion sync.
 *
 * Scans the output directory for markdown files, reads their content,
 * computes content hashes, and extracts file metadata for change detection.
 *
 * User Story 5 acceptance scenarios:
 * - Scan directory with .md files → returns MarkdownFileInfo for each
 * - Correctly computes SHA-256 content hash
 * - Correctly extracts slug from filename
 * - Correctly gets file modification time
 * - Ignores non-.md files
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { MarkdownFileInfo } from "../types.js";
import { computeContentHash } from "./state.js";

/**
 * Scan a directory for markdown files and return their metadata.
 *
 * Scans the directory (non-recursive) for files ending with `.md`.
 * For each file, reads content, computes content hash, and gets mtime.
 *
 * @param outputDir - The directory to scan (e.g., "./docs")
 * @returns Array of MarkdownFileInfo objects for each .md file found
 *
 * @example
 * ```ts
 * const files = await scanMarkdownFiles("./docs");
 * // Returns:
 * // [
 * //   {
 * //     filePath: "getting-started.md",
 * //     slug: "getting-started",
 * //     content: "---\ntitle: Getting Started\n---\n...",
 * //     contentHash: "sha256:abc123...",
 * //     lastModified: "2026-02-06T12:00:00.000Z"
 * //   },
 * //   ...
 * // ]
 * ```
 */
export async function scanMarkdownFiles(
  outputDir: string
): Promise<MarkdownFileInfo[]> {
  const results: MarkdownFileInfo[] = [];

  // Check if directory exists
  try {
    await fs.access(outputDir);
  } catch {
    // Directory doesn't exist — return empty array
    return [];
  }

  // Read directory entries
  const entries = await fs.readdir(outputDir, { withFileTypes: true });

  // Filter for .md files only (non-recursive)
  const mdFiles = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".md")
  );

  // Process each markdown file
  for (const entry of mdFiles) {
    const filePath = path.join(outputDir, entry.name);
    const fileInfo = await readMarkdownFileInfo(outputDir, entry.name);
    if (fileInfo) {
      results.push(fileInfo);
    }
  }

  return results;
}

/**
 * Read a single markdown file and return its metadata.
 *
 * @param outputDir - The base output directory
 * @param filename - The filename (e.g., "getting-started.md")
 * @returns MarkdownFileInfo or null if file cannot be read
 */
async function readMarkdownFileInfo(
  outputDir: string,
  filename: string
): Promise<MarkdownFileInfo | null> {
  const fullPath = path.join(outputDir, filename);

  try {
    // Read file content and stats in parallel
    const [content, stats] = await Promise.all([
      fs.readFile(fullPath, "utf-8"),
      fs.stat(fullPath),
    ]);

    // Extract slug from filename (strip .md extension)
    const slug = filename.replace(/\.md$/, "");

    // Compute content hash using existing utility
    const contentHash = computeContentHash(content);

    // Get ISO timestamp from mtime
    const lastModified = stats.mtime.toISOString();

    return {
      filePath: filename, // Relative path from outputDir
      slug,
      content,
      contentHash,
      lastModified,
    };
  } catch (error) {
    console.warn(
      `[file-reader] Failed to read ${fullPath}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
