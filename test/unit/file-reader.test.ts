/**
 * Unit tests for the file reader module.
 *
 * Tests the markdown file scanning operations including:
 * - Scanning directories for .md files
 * - Computing content hashes
 * - Extracting slugs from filenames
 * - Getting file modification times
 * - Filtering non-.md files
 * - Handling edge cases (empty dirs, missing dirs, unreadable files)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { scanMarkdownFiles } from "../../src/sync/file-reader.js";
import { computeContentHash } from "../../src/sync/state.js";

describe("file reader", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for file reader tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-reader-test-"));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.restoreAllMocks();
  });

  describe("scanMarkdownFiles", () => {
    it("returns empty array for non-existent directory", async () => {
      const nonExistentDir = path.join(tempDir, "does-not-exist");

      const result = await scanMarkdownFiles(nonExistentDir);

      expect(result).toEqual([]);
    });

    it("returns empty array for empty directory", async () => {
      const emptyDir = path.join(tempDir, "empty");
      await fs.mkdir(emptyDir);

      const result = await scanMarkdownFiles(emptyDir);

      expect(result).toEqual([]);
    });

    it("returns MarkdownFileInfo for each .md file", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      await fs.writeFile(
        path.join(docsDir, "getting-started.md"),
        "---\ntitle: Getting Started\n---\n\n# Welcome"
      );
      await fs.writeFile(
        path.join(docsDir, "installation.md"),
        "---\ntitle: Installation\n---\n\n# Install"
      );

      const result = await scanMarkdownFiles(docsDir);

      expect(result).toHaveLength(2);
      expect(result.map((f) => f.slug).sort()).toEqual([
        "getting-started",
        "installation",
      ]);
    });

    it("ignores non-.md files", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      await fs.writeFile(path.join(docsDir, "readme.txt"), "Text file");
      await fs.writeFile(path.join(docsDir, "config.json"), "{}");
      await fs.writeFile(path.join(docsDir, "page.md"), "# Page");
      await fs.writeFile(path.join(docsDir, "image.png"), "binary");

      const result = await scanMarkdownFiles(docsDir);

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("page");
    });

    it("ignores directories (non-recursive scan)", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      await fs.mkdir(path.join(docsDir, "subdir.md")); // Directory with .md name
      await fs.writeFile(path.join(docsDir, "page.md"), "# Page");

      const result = await scanMarkdownFiles(docsDir);

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("page");
    });

    it("correctly extracts slug from filename (strips .md)", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      await fs.writeFile(path.join(docsDir, "my-great-page.md"), "Content");

      const result = await scanMarkdownFiles(docsDir);

      expect(result[0].slug).toBe("my-great-page");
    });

    it("returns relative filePath from output directory", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      await fs.writeFile(path.join(docsDir, "page.md"), "Content");

      const result = await scanMarkdownFiles(docsDir);

      expect(result[0].filePath).toBe("page.md");
    });

    it("returns raw file content including frontmatter", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      const content = "---\ntitle: Test\nslug: test\n---\n\n# Heading\n\nParagraph.";
      await fs.writeFile(path.join(docsDir, "test.md"), content);

      const result = await scanMarkdownFiles(docsDir);

      expect(result[0].content).toBe(content);
    });

    it("computes SHA-256 content hash correctly", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      const content = "# Hello World";
      await fs.writeFile(path.join(docsDir, "hello.md"), content);

      const result = await scanMarkdownFiles(docsDir);

      // Verify hash matches what computeContentHash produces
      const expectedHash = computeContentHash(content);
      expect(result[0].contentHash).toBe(expectedHash);
      expect(result[0].contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it("returns ISO timestamp for lastModified", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      await fs.writeFile(path.join(docsDir, "page.md"), "Content");

      const result = await scanMarkdownFiles(docsDir);

      // Should be a valid ISO date string
      expect(result[0].lastModified).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
      );
      // Should be parseable as a date
      const date = new Date(result[0].lastModified);
      expect(date.getTime()).not.toBeNaN();
    });

    it("lastModified reflects file modification time", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      const filePath = path.join(docsDir, "page.md");
      await fs.writeFile(filePath, "Content");

      // Get the actual file mtime
      const stats = await fs.stat(filePath);
      const expectedMtime = stats.mtime.toISOString();

      const result = await scanMarkdownFiles(docsDir);

      expect(result[0].lastModified).toBe(expectedMtime);
    });

    it("handles unicode content in files", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      const content = "# こんにちは世界 🌍\n\nÜber cool émojis! 🚀";
      await fs.writeFile(path.join(docsDir, "unicode.md"), content);

      const result = await scanMarkdownFiles(docsDir);

      expect(result[0].content).toBe(content);
      expect(result[0].content).toContain("こんにちは世界");
      expect(result[0].content).toContain("🌍");
    });

    it("handles empty files", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      await fs.writeFile(path.join(docsDir, "empty.md"), "");

      const result = await scanMarkdownFiles(docsDir);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("");
      expect(result[0].contentHash).toBe(computeContentHash(""));
    });

    it("handles files with only frontmatter (no body)", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      const content = "---\ntitle: Frontmatter Only\nslug: fm-only\n---\n";
      await fs.writeFile(path.join(docsDir, "frontmatter-only.md"), content);

      const result = await scanMarkdownFiles(docsDir);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(content);
    });

    it("handles files with special characters in filename", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      await fs.writeFile(path.join(docsDir, "page-with-numbers-123.md"), "Content");
      await fs.writeFile(path.join(docsDir, "page_with_underscores.md"), "Content");

      const result = await scanMarkdownFiles(docsDir);

      const slugs = result.map((f) => f.slug).sort();
      expect(slugs).toContain("page-with-numbers-123");
      expect(slugs).toContain("page_with_underscores");
    });

    it("handles many files in directory", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);

      // Create 50 markdown files
      const fileCount = 50;
      for (let i = 0; i < fileCount; i++) {
        await fs.writeFile(
          path.join(docsDir, `page-${i.toString().padStart(3, "0")}.md`),
          `# Page ${i}\n\nContent for page ${i}.`
        );
      }

      const result = await scanMarkdownFiles(docsDir);

      expect(result).toHaveLength(fileCount);
    });

    it("different content produces different hashes", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      await fs.writeFile(path.join(docsDir, "page1.md"), "Content A");
      await fs.writeFile(path.join(docsDir, "page2.md"), "Content B");

      const result = await scanMarkdownFiles(docsDir);

      const hashes = result.map((f) => f.contentHash);
      expect(hashes[0]).not.toBe(hashes[1]);
    });

    it("identical content produces identical hashes", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      const content = "Identical content";
      await fs.writeFile(path.join(docsDir, "page1.md"), content);
      await fs.writeFile(path.join(docsDir, "page2.md"), content);

      const result = await scanMarkdownFiles(docsDir);

      const hashes = result.map((f) => f.contentHash);
      expect(hashes[0]).toBe(hashes[1]);
    });

    it("skips unreadable files with warning (does not throw)", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      await fs.writeFile(path.join(docsDir, "readable.md"), "Content");
      const unreadablePath = path.join(docsDir, "unreadable.md");
      await fs.writeFile(unreadablePath, "Content");
      // Make file unreadable (skip on Windows where chmod may not work)
      if (process.platform !== "win32") {
        await fs.chmod(unreadablePath, 0o000);
      }

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await scanMarkdownFiles(docsDir);

      if (process.platform !== "win32") {
        // Should have logged a warning
        expect(warnSpy).toHaveBeenCalled();
        // Should still return the readable file
        expect(result).toHaveLength(1);
        expect(result[0].slug).toBe("readable");

        // Restore file permissions for cleanup
        await fs.chmod(unreadablePath, 0o644);
      } else {
        // On Windows, both files should be readable
        expect(result).toHaveLength(2);
      }
    });

    it("handles large files", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      // Create a ~1MB file
      const largeContent = "# Large File\n\n" + "Lorem ipsum. ".repeat(100000);
      await fs.writeFile(path.join(docsDir, "large.md"), largeContent);

      const result = await scanMarkdownFiles(docsDir);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(largeContent);
      expect(result[0].contentHash).toBe(computeContentHash(largeContent));
    });

    it("handles files with .markdown extension (ignored)", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      await fs.writeFile(path.join(docsDir, "page.md"), "Included");
      await fs.writeFile(path.join(docsDir, "page.markdown"), "Excluded");

      const result = await scanMarkdownFiles(docsDir);

      // Only .md files are included, not .markdown
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("page");
    });

    it("handles hidden files (starting with dot)", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      await fs.writeFile(path.join(docsDir, ".hidden.md"), "Hidden content");
      await fs.writeFile(path.join(docsDir, "visible.md"), "Visible content");

      const result = await scanMarkdownFiles(docsDir);

      // Hidden files with .md extension should still be included
      const slugs = result.map((f) => f.slug).sort();
      expect(slugs).toContain(".hidden");
      expect(slugs).toContain("visible");
    });

    it("handles files with multiple dots in name", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      await fs.writeFile(
        path.join(docsDir, "version.1.0.release-notes.md"),
        "Content"
      );

      const result = await scanMarkdownFiles(docsDir);

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("version.1.0.release-notes");
      expect(result[0].filePath).toBe("version.1.0.release-notes.md");
    });

    it("handles files with whitespace in content", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      const content = "  \n\n  # Heading  \n\n  Paragraph with trailing spaces.  \n\n";
      await fs.writeFile(path.join(docsDir, "whitespace.md"), content);

      const result = await scanMarkdownFiles(docsDir);

      // Content should be preserved exactly as-is
      expect(result[0].content).toBe(content);
    });

    it("handles Windows-style line endings (CRLF)", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      const content = "---\r\ntitle: Windows\r\n---\r\n\r\n# Heading\r\n";
      await fs.writeFile(path.join(docsDir, "windows.md"), content);

      const result = await scanMarkdownFiles(docsDir);

      // Content should be preserved with original line endings
      expect(result[0].content).toBe(content);
    });

    it("handles files ending without newline", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      const content = "# No trailing newline";
      await fs.writeFile(path.join(docsDir, "no-newline.md"), content);

      const result = await scanMarkdownFiles(docsDir);

      expect(result[0].content).toBe(content);
    });

    it("returns files in deterministic order based on processing", async () => {
      const docsDir = path.join(tempDir, "docs");
      await fs.mkdir(docsDir);
      // Create files in specific order
      await fs.writeFile(path.join(docsDir, "z-last.md"), "Z");
      await fs.writeFile(path.join(docsDir, "a-first.md"), "A");
      await fs.writeFile(path.join(docsDir, "m-middle.md"), "M");

      const result1 = await scanMarkdownFiles(docsDir);
      const result2 = await scanMarkdownFiles(docsDir);

      // Results should be in the same order on repeated calls
      expect(result1.map((f) => f.slug)).toEqual(result2.map((f) => f.slug));
    });
  });
});
