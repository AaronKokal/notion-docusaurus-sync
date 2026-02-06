# Architecture Decision Records

Consolidated research and architecture decisions for the notion-docusaurus-sync project.

## ADR-001: Pre-build File Sync (Not a Docusaurus Plugin)

**Context**: Docusaurus offers content plugins for integrating external data sources. An alternative is syncing content to markdown files before Docusaurus builds.

**Options considered**:
1. Custom Docusaurus content plugin (fetch from Notion at build time)
2. Pre-build file sync (write .md files to docs/, then standard Docusaurus build)

**Decision**: Pre-build file sync.

**Rationale**: The plugin approach breaks sidebars, pagination, TOC, and search because Docusaurus's built-in features depend on the standard docs plugin pipeline. Existing tools that tried the plugin route (e.g., docusaurus-notion-mdx-plugin) all hit these limitations. Pre-build sync produces standard markdown files that Docusaurus processes normally, preserving all features. It also decouples the sync engine from Docusaurus entirely — the tool is useful for any static site generator, not just Docusaurus.

**Consequences**: The sync tool is a standalone CLI/library. Docusaurus configuration remains standard. Users run sync before build (or via CI/cron/n8n).

---

## ADR-002: SDK v5 dataSources API (No Legacy REST Fallbacks)

**Context**: The `@notionhq/client` v5 SDK restructured how databases are queried. The old `databases.query()` method is gone, replaced by `dataSources.query()` with a separate data source ID. The older REST endpoint (`/v1/databases/{id}/query` with `Notion-Version: 2022-06-28`) still works.

**Options considered**:
1. Use the legacy REST endpoint directly (simpler, well-documented)
2. Use SDK v5 `dataSources` API (newer, extra round-trip for ID resolution)
3. Downgrade to SDK v2/v3 (familiar API, but increasingly outdated)

**Decision**: SDK v5 `dataSources` API exclusively.

**Rationale**: This project targets long-term commercial viability. Building on an older API version creates invisible technical debt — Notion could deprecate `Notion-Version: 2022-06-28` at any time. The `dataSources` API is Notion's current direction. The extra round-trip to resolve data source IDs is trivial (one call per sync run, cached).

**Flow**:
```
databases.retrieve(database_id) → data_sources[0].id → dataSources.query(data_source_id)
```

**Consequences**: All code uses the official SDK. Data source IDs are cached per sync run. Type definitions from the SDK may need `as any` casts until types catch up.

---

## ADR-003: Page-Level Sync Granularity

**Context**: Sync can operate at page level (one Notion page = one markdown file, replaced entirely) or block level (diff individual blocks within a page).

**Options considered**:
1. Page-level replacement (simpler, entire page re-synced on change)
2. Block-level diffing (more efficient, but extremely complex)

**Decision**: Page-level replacement.

**Rationale**: Block-level diffing requires tracking block IDs across Notion and markdown, handling block reordering, insertion, and deletion. This complexity is disproportionate to the benefit, especially since best practices keep pages reasonably sized. Page-level replacement is simple, deterministic, and easy to reason about. Block-level optimization can be added later if needed.

**Consequences**: When a page changes on either side, the entire page content is re-synced. Sync state tracks per-page `last_edited_time` and file hashes.

---

## ADR-004: Simple Conflict Resolution Rules

**Context**: Bidirectional sync can encounter conflicts when the same page is edited on both Notion and Git between sync runs.

**Options considered**:
1. Three-way merge (complex, requires common ancestor tracking)
2. Configurable simple rules: latest-wins, notion-wins, git-wins
3. Manual resolution (flag conflicts, require human intervention)

**Decision**: Configurable simple rules, default "latest-wins".

**Rationale**: Three-way merge is overkill for a CMS sync tool — pages are typically edited by one person at a time. Simple rules are deterministic, easy to understand, and cover all practical cases. The conflict is logged regardless of which rule fires, providing auditability.

**Strategies**:
- `latest-wins` (default): Compare `last_edited_time` on both sides, newer overwrites older
- `notion-wins`: Notion content always takes precedence
- `git-wins`: Git content always takes precedence

**Consequences**: No complex merge logic needed. Conflicts are resolved automatically per configured rule. All conflicts are logged with details for audit.

---

## ADR-005: Pluggable Image Strategy

**Context**: Notion stores images on S3 with URLs that expire after ~1 hour. These URLs cannot appear in output markdown.

**Options considered**:
1. Always download to local `static/img/`
2. Always use Google Drive
3. Pluggable strategy (local, Google Drive, custom)

**Decision**: Pluggable strategy with local download as default.

**Rationale**: Different users have different needs. Local download is simplest and works everywhere. Google Drive is proven for teams already using Google Workspace (Aaron has had good results with this approach). Custom handlers enable CDN integration or other storage backends. The image handler interface is simple: given a Notion image URL, return a stable reference.

**Strategies**:
- `local` (default): Download to `static/img/`, content-hash filenames for deduplication
- `google-drive`: Upload to a shared Drive folder, return stable sharing URL
- `custom`: User-provided function `(notionUrl: string) => Promise<string>`

**Consequences**: Image handling is decoupled from the core sync logic. Each strategy is independently testable.

---

## ADR-006: Notion-to-Markdown Conversion Approach

**Context**: Converting Notion blocks to markdown requires handling ~30 block types with their nested structures.

**Options considered**:
1. `notion-to-md` v4 with custom renderer plugins
2. Custom converter built from scratch using the Notion SDK types
3. `react-notion-x` (React rendering, not markdown)

**Decision**: Evaluate `notion-to-md` v4 first; fall back to custom if needed.

**Rationale**: `notion-to-md` v4 introduced a renderer plugin system that allows Docusaurus-specific output (MDX admonitions, custom code block handling). This avoids reinventing block-type traversal. However, v4 was in alpha status as of early 2026, so we maintain the option to build a custom converter if the library proves unreliable.

**Key considerations**:
- Block types to support: paragraph, headings (1-3), bulleted/numbered lists, code, quote, callout, divider, table, toggle, image, bookmark, embed, equation, to_do, column_list
- Inline formatting: bold, italic, strikethrough, code, links, colors
- Nested blocks: toggles with children, column layouts

**Consequences**: The converter is abstracted behind an interface, allowing either implementation. Tests verify output for each block type independently.

---

## ADR-007: Markdown-to-Notion Conversion Approach (Git → Notion)

**Context**: The reverse direction — parsing markdown back to Notion blocks — is where no existing tool delivers well.

**Options considered**:
1. `unified`/`remark` AST pipeline (parse MD to AST, transform AST to Notion blocks)
2. Custom line-by-line parser (like the wiki-notion-sync prototype)
3. `marked` or other markdown parser with visitor pattern

**Decision**: `unified`/`remark` AST pipeline.

**Rationale**: The unified ecosystem provides battle-tested markdown parsing with a well-defined AST (mdast). Transforming mdast nodes to Notion blocks is a clean mapping. This approach handles nested structures, inline formatting, and edge cases that a line-by-line parser would struggle with. It also allows MDX support via `remark-mdx` if needed later.

**Lossy mappings** (markdown → Notion):
- HTML blocks → unsupported (Notion has no raw HTML block)
- Complex MDX components → unsupported (would need custom handling)
- Footnotes → unsupported (Notion has no footnote concept)
- Admonitions (Docusaurus `:::`) → callout blocks (close mapping)

**Consequences**: Depends on `unified`, `remark-parse`, and potentially `remark-mdx`. The AST-to-Notion-blocks transformer is our custom code.

---

## ADR-008: Incremental Sync via Sync State File

**Context**: Full re-sync on every run is wasteful for large databases. We need to detect which pages changed.

**Options considered**:
1. Always full sync (simple but slow)
2. Notion `last_edited_time` comparison with local state file
3. Notion webhooks for real-time change detection

**Decision**: Local sync state file comparing `last_edited_time` (default), with webhook support planned for later.

**Rationale**: A local JSON state file mapping page IDs to their last known `last_edited_time` (Notion side) and content hash (Git side) is simple and reliable. On each sync run: query all pages, compare timestamps against state, only process changed pages. Webhooks (spec 008) add real-time capability later but aren't needed for MVP.

**State file structure**:
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

**Consequences**: State file is gitignored (local to each machine). Full re-sync available via `--full` flag. State file corruption → automatic full re-sync.

---

## ADR-009: MD Output Format (Not MDX by Default)

**Context**: Docusaurus supports both `.md` and `.mdx` files. MDX allows JSX components but adds complexity.

**Options considered**:
1. Always output `.md` (standard markdown + Docusaurus extensions)
2. Always output `.mdx` (enables JSX components)
3. Configurable per-page or global setting

**Decision**: Default to `.md`, configurable to `.mdx`.

**Rationale**: Standard markdown is simpler, more portable, and sufficient for content synced from Notion (which doesn't have JSX concepts). Docusaurus's `.md` files already support frontmatter, admonitions (`:::`), and most features needed for documentation. MDX is available as an option for users who need JSX component embedding, but it adds parser complexity and potential for errors.

**Consequences**: Default output uses `.md` extension. Admonitions map Notion callouts to Docusaurus `:::` syntax. MDX mode is a config flag.

---

## Existing Tool Landscape

Evaluated tools and why we're building custom:

| Tool | Approach | Bidirectional | Why Not Sufficient |
|------|----------|---------------|-------------------|
| docu-notion | Pre-build sync | No (Notion → MD only) | No Git → Notion, limited block types |
| notion-to-md v4 | Library | No (converter only) | Useful as a dependency, not a sync engine |
| notion-downloader | CLI dump | No | Dump only, no sync state, no frontmatter |
| docusaurus-notion-mdx-plugin | Docusaurus plugin | No | Breaks sidebars/pagination/search |
| react-notion-x | React renderer | No | React, not markdown output |
| Notion-Hugo | Pre-build sync | No | Hugo-specific, not Docusaurus |

**Build-vs-extend decision**: Build a custom sync engine. Use `notion-to-md` v4 as a dependency for the Notion → MD direction. Use `unified`/`remark` for the MD → Notion direction. No existing tool handles bidirectional sync.

---

## Notion API Key Facts

- **Rate limit**: 3 requests/second (average), with burst allowance
- **Block fetching**: Recursive — children must be fetched separately for each block with `has_children: true`
- **Image URLs**: Expire after ~1 hour (S3 signed URLs)
- **Webhooks**: Available since 2025 — supports `page.content_updated`, `page.properties_updated`
- **SDK v5**: Uses `dataSources` API for database queries (see ADR-002)
- **Page creation**: Can include up to 100 blocks in initial `children` array
- **Block append**: `blocks.children.append()` for adding content to existing pages
- **Write capabilities**: Create pages, append blocks, update blocks, delete blocks — all primitives needed for Git → Notion sync

## CMS Database Template

The recommended database schema for Docusaurus CMS usage (implemented in test DB):

| Property | Type | Docusaurus Frontmatter | Direction |
|----------|------|----------------------|-----------|
| Name | title | `title` | Bidirectional |
| Status | select (Draft/Published/Archived) | Used for filtering (not in frontmatter) | Bidirectional |
| Slug | rich_text | `slug` | Bidirectional |
| Description | rich_text | `description` | Bidirectional |
| Tags | multi_select | `tags` | Bidirectional |
| Sidebar Position | number | `sidebar_position` | Bidirectional |
| Published Date | date | `date` (for blog) or custom | Bidirectional |
| Category | select | `sidebar_label` or custom | Bidirectional |

**Note**: Status uses `select` type, not the classic `status` property type, because the latter fails when created programmatically.
