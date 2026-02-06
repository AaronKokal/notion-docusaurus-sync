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

import { syncNotionToGit, type SyncOptions } from "./sync/engine.js";
import type { SyncConfig } from "./types.js";

interface CliArgs {
  command: string | null;
  fullSync: boolean;
  outputDir: string;
  help: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    command: null,
    fullSync: false,
    outputDir: "./docs",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--full") {
      result.fullSync = true;
    } else if (arg === "--output" || arg === "-o") {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        result.outputDir = nextArg;
        i++; // Skip the value
      } else {
        console.error("Error: --output requires a directory path");
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
  notion-docusaurus-sync sync [options]

Commands:
  sync    Sync pages from Notion to markdown files

Options:
  --full, -f      Force full re-sync (ignore change detection)
  --output, -o    Output directory for markdown files (default: ./docs)
  --help, -h      Show this help message

Environment Variables (required):
  NOTION_TOKEN        Notion integration token
  NOTION_DATABASE_ID  Database ID to sync from

Examples:
  notion-docusaurus-sync sync
  notion-docusaurus-sync sync --full
  notion-docusaurus-sync sync --output ./my-docs
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
    conflictStrategy: "latest-wins",
    imageStrategy: "local",
    statusProperty: "Status",
    publishedStatus: "Published",
    stateFile: "./.notion-sync-state.json",
  };

  const options: SyncOptions = {
    fullSync: args.fullSync,
    quiet: false,
  };

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
