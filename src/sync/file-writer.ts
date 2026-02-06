/**
 * File writer for synced markdown files.
 *
 * Writes Docusaurus-compatible markdown files with YAML frontmatter
 * to the output directory. Handles directory creation, file writing,
 * and deletion of removed pages.
 *
 * User Story 5 acceptance scenarios:
 * - Given a page with slug "getting-started", file is `{outputDir}/getting-started.md`
 * - Given a page with no slug, filename is derived from the page title (kebab-case)
 * - Given a page with frontmatter and markdown body, file contains `---\n{yaml}\n---\n{body}`
 * - Given the output directory doesn't exist, it is created
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Writes a markdown file with frontmatter to the output directory.
 *
 * Creates the output directory if it doesn't exist. The file is written
 * atomically by writing to a temporary file first, then renaming.
 *
 * @param outputDir - The directory to write to (e.g., "docs")
 * @param slug - The slug used for the filename (e.g., "getting-started")
 * @param frontmatter - The YAML frontmatter string (including `---` delimiters)
 * @param body - The markdown body content
 * @returns The absolute path to the written file
 *
 * @example
 * ```ts
 * const filePath = await writeMarkdownFile(
 *   "./docs",
 *   "getting-started",
 *   "---\ntitle: Getting Started\n---",
 *   "# Welcome\n\nThis is the content."
 * );
 * // Returns: "/absolute/path/docs/getting-started.md"
 * ```
 */
export async function writeMarkdownFile(
  outputDir: string,
  slug: string,
  frontmatter: string,
  body: string
): Promise<string> {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Construct file path
  const filename = `${slug}.md`;
  const filePath = path.resolve(outputDir, filename);

  // Combine frontmatter and body
  // Frontmatter already includes `---` delimiters from frontmatterToYaml
  // Ensure there's exactly one newline between frontmatter and body
  const content = frontmatter + "\n" + body;

  // Write atomically: temp file then rename
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, content, "utf-8");
  await fs.rename(tempPath, filePath);

  return filePath;
}

/**
 * Deletes a markdown file.
 *
 * Does not throw an error if the file doesn't exist (idempotent delete).
 * This is useful when cleaning up files for pages that were deleted from Notion.
 *
 * @param filePath - The absolute path to the file to delete
 *
 * @example
 * ```ts
 * await deleteMarkdownFile("/path/to/docs/old-page.md");
 * // File is deleted if it exists, no error if it doesn't
 * ```
 */
export async function deleteMarkdownFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Ignore "file not found" errors (idempotent delete)
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * Converts a page title to a URL-safe kebab-case slug.
 *
 * Used when a page doesn't have an explicit Slug property set.
 * The conversion process:
 * 1. Converts to lowercase
 * 2. Replaces spaces and special characters with hyphens
 * 3. Collapses consecutive hyphens into a single hyphen
 * 4. Trims leading and trailing hyphens
 *
 * @param title - The page title to convert
 * @returns A kebab-case slug suitable for filenames and URLs
 *
 * @example
 * ```ts
 * slugFromTitle("Getting Started"); // "getting-started"
 * slugFromTitle("What's New?"); // "whats-new"
 * slugFromTitle("API / REST"); // "api-rest"
 * slugFromTitle("  Hello   World  "); // "hello-world"
 * slugFromTitle("Über Cool Feature"); // "uber-cool-feature"
 * slugFromTitle("Page #1: The Beginning!"); // "page-1-the-beginning"
 * ```
 */
export function slugFromTitle(title: string): string {
  if (!title || typeof title !== "string") {
    return "untitled";
  }

  return (
    title
      // Normalize unicode characters (convert accented chars to base form)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // Convert to lowercase
      .toLowerCase()
      // Replace apostrophes with nothing (for contractions like "what's")
      .replace(/['']/g, "")
      // Replace spaces and non-alphanumeric chars with hyphens
      .replace(/[^a-z0-9]+/g, "-")
      // Collapse consecutive hyphens
      .replace(/-+/g, "-")
      // Trim leading and trailing hyphens
      .replace(/^-+|-+$/g, "")
      // Handle empty result
      || "untitled"
  );
}
