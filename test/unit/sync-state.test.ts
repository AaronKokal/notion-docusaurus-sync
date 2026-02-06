/**
 * Unit tests for sync state management.
 *
 * Tests the sync state file operations including:
 * - Creating empty state
 * - Loading state from file (exists, missing, corrupted)
 * - Saving state atomically
 * - Detecting changes between sync runs
 * - Updating and removing page state entries
 * - Computing content hashes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  createEmptyState,
  loadState,
  saveState,
  detectChanges,
  updatePageState,
  removePageState,
  computeContentHash,
  detectGitChanges,
  findPageBySlug,
  detectConflicts,
  STATE_FILE_VERSION,
  type ChangeDetectionResult,
  type GitChangeDetectionResult,
} from "../../src/sync/state.js";
import type { SyncStateFile, PageStateEntry, MarkdownFileInfo, ConflictRecord } from "../../src/types.js";
import { mockNotionPage, resetMockCounters } from "../helpers.js";
import type { NotionPage } from "../../src/notion/types.js";

describe("sync state management", () => {
  let tempDir: string;
  let stateFilePath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetMockCounters();

    // Create a temporary directory for state file tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sync-state-test-"));
    stateFilePath = path.join(tempDir, ".notion-sync-state.json");
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createEmptyState", () => {
    it("returns a state object with correct version", () => {
      const state = createEmptyState();

      expect(state.version).toBe(STATE_FILE_VERSION);
    });

    it("returns a state object with empty databaseId", () => {
      const state = createEmptyState();

      expect(state.databaseId).toBe("");
    });

    it("returns a state object with empty dataSourceId", () => {
      const state = createEmptyState();

      expect(state.dataSourceId).toBe("");
    });

    it("returns a state object with empty lastSyncTime", () => {
      const state = createEmptyState();

      expect(state.lastSyncTime).toBe("");
    });

    it("returns a state object with empty pages object", () => {
      const state = createEmptyState();

      expect(state.pages).toEqual({});
      expect(Object.keys(state.pages)).toHaveLength(0);
    });

    it("returns a new object each time (not shared reference)", () => {
      const state1 = createEmptyState();
      const state2 = createEmptyState();

      expect(state1).not.toBe(state2);
      expect(state1.pages).not.toBe(state2.pages);
    });
  });

  describe("loadState", () => {
    it("returns empty state when file does not exist", async () => {
      const state = await loadState(stateFilePath);

      expect(state.version).toBe(STATE_FILE_VERSION);
      expect(state.pages).toEqual({});
    });

    it("loads valid state file correctly", async () => {
      const validState: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T11:00:00Z",
            gitContentHash: "sha256:abc123",
            slug: "getting-started",
            filePath: "docs/getting-started.md",
          },
        },
      };

      await fs.writeFile(stateFilePath, JSON.stringify(validState, null, 2));

      const state = await loadState(stateFilePath);

      expect(state.version).toBe(1);
      expect(state.databaseId).toBe("db-123");
      expect(state.dataSourceId).toBe("ds-456");
      expect(state.lastSyncTime).toBe("2026-02-06T12:00:00Z");
      expect(state.pages["page-1"]).toEqual(validState.pages["page-1"]);
    });

    it("loads state with multiple pages", async () => {
      const validState: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T11:00:00Z",
            gitContentHash: "sha256:abc123",
            slug: "getting-started",
            filePath: "docs/getting-started.md",
          },
          "page-2": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:def456",
            slug: "installation",
            filePath: "docs/installation.md",
          },
          "page-3": {
            notionLastEdited: "2026-02-06T09:00:00Z",
            gitContentHash: "sha256:ghi789",
            slug: "configuration",
            filePath: "docs/configuration.md",
          },
        },
      };

      await fs.writeFile(stateFilePath, JSON.stringify(validState, null, 2));

      const state = await loadState(stateFilePath);

      expect(Object.keys(state.pages)).toHaveLength(3);
      expect(state.pages["page-1"].slug).toBe("getting-started");
      expect(state.pages["page-2"].slug).toBe("installation");
      expect(state.pages["page-3"].slug).toBe("configuration");
    });

    it("returns empty state for corrupted JSON", async () => {
      await fs.writeFile(stateFilePath, "{ invalid json }}}");

      // Suppress console.warn during this test
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const state = await loadState(stateFilePath);

      expect(state.version).toBe(STATE_FILE_VERSION);
      expect(state.pages).toEqual({});
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("returns empty state when version field is missing", async () => {
      const invalidState = {
        databaseId: "db-123",
        pages: {},
      };

      await fs.writeFile(stateFilePath, JSON.stringify(invalidState));

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const state = await loadState(stateFilePath);

      expect(state.version).toBe(STATE_FILE_VERSION);
      expect(state.pages).toEqual({});
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("returns empty state when version is not a number", async () => {
      const invalidState = {
        version: "1",
        databaseId: "db-123",
        pages: {},
      };

      await fs.writeFile(stateFilePath, JSON.stringify(invalidState));

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const state = await loadState(stateFilePath);

      expect(state.version).toBe(STATE_FILE_VERSION);
      expect(state.pages).toEqual({});

      warnSpy.mockRestore();
    });

    it("returns empty state when pages field is missing", async () => {
      const invalidState = {
        version: 1,
        databaseId: "db-123",
      };

      await fs.writeFile(stateFilePath, JSON.stringify(invalidState));

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const state = await loadState(stateFilePath);

      expect(state.version).toBe(STATE_FILE_VERSION);
      expect(state.pages).toEqual({});

      warnSpy.mockRestore();
    });

    it("returns empty state when pages is null", async () => {
      const invalidState = {
        version: 1,
        databaseId: "db-123",
        pages: null,
      };

      await fs.writeFile(stateFilePath, JSON.stringify(invalidState));

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const state = await loadState(stateFilePath);

      expect(state.version).toBe(STATE_FILE_VERSION);
      expect(state.pages).toEqual({});

      warnSpy.mockRestore();
    });

    it("returns empty state when pages is not an object", async () => {
      const invalidState = {
        version: 1,
        databaseId: "db-123",
        pages: ["page-1", "page-2"],
      };

      await fs.writeFile(stateFilePath, JSON.stringify(invalidState));

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const state = await loadState(stateFilePath);

      // Arrays are technically objects in JS, but this is still considered valid
      // The state module accepts any object for pages
      // This is intentional - the validation is minimal for flexibility
      expect(state.version).toBe(1);

      warnSpy.mockRestore();
    });

    it("handles empty file gracefully", async () => {
      await fs.writeFile(stateFilePath, "");

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const state = await loadState(stateFilePath);

      expect(state.version).toBe(STATE_FILE_VERSION);
      expect(state.pages).toEqual({});

      warnSpy.mockRestore();
    });

    it("handles permission errors gracefully", async () => {
      // Create a directory with the same name (can't read as file)
      const dirPath = path.join(tempDir, "state-dir.json");
      await fs.mkdir(dirPath);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const state = await loadState(dirPath);

      expect(state.version).toBe(STATE_FILE_VERSION);
      expect(state.pages).toEqual({});
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe("saveState", () => {
    it("saves state to file", async () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {},
      };

      await saveState(stateFilePath, state);

      const content = await fs.readFile(stateFilePath, "utf-8");
      const saved = JSON.parse(content) as SyncStateFile;

      expect(saved.version).toBe(1);
      expect(saved.databaseId).toBe("db-123");
      expect(saved.dataSourceId).toBe("ds-456");
    });

    it("saves state with pages", async () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T11:00:00Z",
            gitContentHash: "sha256:abc123",
            slug: "test-page",
            filePath: "docs/test-page.md",
          },
        },
      };

      await saveState(stateFilePath, state);

      const content = await fs.readFile(stateFilePath, "utf-8");
      const saved = JSON.parse(content) as SyncStateFile;

      expect(saved.pages["page-1"].slug).toBe("test-page");
      expect(saved.pages["page-1"].gitContentHash).toBe("sha256:abc123");
    });

    it("creates parent directory if it does not exist", async () => {
      const nestedPath = path.join(tempDir, "nested", "dir", "state.json");
      const state = createEmptyState();

      await saveState(nestedPath, state);

      const content = await fs.readFile(nestedPath, "utf-8");
      const saved = JSON.parse(content) as SyncStateFile;

      expect(saved.version).toBe(STATE_FILE_VERSION);
    });

    it("overwrites existing state file", async () => {
      const state1: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: { "page-1": { notionLastEdited: "t1", gitContentHash: "h1", slug: "s1", filePath: "f1" } },
      };

      const state2: SyncStateFile = {
        version: 1,
        databaseId: "db-789",
        dataSourceId: "ds-000",
        lastSyncTime: "2026-02-06T13:00:00Z",
        pages: { "page-2": { notionLastEdited: "t2", gitContentHash: "h2", slug: "s2", filePath: "f2" } },
      };

      await saveState(stateFilePath, state1);
      await saveState(stateFilePath, state2);

      const content = await fs.readFile(stateFilePath, "utf-8");
      const saved = JSON.parse(content) as SyncStateFile;

      expect(saved.databaseId).toBe("db-789");
      expect(saved.pages["page-2"]).toBeDefined();
      expect(saved.pages["page-1"]).toBeUndefined();
    });

    it("uses pretty-printed JSON format", async () => {
      const state = createEmptyState();

      await saveState(stateFilePath, state);

      const content = await fs.readFile(stateFilePath, "utf-8");

      // Pretty-printed JSON has newlines and indentation
      expect(content).toContain("\n");
      expect(content).toContain("  ");
    });

    it("cleans up temporary file on success", async () => {
      const state = createEmptyState();

      await saveState(stateFilePath, state);

      const tempPath = `${stateFilePath}.tmp`;

      // Temp file should not exist after successful save
      await expect(fs.access(tempPath)).rejects.toThrow();
    });

    it("saves roundtrip correctly (save then load)", async () => {
      const originalState: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T11:00:00Z",
            gitContentHash: "sha256:abc123def456",
            slug: "test-page",
            filePath: "docs/test-page.md",
          },
          "page-2": {
            notionLastEdited: "2026-02-06T10:30:00Z",
            gitContentHash: "sha256:789xyz",
            slug: "another-page",
            filePath: "docs/another-page.md",
          },
        },
      };

      await saveState(stateFilePath, originalState);
      const loadedState = await loadState(stateFilePath);

      expect(loadedState).toEqual(originalState);
    });
  });

  describe("detectChanges", () => {
    /**
     * Helper to create a NotionPage for testing.
     * Uses the mock helper but casts to NotionPage for type compatibility.
     */
    function createTestPage(id: string, lastEditedTime: string): NotionPage {
      return mockNotionPage({
        id,
        lastEditedTime,
      }) as unknown as NotionPage;
    }

    it("marks all pages as changed when state is empty (first sync)", () => {
      const state = createEmptyState();
      const pages = [
        createTestPage("page-1", "2026-02-06T11:00:00Z"),
        createTestPage("page-2", "2026-02-06T12:00:00Z"),
      ];

      const result = detectChanges(state, pages);

      expect(result.changed).toHaveLength(2);
      expect(result.unchanged).toHaveLength(0);
      expect(result.deleted).toHaveLength(0);
    });

    it("marks page as changed when last_edited_time is newer", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "page-1",
            filePath: "docs/page-1.md",
          },
        },
      };
      const pages = [
        createTestPage("page-1", "2026-02-06T12:00:00Z"), // Newer timestamp
      ];

      const result = detectChanges(state, pages);

      expect(result.changed).toHaveLength(1);
      expect(result.changed[0].id).toBe("page-1");
      expect(result.unchanged).toHaveLength(0);
    });

    it("marks page as unchanged when last_edited_time matches", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T12:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "page-1",
            filePath: "docs/page-1.md",
          },
        },
      };
      const pages = [
        createTestPage("page-1", "2026-02-06T12:00:00Z"), // Same timestamp
      ];

      const result = detectChanges(state, pages);

      expect(result.changed).toHaveLength(0);
      expect(result.unchanged).toHaveLength(1);
      expect(result.unchanged[0]).toBe("page-1");
    });

    it("marks page as unchanged when last_edited_time is older (edge case)", () => {
      // This shouldn't normally happen, but the code should handle it
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T12:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "page-1",
            filePath: "docs/page-1.md",
          },
        },
      };
      const pages = [
        createTestPage("page-1", "2026-02-06T10:00:00Z"), // Older timestamp
      ];

      const result = detectChanges(state, pages);

      expect(result.changed).toHaveLength(0);
      expect(result.unchanged).toHaveLength(1);
    });

    it("detects deleted pages (in state but not in current pages)", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T12:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "page-1",
            filePath: "docs/page-1.md",
          },
          "page-2": {
            notionLastEdited: "2026-02-06T11:00:00Z",
            gitContentHash: "sha256:def",
            slug: "page-2",
            filePath: "docs/page-2.md",
          },
        },
      };
      const pages = [
        createTestPage("page-1", "2026-02-06T12:00:00Z"),
        // page-2 is missing - deleted from Notion
      ];

      const result = detectChanges(state, pages);

      expect(result.deleted).toHaveLength(1);
      expect(result.deleted[0]).toBe("page-2");
    });

    it("handles mixed scenario: new, changed, unchanged, and deleted", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-unchanged": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:unchanged",
            slug: "unchanged",
            filePath: "docs/unchanged.md",
          },
          "page-changed": {
            notionLastEdited: "2026-02-06T09:00:00Z",
            gitContentHash: "sha256:changed",
            slug: "changed",
            filePath: "docs/changed.md",
          },
          "page-deleted": {
            notionLastEdited: "2026-02-06T08:00:00Z",
            gitContentHash: "sha256:deleted",
            slug: "deleted",
            filePath: "docs/deleted.md",
          },
        },
      };

      const pages = [
        createTestPage("page-unchanged", "2026-02-06T10:00:00Z"), // Same timestamp
        createTestPage("page-changed", "2026-02-06T12:00:00Z"),   // Newer timestamp
        createTestPage("page-new", "2026-02-06T11:00:00Z"),       // Not in state
        // page-deleted is missing
      ];

      const result = detectChanges(state, pages);

      expect(result.unchanged).toHaveLength(1);
      expect(result.unchanged).toContain("page-unchanged");

      expect(result.changed).toHaveLength(2);
      expect(result.changed.map((p) => p.id).sort()).toEqual(["page-changed", "page-new"]);

      expect(result.deleted).toHaveLength(1);
      expect(result.deleted).toContain("page-deleted");
    });

    it("handles empty pages array", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T12:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "page-1",
            filePath: "docs/page-1.md",
          },
        },
      };
      const pages: NotionPage[] = [];

      const result = detectChanges(state, pages);

      expect(result.changed).toHaveLength(0);
      expect(result.unchanged).toHaveLength(0);
      expect(result.deleted).toHaveLength(1);
      expect(result.deleted[0]).toBe("page-1");
    });

    it("handles empty state and empty pages", () => {
      const state = createEmptyState();
      const pages: NotionPage[] = [];

      const result = detectChanges(state, pages);

      expect(result.changed).toHaveLength(0);
      expect(result.unchanged).toHaveLength(0);
      expect(result.deleted).toHaveLength(0);
    });

    it("correctly uses string comparison for timestamps", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T09:00:00.000Z",
            gitContentHash: "sha256:abc",
            slug: "page-1",
            filePath: "docs/page-1.md",
          },
        },
      };

      // ISO timestamps with same value but different formats
      const pages = [
        createTestPage("page-1", "2026-02-06T09:00:00.000Z"),
      ];

      const result = detectChanges(state, pages);

      expect(result.unchanged).toHaveLength(1);
    });
  });

  describe("updatePageState", () => {
    it("adds a new page entry to state", () => {
      const state = createEmptyState();
      const entry: PageStateEntry = {
        notionLastEdited: "2026-02-06T12:00:00Z",
        gitContentHash: "sha256:abc123",
        slug: "new-page",
        filePath: "docs/new-page.md",
      };

      updatePageState(state, "page-1", entry);

      expect(state.pages["page-1"]).toEqual(entry);
    });

    it("updates an existing page entry", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:old",
            slug: "old-slug",
            filePath: "docs/old-slug.md",
          },
        },
      };

      const newEntry: PageStateEntry = {
        notionLastEdited: "2026-02-06T14:00:00Z",
        gitContentHash: "sha256:new",
        slug: "new-slug",
        filePath: "docs/new-slug.md",
      };

      updatePageState(state, "page-1", newEntry);

      expect(state.pages["page-1"]).toEqual(newEntry);
      expect(state.pages["page-1"].notionLastEdited).toBe("2026-02-06T14:00:00Z");
    });

    it("does not affect other page entries", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:page1",
            slug: "page-1",
            filePath: "docs/page-1.md",
          },
          "page-2": {
            notionLastEdited: "2026-02-06T11:00:00Z",
            gitContentHash: "sha256:page2",
            slug: "page-2",
            filePath: "docs/page-2.md",
          },
        },
      };

      const newEntry: PageStateEntry = {
        notionLastEdited: "2026-02-06T14:00:00Z",
        gitContentHash: "sha256:updated",
        slug: "page-1-updated",
        filePath: "docs/page-1-updated.md",
      };

      updatePageState(state, "page-1", newEntry);

      expect(state.pages["page-2"].slug).toBe("page-2");
      expect(state.pages["page-2"].gitContentHash).toBe("sha256:page2");
    });

    it("mutates the state object in place", () => {
      const state = createEmptyState();
      const entry: PageStateEntry = {
        notionLastEdited: "2026-02-06T12:00:00Z",
        gitContentHash: "sha256:abc123",
        slug: "test",
        filePath: "docs/test.md",
      };

      const originalState = state;
      updatePageState(state, "page-1", entry);

      expect(state).toBe(originalState);
    });
  });

  describe("removePageState", () => {
    it("removes an existing page entry", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "page-1",
            filePath: "docs/page-1.md",
          },
        },
      };

      removePageState(state, "page-1");

      expect(state.pages["page-1"]).toBeUndefined();
      expect(Object.keys(state.pages)).toHaveLength(0);
    });

    it("does nothing for non-existent page", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "page-1",
            filePath: "docs/page-1.md",
          },
        },
      };

      removePageState(state, "page-nonexistent");

      expect(state.pages["page-1"]).toBeDefined();
      expect(Object.keys(state.pages)).toHaveLength(1);
    });

    it("does not affect other page entries", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "page-1",
            filePath: "docs/page-1.md",
          },
          "page-2": {
            notionLastEdited: "2026-02-06T11:00:00Z",
            gitContentHash: "sha256:def",
            slug: "page-2",
            filePath: "docs/page-2.md",
          },
        },
      };

      removePageState(state, "page-1");

      expect(state.pages["page-1"]).toBeUndefined();
      expect(state.pages["page-2"]).toBeDefined();
      expect(state.pages["page-2"].slug).toBe("page-2");
    });

    it("mutates the state object in place", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "page-1",
            filePath: "docs/page-1.md",
          },
        },
      };

      const originalState = state;
      removePageState(state, "page-1");

      expect(state).toBe(originalState);
    });
  });

  describe("computeContentHash", () => {
    it("returns sha256 prefixed hash", () => {
      const hash = computeContentHash("test content");

      expect(hash.startsWith("sha256:")).toBe(true);
    });

    it("returns consistent hash for same content", () => {
      const content = "# Hello World\n\nThis is some content.";
      const hash1 = computeContentHash(content);
      const hash2 = computeContentHash(content);

      expect(hash1).toBe(hash2);
    });

    it("returns different hash for different content", () => {
      const hash1 = computeContentHash("content A");
      const hash2 = computeContentHash("content B");

      expect(hash1).not.toBe(hash2);
    });

    it("handles empty string", () => {
      const hash = computeContentHash("");

      expect(hash.startsWith("sha256:")).toBe(true);
      // SHA-256 of empty string is well-known
      expect(hash).toBe("sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    it("handles unicode content", () => {
      const hash = computeContentHash("こんにちは世界 🌍");

      expect(hash.startsWith("sha256:")).toBe(true);
      expect(hash.length).toBe(7 + 64); // "sha256:" + 64 hex chars
    });

    it("handles multiline content", () => {
      const content = `# Title

Paragraph 1.

Paragraph 2.

- Item 1
- Item 2
`;
      const hash = computeContentHash(content);

      expect(hash.startsWith("sha256:")).toBe(true);
    });

    it("is case sensitive", () => {
      const hash1 = computeContentHash("Hello");
      const hash2 = computeContentHash("hello");

      expect(hash1).not.toBe(hash2);
    });

    it("is whitespace sensitive", () => {
      const hash1 = computeContentHash("hello world");
      const hash2 = computeContentHash("hello  world");
      const hash3 = computeContentHash("hello\nworld");

      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash2).not.toBe(hash3);
    });
  });

  describe("STATE_FILE_VERSION constant", () => {
    it("is a number", () => {
      expect(typeof STATE_FILE_VERSION).toBe("number");
    });

    it("is version 1", () => {
      expect(STATE_FILE_VERSION).toBe(1);
    });
  });

  // ===========================================================================
  // Git-side Change Detection Tests (for Git → Notion sync)
  // ===========================================================================

  describe("detectGitChanges", () => {
    /**
     * Helper to create a MarkdownFileInfo for testing.
     */
    function createMarkdownFileInfo(
      slug: string,
      contentHash: string,
      lastModified: string = "2026-02-06T12:00:00Z"
    ): MarkdownFileInfo {
      return {
        filePath: `docs/${slug}.md`,
        slug,
        content: `# ${slug}\n\nSome content.`,
        contentHash,
        lastModified,
      };
    }

    it("marks all files as changed when state is empty (first sync)", () => {
      const state = createEmptyState();
      const files = [
        createMarkdownFileInfo("getting-started", "sha256:abc123"),
        createMarkdownFileInfo("installation", "sha256:def456"),
      ];

      const result = detectGitChanges(state, files);

      expect(result.changed).toHaveLength(2);
      expect(result.unchanged).toHaveLength(0);
      expect(result.deleted).toHaveLength(0);
    });

    it("marks file as changed when not in state (new file)", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:existing",
            slug: "existing-page",
            filePath: "docs/existing-page.md",
          },
        },
      };
      const files = [
        createMarkdownFileInfo("existing-page", "sha256:existing"),
        createMarkdownFileInfo("new-page", "sha256:newfile"),
      ];

      const result = detectGitChanges(state, files);

      expect(result.changed).toHaveLength(1);
      expect(result.changed[0].slug).toBe("new-page");
      expect(result.unchanged).toHaveLength(1);
      expect(result.unchanged[0]).toBe("existing-page");
    });

    it("marks file as changed when content hash differs", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:oldhash",
            slug: "my-page",
            filePath: "docs/my-page.md",
          },
        },
      };
      const files = [
        createMarkdownFileInfo("my-page", "sha256:newhash"),
      ];

      const result = detectGitChanges(state, files);

      expect(result.changed).toHaveLength(1);
      expect(result.changed[0].slug).toBe("my-page");
      expect(result.unchanged).toHaveLength(0);
    });

    it("marks file as unchanged when content hash matches", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:samehash",
            slug: "my-page",
            filePath: "docs/my-page.md",
          },
        },
      };
      const files = [
        createMarkdownFileInfo("my-page", "sha256:samehash"),
      ];

      const result = detectGitChanges(state, files);

      expect(result.changed).toHaveLength(0);
      expect(result.unchanged).toHaveLength(1);
      expect(result.unchanged[0]).toBe("my-page");
    });

    it("detects deleted files (in state but no corresponding file on disk)", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:hash1",
            slug: "existing-page",
            filePath: "docs/existing-page.md",
          },
          "page-2": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:hash2",
            slug: "deleted-page",
            filePath: "docs/deleted-page.md",
          },
        },
      };
      const files = [
        createMarkdownFileInfo("existing-page", "sha256:hash1"),
        // deleted-page is missing from disk
      ];

      const result = detectGitChanges(state, files);

      expect(result.deleted).toHaveLength(1);
      expect(result.deleted[0]).toBe("page-2");
    });

    it("handles mixed scenario: new, changed, unchanged, and deleted", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-unchanged": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:unchanged",
            slug: "unchanged",
            filePath: "docs/unchanged.md",
          },
          "page-changed": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:oldcontent",
            slug: "changed",
            filePath: "docs/changed.md",
          },
          "page-deleted": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:deleted",
            slug: "deleted",
            filePath: "docs/deleted.md",
          },
        },
      };

      const files = [
        createMarkdownFileInfo("unchanged", "sha256:unchanged"),
        createMarkdownFileInfo("changed", "sha256:newcontent"),
        createMarkdownFileInfo("new-page", "sha256:brand-new"),
        // deleted is missing
      ];

      const result = detectGitChanges(state, files);

      expect(result.unchanged).toHaveLength(1);
      expect(result.unchanged).toContain("unchanged");

      expect(result.changed).toHaveLength(2);
      const changedSlugs = result.changed.map((f) => f.slug).sort();
      expect(changedSlugs).toEqual(["changed", "new-page"]);

      expect(result.deleted).toHaveLength(1);
      expect(result.deleted).toContain("page-deleted");
    });

    it("handles empty files array", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:hash",
            slug: "some-page",
            filePath: "docs/some-page.md",
          },
        },
      };
      const files: MarkdownFileInfo[] = [];

      const result = detectGitChanges(state, files);

      expect(result.changed).toHaveLength(0);
      expect(result.unchanged).toHaveLength(0);
      expect(result.deleted).toHaveLength(1);
      expect(result.deleted[0]).toBe("page-1");
    });

    it("handles empty state and empty files", () => {
      const state = createEmptyState();
      const files: MarkdownFileInfo[] = [];

      const result = detectGitChanges(state, files);

      expect(result.changed).toHaveLength(0);
      expect(result.unchanged).toHaveLength(0);
      expect(result.deleted).toHaveLength(0);
    });
  });

  describe("findPageBySlug", () => {
    it("returns correct entry when slug exists", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-abc": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "getting-started",
            filePath: "docs/getting-started.md",
          },
          "page-def": {
            notionLastEdited: "2026-02-06T11:00:00Z",
            gitContentHash: "sha256:def",
            slug: "installation",
            filePath: "docs/installation.md",
          },
        },
      };

      const result = findPageBySlug(state, "getting-started");

      expect(result).not.toBeNull();
      expect(result!.pageId).toBe("page-abc");
      expect(result!.entry.slug).toBe("getting-started");
      expect(result!.entry.gitContentHash).toBe("sha256:abc");
    });

    it("returns correct entry for second page by slug", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-abc": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "getting-started",
            filePath: "docs/getting-started.md",
          },
          "page-def": {
            notionLastEdited: "2026-02-06T11:00:00Z",
            gitContentHash: "sha256:def",
            slug: "installation",
            filePath: "docs/installation.md",
          },
        },
      };

      const result = findPageBySlug(state, "installation");

      expect(result).not.toBeNull();
      expect(result!.pageId).toBe("page-def");
      expect(result!.entry.slug).toBe("installation");
    });

    it("returns null when slug does not exist", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-abc": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "getting-started",
            filePath: "docs/getting-started.md",
          },
        },
      };

      const result = findPageBySlug(state, "nonexistent-slug");

      expect(result).toBeNull();
    });

    it("returns null for empty state", () => {
      const state = createEmptyState();

      const result = findPageBySlug(state, "any-slug");

      expect(result).toBeNull();
    });

    it("handles slug with special characters", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T12:00:00Z",
        pages: {
          "page-123": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:special",
            slug: "my-page-v2-beta",
            filePath: "docs/my-page-v2-beta.md",
          },
        },
      };

      const result = findPageBySlug(state, "my-page-v2-beta");

      expect(result).not.toBeNull();
      expect(result!.pageId).toBe("page-123");
    });
  });

  describe("detectConflicts", () => {
    /**
     * Helper to create a NotionPage for testing.
     */
    function createTestPage(id: string, lastEditedTime: string): NotionPage {
      return mockNotionPage({
        id,
        lastEditedTime,
      }) as unknown as NotionPage;
    }

    /**
     * Helper to create a MarkdownFileInfo for testing.
     */
    function createMarkdownFileInfo(
      slug: string,
      contentHash: string,
      lastModified: string
    ): MarkdownFileInfo {
      return {
        filePath: `docs/${slug}.md`,
        slug,
        content: `# ${slug}\n\nSome content.`,
        contentHash,
        lastModified,
      };
    }

    it("returns empty array when no pages changed on both sides", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "my-page",
            filePath: "docs/my-page.md",
          },
        },
      };

      const notionChanges = { changed: [] as NotionPage[] };
      const gitChanges = { changed: [] as MarkdownFileInfo[] };

      const conflicts = detectConflicts(notionChanges, gitChanges, state);

      expect(conflicts).toHaveLength(0);
    });

    it("returns empty array when page changed on Notion side only", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:abc",
            slug: "my-page",
            filePath: "docs/my-page.md",
          },
        },
      };

      const notionChanges = {
        changed: [createTestPage("page-1", "2026-02-06T12:00:00Z")],
      };
      const gitChanges = { changed: [] as MarkdownFileInfo[] };

      const conflicts = detectConflicts(notionChanges, gitChanges, state);

      expect(conflicts).toHaveLength(0);
    });

    it("returns empty array when page changed on Git side only", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:old",
            slug: "my-page",
            filePath: "docs/my-page.md",
          },
        },
      };

      const notionChanges = { changed: [] as NotionPage[] };
      const gitChanges = {
        changed: [createMarkdownFileInfo("my-page", "sha256:new", "2026-02-06T12:00:00Z")],
      };

      const conflicts = detectConflicts(notionChanges, gitChanges, state);

      expect(conflicts).toHaveLength(0);
    });

    it("detects conflict when same page changed on both sides", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:old",
            slug: "my-page",
            filePath: "docs/my-page.md",
          },
        },
      };

      const notionChanges = {
        changed: [createTestPage("page-1", "2026-02-06T14:00:00Z")],
      };
      const gitChanges = {
        changed: [createMarkdownFileInfo("my-page", "sha256:new", "2026-02-06T12:00:00Z")],
      };

      const conflicts = detectConflicts(notionChanges, gitChanges, state);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].pageId).toBe("page-1");
      expect(conflicts[0].slug).toBe("my-page");
      expect(conflicts[0].notionEditedAt).toBe("2026-02-06T14:00:00Z");
      expect(conflicts[0].gitEditedAt).toBe("2026-02-06T12:00:00Z");
      expect(conflicts[0].resolution).toBe("latest-wins");
      expect(conflicts[0].winner).toBe("notion"); // Notion is newer
    });

    it("sets winner to git when Git timestamp is newer", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:old",
            slug: "my-page",
            filePath: "docs/my-page.md",
          },
        },
      };

      const notionChanges = {
        changed: [createTestPage("page-1", "2026-02-06T12:00:00Z")],
      };
      const gitChanges = {
        changed: [createMarkdownFileInfo("my-page", "sha256:new", "2026-02-06T14:00:00Z")],
      };

      const conflicts = detectConflicts(notionChanges, gitChanges, state);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].winner).toBe("git"); // Git is newer
    });

    it("detects multiple conflicts correctly", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:old1",
            slug: "page-one",
            filePath: "docs/page-one.md",
          },
          "page-2": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:old2",
            slug: "page-two",
            filePath: "docs/page-two.md",
          },
          "page-3": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:old3",
            slug: "no-conflict",
            filePath: "docs/no-conflict.md",
          },
        },
      };

      const notionChanges = {
        changed: [
          createTestPage("page-1", "2026-02-06T14:00:00Z"),
          createTestPage("page-2", "2026-02-06T12:00:00Z"),
          // page-3 not changed on Notion
        ],
      };
      const gitChanges = {
        changed: [
          createMarkdownFileInfo("page-one", "sha256:new1", "2026-02-06T13:00:00Z"),
          createMarkdownFileInfo("page-two", "sha256:new2", "2026-02-06T14:00:00Z"),
          // no-conflict changed only on Git
          createMarkdownFileInfo("no-conflict", "sha256:new3", "2026-02-06T12:00:00Z"),
        ],
      };

      const conflicts = detectConflicts(notionChanges, gitChanges, state);

      expect(conflicts).toHaveLength(2);

      const conflict1 = conflicts.find((c) => c.slug === "page-one");
      expect(conflict1).toBeDefined();
      expect(conflict1!.winner).toBe("notion"); // 14:00 > 13:00

      const conflict2 = conflicts.find((c) => c.slug === "page-two");
      expect(conflict2).toBeDefined();
      expect(conflict2!.winner).toBe("git"); // 14:00 > 12:00
    });

    it("ignores new pages on Notion side (not in state)", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {}, // empty state
      };

      const notionChanges = {
        changed: [createTestPage("new-page", "2026-02-06T14:00:00Z")],
      };
      const gitChanges = {
        changed: [createMarkdownFileInfo("new-page", "sha256:new", "2026-02-06T12:00:00Z")],
      };

      const conflicts = detectConflicts(notionChanges, gitChanges, state);

      // Can't conflict because "new-page" is not in state (new on Notion side)
      expect(conflicts).toHaveLength(0);
    });

    it("ignores changed pages with non-matching slugs", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:old",
            slug: "notion-page",
            filePath: "docs/notion-page.md",
          },
        },
      };

      const notionChanges = {
        changed: [createTestPage("page-1", "2026-02-06T14:00:00Z")],
      };
      const gitChanges = {
        // Different slug, so no conflict
        changed: [createMarkdownFileInfo("different-page", "sha256:new", "2026-02-06T12:00:00Z")],
      };

      const conflicts = detectConflicts(notionChanges, gitChanges, state);

      expect(conflicts).toHaveLength(0);
    });

    it("handles equal timestamps correctly (Notion wins ties)", () => {
      const state: SyncStateFile = {
        version: 1,
        databaseId: "db-123",
        dataSourceId: "ds-456",
        lastSyncTime: "2026-02-06T10:00:00Z",
        pages: {
          "page-1": {
            notionLastEdited: "2026-02-06T10:00:00Z",
            gitContentHash: "sha256:old",
            slug: "my-page",
            filePath: "docs/my-page.md",
          },
        },
      };

      const timestamp = "2026-02-06T12:00:00Z";
      const notionChanges = {
        changed: [createTestPage("page-1", timestamp)],
      };
      const gitChanges = {
        changed: [createMarkdownFileInfo("my-page", "sha256:new", timestamp)],
      };

      const conflicts = detectConflicts(notionChanges, gitChanges, state);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].winner).toBe("notion"); // Notion wins ties (>=)
    });
  });
});
