/**
 * Core types for the sync engine.
 */

export type ConflictStrategy = "latest-wins" | "notion-wins" | "git-wins";

export type ImageStrategy = "local" | "google-drive" | "custom";

export interface SyncConfig {
  /** Notion integration token */
  notionToken: string;
  /** Notion database ID to sync from */
  databaseId: string;
  /** Output directory for markdown files (e.g., "test-site/docs") */
  outputDir: string;
  /** Output directory for images (e.g., "test-site/static/img") */
  imageDir: string;
  /** Conflict resolution strategy */
  conflictStrategy: ConflictStrategy;
  /** Image handling strategy */
  imageStrategy: ImageStrategy;
  /** Notion property that controls publish status */
  statusProperty: string;
  /** Value of status property that means "published" */
  publishedStatus: string;
  /** Path to sync state file */
  stateFile: string;
}

export interface SyncResult {
  /** Pages synced from Notion to Git */
  notionToGit: PageSyncResult[];
  /** Pages synced from Git to Notion */
  gitToNotion: PageSyncResult[];
  /** Conflicts detected and how they were resolved */
  conflicts: ConflictRecord[];
  /** Errors encountered */
  errors: SyncError[];
}

export interface PageSyncResult {
  pageId: string;
  slug: string;
  title: string;
  direction: "notion-to-git" | "git-to-notion";
  action: "created" | "updated" | "deleted" | "skipped";
}

export interface ConflictRecord {
  pageId: string;
  slug: string;
  notionEditedAt: string;
  gitEditedAt: string;
  resolution: ConflictStrategy;
  winner: "notion" | "git";
}

export interface SyncError {
  pageId?: string;
  slug?: string;
  message: string;
  cause?: unknown;
}

export interface SyncState {
  lastSyncAt: string;
  pages: Record<string, PageState>;
}

export interface PageState {
  pageId: string;
  slug: string;
  notionLastEdited: string;
  gitLastEdited: string;
  contentHash: string;
}
