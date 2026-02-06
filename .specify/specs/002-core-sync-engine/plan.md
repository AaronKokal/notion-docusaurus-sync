# Implementation Plan: Core Sync Engine (Notion → Git)

**Branch**: `002-core-sync-engine` | **Date**: 2026-02-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-core-sync-engine/spec.md`

## Summary

Build the complete Notion → Git sync pipeline: SDK v5 client wrapper with data source resolution and rate limiting, block-to-markdown converter for all specified block types, property-to-frontmatter mapper, incremental sync state management, file writer, and a basic CLI `sync` command. The output is Docusaurus-compatible markdown files generated from the test Notion database.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), ESM
**Primary Dependencies**: `@notionhq/client` v5.9+ (already installed), `yaml` (for frontmatter serialization)
**Storage**: JSON state file (local filesystem)
**Testing**: Vitest (already configured)
**Build**: tsup (already configured)
**Target Platform**: Node.js 20+
**Performance Goals**: Sync of 5-page test database under 30 seconds (NFR-001)
**Constraints**: 3 req/s Notion rate limit, SDK v5 dataSources API mandatory (Constitution VIII)

## Constitution Check

*GATE: Must pass before proceeding. Re-check after design.*

- [x] Principle I: Bidirectional Sync — This spec covers Notion → Git only; types support both directions
- [x] Principle II: Pre-build File-based — Writes .md files to output dir, no Docusaurus plugin
- [x] Principle III: Incremental by Default — State file tracks last_edited_time, only changed pages re-synced
- [x] Principle IV: Page-level Granularity — One page = one file, full page replacement
- [x] Principle V: Image Reliability — Image blocks output placeholder URLs (spec 005 handles downloads)
- [x] Principle VI: Publishable Quality — TypeScript strict, unit tests for all modules
- [x] Principle VII: Start Simple — MVP Notion → Git with basic block types first
- [x] Principle VIII: Latest API — SDK v5 dataSources API exclusively, no legacy REST

## Project Structure

### Documentation (this feature)

```text
.specify/specs/002-core-sync-engine/
├── spec.md              # WHAT and WHY
├── plan.md              # This file - HOW
└── tasks.md             # Executable tasks
```

### Source Code (repository root)

```text
src/
├── notion/
│   ├── client.ts          # SDK v5 client wrapper (data source resolution, rate limiting)
│   └── types.ts           # Notion-specific type helpers and re-exports
├── converter/
│   ├── blocks-to-md.ts    # Notion blocks → markdown string
│   ├── properties-to-fm.ts # Notion properties → frontmatter object
│   └── rich-text.ts       # Inline rich text formatting
├── sync/
│   ├── engine.ts          # Main sync orchestrator
│   ├── state.ts           # Sync state file management
│   └── file-writer.ts     # Write markdown files to disk
├── cli.ts                 # CLI entry point (basic sync command)
├── types.ts               # Shared types (already exists, extend)
└── index.ts               # Public API exports (already exists, extend)

test/
├── unit/
│   ├── notion-client.test.ts
│   ├── blocks-to-md.test.ts
│   ├── rich-text.test.ts
│   ├── properties-to-fm.test.ts
│   ├── sync-state.test.ts
│   └── file-writer.test.ts
├── e2e/
│   └── sync.test.ts          # E2E against live Notion test database
└── connectivity.test.ts       # Already exists
```

**Structure Decision**: Single project layout. Modules under `src/` organized by domain (notion, converter, sync). Tests mirror this in `test/unit/` with an `e2e/` directory for integration tests.

## Research Notes

### Approach Chosen: Custom Block Converter

Build a custom Notion-blocks-to-markdown converter rather than using `notion-to-md` v4.

**Rationale**:
- `notion-to-md` v4 was in alpha as of early 2026 (ADR-006 noted this risk)
- We need Docusaurus-specific output (admonitions, `<details>` for toggles)
- Block type list is well-defined in the spec (13 types)
- Custom converter is easier to test — each block type is a pure function
- No external dependency risk for the core conversion path

### Rate Limiting Strategy

Simple token-bucket approach: track timestamps of recent requests, sleep before making a new request if we'd exceed 3 req/s. Automatic retry on HTTP 429 with exponential backoff (1s, 2s, 4s, max 3 retries).

### Frontmatter Serialization

Use the `yaml` npm package for reliable YAML serialization. Hand-rolling YAML is error-prone with special characters in titles/descriptions.

### CLI Approach (Minimal for Spec 002)

Basic CLI using `process.argv` parsing — just `sync` command with env var config. Full CLI with commander/yargs and config file support is deferred to spec 007. The sync command here is enough to demonstrate the pipeline works.

### Sync State File Format

Per ADR-008:
```json
{
  "version": 1,
  "databaseId": "...",
  "dataSourceId": "...",
  "lastSyncTime": "2026-02-06T12:00:00Z",
  "pages": {
    "page-id-1": {
      "notionLastEdited": "2026-02-06T11:00:00Z",
      "gitContentHash": "sha256:abc123...",
      "slug": "getting-started",
      "filePath": "docs/getting-started.md"
    }
  }
}
```

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| notion-to-md v4 | Less code, community maintained | Alpha, extra dependency, need custom renderers anyway | Risk of instability, limited control |
| commander for CLI | Polished CLI UX | Extra dependency for a basic sync command | Overkill for spec 002; deferred to spec 007 |
| Raw YAML template strings | No dependency | Breaks on special chars, quoting edge cases | Unreliable for user-generated content |

### Open Questions

- [x] Whether to use notion-to-md v4 → Decision: custom converter
- [x] Whether to add `yaml` dependency → Decision: yes, for reliable frontmatter

## Next Steps

1. Create tasks.md with concrete implementation tasks
2. Begin implementation (RALF or manual)
