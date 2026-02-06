/**
 * Sync Engine — Notion to Git Orchestration.
 *
 * Implements the complete Notion → Git sync pipeline:
 * 1. Initialize Notion client
 * 2. Resolve data source ID
 * 3. Load sync state
 * 4. Query pages and detect changes
 * 5. For each changed page: fetch blocks, convert to markdown, write file
 * 6. Handle deleted pages
 * 7. Save state and return summary
 *
 * User Story 6 acceptance scenarios:
 * - Given valid config, `notion-docusaurus-sync sync` produces markdown files
 * - Given 5 pages (3 Published, 1 Draft, 1 Archived), only 3 files are written
 * - Given no changes, second sync modifies no files
 * - Given invalid config, clear error message is displayed
 */

import type { SyncConfig, SyncResult, PageSyncResult, SyncError, PageStateEntry } from "../types.js";
import type { NotionPage, NotionPageProperty } from "../notion/types.js";
import { NotionClientWrapper } from "../notion/client.js";
import { blocksToMarkdown, type BlockWithChildren } from "../converter/blocks-to-md.js";
import { propertiesToFrontmatter, frontmatterToYaml, richTextToPlainText } from "../converter/properties-to-fm.js";
import { loadState, saveState, detectChanges, updatePageState, removePageState, computeContentHash } from "./state.js";
import { writeMarkdownFile, deleteMarkdownFile, slugFromTitle } from "./file-writer.js";

/**
 * Options for the sync operation.
 */
export interface SyncOptions {
  /** If true, re-sync all pages regardless of change detection */
  fullSync?: boolean;
  /** If true, suppress console output */
  quiet?: boolean;
}

/**
 * Internal sync context passed between helper functions.
 */
interface SyncContext {
  client: NotionClientWrapper;
  config: SyncConfig;
  options: SyncOptions;
  results: PageSyncResult[];
  errors: SyncError[];
}

/**
 * Syncs pages from Notion to Git (markdown files).
 *
 * This is the main orchestration function that:
 * 1. Connects to Notion and resolves the data source ID
 * 2. Loads existing sync state (or creates empty state for first sync)
 * 3. Queries all pages from the database
 * 4. Filters to published pages (based on Status property)
 * 5. Detects which pages have changed since last sync
 * 6. For each changed page: fetches blocks, converts to markdown, writes file
 * 7. Deletes files for pages that were removed from Notion
 * 8. Saves updated sync state
 * 9. Returns a summary of the sync operation
 *
 * @param config - The sync configuration
 * @param options - Optional sync options (fullSync, quiet)
 * @returns Promise<SyncResult> with lists of synced pages, conflicts (empty for now), and errors
 *
 * @example
 * ```ts
 * const result = await syncNotionToGit({
 *   notionToken: process.env.NOTION_TOKEN!,
 *   databaseId: "abc123...",
 *   outputDir: "./docs",
 *   stateFile: "./.notion-sync-state.json",
 *   statusProperty: "Status",
 *   publishedStatus: "Published",
 *   // ... other config
 * });
 *
 * console.log(`Synced ${result.notionToGit.length} pages`);
 * ```
 */
export async function syncNotionToGit(
  config: SyncConfig,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { quiet = false } = options;

  // Initialize result structures
  const results: PageSyncResult[] = [];
  const errors: SyncError[] = [];

  // Create Notion client
  const client = new NotionClientWrapper({ token: config.notionToken });

  // Create sync context
  const ctx: SyncContext = { client, config, options, results, errors };

  try {
    // Step 1: Resolve data source ID
    if (!quiet) console.log("[sync] Resolving data source ID...");
    const dataSourceId = await client.getDataSourceId(config.databaseId);

    // Step 2: Load sync state
    if (!quiet) console.log("[sync] Loading sync state...");
    const state = await loadState(config.stateFile);

    // Update state with database/data source IDs if this is first sync
    if (!state.databaseId) state.databaseId = config.databaseId;
    if (!state.dataSourceId) state.dataSourceId = dataSourceId;

    // Step 3: Query all pages
    if (!quiet) console.log("[sync] Querying pages from Notion...");
    const allPages = await client.queryPages(dataSourceId);
    if (!quiet) console.log(`[sync] Found ${allPages.length} total pages in database`);

    // Step 4: Filter to published pages only
    const publishedPages = filterPublishedPages(allPages, config);
    if (!quiet) {
      console.log(`[sync] ${publishedPages.length} pages have status "${config.publishedStatus}"`);
    }

    // Step 5: Detect changes (or sync all in full sync mode)
    let pagesToSync: NotionPage[];
    let unchangedIds: string[];
    let deletedIds: string[];

    if (options.fullSync) {
      if (!quiet) console.log("[sync] Full sync mode — re-syncing all published pages");
      pagesToSync = publishedPages;
      unchangedIds = [];
      // In full sync, we still detect deleted pages
      const detection = detectChanges(state, publishedPages);
      deletedIds = detection.deleted;
    } else {
      const detection = detectChanges(state, publishedPages);
      pagesToSync = detection.changed;
      unchangedIds = detection.unchanged;
      deletedIds = detection.deleted;
      if (!quiet) {
        console.log(`[sync] Changes detected: ${pagesToSync.length} to sync, ${unchangedIds.length} unchanged, ${deletedIds.length} deleted`);
      }
    }

    // Step 6: Sync each changed page
    for (const page of pagesToSync) {
      await syncSinglePage(ctx, page, state);
    }

    // Record skipped (unchanged) pages
    for (const pageId of unchangedIds) {
      const entry = state.pages[pageId];
      if (entry) {
        results.push({
          pageId,
          slug: entry.slug,
          title: "", // We don't have title for skipped pages without refetching
          direction: "notion-to-git",
          action: "skipped",
        });
      }
    }

    // Step 7: Handle deleted pages
    for (const pageId of deletedIds) {
      await handleDeletedPage(ctx, pageId, state);
    }

    // Step 8: Update sync time and save state
    state.lastSyncTime = new Date().toISOString();
    await saveState(config.stateFile, state);

    if (!quiet) {
      const created = results.filter((r) => r.action === "created").length;
      const updated = results.filter((r) => r.action === "updated").length;
      const deleted = results.filter((r) => r.action === "deleted").length;
      const skipped = results.filter((r) => r.action === "skipped").length;
      console.log(`[sync] Complete: ${created} created, ${updated} updated, ${deleted} deleted, ${skipped} skipped`);
      if (errors.length > 0) {
        console.log(`[sync] ${errors.length} errors occurred`);
      }
    }
  } catch (error) {
    // Top-level error (e.g., failed to connect, invalid database ID)
    errors.push({
      message: error instanceof Error ? error.message : String(error),
      cause: error,
    });
    if (!quiet) {
      console.error("[sync] Fatal error:", error instanceof Error ? error.message : error);
    }
  }

  return {
    notionToGit: results,
    gitToNotion: [], // Not implemented in this spec (Git → Notion is spec 006)
    conflicts: [], // No conflict detection in Notion → Git only mode
    errors,
  };
}

/**
 * Filters pages to only those with the published status.
 */
function filterPublishedPages(
  pages: NotionPage[],
  config: SyncConfig
): NotionPage[] {
  return pages.filter((page) => {
    const statusValue = getStatusValue(page, config.statusProperty);
    return statusValue === config.publishedStatus;
  });
}

/**
 * Extracts the status value from a page's properties.
 */
function getStatusValue(page: NotionPage, statusPropertyName: string): string | null {
  const property = page.properties[statusPropertyName] as NotionPageProperty | undefined;
  if (!property) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = property as any;

  if (prop.type === "select" && prop.select) {
    return prop.select.name ?? null;
  }
  if (prop.type === "status" && prop.status) {
    return prop.status.name ?? null;
  }

  return null;
}

/**
 * Syncs a single page: fetches blocks, converts to markdown, writes file.
 */
async function syncSinglePage(
  ctx: SyncContext,
  page: NotionPage,
  state: import("../types.js").SyncStateFile
): Promise<void> {
  const { client, config, options, results, errors } = ctx;
  const { quiet = false } = options;

  try {
    // Get page title for logging
    const title = getPageTitle(page);
    if (!quiet) console.log(`[sync] Processing: ${title}`);

    // Step 1: Fetch blocks
    const blocks = await client.getPageBlocks(page.id);

    // Step 2: Convert blocks to markdown
    const markdownBody = blocksToMarkdown(blocks as BlockWithChildren[]);

    // Step 3: Map properties to frontmatter
    const { frontmatter, shouldPublish } = propertiesToFrontmatter(
      page.properties as Record<string, NotionPageProperty>,
      {
        statusProperty: config.statusProperty,
        publishedStatus: config.publishedStatus,
      }
    );

    // Double-check publish status (should already be filtered, but defensive)
    if (!shouldPublish) {
      if (!quiet) console.log(`[sync] Skipping ${title} — not published`);
      results.push({
        pageId: page.id,
        slug: "",
        title,
        direction: "notion-to-git",
        action: "skipped",
      });
      return;
    }

    // Step 4: Determine slug
    const slug = getPageSlug(page, config.statusProperty) || slugFromTitle(title);

    // Step 5: Serialize frontmatter to YAML
    const frontmatterYaml = frontmatterToYaml(frontmatter);

    // Step 6: Write file
    const filePath = await writeMarkdownFile(
      config.outputDir,
      slug,
      frontmatterYaml,
      markdownBody
    );

    // Step 7: Compute content hash and update state
    const fullContent = frontmatterYaml + "\n" + markdownBody;
    const contentHash = computeContentHash(fullContent);

    const isNew = !state.pages[page.id];
    const entry: PageStateEntry = {
      notionLastEdited: page.last_edited_time,
      gitContentHash: contentHash,
      slug,
      filePath,
    };
    updatePageState(state, page.id, entry);

    // Record result
    results.push({
      pageId: page.id,
      slug,
      title,
      direction: "notion-to-git",
      action: isNew ? "created" : "updated",
    });

    if (!quiet) console.log(`[sync] ${isNew ? "Created" : "Updated"}: ${filePath}`);
  } catch (error) {
    const title = getPageTitle(page);
    errors.push({
      pageId: page.id,
      slug: getPageSlug(page, config.statusProperty) ?? undefined,
      message: `Failed to sync page "${title}": ${error instanceof Error ? error.message : String(error)}`,
      cause: error,
    });
    if (!quiet) {
      console.error(`[sync] Error syncing "${title}":`, error instanceof Error ? error.message : error);
    }
  }
}

/**
 * Handles a deleted page: removes the file and state entry.
 */
async function handleDeletedPage(
  ctx: SyncContext,
  pageId: string,
  state: import("../types.js").SyncStateFile
): Promise<void> {
  const { config, options, results, errors } = ctx;
  const { quiet = false } = options;

  const entry = state.pages[pageId];
  if (!entry) return;

  try {
    // Delete the file
    await deleteMarkdownFile(entry.filePath);

    // Remove from state
    removePageState(state, pageId);

    // Record result
    results.push({
      pageId,
      slug: entry.slug,
      title: "", // We don't have the title for deleted pages
      direction: "notion-to-git",
      action: "deleted",
    });

    if (!quiet) console.log(`[sync] Deleted: ${entry.filePath}`);
  } catch (error) {
    errors.push({
      pageId,
      slug: entry.slug,
      message: `Failed to delete file for page ${pageId}: ${error instanceof Error ? error.message : String(error)}`,
      cause: error,
    });
    if (!quiet) {
      console.error(`[sync] Error deleting "${entry.filePath}":`, error instanceof Error ? error.message : error);
    }
  }
}

/**
 * Extracts the title from a page's properties.
 */
function getPageTitle(page: NotionPage): string {
  // Find the title property (type === "title")
  for (const property of Object.values(page.properties)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prop = property as any;
    if (prop.type === "title" && prop.title) {
      return richTextToPlainText(prop.title);
    }
  }
  return "Untitled";
}

/**
 * Extracts the slug from a page's Slug property (if present).
 */
function getPageSlug(page: NotionPage, statusPropertyName: string): string | null {
  // Look for a property named "Slug" with type "rich_text"
  const slugProperty = page.properties["Slug"];
  if (!slugProperty) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = slugProperty as any;
  if (prop.type === "rich_text" && prop.rich_text) {
    const slug = richTextToPlainText(prop.rich_text);
    return slug || null;
  }

  return null;
}
