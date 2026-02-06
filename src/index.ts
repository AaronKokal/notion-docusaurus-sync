/**
 * notion-docusaurus-sync
 *
 * Bidirectional sync between Notion databases and Docusaurus markdown files.
 */

// Core sync functions
export { syncNotionToGit, type SyncOptions } from "./sync/notion-to-git.js";
export { syncGitToNotion } from "./sync/git-to-notion.js";

// Notion client wrapper (for advanced use cases)
export { NotionClientWrapper, type NotionClientConfig } from "./notion/client.js";

// Converters (for custom pipelines)
export { blocksToMarkdown, type BlockWithChildren } from "./converter/blocks-to-md.js";
export {
  propertiesToFrontmatter,
  frontmatterToYaml,
  richTextToPlainText,
  type PropertyMapperConfig,
  type FrontmatterResult,
} from "./converter/properties-to-fm.js";

// Types
export type { SyncConfig, SyncResult, PageSyncResult, SyncError } from "./types.js";
