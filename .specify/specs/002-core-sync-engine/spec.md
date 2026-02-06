# Feature Specification: Core Sync Engine (Notion → Git)

**Feature Branch**: `002-core-sync-engine`
**Created**: 2026-02-06
**Status**: Ready
**Depends on**: 001-research-and-architecture (complete)
**Reference**: `docs/research/architecture-decisions.md` (ADR-002, ADR-003, ADR-008)

## Goal

Build the core Notion → Git sync pipeline: connect to a Notion database, fetch pages and their block content, convert blocks to markdown, map properties to frontmatter, and write `.md` files to an output directory. This is the MVP — a working `notion-docusaurus-sync sync` CLI command that produces Docusaurus-compatible markdown from the test database.

## User Scenarios & Testing

### User Story 1 - Notion Client Wrapper (Priority: P1)

As a developer, I need a Notion API client that handles the SDK v5 dataSources indirection so the rest of the codebase doesn't deal with data source ID resolution.

**Independent Test**: Unit tests for the client wrapper using mocked Notion API responses.

**Acceptance Scenarios**:

1. **Given** a database ID, **When** I call `client.getDataSourceId(databaseId)`, **Then** it returns the data source ID (resolved via `databases.retrieve`)
2. **Given** a data source ID, **When** I call `client.queryPages(dataSourceId)`, **Then** it returns all pages with their properties
3. **Given** a page ID, **When** I call `client.getPageBlocks(pageId)`, **Then** it returns all blocks including nested children (recursive fetch)
4. **Given** rate limiting, **When** multiple requests are made, **Then** the client respects the 3 req/s limit with automatic retry on 429

---

### User Story 2 - Block-to-Markdown Converter (Priority: P1)

As a developer, I need a converter that transforms Notion blocks into Docusaurus-compatible markdown strings.

**Independent Test**: Unit tests for each supported block type with expected markdown output.

**Acceptance Scenarios**:

1. **Given** a paragraph block with inline formatting (bold, italic, code, links), **When** converted, **Then** the output is valid markdown with correct formatting
2. **Given** heading blocks (h1, h2, h3), **When** converted, **Then** the output uses `#`, `##`, `###` syntax
3. **Given** a code block with language, **When** converted, **Then** the output uses fenced code blocks with language annotation
4. **Given** bulleted and numbered list items, **When** converted, **Then** the output uses `-` and `1.` syntax respectively
5. **Given** a callout block, **When** converted, **Then** the output uses Docusaurus admonition syntax (`:::note`, `:::tip`, `:::warning`)
6. **Given** a table block with rows, **When** converted, **Then** the output uses pipe-table markdown syntax
7. **Given** a quote block, **When** converted, **Then** the output uses `>` blockquote syntax
8. **Given** a divider block, **When** converted, **Then** the output is `---`
9. **Given** a toggle block with children, **When** converted, **Then** the output uses `<details><summary>` HTML (Docusaurus supports this)
10. **Given** an image block, **When** converted, **Then** the output is `![alt](url)` with a placeholder URL (image handling is spec 005)
11. **Given** an unsupported block type, **When** converted, **Then** a warning is logged and the block is rendered as a comment or skipped gracefully

---

### User Story 3 - Property-to-Frontmatter Mapper (Priority: P1)

As a developer, I need a mapper that converts Notion database properties into Docusaurus frontmatter YAML.

**Independent Test**: Unit tests with various property types and expected frontmatter output.

**Acceptance Scenarios**:

1. **Given** a page with Name (title), **When** mapped, **Then** frontmatter contains `title: "Page Name"`
2. **Given** a page with Slug (rich_text), **When** mapped, **Then** frontmatter contains `slug: the-slug`
3. **Given** a page with Description (rich_text), **When** mapped, **Then** frontmatter contains `description: "The description"`
4. **Given** a page with Tags (multi_select), **When** mapped, **Then** frontmatter contains `tags: [tag1, tag2]`
5. **Given** a page with Sidebar Position (number), **When** mapped, **Then** frontmatter contains `sidebar_position: 3`
6. **Given** a page with Published Date (date), **When** mapped, **Then** frontmatter contains `date: 2026-02-06`
7. **Given** a page with Category (select), **When** mapped, **Then** frontmatter contains `sidebar_label: Tutorials`
8. **Given** a page with Status = "Draft" or "Archived", **When** synced, **Then** the page is skipped (only "Published" pages are written to disk by default, configurable)

---

### User Story 4 - Sync State Management (Priority: P1)

As a developer, I need sync state tracking so only changed pages are re-synced on subsequent runs.

**Independent Test**: Unit tests for state file read/write and change detection logic.

**Acceptance Scenarios**:

1. **Given** no state file exists, **When** sync runs, **Then** all pages are fetched and a state file is created
2. **Given** a state file exists, **When** a page's `last_edited_time` is newer than the stored value, **Then** that page is re-synced
3. **Given** a state file exists, **When** a page's `last_edited_time` matches the stored value, **Then** that page is skipped
4. **Given** a page exists in state but was deleted from Notion, **When** sync runs, **Then** the corresponding markdown file is deleted and the page is removed from state
5. **Given** the `--full` flag, **When** sync runs, **Then** all pages are re-synced regardless of state

---

### User Story 5 - File Writer (Priority: P1)

As a developer, I need a file writer that creates markdown files in the output directory with correct naming and directory structure.

**Independent Test**: Integration test that writes files and verifies their content.

**Acceptance Scenarios**:

1. **Given** a page with slug "getting-started", **When** written, **Then** the file is `{outputDir}/getting-started.md`
2. **Given** a page with no slug, **When** written, **Then** the filename is derived from the page title (kebab-case)
3. **Given** a page with frontmatter and markdown body, **When** written, **Then** the file contains `---\n{yaml}\n---\n{body}`
4. **Given** the output directory doesn't exist, **When** sync runs, **Then** the directory is created

---

### User Story 6 - CLI Sync Command (Priority: P1)

As a user, I need a `sync` CLI command that orchestrates the full Notion → Git pipeline.

**Independent Test**: E2E test against the test Notion database producing actual markdown files.

**Acceptance Scenarios**:

1. **Given** valid config (token, database ID, output dir), **When** I run `notion-docusaurus-sync sync`, **Then** markdown files appear in the output directory
2. **Given** the test database with 5 pages (3 Published, 1 Draft, 1 Archived), **When** sync runs with default config, **Then** 3 markdown files are written (only Published)
3. **Given** a successful sync, **When** I run sync again without changes, **Then** no files are modified (incremental sync)
4. **Given** invalid config (bad token), **When** I run sync, **Then** a clear error message is displayed

---

### Edge Cases

- Page with empty content (no blocks) → Write file with frontmatter only
- Page title with special characters → Sanitize for filename
- Notion API rate limit hit → Automatic retry with backoff
- Very long page (100+ blocks) → Handle pagination in block fetching
- Nested blocks (toggle children, column children) → Recursive conversion
- Rich text with multiple annotations (bold + italic + link) → Correct markdown nesting

## Requirements

### Functional Requirements

- **FR-001**: Notion client MUST use SDK v5 dataSources API exclusively (per ADR-002)
- **FR-002**: Block converter MUST handle at minimum: paragraph, heading_1/2/3, bulleted_list_item, numbered_list_item, code, quote, callout, divider, table, toggle, image, to_do, bookmark
- **FR-003**: Property mapper MUST handle: title, rich_text, select, multi_select, number, date
- **FR-004**: Sync state MUST persist across runs via a JSON state file
- **FR-005**: File writer MUST produce valid Docusaurus-compatible markdown with YAML frontmatter
- **FR-006**: CLI MUST accept config via environment variables and/or a config file
- **FR-007**: Unsupported block types MUST be handled gracefully (warning + skip or comment)
- **FR-008**: Rate limiting MUST be handled with automatic retry and backoff

### Non-Functional Requirements

- **NFR-001**: Sync of the 5-page test database MUST complete in under 30 seconds
- **NFR-002**: All core modules MUST have unit test coverage
- **NFR-003**: E2E test MUST run against the actual test Notion database

## Architecture

```text
CLI (sync command)
  │
  ├─ Load config (env vars / config file)
  ├─ Initialize Notion client
  ├─ Resolve data source ID (databases.retrieve → data_sources[0].id)
  ├─ Load sync state (or create new)
  │
  ├─ Query all pages (dataSources.query)
  ├─ Detect changed pages (compare last_edited_time)
  │
  ├─ For each changed page:
  │   ├─ Fetch blocks (blocks.children.list, recursive)
  │   ├─ Convert blocks → markdown (block converter)
  │   ├─ Map properties → frontmatter (property mapper)
  │   ├─ Assemble file content (frontmatter + body)
  │   └─ Write to output directory
  │
  ├─ Handle deleted pages (remove files, update state)
  ├─ Save sync state
  └─ Print summary (pages synced, skipped, errors)
```

## File Structure

```text
src/
├── notion/
│   ├── client.ts          # SDK v5 client wrapper (data source resolution, rate limiting)
│   └── types.ts           # Notion-specific type helpers
├── converter/
│   ├── blocks-to-md.ts    # Notion blocks → markdown string
│   ├── properties-to-fm.ts # Notion properties → frontmatter object
│   └── rich-text.ts       # Inline rich text formatting
├── sync/
│   ├── engine.ts          # Main sync orchestrator
│   ├── state.ts           # Sync state file management
│   └── file-writer.ts     # Write markdown files to disk
├── cli.ts                 # CLI entry point (sync command)
├── types.ts               # Shared types (SyncConfig, etc.)
└── index.ts               # Public API exports
```

## Success Criteria

- **SC-001**: `notion-docusaurus-sync sync` produces 3 markdown files from the test database (Published pages only)
- **SC-002**: Generated markdown files are valid Docusaurus docs (correct frontmatter, render in test site)
- **SC-003**: Second sync run with no changes produces no file modifications
- **SC-004**: Unit tests pass for all block types present in the test database
- **SC-005**: E2E test passes against the live test Notion database
