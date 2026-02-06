/**
 * Git to Notion sync — public API re-export.
 *
 * This module provides the public `syncGitToNotion` function that users call.
 * The actual implementation lives in `engine.ts`. This file exists to:
 * 1. Provide a stable import path (`sync/git-to-notion`)
 * 2. Allow future wrapper logic if needed (e.g., telemetry, logging)
 * 3. Keep the public API surface minimal
 */

// Re-export the sync function from the engine
export { syncGitToNotion } from "./engine.js";
