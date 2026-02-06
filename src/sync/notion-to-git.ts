/**
 * Notion to Git sync — public API re-export.
 *
 * This module provides the public `syncNotionToGit` function that users call.
 * The actual implementation lives in `engine.ts`. This file exists to:
 * 1. Provide a stable import path (`sync/notion-to-git`)
 * 2. Allow future wrapper logic if needed (e.g., telemetry, logging)
 * 3. Keep the public API surface minimal
 */

// Re-export the sync function and options type from the engine
export { syncNotionToGit, type SyncOptions } from "./engine.js";
