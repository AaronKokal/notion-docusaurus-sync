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

import type { SyncConfig, SyncResult, PageSyncResult, SyncError, PageStateEntry, ConflictRecord, MarkdownFileInfo } from "../types.js";
import type { NotionPage, NotionPageProperty } from "../notion/types.js";
import { NotionClientWrapper } from "../notion/client.js";
import { blocksToMarkdown, type BlockWithChildren } from "../converter/blocks-to-md.js";
import { propertiesToFrontmatter, frontmatterToYaml, richTextToPlainText } from "../converter/properties-to-fm.js";
import { frontmatterToProperties } from "../converter/fm-to-properties.js";
import { mdastToNotionBlocks } from "../converter/md-to-blocks.js";
import { parseMarkdownFile } from "../parser/markdown-parser.js";
import { loadState, saveState, detectChanges, updatePageState, removePageState, computeContentHash, detectGitChanges, findPageBySlug, detectConflicts } from "./state.js";
import { writeMarkdownFile, deleteMarkdownFile, slugFromTitle } from "./file-writer.js";
import { scanMarkdownFiles } from "./file-reader.js";
import { NotionWriter } from "./notion-writer.js";

/**
 * Options for the sync operation.
 */
export interface SyncOptions {
  /** If true, re-sync all pages regardless of change detection */
  fullSync?: boolean;
  /** If true, suppress console output */
  quiet?: boolean;
  /** Page IDs to exclude from Notion → Git sync (used by bidirectional sync for conflict resolution) */
  excludePageIds?: string[];
  /** Slugs to exclude from Git → Notion sync (used by bidirectional sync for conflict resolution) */
  excludeSlugs?: string[];
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

    // Filter out excluded pages (used by bidirectional sync for conflict resolution)
    const excludePageIds = options.excludePageIds ?? [];
    if (excludePageIds.length > 0) {
      const excludeSet = new Set(excludePageIds);
      pagesToSync = pagesToSync.filter((p) => !excludeSet.has(p.id));
      if (!quiet && excludePageIds.length > 0) {
        console.log(`[sync] Excluding ${excludePageIds.length} pages due to conflict resolution`);
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

// =============================================================================
// Git → Notion Sync
// =============================================================================

/**
 * Internal context for Git → Notion sync.
 */
interface GitToNotionContext {
  client: NotionClientWrapper;
  writer: NotionWriter;
  config: SyncConfig;
  options: SyncOptions;
  results: PageSyncResult[];
  errors: SyncError[];
}

/**
 * Syncs markdown files from Git to Notion.
 *
 * This is the reverse direction sync that:
 * 1. Scans the output directory for markdown files
 * 2. Loads sync state
 * 3. Detects which files have changed since last sync
 * 4. For each changed file: parses markdown, converts to Notion blocks/properties, creates/updates page
 * 5. Archives pages for deleted files
 * 6. Saves updated sync state
 * 7. Returns a summary of the sync operation
 *
 * @param config - The sync configuration
 * @param options - Optional sync options (fullSync, quiet)
 * @returns Promise<SyncResult> with gitToNotion results
 *
 * @example
 * ```ts
 * const result = await syncGitToNotion({
 *   notionToken: process.env.NOTION_TOKEN!,
 *   databaseId: "abc123...",
 *   outputDir: "./docs",
 *   stateFile: "./.notion-sync-state.json",
 *   // ... other config
 * });
 *
 * console.log(`Pushed ${result.gitToNotion.length} pages to Notion`);
 * ```
 */
export async function syncGitToNotion(
  config: SyncConfig,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { quiet = false } = options;

  // Initialize result structures
  const results: PageSyncResult[] = [];
  const errors: SyncError[] = [];

  // Create Notion client
  const client = new NotionClientWrapper({ token: config.notionToken });

  try {
    // Step 1: Resolve data source ID
    if (!quiet) console.log("[push] Resolving data source ID...");
    const dataSourceId = await client.getDataSourceId(config.databaseId);

    // Create Notion writer
    const writer = new NotionWriter(client, config.databaseId);

    // Create sync context
    const ctx: GitToNotionContext = { client, writer, config, options, results, errors };

    // Step 2: Load sync state
    if (!quiet) console.log("[push] Loading sync state...");
    const state = await loadState(config.stateFile);

    // Update state with database/data source IDs if this is first sync
    if (!state.databaseId) state.databaseId = config.databaseId;
    if (!state.dataSourceId) state.dataSourceId = dataSourceId;

    // Step 3: Scan output directory for markdown files
    if (!quiet) console.log("[push] Scanning output directory for markdown files...");
    const files = await scanMarkdownFiles(config.outputDir);
    if (!quiet) console.log(`[push] Found ${files.length} markdown files`);

    // Step 4: Detect changes (or sync all in full sync mode)
    let filesToSync: MarkdownFileInfo[];
    let unchangedSlugs: string[];
    let deletedPageIds: string[];

    if (options.fullSync) {
      if (!quiet) console.log("[push] Full sync mode — pushing all files");
      filesToSync = files;
      unchangedSlugs = [];
      // Still detect deleted files even in full sync
      const detection = detectGitChanges(state, files);
      deletedPageIds = detection.deleted;
    } else {
      const detection = detectGitChanges(state, files);
      filesToSync = detection.changed;
      unchangedSlugs = detection.unchanged;
      deletedPageIds = detection.deleted;
      if (!quiet) {
        console.log(`[push] Changes detected: ${filesToSync.length} to push, ${unchangedSlugs.length} unchanged, ${deletedPageIds.length} deleted`);
      }
    }

    // Filter out excluded slugs (used by bidirectional sync for conflict resolution)
    const excludeSlugs = options.excludeSlugs ?? [];
    if (excludeSlugs.length > 0) {
      const excludeSet = new Set(excludeSlugs);
      filesToSync = filesToSync.filter((f) => !excludeSet.has(f.slug));
      if (!quiet && excludeSlugs.length > 0) {
        console.log(`[push] Excluding ${excludeSlugs.length} files due to conflict resolution`);
      }
    }

    // Step 5: Push each changed file
    for (const file of filesToSync) {
      await pushSingleFile(ctx, file, state);
    }

    // Record skipped (unchanged) files
    for (const slug of unchangedSlugs) {
      const existing = findPageBySlug(state, slug);
      if (existing) {
        results.push({
          pageId: existing.pageId,
          slug,
          title: "",
          direction: "git-to-notion",
          action: "skipped",
        });
      }
    }

    // Step 6: Handle deleted files (archive pages)
    for (const pageId of deletedPageIds) {
      await handleDeletedFile(ctx, pageId, state);
    }

    // Step 7: Update sync time and save state
    state.lastSyncTime = new Date().toISOString();
    await saveState(config.stateFile, state);

    if (!quiet) {
      const created = results.filter((r) => r.action === "created").length;
      const updated = results.filter((r) => r.action === "updated").length;
      const archived = results.filter((r) => r.action === "deleted").length;
      const skipped = results.filter((r) => r.action === "skipped").length;
      console.log(`[push] Complete: ${created} created, ${updated} updated, ${archived} archived, ${skipped} skipped`);
      if (errors.length > 0) {
        console.log(`[push] ${errors.length} errors occurred`);
      }
    }
  } catch (error) {
    // Top-level error (e.g., failed to connect, invalid database ID)
    errors.push({
      message: error instanceof Error ? error.message : String(error),
      cause: error,
    });
    if (!quiet) {
      console.error("[push] Fatal error:", error instanceof Error ? error.message : error);
    }
  }

  return {
    notionToGit: [], // Not handled in this direction
    gitToNotion: results,
    conflicts: [], // Conflict detection is for bidirectional sync
    errors,
  };
}

/**
 * Pushes a single markdown file to Notion.
 */
async function pushSingleFile(
  ctx: GitToNotionContext,
  file: MarkdownFileInfo,
  state: import("../types.js").SyncStateFile
): Promise<void> {
  const { writer, config, options, results, errors } = ctx;
  const { quiet = false } = options;

  try {
    if (!quiet) console.log(`[push] Processing: ${file.filePath}`);

    // Step 1: Parse markdown file
    const { frontmatter, ast } = parseMarkdownFile(file.content);

    // Step 2: Get title from frontmatter or derive from slug
    const title = typeof frontmatter.title === "string"
      ? frontmatter.title
      : file.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    // Step 3: Map frontmatter to Notion properties
    const properties = frontmatterToProperties(frontmatter, {
      statusProperty: config.statusProperty,
      publishedStatus: config.publishedStatus,
    });

    // Ensure the page has a title
    if (!properties["Name"]) {
      properties["Name"] = { title: [{ text: { content: title } }] };
    }

    // Set status to published (since it's being pushed from Git)
    if (!properties["Status"] && config.statusProperty && config.publishedStatus) {
      properties[config.statusProperty] = { select: { name: config.publishedStatus } };
    }

    // Ensure slug is set
    if (!properties["Slug"]) {
      properties["Slug"] = { rich_text: [{ text: { content: file.slug } }] };
    }

    // Step 4: Convert mdast to Notion blocks
    const blocks = mdastToNotionBlocks(ast.children);

    // Step 5: Look up existing page by slug
    const existing = findPageBySlug(state, file.slug);

    let pageId: string;
    let action: "created" | "updated";

    if (existing) {
      // Update existing page
      pageId = existing.pageId;
      action = "updated";

      // Update properties
      await writer.updateProperties(pageId, properties);

      // Replace page content
      await writer.replacePageContent(pageId, blocks);

      if (!quiet) console.log(`[push] Updated: ${file.filePath} (page ${pageId})`);
    } else {
      // Create new page
      pageId = await writer.createPage(properties, blocks);
      action = "created";

      if (!quiet) console.log(`[push] Created: ${file.filePath} (page ${pageId})`);
    }

    // Step 6: Update sync state
    const entry: PageStateEntry = {
      notionLastEdited: new Date().toISOString(), // Will be updated on next pull
      gitContentHash: file.contentHash,
      slug: file.slug,
      filePath: file.filePath,
      gitLastModified: file.lastModified,
      notionPageId: pageId,
    };
    updatePageState(state, pageId, entry);

    // Record result
    results.push({
      pageId,
      slug: file.slug,
      title,
      direction: "git-to-notion",
      action,
    });
  } catch (error) {
    errors.push({
      slug: file.slug,
      message: `Failed to push file "${file.filePath}": ${error instanceof Error ? error.message : String(error)}`,
      cause: error,
    });
    if (!quiet) {
      console.error(`[push] Error pushing "${file.filePath}":`, error instanceof Error ? error.message : error);
    }
  }
}

/**
 * Handles a deleted file: archives the corresponding Notion page.
 */
async function handleDeletedFile(
  ctx: GitToNotionContext,
  pageId: string,
  state: import("../types.js").SyncStateFile
): Promise<void> {
  const { writer, options, results, errors } = ctx;
  const { quiet = false } = options;

  const entry = state.pages[pageId];
  if (!entry) return;

  try {
    // Archive the Notion page
    await writer.archivePage(pageId);

    // Remove from state
    removePageState(state, pageId);

    // Record result
    results.push({
      pageId,
      slug: entry.slug,
      title: "",
      direction: "git-to-notion",
      action: "deleted", // "deleted" here means archived in Notion
    });

    if (!quiet) console.log(`[push] Archived: ${entry.filePath} (page ${pageId})`);
  } catch (error) {
    errors.push({
      pageId,
      slug: entry.slug,
      message: `Failed to archive page for deleted file "${entry.filePath}": ${error instanceof Error ? error.message : String(error)}`,
      cause: error,
    });
    if (!quiet) {
      console.error(`[push] Error archiving page for "${entry.filePath}":`, error instanceof Error ? error.message : error);
    }
  }
}

// =============================================================================
// Bidirectional Sync
// =============================================================================

/**
 * Performs bidirectional sync between Notion and Git.
 *
 * This function orchestrates both directions in a single operation:
 * 1. Loads sync state
 * 2. Detects Notion-side changes (query pages, compare timestamps)
 * 3. Detects Git-side changes (scan files, compare hashes)
 * 4. Detects conflicts (pages changed on both sides)
 * 5. Resolves conflicts per `config.conflictStrategy`
 * 6. Pulls Notion → Git for Notion-won pages + non-conflicting Notion changes
 * 7. Pushes Git → Notion for Git-won pages + non-conflicting Git changes
 * 8. Saves state
 * 9. Returns combined SyncResult with both directions + conflict records
 *
 * @param config - The sync configuration
 * @param options - Optional sync options (fullSync, quiet)
 * @returns Promise<SyncResult> with results from both directions and conflicts
 *
 * @example
 * ```ts
 * const result = await syncBidirectional({
 *   notionToken: process.env.NOTION_TOKEN!,
 *   databaseId: "abc123...",
 *   outputDir: "./docs",
 *   stateFile: "./.notion-sync-state.json",
 *   conflictStrategy: "latest-wins",
 *   // ... other config
 * });
 *
 * console.log(`Conflicts resolved: ${result.conflicts.length}`);
 * console.log(`Notion → Git: ${result.notionToGit.length} pages`);
 * console.log(`Git → Notion: ${result.gitToNotion.length} pages`);
 * ```
 */
export async function syncBidirectional(
  config: SyncConfig,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { quiet = false } = options;

  // Initialize result structures
  const allErrors: SyncError[] = [];
  let conflicts: ConflictRecord[] = [];

  try {
    // Create Notion client
    const client = new NotionClientWrapper({ token: config.notionToken });

    // Step 1: Resolve data source ID
    if (!quiet) console.log("[bidirectional] Resolving data source ID...");
    const dataSourceId = await client.getDataSourceId(config.databaseId);

    // Step 2: Load sync state
    if (!quiet) console.log("[bidirectional] Loading sync state...");
    const state = await loadState(config.stateFile);

    // Update state with database/data source IDs if this is first sync
    if (!state.databaseId) state.databaseId = config.databaseId;
    if (!state.dataSourceId) state.dataSourceId = dataSourceId;

    // Step 3: Detect Notion-side changes
    if (!quiet) console.log("[bidirectional] Querying pages from Notion...");
    const allPages = await client.queryPages(dataSourceId);
    const publishedPages = filterPublishedPages(allPages, config);

    let notionChangedPages: NotionPage[];
    if (options.fullSync) {
      notionChangedPages = publishedPages;
    } else {
      const notionDetection = detectChanges(state, publishedPages);
      notionChangedPages = notionDetection.changed;
    }
    if (!quiet) console.log(`[bidirectional] Notion changes: ${notionChangedPages.length} pages`);

    // Step 4: Detect Git-side changes
    if (!quiet) console.log("[bidirectional] Scanning output directory...");
    const files = await scanMarkdownFiles(config.outputDir);

    let gitChangedFiles: MarkdownFileInfo[];
    if (options.fullSync) {
      gitChangedFiles = files;
    } else {
      const gitDetection = detectGitChanges(state, files);
      gitChangedFiles = gitDetection.changed;
    }
    if (!quiet) console.log(`[bidirectional] Git changes: ${gitChangedFiles.length} files`);

    // Step 5: Detect conflicts
    conflicts = detectConflicts(
      { changed: notionChangedPages },
      { changed: gitChangedFiles },
      state
    );

    if (!quiet && conflicts.length > 0) {
      console.log(`[bidirectional] Detected ${conflicts.length} conflict(s)`);
    }

    // Step 6: Resolve conflicts based on strategy
    const notionWonPageIds: string[] = [];
    const gitWonSlugs: string[] = [];

    for (const conflict of conflicts) {
      // Apply conflict resolution strategy
      let winner: "notion" | "git";

      switch (config.conflictStrategy) {
        case "notion-wins":
          winner = "notion";
          break;
        case "git-wins":
          winner = "git";
          break;
        case "latest-wins":
        default:
          // Compare timestamps to determine winner
          const notionTime = new Date(conflict.notionEditedAt).getTime();
          const gitTime = new Date(conflict.gitEditedAt).getTime();
          winner = notionTime >= gitTime ? "notion" : "git";
          break;
      }

      // Update conflict record with resolution
      conflict.resolution = config.conflictStrategy;
      conflict.winner = winner;

      if (winner === "notion") {
        notionWonPageIds.push(conflict.pageId);
        gitWonSlugs.push(conflict.slug); // Exclude from Git→Notion push
        if (!quiet) {
          console.log(`[bidirectional] Conflict "${conflict.slug}": Notion wins (${config.conflictStrategy})`);
        }
      } else {
        gitWonSlugs.push(conflict.slug);
        notionWonPageIds.push(conflict.pageId); // Exclude from Notion→Git pull (wait... this is backwards)
        if (!quiet) {
          console.log(`[bidirectional] Conflict "${conflict.slug}": Git wins (${config.conflictStrategy})`);
        }
      }
    }

    // Build exclusion lists:
    // - For Notion→Git: exclude pages where Git won (Git will push, so don't overwrite)
    // - For Git→Notion: exclude files where Notion won (Notion will be pulled, so don't push)
    const excludeFromNotionPull: string[] = [];  // Page IDs to exclude from Notion→Git
    const excludeFromGitPush: string[] = [];     // Slugs to exclude from Git→Notion

    for (const conflict of conflicts) {
      if (conflict.winner === "git") {
        // Git won: exclude this page from Notion→Git (we'll push Git version instead)
        excludeFromNotionPull.push(conflict.pageId);
      } else {
        // Notion won: exclude this slug from Git→Notion (we'll pull Notion version instead)
        excludeFromGitPush.push(conflict.slug);
      }
    }

    // Step 7: Run Notion → Git sync (excluding Git-won conflicts)
    if (!quiet) console.log("[bidirectional] Running Notion → Git sync...");
    const notionToGitResult = await syncNotionToGit(config, {
      ...options,
      excludePageIds: excludeFromNotionPull,
    });
    allErrors.push(...notionToGitResult.errors);

    // Step 8: Run Git → Notion sync (excluding Notion-won conflicts)
    if (!quiet) console.log("[bidirectional] Running Git → Notion sync...");
    const gitToNotionResult = await syncGitToNotion(config, {
      ...options,
      excludeSlugs: excludeFromGitPush,
    });
    allErrors.push(...gitToNotionResult.errors);

    if (!quiet) {
      const n2g = notionToGitResult.notionToGit;
      const g2n = gitToNotionResult.gitToNotion;
      const n2gCreated = n2g.filter((r) => r.action === "created").length;
      const n2gUpdated = n2g.filter((r) => r.action === "updated").length;
      const g2nCreated = g2n.filter((r) => r.action === "created").length;
      const g2nUpdated = g2n.filter((r) => r.action === "updated").length;
      console.log("[bidirectional] Complete:");
      console.log(`  Notion → Git: ${n2gCreated} created, ${n2gUpdated} updated`);
      console.log(`  Git → Notion: ${g2nCreated} created, ${g2nUpdated} updated`);
      console.log(`  Conflicts resolved: ${conflicts.length}`);
      if (allErrors.length > 0) {
        console.log(`  Errors: ${allErrors.length}`);
      }
    }

    return {
      notionToGit: notionToGitResult.notionToGit,
      gitToNotion: gitToNotionResult.gitToNotion,
      conflicts,
      errors: allErrors,
    };
  } catch (error) {
    // Top-level error
    allErrors.push({
      message: error instanceof Error ? error.message : String(error),
      cause: error,
    });
    if (!quiet) {
      console.error("[bidirectional] Fatal error:", error instanceof Error ? error.message : error);
    }

    return {
      notionToGit: [],
      gitToNotion: [],
      conflicts,
      errors: allErrors,
    };
  }
}
