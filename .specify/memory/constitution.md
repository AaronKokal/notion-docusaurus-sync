# Notion Docusaurus Sync Constitution

## Vision

Build a stable, reproducible, potentially publishable integration that syncs Notion database content to Docusaurus markdown files. The tool should be usable by anyone who wants to use Notion as a CMS for their Docusaurus documentation site.

## Core Principles

### I. Pre-build File-based Sync

Notion content is synced to markdown files in `docs/` before Docusaurus builds. We do NOT create a custom Docusaurus content plugin that bypasses `plugin-content-docs`. The standard docs pipeline (sidebars, pagination, TOC, search, versioning) is too valuable to replicate.

**Enforced**: The sync tool writes `.md`/`.mdx` files to a configurable output directory. Docusaurus processes them as regular docs.

### II. Incremental by Default

Every sync operation should be incremental -- only fetch and regenerate pages that changed. Full re-sync is available as a flag, not the default.

**Enforced**: Sync state (page ID to last-edited-time mapping) is persisted locally. Notion webhooks or `last_edited_time` comparisons drive change detection.

### III. Image Reliability

Notion S3 image URLs expire (~1 hour). All images are downloaded locally during sync and stored with content-hash filenames for deduplication.

**Enforced**: No Notion-hosted image URLs appear in output markdown. All images reference local paths.

### IV. Publishable Quality

This project aims for npm-publishable quality. Code must be clean, well-tested, documented, and configurable enough for diverse use cases.

**Enforced**: TypeScript strict mode, tests for core logic, documented configuration, semver releases.

### V. Start Simple, Grow Deliberately

MVP first: internal integration, CLI sync, basic block types. OAuth/public integration, webhooks, advanced blocks come later.

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

- Unit tests for block-to-markdown conversion (core business logic)
- Integration tests for Notion API interactions (mocked)
- E2E tests for full sync pipeline (against a test Notion database)

### Deployment

- npm package published to registry
- CLI entry point via `npx notion-docusaurus-sync`
- CI via GitHub Actions

## Technology Stack

- **Primary Language**: TypeScript (strict mode)
- **Runtime**: Node.js 20+
- **Notion SDK**: `@notionhq/client` (official)
- **Markdown Conversion**: `notion-to-md` v4 (with custom renderers) or custom
- **Testing**: Vitest
- **Build**: tsup or similar
- **Package Manager**: npm
- **Linting**: ESLint + Prettier

## Architecture Overview

```text
Notion Database
    |
    v
[Sync Engine]
    |-- Query database (filter by Status = Published)
    |-- Fetch page blocks recursively
    |-- Download images to local storage
    |
    v
[Converter]
    |-- Notion blocks -> Markdown/MDX
    |-- Notion properties -> YAML frontmatter
    |-- Callouts -> Docusaurus admonitions
    |-- Code blocks -> fenced code with language
    |
    v
[File Writer]
    |-- Write .md/.mdx to docs/ directory
    |-- Write images to static/img/ directory
    |-- Generate _category_.json for sidebar categories
    |
    v
[Docusaurus Build] (standard pipeline)
```

## Roadmap (Spec Sequence)

1. **001-research-and-architecture** -- Deep research, architecture decisions, technology evaluation
2. **002-core-sync-engine** -- Notion API client, database querying, page fetching, sync state
3. **003-block-converter** -- Notion block types to Markdown/MDX conversion
4. **004-frontmatter-mapping** -- Notion properties to Docusaurus frontmatter
5. **005-image-handling** -- Image download, deduplication, local storage
6. **006-cli-interface** -- CLI tool with config file support
7. **007-webhook-support** -- Real-time sync via Notion webhooks
8. **008-oauth-public-integration** -- OAuth flow for distributable tool

## Governance

This constitution supersedes conflicting practices. Amendments require:
1. Issue/spec documenting the change
2. PR with updated constitution
3. Review and approval

**Version**: 1.0.0 | **Created**: 2026-02-06 | **Last Amended**: 2026-02-06
