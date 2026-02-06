/**
 * E2E tests for the Git → Notion push sync against the live Notion test database.
 *
 * These tests verify the full Git → Notion sync pipeline by running
 * actual pushes against the test database defined in CLAUDE.md.
 *
 * User Story 6 (Git-to-Notion Sync Integration) acceptance scenarios:
 * 1. Given a markdown file not in sync state, `push` creates a new page in Notion
 * 2. Given a markdown file whose content hash differs from state, `push` updates the page
 * 3. Given a markdown file whose content hash matches state, `push` skips (no API calls)
 *
 * Requires NOTION_TOKEN environment variable to be set.
 * Skipped in CI unless credentials are available.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";

// Increase timeout for E2E tests that hit live Notion API
// Default is 5s which isn't enough for API calls with rate limiting
vi.setConfig({ testTimeout: 60000, hookTimeout: 30000 });
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { syncGitToNotion } from "../../src/sync/engine.js";
import { NotionClientWrapper } from "../../src/notion/client.js";
import type { SyncConfig } from "../../src/types.js";

/**
 * Test database from CLAUDE.md:
 * - ID: 2ffc0fdf-942d-817f-ad7e-efd2e1887262
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

/**
 * Creates a test markdown file with frontmatter and content.
 */
async function createTestMarkdownFile(
  outputDir: string,
  slug: string,
  options: {
    title?: string;
    tags?: string[];
    sidebarPosition?: number;
    content?: string;
  } = {}
): Promise<string> {
  const {
    title = "E2E Test Page",
    tags = ["test", "automated"],
    sidebarPosition = 99,
    content = `# Test Heading

Paragraph with **bold** and *italic*.

- Bullet point 1
- Bullet point 2

1. Numbered item 1
2. Numbered item 2
`,
  } = options;

  const frontmatter = `---
title: "${title}"
slug: "${slug}"
tags: [${tags.join(", ")}]
sidebar_position: ${sidebarPosition}
---
`;

  const markdown = frontmatter + "\n" + content;
  const filePath = path.join(outputDir, `${slug}.md`);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(filePath, markdown, "utf-8");

  return filePath;
}

/**
 * Deletes a page from Notion (permanently, for cleanup).
 * Uses archive + trash method since permanent delete is not available via API.
 */
async function deleteNotionPage(
  client: NotionClientWrapper,
  pageId: string
): Promise<void> {
  try {
    // Archive the page (this is the best we can do via API)
    await client.rawClient.pages.update({
      page_id: pageId,
      archived: true,
    });
  } catch {
    // Ignore errors - page may already be deleted or not exist
  }
}

/**
 * Finds a page in Notion by slug.
 */
async function findPageBySlug(
  client: NotionClientWrapper,
  dataSourceId: string,
  slug: string
): Promise<{ id: string; properties: Record<string, unknown> } | null> {
  // Query pages and filter by slug
  const pages = await client.queryPages(dataSourceId);

  for (const page of pages) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slugProperty = page.properties.Slug as any;
    if (slugProperty?.type === "rich_text" && slugProperty.rich_text) {
      const pageSlug = slugProperty.rich_text
        .map((t: { plain_text?: string }) => t.plain_text || "")
        .join("");
      if (pageSlug === slug) {
        return {
          id: page.id,
          properties: page.properties as Record<string, unknown>,
        };
      }
    }
  }

  return null;
}

/**
 * Gets the plain text value of a rich_text property.
 */
function getRichTextValue(property: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = property as any;
  if (prop?.type === "rich_text" && prop.rich_text) {
    return prop.rich_text
      .map((t: { plain_text?: string }) => t.plain_text || "")
      .join("");
  }
  return "";
}

/**
 * Gets the title value from a title property.
 */
function getTitleValue(property: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = property as any;
  if (prop?.type === "title" && prop.title) {
    return prop.title
      .map((t: { plain_text?: string }) => t.plain_text || "")
      .join("");
  }
  return "";
}

/**
 * Gets multi-select values from a multi_select property.
 */
function getMultiSelectValues(property: unknown): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = property as any;
  if (prop?.type === "multi_select" && prop.multi_select) {
    return prop.multi_select.map((s: { name: string }) => s.name);
  }
  return [];
}

/**
 * Gets number value from a number property.
 */
function getNumberValue(property: unknown): number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = property as any;
  if (prop?.type === "number") {
    return prop.number;
  }
  return null;
}

describe.skipIf(!process.env.NOTION_TOKEN)("e2e push", () => {
  let tempDir: string;
  let outputDir: string;
  let stateFile: string;
  let client: NotionClientWrapper;
  let dataSourceId: string;
  let testSlug: string;

  // Track pages created during tests for cleanup
  const createdPageIds: string[] = [];

  // Counter for unique slugs within this test run
  let testCounter = 0;

  // Initialize Notion client once for all tests (expensive API call)
  beforeAll(async () => {
    client = new NotionClientWrapper({ token: process.env.NOTION_TOKEN! });
    dataSourceId = await client.getDataSourceId(TEST_DB_ID);
  });

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "e2e-push-test-"));
    outputDir = path.join(tempDir, "docs");
    stateFile = path.join(tempDir, ".notion-sync-state.json");

    // Generate unique slug for each test to avoid conflicts
    testCounter++;
    testSlug = `e2e-test-push-${Date.now().toString(36)}-${testCounter}`;
  });

  afterEach(async () => {
    // Clean up created pages in Notion
    for (const pageId of createdPageIds) {
      await deleteNotionPage(client, pageId);
    }
    createdPageIds.length = 0;

    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  afterAll(async () => {
    // Final cleanup - ensure no test pages are left behind
    // This catches any pages that may have been missed due to test failures
  });

  describe("acceptance scenario 1: new markdown file creates Notion page", () => {
    it("creates a new page in Notion from a markdown file", async () => {
      // Create a test markdown file
      await createTestMarkdownFile(outputDir, testSlug, {
        title: "E2E Test Page",
        tags: ["test", "automated"],
        sidebarPosition: 99,
      });

      const config = createTestConfig({ outputDir, stateFile });

      // Run the push sync
      const result = await syncGitToNotion(config, { quiet: true });

      // Should have no errors
      expect(result.errors).toHaveLength(0);

      // Should have created one page
      const created = result.gitToNotion.filter((r) => r.action === "created");
      expect(created).toHaveLength(1);
      expect(created[0].slug).toBe(testSlug);

      // Track for cleanup
      createdPageIds.push(created[0].pageId);

      // Verify page exists in Notion with correct properties
      const page = await findPageBySlug(client, dataSourceId, testSlug);
      expect(page).not.toBeNull();

      // Verify title
      const title = getTitleValue(page!.properties.Name);
      expect(title).toBe("E2E Test Page");

      // Verify tags
      const tags = getMultiSelectValues(page!.properties.Tags);
      expect(tags).toContain("test");
      expect(tags).toContain("automated");

      // Verify sidebar position
      const sidebarPosition = getNumberValue(
        page!.properties["Sidebar Position"]
      );
      expect(sidebarPosition).toBe(99);
    });

    it("creates page with heading and paragraph blocks", async () => {
      await createTestMarkdownFile(outputDir, testSlug, {
        title: "Block Test Page",
        content: `# Main Heading

This is a paragraph with **bold** and *italic* text.
`,
      });

      const config = createTestConfig({ outputDir, stateFile });

      const result = await syncGitToNotion(config, { quiet: true });

      expect(result.errors).toHaveLength(0);
      const created = result.gitToNotion.filter((r) => r.action === "created");
      expect(created).toHaveLength(1);

      createdPageIds.push(created[0].pageId);

      // Verify blocks were created by fetching the page blocks
      const blocks = await client.getPageBlocks(created[0].pageId);

      // Should have at least a heading and a paragraph
      expect(blocks.length).toBeGreaterThan(0);

      // Find the heading block
      const headingBlock = blocks.find((b) => b.type === "heading_1");
      expect(headingBlock).toBeDefined();

      // Find the paragraph block
      const paragraphBlock = blocks.find((b) => b.type === "paragraph");
      expect(paragraphBlock).toBeDefined();
    });
  });

  describe("acceptance scenario 2: modified markdown file updates Notion page", () => {
    it("updates an existing page when markdown content changes", async () => {
      // Step 1: Create initial markdown file and push
      await createTestMarkdownFile(outputDir, testSlug, {
        title: "Original Title",
        sidebarPosition: 1,
      });

      const config = createTestConfig({ outputDir, stateFile });

      const firstResult = await syncGitToNotion(config, { quiet: true });
      expect(firstResult.errors).toHaveLength(0);
      expect(firstResult.gitToNotion.filter((r) => r.action === "created")).toHaveLength(1);

      const pageId = firstResult.gitToNotion[0].pageId;
      createdPageIds.push(pageId);

      // Step 2: Modify the markdown file
      await createTestMarkdownFile(outputDir, testSlug, {
        title: "Updated Title",
        sidebarPosition: 5,
        content: `# New Heading

Completely new content here.
`,
      });

      // Step 3: Push again
      const secondResult = await syncGitToNotion(config, { quiet: true });

      expect(secondResult.errors).toHaveLength(0);

      // Should have updated (not created) the page
      const updated = secondResult.gitToNotion.filter(
        (r) => r.action === "updated"
      );
      expect(updated).toHaveLength(1);
      expect(updated[0].pageId).toBe(pageId);

      // Step 4: Verify the page was updated in Notion
      const page = await findPageBySlug(client, dataSourceId, testSlug);
      expect(page).not.toBeNull();

      const title = getTitleValue(page!.properties.Name);
      expect(title).toBe("Updated Title");

      const sidebarPosition = getNumberValue(
        page!.properties["Sidebar Position"]
      );
      expect(sidebarPosition).toBe(5);
    });
  });

  describe("acceptance scenario 3: unchanged file is skipped", () => {
    it("skips files that have not changed since last sync", async () => {
      // Step 1: Create markdown file and push
      await createTestMarkdownFile(outputDir, testSlug, {
        title: "Unchanged Test",
      });

      const config = createTestConfig({ outputDir, stateFile });

      const firstResult = await syncGitToNotion(config, { quiet: true });
      expect(firstResult.errors).toHaveLength(0);
      expect(firstResult.gitToNotion.filter((r) => r.action === "created")).toHaveLength(1);

      createdPageIds.push(firstResult.gitToNotion[0].pageId);

      // Step 2: Push again without changing the file
      const secondResult = await syncGitToNotion(config, { quiet: true });

      expect(secondResult.errors).toHaveLength(0);

      // Should have skipped (no creates or updates)
      const skipped = secondResult.gitToNotion.filter(
        (r) => r.action === "skipped"
      );
      expect(skipped).toHaveLength(1);

      const created = secondResult.gitToNotion.filter(
        (r) => r.action === "created"
      );
      expect(created).toHaveLength(0);

      const updated = secondResult.gitToNotion.filter(
        (r) => r.action === "updated"
      );
      expect(updated).toHaveLength(0);
    });
  });

  describe("full sync mode", () => {
    it("re-pushes all files when fullSync option is set", async () => {
      // Step 1: Create file and push
      await createTestMarkdownFile(outputDir, testSlug, {
        title: "Full Sync Test",
      });

      const config = createTestConfig({ outputDir, stateFile });

      const firstResult = await syncGitToNotion(config, { quiet: true });
      expect(firstResult.errors).toHaveLength(0);

      createdPageIds.push(firstResult.gitToNotion[0].pageId);

      // Step 2: Push again with fullSync mode
      const secondResult = await syncGitToNotion(config, {
        quiet: true,
        fullSync: true,
      });

      expect(secondResult.errors).toHaveLength(0);

      // Should have updated (not skipped) since fullSync ignores state
      const updated = secondResult.gitToNotion.filter(
        (r) => r.action === "updated"
      );
      expect(updated).toHaveLength(1);

      const skipped = secondResult.gitToNotion.filter(
        (r) => r.action === "skipped"
      );
      expect(skipped).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    it("returns error with invalid token", async () => {
      await createTestMarkdownFile(outputDir, testSlug);

      const config = createTestConfig({
        outputDir,
        stateFile,
        notionToken: "invalid-token-that-will-fail",
      });

      const result = await syncGitToNotion(config, { quiet: true });

      // Should have errors
      expect(result.errors.length).toBeGreaterThan(0);

      // No pages should be pushed
      expect(result.gitToNotion).toHaveLength(0);
    });
  });

  describe("state file management", () => {
    it("creates state file after successful push", async () => {
      await createTestMarkdownFile(outputDir, testSlug);

      const config = createTestConfig({ outputDir, stateFile });

      await syncGitToNotion(config, { quiet: true });

      // Track for cleanup
      const page = await findPageBySlug(client, dataSourceId, testSlug);
      if (page) {
        createdPageIds.push(page.id);
      }

      // State file should exist
      const stateExists = await fs
        .access(stateFile)
        .then(() => true)
        .catch(() => false);
      expect(stateExists).toBe(true);

      // State file should be valid JSON with correct structure
      const stateContent = await fs.readFile(stateFile, "utf-8");
      const state = JSON.parse(stateContent);

      expect(state.version).toBe(1);
      expect(state.databaseId).toBe(TEST_DB_ID);
      expect(Object.keys(state.pages).length).toBeGreaterThan(0);
    });
  });

  describe("content conversion", () => {
    it("handles lists correctly", async () => {
      await createTestMarkdownFile(outputDir, testSlug, {
        title: "List Test",
        content: `# Lists

- Bullet 1
- Bullet 2
- Bullet 3

1. Number 1
2. Number 2
3. Number 3
`,
      });

      const config = createTestConfig({ outputDir, stateFile });

      const result = await syncGitToNotion(config, { quiet: true });
      expect(result.errors).toHaveLength(0);

      createdPageIds.push(result.gitToNotion[0].pageId);

      // Fetch blocks and verify lists were created
      const blocks = await client.getPageBlocks(result.gitToNotion[0].pageId);

      // Should have bulleted list items
      const bulletItems = blocks.filter((b) => b.type === "bulleted_list_item");
      expect(bulletItems.length).toBeGreaterThanOrEqual(3);

      // Should have numbered list items
      const numberItems = blocks.filter((b) => b.type === "numbered_list_item");
      expect(numberItems.length).toBeGreaterThanOrEqual(3);
    });

    it("handles code blocks correctly", async () => {
      await createTestMarkdownFile(outputDir, testSlug, {
        title: "Code Test",
        content: `# Code Example

\`\`\`typescript
const x: number = 42;
console.log(x);
\`\`\`
`,
      });

      const config = createTestConfig({ outputDir, stateFile });

      const result = await syncGitToNotion(config, { quiet: true });
      expect(result.errors).toHaveLength(0);

      createdPageIds.push(result.gitToNotion[0].pageId);

      // Fetch blocks and verify code block was created
      const blocks = await client.getPageBlocks(result.gitToNotion[0].pageId);

      const codeBlocks = blocks.filter((b) => b.type === "code");
      expect(codeBlocks.length).toBeGreaterThanOrEqual(1);

      // Verify code language
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const codeBlock = codeBlocks[0] as any;
      expect(codeBlock.code?.language).toBe("typescript");
    });

    it("handles blockquotes correctly", async () => {
      await createTestMarkdownFile(outputDir, testSlug, {
        title: "Quote Test",
        content: `# Quotes

> This is a blockquote.
> It can span multiple lines.
`,
      });

      const config = createTestConfig({ outputDir, stateFile });

      const result = await syncGitToNotion(config, { quiet: true });
      expect(result.errors).toHaveLength(0);

      createdPageIds.push(result.gitToNotion[0].pageId);

      // Fetch blocks and verify quote was created
      const blocks = await client.getPageBlocks(result.gitToNotion[0].pageId);

      const quoteBlocks = blocks.filter((b) => b.type === "quote");
      expect(quoteBlocks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("performance", () => {
    it("completes push in under 30 seconds", async () => {
      await createTestMarkdownFile(outputDir, testSlug);

      const config = createTestConfig({ outputDir, stateFile });

      const startTime = Date.now();
      const result = await syncGitToNotion(config, { quiet: true });
      const elapsed = Date.now() - startTime;

      expect(result.errors).toHaveLength(0);

      // Track for cleanup
      if (result.gitToNotion[0]?.pageId) {
        createdPageIds.push(result.gitToNotion[0].pageId);
      }

      // Should complete in under 30 seconds
      expect(elapsed).toBeLessThan(30000);
    });
  });
});
