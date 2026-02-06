# Feature Specification: Markdown-to-Notion Converter (Git → Notion)

**Feature Branch**: `006-md-to-notion-converter`
**Created**: 2026-02-06
**Status**: Draft
**Depends on**: 002-core-sync-engine (complete)
**Reference**: `docs/research/architecture-decisions.md` (ADR-004, ADR-007, ADR-008)

## Goal

Build the reverse sync direction: read markdown files from the output directory, parse frontmatter and content, convert to Notion blocks and properties, and create or update pages in the Notion database. This completes the bidirectional sync loop. The sync engine will detect which side changed, apply the configured conflict resolution strategy, and push Git-side changes to Notion.

## User Scenarios & Testing

### User Story 1 - Markdown Parser (Priority: P1)

As a developer, I need a markdown parser that converts markdown content into an AST (mdast) suitable for transformation to Notion blocks.

**Why this priority**: This is the foundational layer — nothing else works without parsing markdown first.

**Independent Test**: Unit tests parsing various markdown constructs into expected AST nodes.

**Acceptance Scenarios**:

1. **Given** a markdown string with headings (h1-h3), **When** parsed, **Then** the AST contains heading nodes with correct depth
2. **Given** a markdown string with inline formatting (bold, italic, code, strikethrough, links), **When** parsed, **Then** the AST contains emphasis/strong/inlineCode/delete/link nodes
3. **Given** a markdown string with code blocks (fenced, with language), **When** parsed, **Then** the AST contains code nodes with lang metadata
4. **Given** a markdown string with lists (bulleted, numbered, nested), **When** parsed, **Then** the AST contains list/listItem nodes with correct nesting
5. **Given** a markdown string with blockquotes, **When** parsed, **Then** the AST contains blockquote nodes
6. **Given** a markdown string with tables (pipe syntax), **When** parsed, **Then** the AST contains table/tableRow/tableCell nodes
7. **Given** a markdown string with Docusaurus admonitions (`:::note`, `:::tip`, `:::warning`, `:::danger`, `:::info`), **When** parsed, **Then** the AST contains custom directive nodes (via remark-directive)
8. **Given** a markdown string with `<details><summary>` toggles, **When** parsed, **Then** the AST contains html nodes that can be identified as toggles
9. **Given** a markdown string with images (`![alt](url)`), **When** parsed, **Then** the AST contains image nodes
10. **Given** a markdown string with thematic breaks (`---`), **When** parsed, **Then** the AST contains thematicBreak nodes
11. **Given** a markdown string with task lists (`- [ ]`, `- [x]`), **When** parsed, **Then** the AST contains listItem nodes with checked property

---

### User Story 2 - AST-to-Notion Block Transformer (Priority: P1)

As a developer, I need a transformer that converts mdast nodes into Notion block creation payloads.

**Why this priority**: This is the core conversion logic — the reverse of `blocks-to-md.ts`.

**Independent Test**: Unit tests transforming each mdast node type into the expected Notion block payload.

**Acceptance Scenarios**:

1. **Given** a paragraph AST node with formatted text, **When** transformed, **Then** output is a Notion paragraph block with rich_text array containing correct annotations (bold, italic, code, strikethrough, links)
2. **Given** heading AST nodes (depth 1-3), **When** transformed, **Then** output is Notion heading_1/heading_2/heading_3 blocks
3. **Given** a code AST node with language, **When** transformed, **Then** output is a Notion code block with language and rich_text content
4. **Given** list AST nodes (ordered/unordered), **When** transformed, **Then** output is Notion bulleted_list_item/numbered_list_item blocks
5. **Given** nested list items, **When** transformed, **Then** output is Notion list items with children (nested blocks)
6. **Given** a blockquote AST node, **When** transformed, **Then** output is a Notion quote block
7. **Given** a table AST node, **When** transformed, **Then** output is a Notion table block with table_row children, correct has_column_header setting
8. **Given** a Docusaurus admonition directive, **When** transformed, **Then** output is a Notion callout block with appropriate icon (reverse of CALLOUT_ICON_TO_ADMONITION mapping)
9. **Given** a `<details><summary>` HTML block, **When** transformed, **Then** output is a Notion toggle block with title and children
10. **Given** an image AST node, **When** transformed, **Then** output is a Notion image block with external URL
11. **Given** a thematic break AST node, **When** transformed, **Then** output is a Notion divider block
12. **Given** a task list item (`- [x] done`), **When** transformed, **Then** output is a Notion to_do block with checked=true
13. **Given** an unsupported AST node type (e.g., raw HTML), **When** transformed, **Then** a warning is logged and the node is skipped gracefully

---

### User Story 3 - Inline Text to Rich Text Converter (Priority: P1)

As a developer, I need a converter that transforms mdast inline nodes (phrasing content) into Notion rich_text arrays — the reverse of `rich-text.ts`.

**Why this priority**: Rich text conversion is used by every block type that contains text.

**Independent Test**: Unit tests for each annotation type and combination.

**Acceptance Scenarios**:

1. **Given** plain text, **When** converted, **Then** output is `[{ text: { content: "..." }, annotations: {} }]`
2. **Given** bold text (`**text**`), **When** converted, **Then** annotations include `bold: true`
3. **Given** italic text (`*text*`), **When** converted, **Then** annotations include `italic: true`
4. **Given** inline code (`` `text` ``), **When** converted, **Then** annotations include `code: true`
5. **Given** strikethrough (`~~text~~`), **When** converted, **Then** annotations include `strikethrough: true`
6. **Given** a link (`[text](url)`), **When** converted, **Then** output has `text.link.url` set
7. **Given** combined annotations (bold + italic + link), **When** converted, **Then** output has all annotations applied correctly
8. **Given** multiple text segments with different formatting, **When** converted, **Then** output is an array of rich_text objects, one per formatting run

---

### User Story 4 - Frontmatter-to-Properties Mapper (Priority: P1)

As a developer, I need a mapper that converts Docusaurus frontmatter YAML back to Notion property update payloads — the reverse of `properties-to-fm.ts`.

**Why this priority**: Pages need correct properties to appear properly in the Notion database.

**Independent Test**: Unit tests mapping each frontmatter key back to the expected Notion property payload.

**Acceptance Scenarios**:

1. **Given** `title: "Getting Started"`, **When** mapped, **Then** output is `{ Name: { title: [{ text: { content: "Getting Started" } }] } }`
2. **Given** `slug: "getting-started"`, **When** mapped, **Then** output is `{ Slug: { rich_text: [{ text: { content: "getting-started" } }] } }`
3. **Given** `description: "An intro guide"`, **When** mapped, **Then** output is `{ Description: { rich_text: [{ text: { content: "An intro guide" } }] } }`
4. **Given** `tags: [tutorial, beginner]`, **When** mapped, **Then** output is `{ Tags: { multi_select: [{ name: "tutorial" }, { name: "beginner" }] } }`
5. **Given** `sidebar_position: 3`, **When** mapped, **Then** output is `{ "Sidebar Position": { number: 3 } }`
6. **Given** `date: 2026-02-06`, **When** mapped, **Then** output is `{ "Published Date": { date: { start: "2026-02-06" } } }`
7. **Given** `sidebar_label: "Tutorials"`, **When** mapped, **Then** output is `{ Category: { select: { name: "Tutorials" } } }`
8. **Given** unknown frontmatter keys not in the property mapping, **When** mapped, **Then** they are skipped with a warning (not sent to Notion)
9. **Given** null/empty frontmatter values, **When** mapped, **Then** they are skipped (not sent as empty properties)

---

### User Story 5 - Notion Page Writer (Priority: P1)

As a developer, I need functions to create new Notion pages and update existing ones with blocks and properties.

**Why this priority**: This is the write side — the actual API calls that push content to Notion.

**Independent Test**: Unit tests with mocked Notion API. E2E test creating a real page in the test database.

**Acceptance Scenarios**:

1. **Given** a new markdown file with no matching page ID in state, **When** synced, **Then** a new page is created in the database with properties and content blocks
2. **Given** an existing page (page ID in state), **When** the markdown file changed, **Then** the page's properties are updated and all existing blocks are replaced with the new content
3. **Given** a page with more than 100 blocks, **When** created, **Then** the first 100 blocks are included in `pages.create` and the rest are appended via `blocks.children.append` in batches
4. **Given** an API rate limit (429), **When** writing, **Then** the write retries with exponential backoff (uses existing `NotionClientWrapper` rate limiting)
5. **Given** block replacement for an existing page, **When** updating, **Then** all existing child blocks are deleted first, then new blocks are appended (page-level replacement per ADR-003)

---

### User Story 6 - Git-to-Notion Sync Integration (Priority: P1)

As a user, I need a `push` CLI command that syncs changed markdown files to Notion.

**Why this priority**: This ties everything together into a usable feature.

**Independent Test**: E2E test pushing a markdown file to the test database and verifying the page content.

**Acceptance Scenarios**:

1. **Given** a markdown file in the output directory that's not in sync state, **When** I run `push`, **Then** a new page is created in Notion with correct title, properties, and content
2. **Given** a markdown file whose content hash differs from state, **When** I run `push`, **Then** the Notion page is updated with the new content
3. **Given** a markdown file whose content hash matches state, **When** I run `push`, **Then** the page is skipped (no API calls)
4. **Given** a page ID in state but no corresponding markdown file, **When** I run `push`, **Then** the page status in Notion is set to "Archived" (not deleted) and removed from state
5. **Given** both Notion and Git changed since last sync (conflict), **When** I run `push` with `--conflict latest-wins`, **Then** the newer side wins based on timestamps
6. **Given** `push --full`, **When** I run it, **Then** all files are pushed regardless of state

---

### User Story 7 - Bidirectional Sync Command (Priority: P2)

As a user, I need a single `sync` command that handles both directions in one run.

**Why this priority**: Convenience feature that combines `sync` (pull) and `push` into one operation.

**Independent Test**: E2E test running bidirectional sync with changes on both sides.

**Acceptance Scenarios**:

1. **Given** changes on Notion side only, **When** I run `sync --bidirectional`, **Then** Notion changes are pulled to Git
2. **Given** changes on Git side only, **When** I run `sync --bidirectional`, **Then** Git changes are pushed to Notion
3. **Given** changes on both sides (different pages), **When** I run `sync --bidirectional`, **Then** both directions sync correctly
4. **Given** changes on both sides (same page = conflict), **When** I run `sync --bidirectional`, **Then** conflict resolution applies per configured strategy

---

### Edge Cases

- Markdown file with frontmatter only (no body content) → Create page with properties but no blocks
- Markdown file with body only (no frontmatter) → Derive title from first heading or filename
- Very large markdown file (100+ blocks) → Batch block creation (100 per API call)
- Markdown with unsupported elements (raw HTML, footnotes, MDX components) → Skip with warning
- Notion API error mid-sync → Rollback state for failed pages, report which pages succeeded/failed
- File deleted from Git but page was also edited in Notion → Conflict per strategy
- Slug collision (two files mapping to same Notion page) → Error with clear message
- Markdown with images pointing to local files → Upload not in scope (spec 005), use external URL reference

## Requirements

### Functional Requirements

- **FR-001**: Markdown parser MUST use `unified`/`remark` AST pipeline (per ADR-007)
- **FR-002**: AST transformer MUST handle: paragraph, heading (1-3), bulleted_list_item, numbered_list_item, code, quote, callout (from admonitions), divider, table, toggle (from details/summary), image, to_do, bookmark
- **FR-003**: Rich text converter MUST handle: bold, italic, code, strikethrough, links, and combinations
- **FR-004**: Frontmatter mapper MUST reverse all mappings from `properties-to-fm.ts`: title, rich_text, select, multi_select, number, date
- **FR-005**: Page writer MUST handle both creation (new pages) and replacement (existing pages) using Notion SDK v5
- **FR-006**: Block replacement MUST delete all existing child blocks then append new ones (page-level, per ADR-003)
- **FR-007**: Pages with >100 blocks MUST be created/updated in batches
- **FR-008**: Sync state MUST be extended to track Git-side changes (file content hash comparison)
- **FR-009**: Conflict detection MUST compare both `notionLastEdited` and Git file mtime/hash against last sync time
- **FR-010**: Conflict resolution MUST follow configured strategy: latest-wins, notion-wins, or git-wins (per ADR-004)
- **FR-011**: Unsupported markdown elements MUST be skipped with a warning, not cause sync failure
- **FR-012**: CLI MUST expose a `push` subcommand for Git → Notion direction

### Key Entities

- **MarkdownFile**: Parsed representation of a `.md` file — frontmatter object + mdast body
- **NotionBlockPayload**: Block creation payload for Notion API (matches SDK `BlockObjectRequest` type)
- **NotionPropertyPayload**: Property update payload for Notion API
- **GitFileState**: Tracks file path, content hash, and modification time for change detection

## Architecture

```text
CLI (push command)
  │
  ├─ Load config (env vars / config file)
  ├─ Initialize Notion client (reuse NotionClientWrapper)
  ├─ Resolve data source ID (cached)
  ├─ Load sync state
  │
  ├─ Scan output directory for .md files
  ├─ For each file:
  │   ├─ Parse frontmatter (yaml)
  │   ├─ Parse markdown body (unified/remark → mdast)
  │   ├─ Compute content hash
  │   └─ Detect if changed vs state
  │
  ├─ Detect conflicts (if bidirectional: compare both sides)
  ├─ Apply conflict resolution strategy
  │
  ├─ For each changed file:
  │   ├─ Map frontmatter → Notion properties (reverse mapper)
  │   ├─ Transform mdast → Notion blocks (AST transformer)
  │   ├─ Create new page OR replace existing page content
  │   └─ Update sync state
  │
  ├─ Handle deleted files (archive in Notion, update state)
  ├─ Save sync state
  └─ Print summary
```

## File Structure (New/Modified)

```text
src/
├── converter/
│   ├── md-to-blocks.ts       # NEW: mdast → Notion block payloads
│   ├── md-to-rich-text.ts    # NEW: mdast inline → Notion rich_text arrays
│   └── fm-to-properties.ts   # NEW: frontmatter → Notion property payloads
├── parser/
│   └── markdown-parser.ts    # NEW: unified/remark pipeline, frontmatter extraction
├── sync/
│   ├── engine.ts             # MODIFIED: add Git → Notion flow
│   ├── state.ts              # MODIFIED: extend for bidirectional change detection
│   ├── file-reader.ts        # NEW: scan directory, read markdown files
│   └── notion-writer.ts      # NEW: create/update Notion pages and blocks
├── cli.ts                    # MODIFIED: add push subcommand
├── types.ts                  # MODIFIED: add Git→Notion types
└── index.ts                  # MODIFIED: export new modules
```

## Dependencies (New)

```
unified        # AST pipeline framework
remark-parse   # Markdown → mdast parser
remark-gfm     # GitHub Flavored Markdown (tables, strikethrough, task lists)
remark-directive  # Docusaurus admonition syntax (:::note, :::tip, etc.)
unist-util-visit  # AST traversal helper
```

## Success Criteria

- **SC-001**: `notion-docusaurus-sync push` creates a new page in the test database from a markdown file with correct title, properties, and block content
- **SC-002**: `notion-docusaurus-sync push` updates an existing page when the markdown file changes, preserving the page ID
- **SC-003**: Incremental push skips unchanged files (no unnecessary API calls)
- **SC-004**: Bidirectional sync handles changes on both sides with correct conflict resolution
- **SC-005**: Unit tests cover all block type transformations (mdast → Notion blocks)
- **SC-006**: Unit tests cover all property type reverse mappings (frontmatter → Notion properties)
- **SC-007**: E2E test creates a page from markdown and verifies content matches via Notion API read-back
