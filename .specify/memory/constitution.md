# Notion Docusaurus Sync Constitution

## Vision

Build a stable, reproducible, commercially viable **bidirectional sync engine** between Notion databases and markdown files in a git repository. Docusaurus is the primary consumer of those markdown files, but the core value is the Notion-to-Git sync itself. The tool should be usable by anyone who wants to use Notion as a CMS for their Docusaurus documentation site -- and vice versa, allowing developers to edit docs in their repo and have changes reflected in Notion. The long-term goal includes publishing as an npm package, potentially offering it as a professional product/integration.

## Core Principles

### I. Bidirectional Sync, Simple Conflict Rules

The sync engine works in both directions:
- **Notion → Git**: Notion pages are converted to markdown files and committed to the repo.
- **Git → Notion**: Markdown file changes are parsed back into Notion blocks and pushed to the corresponding page.

Conflict resolution follows strict, configurable rules -- not complex merge strategies:
- **Option A (default)**: Latest edit wins (compare `last_edited_time` on both sides)
- **Option B**: One platform always wins (configurable: "notion-wins" or "git-wins")

**Enforced**: Every sync run checks both sides for changes. Conflicts are resolved by the configured rule, logged, and never silently dropped.

### II. Pre-build File-based Architecture

Docusaurus is a consumer, not part of the sync engine. Notion content is synced to markdown files in `docs/` before Docusaurus builds. We do NOT create a custom Docusaurus content plugin.

**Enforced**: The sync tool writes `.md`/`.mdx` files to a configurable output directory. Docusaurus processes them as regular docs.

### III. Incremental by Default

Every sync operation is incremental -- only fetch and regenerate pages that actually changed. Full re-sync is available as a flag, not the default.

**Enforced**: Sync state (page ID to last-edited-time mapping, file hashes) is persisted locally. Notion webhooks or `last_edited_time` comparisons drive change detection.

### IV. Page-level Sync Granularity

The unit of sync is a **page** (one Notion page = one markdown file). Block-level diffing is a future optimization, not a requirement. Since best practices keep pages reasonably sized, page-level replacement is pragmatically sufficient.

**Enforced**: When a page changes on either side, the entire page is re-synced. The sync engine does not attempt block-level merging.

### V. Image Reliability (Pluggable Strategy)

Notion S3 image URLs expire (~1 hour). Images must be handled reliably. The image handler is a pluggable strategy:
- **Local download** (default): Download to `static/img/`, content-hash filenames for deduplication
- **Google Drive**: Store in a shared Drive folder, reference stable sharing URLs (proven pattern for personal/team use)
- **Custom**: User provides their own image resolver

**Enforced**: No Notion-hosted S3 URLs appear in output markdown. All images use stable references.

### VI. Publishable Quality

This project aims for npm-publishable quality. Code must be clean, well-tested, documented, and configurable enough for diverse use cases.

**Enforced**: TypeScript strict mode, tests for core logic, documented configuration, semver releases.

### VII. Start Simple, Grow Deliberately

MVP first: Notion → Git direction with internal integration, CLI sync, basic block types. Git → Notion direction, OAuth/public integration, webhooks, advanced blocks come later.

**Enforced**: Each spec delivers a standalone, testable increment of value.

## Development Workflow

### Spec-Driven Development

1. Issue created (GitHub)
2. `/speckit.specify` creates specification
3. `/speckit.plan` creates technical plan
4. `/speckit.tasks` generates task breakdown
5. `/speckit.implement` or `./ralph start` executes tasks
6. PR reviewed and merged

### Testing Requirements

- Unit tests for block-to-markdown and markdown-to-block conversion
- Integration tests for Notion API interactions (mocked)
- E2E tests for full bidirectional sync pipeline (against a test Notion database)

### Deployment

- npm package published to registry
- CLI entry point via `npx notion-docusaurus-sync`
- CI via GitHub Actions

### VIII. Latest API, Future-Proof Foundations

This tool targets commercial viability and long-term maintenance. All Notion API interactions MUST use the latest official SDK (`@notionhq/client` v5+) and the current API version. No legacy REST endpoint fallbacks (e.g., `Notion-Version: 2022-06-28`) unless the latest SDK has a confirmed, unresolvable bug.

**Rationale**: Older API versions may be deprecated. Building on them creates invisible technical debt. The `dataSources` API is Notion's current direction — we follow it even when the older `databases/query` endpoint would be simpler today.

**Enforced**: All Notion API calls go through the official SDK. The data source ID resolution pattern (`databases.retrieve` → `data_sources[0].id` → `dataSources.query`) is the standard flow. Cache data source IDs per sync run.

## Technology Stack

- **Primary Language**: TypeScript (strict mode)
- **Runtime**: Node.js 20+
- **Notion SDK**: `@notionhq/client` v5+ (latest API version, `dataSources` API)
- **Markdown Conversion (Notion → MD)**: `notion-to-md` v4 (with custom renderers) or custom
- **Markdown Parsing (MD → Notion)**: `unified`/`remark` AST pipeline (to evaluate in research)
- **Testing**: Vitest
- **Build**: tsup or similar
- **Package Manager**: npm
- **Linting**: ESLint + Prettier

## Architecture Overview

```text
                    Notion Database
                         |
            +------------+------------+
            |                         |
            v                         ^
   [Notion → Git Sync]      [Git → Notion Sync]
            |                         |
            v                         ^
   [Block Converter]         [MD Parser]
   Notion blocks → MD        MD AST → Notion blocks
   Properties → frontmatter  Frontmatter → properties
            |                         |
            v                         ^
   [File Writer]             [File Reader]
   Write .md to docs/        Read .md from docs/
   Download images            Upload images
            |                         |
            v                         ^
       docs/ folder (Git repo)
            |
            v
   [Docusaurus Build] (standard pipeline, separate concern)
```

## Conflict Resolution Detail

```text
Sync triggered (cron, webhook, or manual)
    |
    v
Compare last_edited_time for each page:
    |
    +-- Only Notion changed → Notion → Git (normal)
    +-- Only Git changed → Git → Notion (normal)
    +-- Both changed → CONFLICT
            |
            +-- "latest-wins": Compare timestamps, newer overwrites older
            +-- "notion-wins": Notion always takes precedence
            +-- "git-wins": Git always takes precedence
            |
            v
        Log conflict and resolution, proceed
```

## Roadmap (Spec Sequence)

1. **001-research-and-architecture** -- Deep research, architecture decisions, technology evaluation (including bidirectional sync patterns, markdown-to-Notion conversion)
2. **002-core-sync-engine** -- Notion API client, database querying, page fetching, sync state tracking
3. **003-notion-to-md-converter** -- Notion block types to Markdown/MDX conversion
4. **004-frontmatter-mapping** -- Bidirectional Notion properties ↔ Docusaurus frontmatter
5. **005-image-handling** -- Pluggable image strategy (local download, Google Drive, custom)
6. **006-md-to-notion-converter** -- Markdown parsing back to Notion blocks (Git → Notion direction)
7. **007-cli-interface** -- CLI tool with config file, conflict resolution rules
8. **008-webhook-support** -- Real-time sync via Notion webhooks
9. **009-ci-cd-integration** -- GitHub Actions workflow for automated sync on push/schedule
10. **010-oauth-public-integration** -- OAuth flow for distributable tool

## Governance

This constitution supersedes conflicting practices. Amendments require:

1. Issue/spec documenting the change
2. PR with updated constitution
3. Review and approval

**Version**: 2.1.0 | **Created**: 2026-02-06 | **Last Amended**: 2026-02-06
