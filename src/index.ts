/**
 * notion-docusaurus-sync
 *
 * Bidirectional sync between Notion databases and Docusaurus markdown files.
 *
 * @packageDocumentation
 */

// =============================================================================
// Core Sync Functions
// =============================================================================

/**
 * Main sync function: Notion → Git (markdown files)
 */
export { syncNotionToGit, type SyncOptions } from "./sync/notion-to-git.js";

/**
 * Stub for Git → Notion sync (to be implemented in spec 006)
 */
export { syncGitToNotion } from "./sync/git-to-notion.js";

// =============================================================================
// Notion Client Wrapper (for advanced use cases)
// =============================================================================

export {
  NotionClientWrapper,
  NotionRateLimitError,
  type NotionClientConfig,
} from "./notion/client.js";

// =============================================================================
// Converters (for custom pipelines)
// =============================================================================

/**
 * Block-to-markdown converter
 */
export { blocksToMarkdown, type BlockWithChildren } from "./converter/blocks-to-md.js";

/**
 * Property-to-frontmatter mapper
 */
export {
  propertiesToFrontmatter,
  frontmatterToYaml,
  richTextToPlainText,
  type PropertyMapperConfig,
  type FrontmatterResult,
} from "./converter/properties-to-fm.js";

/**
 * Rich text to markdown converter
 */
export { richTextToMarkdown } from "./converter/rich-text.js";

/**
 * Markdown-to-Notion converters (Git → Notion direction)
 */
export { frontmatterToProperties } from "./converter/fm-to-properties.js";
// Note: mdastToNotionBlocks and phrasesToRichText are not exported from index.ts
// due to mdast directive type compatibility issues with TypeScript declarations.
// Import directly from "./converter/md-to-blocks.js" or "./converter/md-to-rich-text.js".

// =============================================================================
// Sync State Management (for advanced use cases)
// =============================================================================

export {
  loadState,
  saveState,
  createEmptyState,
  detectChanges,
  updatePageState,
  removePageState,
  computeContentHash,
  STATE_FILE_VERSION,
  type ChangeDetectionResult,
} from "./sync/state.js";

// =============================================================================
// File Writer Utilities
// =============================================================================

export {
  writeMarkdownFile,
  deleteMarkdownFile,
  slugFromTitle,
} from "./sync/file-writer.js";

/**
 * File Reader for Git → Notion sync
 */
export { scanMarkdownFiles } from "./sync/file-reader.js";

/**
 * Notion Page Writer for Git → Notion sync
 */
export { NotionWriter } from "./sync/notion-writer.js";

// =============================================================================
// Core Types
// =============================================================================

export type {
  // Sync configuration and results
  SyncConfig,
  SyncResult,
  PageSyncResult,
  SyncError,
  ConflictRecord,
  ConflictStrategy,
  ImageStrategy,
  // Sync state file types (ADR-008)
  SyncState,
  PageState,
  SyncStateFile,
  PageStateEntry,
  // Git → Notion types (spec 006)
  MarkdownFileInfo,
  NotionBlockPayload,
  FrontmatterToPropertiesConfig,
} from "./types.js";

// =============================================================================
// Notion Type Helpers (re-exported from SDK for convenience)
// =============================================================================

export type {
  // Page and block aliases
  NotionPage,
  NotionBlock,
  NotionRichText,
  NotionProperty,
  NotionPageProperty,
  NotionBlockType,
  NotionPropertyType,
  // Query result types
  NotionQueryResult,
  NotionBlocksResult,
  // Database with data sources
  DatabaseWithDataSources,
} from "./notion/types.js";

export {
  // SDK helper functions
  isFullPage,
  isFullBlock,
  isFullDatabase,
  isFullDataSource,
  isFullPageOrDataSource,
  collectPaginatedAPI,
  iteratePaginatedAPI,
  // Data source helper
  getDataSourcesFromDatabase,
  // SDK Client class
  Client,
} from "./notion/types.js";
