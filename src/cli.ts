#!/usr/bin/env node

/**
 * CLI entry point for notion-docusaurus-sync.
 *
 * Basic sync command supporting:
 * - `sync` subcommand to run Notion → Git sync
 * - `--full` flag to force full re-sync
 * - `--output <dir>` to override output directory
 *
 * Configuration via environment variables:
 * - NOTION_TOKEN (required): Notion integration token
 * - NOTION_DATABASE_ID (required): Database ID to sync from
 *
 * Full CLI with more options will be implemented in spec 007.
 */

import { syncNotionToGit, syncGitToNotion, syncBidirectional, type SyncOptions } from "./sync/engine.js";
import type { SyncConfig, ConflictStrategy } from "./types.js";

interface CliArgs {
  command: string | null;
  fullSync: boolean;
  bidirectional: boolean;
  outputDir: string;
  conflictStrategy: ConflictStrategy;
  help: boolean;
}

const VALID_CONFLICT_STRATEGIES: ConflictStrategy[] = ["latest-wins", "notion-wins", "git-wins"];

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    command: null,
    fullSync: false,
    bidirectional: false,
    outputDir: "./docs",
    conflictStrategy: "latest-wins",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--full") {
      result.fullSync = true;
    } else if (arg === "--bidirectional" || arg === "-b") {
      result.bidirectional = true;
    } else if (arg === "--output" || arg === "-o") {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        result.outputDir = nextArg;
        i++; // Skip the value
      } else {
        console.error("Error: --output requires a directory path");
        process.exit(1);
      }
    } else if (arg === "--conflict") {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        if (VALID_CONFLICT_STRATEGIES.includes(nextArg as ConflictStrategy)) {
          result.conflictStrategy = nextArg as ConflictStrategy;
        } else {
          console.error(`Error: --conflict must be one of: ${VALID_CONFLICT_STRATEGIES.join(", ")}`);
          process.exit(1);
        }
        i++; // Skip the value
      } else {
        console.error(`Error: --conflict requires a strategy (${VALID_CONFLICT_STRATEGIES.join(", ")})`);
        process.exit(1);
      }
    } else if (!arg.startsWith("-") && !result.command) {
      result.command = arg;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
notion-docusaurus-sync - Sync Notion databases to Docusaurus markdown

Usage:
  notion-docusaurus-sync <command> [options]

Commands:
  sync    Sync pages from Notion to markdown files (pull)
          Use --bidirectional for two-way sync
  push    Push markdown files to Notion (Git → Notion)

Options:
  --full              Force full sync (ignore change detection)
  --bidirectional, -b Enable bidirectional sync (both Notion↔Git)
                      Only applies to 'sync' command
  --output, -o        Output directory for markdown files (default: ./docs)
  --conflict          Conflict resolution strategy (default: latest-wins)
                      Values: latest-wins, notion-wins, git-wins
  --help, -h          Show this help message

Environment Variables (required):
  NOTION_TOKEN        Notion integration token
  NOTION_DATABASE_ID  Database ID to sync from

Examples:
  notion-docusaurus-sync sync
  notion-docusaurus-sync sync --full
  notion-docusaurus-sync sync --bidirectional
  notion-docusaurus-sync sync --bidirectional --conflict notion-wins
  notion-docusaurus-sync sync --output ./my-docs
  notion-docusaurus-sync push
  notion-docusaurus-sync push --full
  notion-docusaurus-sync push --conflict git-wins
`);
}

function validateConfig(): { token: string; databaseId: string } | null {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  const errors: string[] = [];

  if (!token) {
    errors.push("NOTION_TOKEN environment variable is not set");
  }

  if (!databaseId) {
    errors.push("NOTION_DATABASE_ID environment variable is not set");
  }

  if (errors.length > 0) {
    console.error("Configuration error:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    console.error("\nSet these environment variables and try again.");
    console.error("Run with --help for more information.");
    return null;
  }

  return { token: token!, databaseId: databaseId! };
}

async function runSync(args: CliArgs): Promise<void> {
  // Validate configuration
  const configValues = validateConfig();
  if (!configValues) {
    process.exit(1);
  }

  // Build sync configuration
  const config: SyncConfig = {
    notionToken: configValues.token,
    databaseId: configValues.databaseId,
    outputDir: args.outputDir,
    imageDir: `${args.outputDir}/../static/img`, // Default image directory
    conflictStrategy: args.conflictStrategy,
    imageStrategy: "local",
    statusProperty: "Status",
    publishedStatus: "Published",
    stateFile: "./.notion-sync-state.json",
  };

  const options: SyncOptions = {
    fullSync: args.fullSync,
    quiet: false,
  };

  if (args.bidirectional) {
    // Bidirectional sync mode
    console.log("Starting bidirectional sync...");
    console.log(`  Database: ${config.databaseId}`);
    console.log(`  Output: ${config.outputDir}`);
    console.log(`  Mode: ${args.fullSync ? "full" : "incremental"}`);
    console.log(`  Conflict strategy: ${config.conflictStrategy}`);
    console.log("");

    try {
      const result = await syncBidirectional(config, options);

      // Print summary for Notion → Git
      const n2gCreated = result.notionToGit.filter((r) => r.action === "created").length;
      const n2gUpdated = result.notionToGit.filter((r) => r.action === "updated").length;
      const n2gDeleted = result.notionToGit.filter((r) => r.action === "deleted").length;
      const n2gSkipped = result.notionToGit.filter((r) => r.action === "skipped").length;

      // Print summary for Git → Notion
      const g2nCreated = result.gitToNotion.filter((r) => r.action === "created").length;
      const g2nUpdated = result.gitToNotion.filter((r) => r.action === "updated").length;
      const g2nArchived = result.gitToNotion.filter((r) => r.action === "deleted").length;
      const g2nSkipped = result.gitToNotion.filter((r) => r.action === "skipped").length;

      console.log("");
      console.log("Bidirectional sync complete:");
      console.log("");
      console.log("  Notion → Git:");
      console.log(`    Created: ${n2gCreated}`);
      console.log(`    Updated: ${n2gUpdated}`);
      console.log(`    Deleted: ${n2gDeleted}`);
      console.log(`    Skipped: ${n2gSkipped}`);
      console.log("");
      console.log("  Git → Notion:");
      console.log(`    Created: ${g2nCreated}`);
      console.log(`    Updated: ${g2nUpdated}`);
      console.log(`    Archived: ${g2nArchived}`);
      console.log(`    Skipped: ${g2nSkipped}`);

      // Print conflicts if any
      if (result.conflicts.length > 0) {
        console.log("");
        console.log(`  Conflicts resolved: ${result.conflicts.length}`);
        for (const conflict of result.conflicts) {
          const winner = conflict.winner === "notion" ? "Notion" : "Git";
          console.log(`    - "${conflict.slug}": ${winner} wins (${conflict.resolution})`);
        }
      }

      if (result.errors.length > 0) {
        console.log("");
        console.log(`  Errors: ${result.errors.length}`);
        for (const error of result.errors) {
          console.error(`    - ${error.message}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error("Bidirectional sync failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  } else {
    // Notion → Git only (default sync behavior)
    console.log("Starting Notion → Git sync...");
    console.log(`  Database: ${config.databaseId}`);
    console.log(`  Output: ${config.outputDir}`);
    console.log(`  Mode: ${args.fullSync ? "full" : "incremental"}`);
    console.log("");

    try {
      const result = await syncNotionToGit(config, options);

      // Print summary
      const created = result.notionToGit.filter((r) => r.action === "created").length;
      const updated = result.notionToGit.filter((r) => r.action === "updated").length;
      const deleted = result.notionToGit.filter((r) => r.action === "deleted").length;
      const skipped = result.notionToGit.filter((r) => r.action === "skipped").length;

      console.log("");
      console.log("Sync complete:");
      console.log(`  Created: ${created}`);
      console.log(`  Updated: ${updated}`);
      console.log(`  Deleted: ${deleted}`);
      console.log(`  Skipped: ${skipped}`);

      if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.length}`);
        for (const error of result.errors) {
          console.error(`    - ${error.message}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error("Sync failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }
}

async function runPush(args: CliArgs): Promise<void> {
  // Validate configuration
  const configValues = validateConfig();
  if (!configValues) {
    process.exit(1);
  }

  // Build sync configuration
  const config: SyncConfig = {
    notionToken: configValues.token,
    databaseId: configValues.databaseId,
    outputDir: args.outputDir,
    imageDir: `${args.outputDir}/../static/img`, // Default image directory
    conflictStrategy: args.conflictStrategy,
    imageStrategy: "local",
    statusProperty: "Status",
    publishedStatus: "Published",
    stateFile: "./.notion-sync-state.json",
  };

  const options: SyncOptions = {
    fullSync: args.fullSync,
    quiet: false,
  };

  console.log("Starting Git → Notion push...");
  console.log(`  Database: ${config.databaseId}`);
  console.log(`  Source: ${config.outputDir}`);
  console.log(`  Mode: ${args.fullSync ? "full" : "incremental"}`);
  console.log(`  Conflict strategy: ${config.conflictStrategy}`);
  console.log("");

  try {
    const result = await syncGitToNotion(config, options);

    // Print summary
    const created = result.gitToNotion.filter((r) => r.action === "created").length;
    const updated = result.gitToNotion.filter((r) => r.action === "updated").length;
    const archived = result.gitToNotion.filter((r) => r.action === "deleted").length;
    const skipped = result.gitToNotion.filter((r) => r.action === "skipped").length;

    console.log("");
    console.log("Push complete:");
    console.log(`  Created: ${created}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Archived: ${archived}`);
    console.log(`  Skipped: ${skipped}`);

    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      for (const error of result.errors) {
        console.error(`    - ${error.message}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error("Push failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  // Skip node and script path
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.command) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  switch (args.command) {
    case "sync":
      await runSync(args);
      break;
    case "push":
      await runPush(args);
      break;
    default:
      console.error(`Unknown command: ${args.command}`);
      console.error("Run with --help for usage information.");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
