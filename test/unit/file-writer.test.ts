/**
 * Unit tests for the file writer module.
 *
 * Tests the markdown file writing operations including:
 * - Writing files with frontmatter and body
 * - Directory creation
 * - Atomic file writes
 * - File deletion (idempotent)
 * - Slug generation from titles (kebab-case)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  writeMarkdownFile,
  deleteMarkdownFile,
  slugFromTitle,
} from "../../src/sync/file-writer.js";

describe("file writer", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for file writer tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-writer-test-"));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("writeMarkdownFile", () => {
    it("writes a file with frontmatter and body", async () => {
      const outputDir = path.join(tempDir, "docs");
      const slug = "getting-started";
      const frontmatter = "---\ntitle: Getting Started\n---";
      const body = "# Welcome\n\nThis is the content.";

      const filePath = await writeMarkdownFile(outputDir, slug, frontmatter, body);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("---\ntitle: Getting Started\n---\n# Welcome\n\nThis is the content.");
    });

    it("returns the absolute path to the written file", async () => {
      const outputDir = path.join(tempDir, "docs");
      const slug = "my-page";
      const frontmatter = "---\ntitle: Test\n---";
      const body = "Content";

      const filePath = await writeMarkdownFile(outputDir, slug, frontmatter, body);

      expect(path.isAbsolute(filePath)).toBe(true);
      expect(filePath.endsWith("my-page.md")).toBe(true);
    });

    it("creates the output directory if it does not exist", async () => {
      const outputDir = path.join(tempDir, "nested", "output", "directory");
      const slug = "test-page";
      const frontmatter = "---\ntitle: Test\n---";
      const body = "Body content";

      await writeMarkdownFile(outputDir, slug, frontmatter, body);

      const stat = await fs.stat(outputDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it("overwrites existing file with same slug", async () => {
      const outputDir = path.join(tempDir, "docs");
      const slug = "page";
      const frontmatter1 = "---\ntitle: First\n---";
      const frontmatter2 = "---\ntitle: Second\n---";
      const body1 = "First content";
      const body2 = "Second content";

      await writeMarkdownFile(outputDir, slug, frontmatter1, body1);
      const filePath = await writeMarkdownFile(outputDir, slug, frontmatter2, body2);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("---\ntitle: Second\n---\nSecond content");
    });

    it("handles empty body", async () => {
      const outputDir = path.join(tempDir, "docs");
      const slug = "empty-body";
      const frontmatter = "---\ntitle: Empty\ndescription: No content\n---";
      const body = "";

      const filePath = await writeMarkdownFile(outputDir, slug, frontmatter, body);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("---\ntitle: Empty\ndescription: No content\n---\n");
    });

    it("handles body with frontmatter already having trailing newline", async () => {
      const outputDir = path.join(tempDir, "docs");
      const slug = "with-newline";
      // Frontmatter from frontmatterToYaml includes trailing newline before ---
      const frontmatter = "---\ntitle: Test\n---";
      const body = "Content here";

      const filePath = await writeMarkdownFile(outputDir, slug, frontmatter, body);

      const content = await fs.readFile(filePath, "utf-8");
      // Should have exactly one newline between frontmatter and body
      expect(content).toBe("---\ntitle: Test\n---\nContent here");
    });

    it("handles unicode content in body", async () => {
      const outputDir = path.join(tempDir, "docs");
      const slug = "unicode-page";
      const frontmatter = "---\ntitle: Unicode Test\n---";
      const body = "こんにちは世界 🌍\n\nÜber cool émojis! 🚀";

      const filePath = await writeMarkdownFile(outputDir, slug, frontmatter, body);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("こんにちは世界");
      expect(content).toContain("🌍");
      expect(content).toContain("Über");
    });

    it("handles multiline frontmatter", async () => {
      const outputDir = path.join(tempDir, "docs");
      const slug = "multiline-fm";
      const frontmatter = `---
title: Multi-line Frontmatter
description: This is a test page
tags:
  - test
  - example
sidebar_position: 5
---`;
      const body = "# Content\n\nParagraph.";

      const filePath = await writeMarkdownFile(outputDir, slug, frontmatter, body);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("tags:");
      expect(content).toContain("  - test");
      expect(content).toContain("# Content");
    });

    it("cleans up temporary file on success", async () => {
      const outputDir = path.join(tempDir, "docs");
      const slug = "temp-cleanup";
      const frontmatter = "---\ntitle: Test\n---";
      const body = "Content";

      const filePath = await writeMarkdownFile(outputDir, slug, frontmatter, body);

      const tempPath = `${filePath}.tmp`;
      // Temp file should not exist after successful write
      await expect(fs.access(tempPath)).rejects.toThrow();
    });

    it("writes files with different slugs to separate files", async () => {
      const outputDir = path.join(tempDir, "docs");
      const frontmatter = "---\ntitle: Test\n---";

      const path1 = await writeMarkdownFile(outputDir, "page-one", frontmatter, "Content 1");
      const path2 = await writeMarkdownFile(outputDir, "page-two", frontmatter, "Content 2");

      expect(path1).not.toBe(path2);
      const content1 = await fs.readFile(path1, "utf-8");
      const content2 = await fs.readFile(path2, "utf-8");
      expect(content1).toContain("Content 1");
      expect(content2).toContain("Content 2");
    });

    it("handles slug with hyphens", async () => {
      const outputDir = path.join(tempDir, "docs");
      const slug = "my-very-long-page-name";
      const frontmatter = "---\ntitle: Long Name\n---";
      const body = "Content";

      const filePath = await writeMarkdownFile(outputDir, slug, frontmatter, body);

      expect(filePath).toContain("my-very-long-page-name.md");
      const exists = await fs.stat(filePath);
      expect(exists.isFile()).toBe(true);
    });

    it("writes to existing directory without error", async () => {
      const outputDir = path.join(tempDir, "existing-docs");
      await fs.mkdir(outputDir);

      const filePath = await writeMarkdownFile(
        outputDir,
        "page",
        "---\ntitle: Test\n---",
        "Body"
      );

      expect(filePath).toContain("existing-docs");
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("Body");
    });
  });

  describe("deleteMarkdownFile", () => {
    it("deletes an existing file", async () => {
      const filePath = path.join(tempDir, "to-delete.md");
      await fs.writeFile(filePath, "content");

      await deleteMarkdownFile(filePath);

      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it("does not throw when file does not exist (idempotent)", async () => {
      const filePath = path.join(tempDir, "nonexistent.md");

      // Should not throw
      await expect(deleteMarkdownFile(filePath)).resolves.toBeUndefined();
    });

    it("can be called multiple times on same path", async () => {
      const filePath = path.join(tempDir, "multi-delete.md");
      await fs.writeFile(filePath, "content");

      await deleteMarkdownFile(filePath);
      await deleteMarkdownFile(filePath);
      await deleteMarkdownFile(filePath);

      // Should complete without error
      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it("throws on permission errors (non-ENOENT)", async () => {
      // Create a directory and try to delete it as a file
      const dirPath = path.join(tempDir, "is-a-directory");
      await fs.mkdir(dirPath);

      // Attempting to unlink a directory should throw EISDIR or EPERM
      await expect(deleteMarkdownFile(dirPath)).rejects.toThrow();
    });

    it("deletes file written by writeMarkdownFile", async () => {
      const outputDir = path.join(tempDir, "docs");
      const filePath = await writeMarkdownFile(
        outputDir,
        "to-remove",
        "---\ntitle: Test\n---",
        "Content"
      );

      await deleteMarkdownFile(filePath);

      await expect(fs.access(filePath)).rejects.toThrow();
    });
  });

  describe("slugFromTitle", () => {
    it("converts simple title to kebab-case", () => {
      expect(slugFromTitle("Getting Started")).toBe("getting-started");
    });

    it("handles single word", () => {
      expect(slugFromTitle("Introduction")).toBe("introduction");
    });

    it("handles multiple spaces", () => {
      expect(slugFromTitle("Hello   World")).toBe("hello-world");
    });

    it("handles leading and trailing spaces", () => {
      expect(slugFromTitle("  Hello World  ")).toBe("hello-world");
    });

    it("handles special characters", () => {
      expect(slugFromTitle("What's New?")).toBe("whats-new");
    });

    it("handles forward slashes", () => {
      expect(slugFromTitle("API / REST")).toBe("api-rest");
    });

    it("handles accented characters", () => {
      expect(slugFromTitle("Über Cool Feature")).toBe("uber-cool-feature");
    });

    it("handles numbers", () => {
      expect(slugFromTitle("Page 1: The Beginning!")).toBe("page-1-the-beginning");
    });

    it("handles mixed special characters", () => {
      expect(slugFromTitle("Hello, World! (Test)")).toBe("hello-world-test");
    });

    it("handles underscores", () => {
      expect(slugFromTitle("snake_case_title")).toBe("snake-case-title");
    });

    it("handles dots", () => {
      expect(slugFromTitle("config.json guide")).toBe("config-json-guide");
    });

    it("handles colons", () => {
      expect(slugFromTitle("Section: Subsection")).toBe("section-subsection");
    });

    it("handles ampersand", () => {
      expect(slugFromTitle("Pros & Cons")).toBe("pros-cons");
    });

    it("handles plus sign", () => {
      expect(slugFromTitle("C++ Programming")).toBe("c-programming");
    });

    it("handles at sign", () => {
      expect(slugFromTitle("@scope/package")).toBe("scope-package");
    });

    it("handles hash sign", () => {
      expect(slugFromTitle("Issue #123")).toBe("issue-123");
    });

    it("returns 'untitled' for empty string", () => {
      expect(slugFromTitle("")).toBe("untitled");
    });

    it("returns 'untitled' for null or undefined", () => {
      expect(slugFromTitle(null as unknown as string)).toBe("untitled");
      expect(slugFromTitle(undefined as unknown as string)).toBe("untitled");
    });

    it("returns 'untitled' for string that becomes empty after processing", () => {
      expect(slugFromTitle("---")).toBe("untitled");
      expect(slugFromTitle("!!!")).toBe("untitled");
      expect(slugFromTitle("   ")).toBe("untitled");
    });

    it("handles emoji (removes them)", () => {
      expect(slugFromTitle("Hello 🌍 World")).toBe("hello-world");
    });

    it("handles curly apostrophes", () => {
      expect(slugFromTitle("It's a test")).toBe("its-a-test");
      expect(slugFromTitle("It's also a test")).toBe("its-also-a-test");
    });

    it("handles all uppercase", () => {
      expect(slugFromTitle("ALL CAPS TITLE")).toBe("all-caps-title");
    });

    it("handles mixed case", () => {
      expect(slugFromTitle("CamelCase Title")).toBe("camelcase-title");
    });

    it("handles hyphenated words", () => {
      expect(slugFromTitle("Pre-existing Conditions")).toBe("pre-existing-conditions");
    });

    it("handles consecutive hyphens in input", () => {
      expect(slugFromTitle("Test--Double--Hyphens")).toBe("test-double-hyphens");
    });

    it("handles japanese characters (converts to latin approximation or removes)", () => {
      // Unicode NFD normalization doesn't convert Japanese to ASCII
      // So Japanese characters get stripped, leaving empty which becomes "untitled"
      const slug = slugFromTitle("日本語テスト");
      expect(typeof slug).toBe("string");
      expect(slug.length).toBeGreaterThan(0);
    });

    it("handles mixed latin and CJK characters", () => {
      // The latin parts should remain
      const slug = slugFromTitle("Hello 世界 World");
      expect(slug).toContain("hello");
      expect(slug).toContain("world");
    });
  });
});
