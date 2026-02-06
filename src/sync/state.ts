/**
 * Sync state management for incremental Notion → Git sync.
 *
 * Tracks which pages have been synced and their last-edited timestamps
 * to enable incremental syncing (only re-sync changed pages).
 *
 * State file format per ADR-008.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type {
  SyncStateFile,
  PageStateEntry,
  MarkdownFileInfo,
  ConflictRecord,
} from "../types.js";
import type { NotionPage } from "../notion/types.js";

/**
 * Current sync state file schema version.
 * Increment when making breaking changes to the state file format.
 */
export const STATE_FILE_VERSION = 1;

/**
 * Create an empty sync state object.
 *
 * Used when no state file exists (first sync) or when the state file
 * is corrupted and cannot be parsed.
 */
export function createEmptyState(): SyncStateFile {
  return {
    version: STATE_FILE_VERSION,
    databaseId: "",
    dataSourceId: "",
    lastSyncTime: "",
    pages: {},
  };
}

/**
 * Load sync state from a JSON file.
 *
 * If the file doesn't exist, returns an empty state (triggers full sync).
 * If the file is corrupted or unparseable, logs a warning and returns
 * an empty state (triggers full sync for safety).
 *
 * @param stateFilePath - Path to the state JSON file
 * @returns The loaded state or an empty state if file doesn't exist/is corrupted
 */
export async function loadState(stateFilePath: string): Promise<SyncStateFile> {
  try {
    const content = await fs.readFile(stateFilePath, "utf-8");
    const parsed = JSON.parse(content) as SyncStateFile;

    // Validate that required fields exist
    if (
      typeof parsed.version !== "number" ||
      typeof parsed.pages !== "object" ||
      parsed.pages === null
    ) {
      console.warn(
        `[sync-state] State file ${stateFilePath} has invalid structure. Starting fresh.`
      );
      return createEmptyState();
    }

    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist - this is normal for first sync
      return createEmptyState();
    }

    // File exists but couldn't be parsed (corrupted JSON, etc.)
    console.warn(
      `[sync-state] Failed to load state file ${stateFilePath}:`,
      error instanceof Error ? error.message : error
    );
    console.warn("[sync-state] Starting fresh sync.");
    return createEmptyState();
  }
}

/**
 * Save sync state to a JSON file atomically.
 *
 * Writes to a temporary file first, then renames to the target path.
 * This prevents corruption if the process is interrupted during write.
 *
 * @param stateFilePath - Path to the state JSON file
 * @param state - The state to save
 */
export async function saveState(
  stateFilePath: string,
  state: SyncStateFile
): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(stateFilePath);
  await fs.mkdir(dir, { recursive: true });

  // Write to temp file first for atomic operation
  const tempPath = `${stateFilePath}.tmp`;
  const content = JSON.stringify(state, null, 2);

  await fs.writeFile(tempPath, content, "utf-8");

  // Rename is atomic on most filesystems
  await fs.rename(tempPath, stateFilePath);
}

/**
 * Result of change detection.
 */
export interface ChangeDetectionResult {
  /** Pages that need to be synced (new or edited since last sync) */
  changed: NotionPage[];
  /** Page IDs that haven't changed (same timestamp as stored) */
  unchanged: string[];
  /** Page IDs that exist in state but were deleted from Notion */
  deleted: string[];
}

/**
 * Detect which pages have changed since the last sync.
 *
 * Compares the `last_edited_time` of each page against the stored
 * `notionLastEdited` timestamp in the state file.
 *
 * @param state - The current sync state
 * @param pages - All pages from the current Notion query
 * @returns Object containing changed, unchanged, and deleted page lists
 */
export function detectChanges(
  state: SyncStateFile,
  pages: NotionPage[]
): ChangeDetectionResult {
  const changed: NotionPage[] = [];
  const unchanged: string[] = [];
  const currentPageIds = new Set<string>();

  for (const page of pages) {
    currentPageIds.add(page.id);
    const storedEntry = state.pages[page.id];

    if (!storedEntry) {
      // New page - not in state
      changed.push(page);
    } else {
      // Compare timestamps
      const pageLastEdited = page.last_edited_time;
      const storedLastEdited = storedEntry.notionLastEdited;

      if (pageLastEdited > storedLastEdited) {
        // Page was edited since last sync
        changed.push(page);
      } else {
        // Page unchanged
        unchanged.push(page.id);
      }
    }
  }

  // Find deleted pages (in state but not in current pages)
  const deleted: string[] = [];
  for (const pageId of Object.keys(state.pages)) {
    if (!currentPageIds.has(pageId)) {
      deleted.push(pageId);
    }
  }

  return { changed, unchanged, deleted };
}

/**
 * Update a single page's state entry.
 *
 * Mutates the provided state object in place.
 *
 * @param state - The sync state to update
 * @param pageId - The Notion page ID
 * @param entry - The new state entry for this page
 */
export function updatePageState(
  state: SyncStateFile,
  pageId: string,
  entry: PageStateEntry
): void {
  state.pages[pageId] = entry;
}

/**
 * Remove a page from the sync state.
 *
 * Called when a page is deleted from Notion.
 * Mutates the provided state object in place.
 *
 * @param state - The sync state to update
 * @param pageId - The Notion page ID to remove
 */
export function removePageState(state: SyncStateFile, pageId: string): void {
  delete state.pages[pageId];
}

/**
 * Compute a SHA-256 hash of content.
 *
 * Used to detect content changes for Git → Notion sync (future).
 * Returns hash in format "sha256:<hex>".
 *
 * @param content - The content to hash
 * @returns Hash string in format "sha256:<hexdigest>"
 */
export function computeContentHash(content: string): string {
  const hash = crypto.createHash("sha256").update(content, "utf-8").digest("hex");
  return `sha256:${hash}`;
}

// =============================================================================
// Git-side Change Detection (for Git → Notion sync)
// =============================================================================

/**
 * Result of Git-side change detection.
 */
export interface GitChangeDetectionResult {
  /** Files that need to be pushed (new or content changed since last sync) */
  changed: MarkdownFileInfo[];
  /** Slugs of files that haven't changed (same content hash as stored) */
  unchanged: string[];
  /** Page IDs that exist in state but have no corresponding file on disk */
  deleted: string[];
}

/**
 * Detect which Git files have changed since the last sync.
 *
 * Compares the content hash of each markdown file against the stored
 * `gitContentHash` in the state file. Uses slug matching to find
 * corresponding pages in state.
 *
 * @param state - The current sync state
 * @param files - All markdown files from the output directory
 * @returns Object containing changed, unchanged, and deleted file lists
 */
export function detectGitChanges(
  state: SyncStateFile,
  files: MarkdownFileInfo[]
): GitChangeDetectionResult {
  const changed: MarkdownFileInfo[] = [];
  const unchanged: string[] = [];
  const seenSlugs = new Set<string>();

  for (const file of files) {
    seenSlugs.add(file.slug);

    // Try to find an existing page in state by slug
    const existingPage = findPageBySlug(state, file.slug);

    if (!existingPage) {
      // New file - not in state
      changed.push(file);
    } else {
      // Compare content hashes
      const storedHash = existingPage.entry.gitContentHash;

      if (file.contentHash !== storedHash) {
        // Content changed since last sync
        changed.push(file);
      } else {
        // Content unchanged
        unchanged.push(file.slug);
      }
    }
  }

  // Find deleted files (pages in state with no corresponding file on disk)
  const deleted: string[] = [];
  for (const [pageId, entry] of Object.entries(state.pages)) {
    if (!seenSlugs.has(entry.slug)) {
      deleted.push(pageId);
    }
  }

  return { changed, unchanged, deleted };
}

/**
 * Find a page entry in the sync state by its slug.
 *
 * Since the state is keyed by page ID, this function searches through
 * all entries to find one with a matching slug. Returns both the page ID
 * and the entry so the caller can use either.
 *
 * @param state - The sync state to search
 * @param slug - The slug to look for
 * @returns The page ID and entry if found, null otherwise
 */
export function findPageBySlug(
  state: SyncStateFile,
  slug: string
): { pageId: string; entry: PageStateEntry } | null {
  for (const [pageId, entry] of Object.entries(state.pages)) {
    if (entry.slug === slug) {
      return { pageId, entry };
    }
  }
  return null;
}

// =============================================================================
// Conflict Detection (for bidirectional sync)
// =============================================================================

/**
 * Input structure for Notion-side changes in conflict detection.
 */
export interface NotionChanges {
  /** Pages that have changed on Notion side since last sync */
  changed: NotionPage[];
}

/**
 * Input structure for Git-side changes in conflict detection.
 */
export interface GitChanges {
  /** Files that have changed on Git side since last sync */
  changed: MarkdownFileInfo[];
}

/**
 * Detect conflicts between Notion and Git changes.
 *
 * A conflict occurs when the same page has been modified on both sides
 * since the last sync. This function identifies such pages by comparing:
 * - Notion's `last_edited_time` against stored `notionLastEdited`
 * - Git file's content hash against stored `gitContentHash`
 *
 * Note: This function does NOT resolve conflicts — it only detects them.
 * Conflict resolution (which side wins) is handled by the sync engine
 * based on the configured conflict strategy.
 *
 * @param notionChanges - Pages that changed on Notion side
 * @param gitChanges - Files that changed on Git side
 * @param state - The current sync state
 * @returns Array of conflict records for pages changed on both sides
 */
export function detectConflicts(
  notionChanges: NotionChanges,
  gitChanges: GitChanges,
  state: SyncStateFile
): ConflictRecord[] {
  const conflicts: ConflictRecord[] = [];

  // Build a map of Notion page ID → changed page for quick lookup
  const notionChangedById = new Map<string, NotionPage>();
  for (const page of notionChanges.changed) {
    notionChangedById.set(page.id, page);
  }

  // Build a map of slug → changed file for quick lookup
  const gitChangedBySlug = new Map<string, MarkdownFileInfo>();
  for (const file of gitChanges.changed) {
    gitChangedBySlug.set(file.slug, file);
  }

  // Find pages that appear in both change sets
  for (const [pageId, notionPage] of notionChangedById) {
    const stateEntry = state.pages[pageId];
    if (!stateEntry) {
      // Page not in state (new on Notion side) — can't conflict with Git
      continue;
    }

    // Check if this page also changed on Git side (by slug)
    const gitFile = gitChangedBySlug.get(stateEntry.slug);
    if (gitFile) {
      // Both sides changed — this is a conflict
      conflicts.push({
        pageId,
        slug: stateEntry.slug,
        notionEditedAt: notionPage.last_edited_time,
        gitEditedAt: gitFile.lastModified,
        // Resolution and winner will be set by the sync engine
        // based on conflict strategy — we leave defaults here
        resolution: "latest-wins",
        winner: determineWinner(notionPage.last_edited_time, gitFile.lastModified),
      });
    }
  }

  return conflicts;
}

/**
 * Determine which side wins based on "latest-wins" strategy.
 *
 * Compares ISO timestamps and returns which side is newer.
 *
 * @param notionEditedAt - Notion's last_edited_time
 * @param gitEditedAt - Git file's lastModified time
 * @returns "notion" if Notion is newer, "git" if Git is newer
 */
function determineWinner(
  notionEditedAt: string,
  gitEditedAt: string
): "notion" | "git" {
  const notionTime = new Date(notionEditedAt).getTime();
  const gitTime = new Date(gitEditedAt).getTime();
  return notionTime >= gitTime ? "notion" : "git";
}
