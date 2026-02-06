/**
 * E2E tests for the sync engine against the live Notion test database.
 *
 * These tests verify the full Notion → Git sync pipeline by running
 * actual syncs against the test database defined in CLAUDE.md.
 *
 * User Story 6 acceptance scenarios:
 * 1. Given valid config, `notion-docusaurus-sync sync` produces markdown files
 * 2. Given 5 pages (3 Published, 1 Draft, 1 Archived), only 3 files are written
 * 3. Given no changes, second sync modifies no files (incremental sync)
 * 4. Given invalid config (bad token), a clear error message is displayed
 *
 * Requires NOTION_TOKEN environment variable to be set.
 * Skipped in CI unless credentials are available.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Increase timeout for E2E tests that hit live Notion API
// Default is 5s which isn't enough for API calls with rate limiting
vi.setConfig({ testTimeout: 60000 });
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { syncNotionToGit } from "../../src/sync/engine.js";
import type { SyncConfig } from "../../src/types.js";

/**
 * Test database from CLAUDE.md:
 * - ID: 2ffc0fdf-942d-817f-ad7e-efd2e1887262
 * - 5 sample pages with varied statuses (3 Published, 1 Draft, 1 Archived)
 * - Properties: Name, Status, Slug, Description, Tags, Sidebar Position, Published Date, Category
 */
const TEST_DB_ID = "2ffc0fdf-942d-817f-ad7e-efd2e1887262";

/**
 * Creates a minimal SyncConfig for testing.
 */
function createTestConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    notionToken: process.env.NOTION_TOKEN!,
    databaseId: TEST_DB_ID,
    outputDir: "", // Set in tests
    imageDir: "", // Not used in this spec
    conflictStrategy: "latest-wins",
    imageStrategy: "local",
    statusProperty: "Status",
    publishedStatus: "Published",
    stateFile: "", // Set in tests
    ...overrides,
  };
}

describe.skipIf(!process.env.NOTION_TOKEN)("e2e sync", () => {
  let tempDir: string;
  let outputDir: string;
  let stateFile: string;

  beforeEach(async () => {
    // Create a temporary directory for sync output
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "e2e-sync-test-"));
    outputDir = path.join(tempDir, "docs");
    stateFile = path.join(tempDir, ".notion-sync-state.json");
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("acceptance scenario 1: valid config produces markdown files", () => {
    it("syncs pages from Notion to markdown files in output directory", async () => {
      const config = createTestConfig({ outputDir, stateFile });

      const result = await syncNotionToGit(config, { quiet: true });

      // Should have synced some pages without errors
      expect(result.errors).toHaveLength(0);
      expect(result.notionToGit.length).toBeGreaterThan(0);

      // Verify files were created
      const files = await fs.readdir(outputDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.every((f) => f.endsWith(".md"))).toBe(true);
    });

    it("creates state file after sync", async () => {
      const config = createTestConfig({ outputDir, stateFile });

      await syncNotionToGit(config, { quiet: true });

      // State file should exist
      const stateExists = await fs
        .access(stateFile)
        .then(() => true)
        .catch(() => false);
      expect(stateExists).toBe(true);

      // State file should be valid JSON
      const stateContent = await fs.readFile(stateFile, "utf-8");
      const state = JSON.parse(stateContent);
      expect(state.version).toBe(1);
      expect(state.databaseId).toBe(TEST_DB_ID);
      expect(Object.keys(state.pages).length).toBeGreaterThan(0);
    });

    it("generates valid Docusaurus markdown with frontmatter", async () => {
      const config = createTestConfig({ outputDir, stateFile });

      await syncNotionToGit(config, { quiet: true });

      // Read one of the generated files
      const files = await fs.readdir(outputDir);
      const firstFile = files[0];
      const content = await fs.readFile(path.join(outputDir, firstFile), "utf-8");

      // Should have frontmatter delimiters
      expect(content.startsWith("---\n")).toBe(true);
      expect(content).toMatch(/---\n[\s\S]+---\n/);

      // Should have title in frontmatter
      expect(content).toMatch(/title:/);
    });
  });

  describe("acceptance scenario 2: only Published pages are synced", () => {
    it("syncs exactly 3 files from the 5-page test database (3 Published, 1 Draft, 1 Archived)", async () => {
      const config = createTestConfig({ outputDir, stateFile });

      const result = await syncNotionToGit(config, { quiet: true });

      // Should have synced 3 pages (Published status only)
      const createdOrUpdated = result.notionToGit.filter(
        (r) => r.action === "created" || r.action === "updated"
      );
      expect(createdOrUpdated).toHaveLength(3);

      // Verify exactly 3 files exist
      const files = await fs.readdir(outputDir);
      expect(files).toHaveLength(3);
    });

    it("filters by status property correctly", async () => {
      const config = createTestConfig({ outputDir, stateFile });

      const result = await syncNotionToGit(config, { quiet: true });

      // All synced pages should have been "created" (first sync)
      const actions = result.notionToGit.map((r) => r.action);
      expect(actions.every((a) => a === "created")).toBe(true);
    });
  });

  describe("acceptance scenario 3: incremental sync", () => {
    it("second sync without changes reports all pages as skipped", async () => {
      const config = createTestConfig({ outputDir, stateFile });

      // First sync
      const firstResult = await syncNotionToGit(config, { quiet: true });
      expect(firstResult.errors).toHaveLength(0);

      // Get file modification times after first sync
      const files = await fs.readdir(outputDir);
      const firstModTimes: Record<string, number> = {};
      for (const file of files) {
        const stat = await fs.stat(path.join(outputDir, file));
        firstModTimes[file] = stat.mtimeMs;
      }

      // Small delay to ensure mtime would change if files were rewritten
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second sync
      const secondResult = await syncNotionToGit(config, { quiet: true });
      expect(secondResult.errors).toHaveLength(0);

      // All pages should be skipped (no changes)
      const skipped = secondResult.notionToGit.filter((r) => r.action === "skipped");
      expect(skipped.length).toBe(3);

      // No creates or updates
      const createdOrUpdated = secondResult.notionToGit.filter(
        (r) => r.action === "created" || r.action === "updated"
      );
      expect(createdOrUpdated).toHaveLength(0);
    });

    it("files are not modified on second sync when content is unchanged", async () => {
      const config = createTestConfig({ outputDir, stateFile });

      // First sync
      await syncNotionToGit(config, { quiet: true });

      // Get file modification times after first sync
      const files = await fs.readdir(outputDir);
      const firstModTimes: Record<string, number> = {};
      for (const file of files) {
        const stat = await fs.stat(path.join(outputDir, file));
        firstModTimes[file] = stat.mtimeMs;
      }

      // Wait to ensure mtime would change if files were rewritten
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second sync
      await syncNotionToGit(config, { quiet: true });

      // Verify file modification times haven't changed
      for (const file of files) {
        const stat = await fs.stat(path.join(outputDir, file));
        expect(stat.mtimeMs).toBe(firstModTimes[file]);
      }
    });

    it("full sync mode re-syncs all pages regardless of state", async () => {
      const config = createTestConfig({ outputDir, stateFile });

      // First sync (normal mode)
      await syncNotionToGit(config, { quiet: true });

      // Second sync with fullSync mode
      const result = await syncNotionToGit(config, { quiet: true, fullSync: true });

      // All 3 pages should be updated (not skipped) in full sync mode
      const updated = result.notionToGit.filter((r) => r.action === "updated");
      expect(updated).toHaveLength(3);

      // No skipped pages in full sync
      const skipped = result.notionToGit.filter((r) => r.action === "skipped");
      expect(skipped).toHaveLength(0);
    });
  });

  describe("acceptance scenario 4: invalid config error handling", () => {
    it("returns error with invalid token", async () => {
      const config = createTestConfig({
        outputDir,
        stateFile,
        notionToken: "invalid-token-that-will-fail",
      });

      const result = await syncNotionToGit(config, { quiet: true });

      // Should have errors
      expect(result.errors.length).toBeGreaterThan(0);

      // Error message should be descriptive
      const errorMessages = result.errors.map((e) => e.message).join(" ");
      expect(
        errorMessages.toLowerCase().includes("unauthorized") ||
          errorMessages.toLowerCase().includes("invalid") ||
          errorMessages.toLowerCase().includes("api") ||
          errorMessages.toLowerCase().includes("401")
      ).toBe(true);

      // No pages should be synced
      expect(result.notionToGit).toHaveLength(0);
    });

    it("returns error with invalid database ID", async () => {
      const config = createTestConfig({
        outputDir,
        stateFile,
        databaseId: "00000000-0000-0000-0000-000000000000",
      });

      const result = await syncNotionToGit(config, { quiet: true });

      // Should have errors
      expect(result.errors.length).toBeGreaterThan(0);

      // No pages should be synced
      expect(result.notionToGit).toHaveLength(0);
    });
  });

  describe("markdown content quality", () => {
    it("generates valid frontmatter with expected properties", async () => {
      const config = createTestConfig({ outputDir, stateFile });

      await syncNotionToGit(config, { quiet: true });

      const files = await fs.readdir(outputDir);

      for (const file of files) {
        const content = await fs.readFile(path.join(outputDir, file), "utf-8");

        // Extract frontmatter
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        expect(match).not.toBeNull();

        const frontmatter = match![1];
        // Should have title (required for Docusaurus)
        expect(frontmatter).toMatch(/title:/);
      }
    });

    it("generates markdown body content for pages with blocks", async () => {
      const config = createTestConfig({ outputDir, stateFile });

      await syncNotionToGit(config, { quiet: true });

      const files = await fs.readdir(outputDir);
      let hasContentfulPage = false;

      for (const file of files) {
        const content = await fs.readFile(path.join(outputDir, file), "utf-8");

        // Extract body (after frontmatter)
        const parts = content.split(/^---\n[\s\S]*?\n---\n/);
        if (parts.length > 1 && parts[1].trim().length > 0) {
          hasContentfulPage = true;
        }
      }

      // At least one page should have content
      expect(hasContentfulPage).toBe(true);
    });
  });

  describe("performance", () => {
    it("completes sync in under 30 seconds (NFR-001)", async () => {
      const config = createTestConfig({ outputDir, stateFile });

      const startTime = Date.now();
      await syncNotionToGit(config, { quiet: true });
      const elapsed = Date.now() - startTime;

      // Should complete in under 30 seconds (NFR-001)
      expect(elapsed).toBeLessThan(30000);
    });
  });

  describe("edge cases", () => {
    it("handles empty output directory creation", async () => {
      // Use a nested path that doesn't exist
      const nestedOutputDir = path.join(tempDir, "nested", "deep", "docs");
      const config = createTestConfig({
        outputDir: nestedOutputDir,
        stateFile,
      });

      const result = await syncNotionToGit(config, { quiet: true });

      expect(result.errors).toHaveLength(0);

      // Directory should be created
      const stat = await fs.stat(nestedOutputDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it("handles state file in non-existent directory", async () => {
      const nestedStateFile = path.join(tempDir, "nested", "state", ".sync-state.json");
      const config = createTestConfig({
        outputDir,
        stateFile: nestedStateFile,
      });

      const result = await syncNotionToGit(config, { quiet: true });

      expect(result.errors).toHaveLength(0);

      // State file should be created
      const stateExists = await fs
        .access(nestedStateFile)
        .then(() => true)
        .catch(() => false);
      expect(stateExists).toBe(true);
    });
  });
});
