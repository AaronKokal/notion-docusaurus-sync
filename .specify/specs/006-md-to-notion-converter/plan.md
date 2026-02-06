# Technical Plan: Markdown-to-Notion Converter (Git → Notion)

**Spec**: `006-md-to-notion-converter/spec.md`
**Created**: 2026-02-06
**Status**: Draft

## Dependencies

### New npm Packages

```
unified@^11         # AST pipeline framework (ESM-only)
remark-parse@^11    # Markdown → mdast parser
remark-gfm@^4       # GFM: tables, strikethrough, task lists
remark-directive@^4  # Docusaurus admonition syntax (:::note, etc.)
unist-util-visit@^5  # AST traversal helper
@types/mdast@^4      # TypeScript types for mdast nodes
```

All packages are ESM-only — compatible with project's existing ESM setup.

### Existing Code Reuse

| Module | Reuse |
|--------|-------|
| `NotionClientWrapper` | Add write methods (createPage, replacePageBlocks, updateProperties) |
| `src/types.ts` | Extend `PageStateEntry` with `gitLastModified` field |
| `src/sync/state.ts` | Add Git-side change detection (`detectGitChanges`) |
| `src/sync/engine.ts` | Add `syncGitToNotion` flow alongside existing `syncNotionToGit` |
| `src/cli.ts` | Add `push` subcommand |

## Architecture

### Data Flow

```text
.md file → [frontmatter + body split]
                ↓
    [YAML parse] → properties object
                ↓
    [fm-to-properties.ts] → Notion property payloads

    [remark parse] → mdast AST
                ↓
    [md-to-rich-text.ts] → inline formatting → Notion rich_text arrays
    [md-to-blocks.ts] → block structures → Notion block payloads
                ↓
    [notion-writer.ts] → pages.create / blocks.children.append / blocks.delete
                ↓
    [state.ts] → update sync state
```

### Module Design

#### 1. `src/parser/markdown-parser.ts`

Responsibilities:
- Set up unified pipeline: `unified().use(remarkParse).use(remarkGfm).use(remarkDirective)`
- Parse markdown string → mdast `Root` node
- Extract YAML frontmatter from raw content (split on `---` delimiters, parse with `yaml`)
- Export `parseMarkdownFile(content: string): { frontmatter: Record<string, unknown>, ast: Root }`

Design decision: Use the `yaml` package already in the project (not `gray-matter`) to keep dependencies minimal. Manual frontmatter extraction is trivial — split on `---`, parse YAML, pass remainder to remark.

#### 2. `src/converter/md-to-rich-text.ts`

Responsibilities:
- Convert mdast phrasing content (inline nodes) to Notion `rich_text` arrays
- Handle: text, strong (bold), emphasis (italic), inlineCode, delete (strikethrough), link
- Handle nested annotations (bold inside link, etc.)
- Recursive traversal of phrasing nodes to build flat rich_text array with correct annotations

Pattern: Walk the phrasing content tree depth-first. Maintain an "annotation stack" — when entering `strong`, push `bold: true`; when entering `emphasis`, push `italic: true`. At leaf `text` nodes, emit a rich_text element with the accumulated annotations.

```typescript
function phrasesToRichText(nodes: PhrasingContent[]): NotionRichTextPayload[]
```

This is the direct reverse of `rich-text.ts`'s `richTextToMarkdown()`.

#### 3. `src/converter/md-to-blocks.ts`

Responsibilities:
- Convert mdast block nodes to Notion block creation payloads
- One handler function per block type
- Handle nested structures (list item children, toggle children)
- Handle special mappings:
  - `containerDirective` (name=note|tip|warning|danger|info) → callout block
  - `html` containing `<details><summary>` → toggle block
  - `thematicBreak` → divider
  - `code` → code block with language
  - `table` → table block with table_row children
  - `list` → sequence of bulleted_list_item/numbered_list_item blocks
  - `listItem` with `checked !== null` → to_do block
  - `blockquote` → quote block
  - `image` → image block (external URL)

```typescript
function mdastToNotionBlocks(nodes: Content[]): NotionBlockPayload[]
```

Design decision: Convert at the `Root.children` level (array of block-level Content nodes), not at the Root level itself. This produces a flat array of block payloads suitable for `pages.create({ children: [...] })` or `blocks.children.append({ children: [...] })`.

**Nested children**: For blocks that have children (toggles, list items), the Notion API accepts nested `children` in the block payload. Max nesting depth varies by block type but is generally supported for list items and toggles.

**100-block limit**: The transformer itself doesn't need to handle batching — that's the writer's job. The transformer always returns a complete block array.

#### 4. `src/converter/fm-to-properties.ts`

Responsibilities:
- Reverse of `properties-to-fm.ts`
- Map frontmatter keys → Notion property names using the same configurable mapping (reversed)
- Convert values to Notion property payloads:
  - `title: string` → `{ title: [{ text: { content } }] }`
  - `slug: string` → `{ rich_text: [{ text: { content } }] }`
  - `description: string` → `{ rich_text: [{ text: { content } }] }`
  - `tags: string[]` → `{ multi_select: [{ name }] }`
  - `sidebar_position: number` → `{ number: n }`
  - `date: string` → `{ date: { start: "YYYY-MM-DD" } }`
  - `sidebar_label: string` → `{ select: { name } }`
- Skip unknown keys with warning
- Skip null/undefined values

```typescript
function frontmatterToProperties(
  frontmatter: Record<string, unknown>,
  config: FrontmatterToPropertiesConfig
): Record<string, NotionPropertyPayload>
```

The config reuses the same property mapping from `PropertyMapperConfig` but in reverse direction.

#### 5. `src/sync/file-reader.ts`

Responsibilities:
- Scan a directory for `.md` files
- Read each file, extract frontmatter and content
- Compute content hash (SHA-256, using existing `computeContentHash` from state.ts)
- Get file modification time (fs.stat → mtime)
- Return structured file list for the sync engine

```typescript
interface MarkdownFileInfo {
  filePath: string;        // Relative path from output dir
  slug: string;            // Derived from filename (without .md)
  content: string;         // Raw file content
  contentHash: string;     // SHA-256 hash
  lastModified: string;    // ISO timestamp from file mtime
}

function scanMarkdownFiles(outputDir: string): Promise<MarkdownFileInfo[]>
```

#### 6. `src/sync/notion-writer.ts`

Responsibilities:
- Create new Notion pages: `pages.create({ parent: { database_id }, properties, children })`
- Replace existing page content: delete all child blocks, then append new blocks
- Update page properties: `pages.update({ page_id, properties })`
- Handle >100 blocks: first 100 in `pages.create`, rest via `blocks.children.append` in batches
- Archive pages (set status to "Archived") when file is deleted
- All operations go through `NotionClientWrapper` for rate limiting

```typescript
class NotionWriter {
  constructor(private client: NotionClientWrapper, private dataSourceId: string)

  createPage(properties: Record<string, any>, blocks: NotionBlockPayload[]): Promise<string>  // returns page ID
  replacePageContent(pageId: string, blocks: NotionBlockPayload[]): Promise<void>
  updateProperties(pageId: string, properties: Record<string, any>): Promise<void>
  archivePage(pageId: string): Promise<void>
}
```

**Block replacement strategy** (per ADR-003, page-level replacement):
1. Fetch all existing child block IDs: `blocks.children.list(pageId)`
2. Delete each block: `blocks.delete(blockId)` — in parallel where safe, with rate limiting
3. Append new blocks: `blocks.children.append(pageId, { children: [...] })` in batches of 100

This is simpler than block-level diffing and consistent with the architecture decision.

#### 7. `src/sync/engine.ts` — Modifications

Add `syncGitToNotion(config)` function:
1. Scan output directory for `.md` files
2. Load sync state
3. For each file, compare content hash against `state.pages[pageId].gitContentHash`
4. Detect changed files (hash differs or new file)
5. Detect deleted files (in state but no file on disk)
6. For each changed file:
   - Parse frontmatter + markdown
   - Map frontmatter → properties
   - Transform mdast → blocks
   - Create or update page
   - Update sync state
7. Handle deletions (archive page, remove from state)
8. Save state

Add conflict detection to the bidirectional sync:
- After detecting Notion-side and Git-side changes separately
- Find pages that changed on both sides
- Apply conflict resolution per configured strategy
- Log all conflicts

#### 8. `src/cli.ts` — Modifications

Add `push` subcommand:
- `notion-docusaurus-sync push` — push Git changes to Notion
- `notion-docusaurus-sync push --full` — force push all files
- `notion-docusaurus-sync push --conflict <strategy>` — override conflict strategy

Modify existing `sync` command:
- Add `--bidirectional` flag (or make it the default eventually)
- When bidirectional: run Notion→Git first, then Git→Notion, with conflict detection

### Admonition ↔ Callout Mapping

Bidirectional mapping for Docusaurus admonitions and Notion callouts:

| Docusaurus | Notion Callout Icon |
|-----------|-------------------|
| `:::note` | 📝 |
| `:::tip` | 💡 |
| `:::info` | ℹ️ |
| `:::warning` | ⚠️ |
| `:::danger` | 🔥 |

This reverses the `CALLOUT_ICON_TO_ADMONITION` mapping in `blocks-to-md.ts`. Multiple icons map to the same admonition in the forward direction; in reverse, we pick one canonical icon per admonition type.

### Toggle ↔ Details Mapping

Forward (blocks-to-md.ts): toggle → `<details><summary>title</summary>content</details>`

Reverse: Parse HTML string to detect `<details>` pattern → extract summary text as toggle title, inner content as toggle children. This requires simple regex/string parsing of the HTML node value since remark treats it as a raw string.

### State File Extension

Extend `PageStateEntry` with:
```typescript
interface PageStateEntry {
  notionLastEdited: string;   // existing
  gitContentHash: string;     // existing
  slug: string;               // existing
  filePath: string;           // existing
  gitLastModified?: string;   // NEW: file mtime at last sync
  notionPageId?: string;      // NEW: explicit mapping (for files created from Git)
}
```

The `notionPageId` field is needed because when a new file is created in Git (no existing Notion page), we create a page and need to store the mapping. Currently the state maps Notion page ID → entry, but for Git-created pages we also need to find the entry by slug.

Add a helper: `findPageBySlug(state, slug): { pageId: string, entry: PageStateEntry } | null`

## Testing Strategy

### Unit Tests

| Module | Test File | What to Test |
|--------|-----------|-------------|
| `md-to-rich-text.ts` | `test/unit/md-to-rich-text.test.ts` | Each annotation type, combinations, empty input |
| `md-to-blocks.ts` | `test/unit/md-to-blocks.test.ts` | Each block type transformation, nested blocks |
| `fm-to-properties.ts` | `test/unit/fm-to-properties.test.ts` | Each property type mapping, unknown keys, null values |
| `markdown-parser.ts` | `test/unit/markdown-parser.test.ts` | Frontmatter extraction, AST structure |
| `file-reader.ts` | `test/unit/file-reader.test.ts` | Directory scanning, hash computation, mtime |
| `notion-writer.ts` | `test/unit/notion-writer.test.ts` | Page creation, block replacement, batching, mocked API |

### E2E Test

`test/e2e/push.test.ts`:
1. Create a temp markdown file with known content
2. Run `syncGitToNotion` against the test database
3. Read the created page back via Notion API
4. Verify title, properties, and block content match
5. Modify the markdown file
6. Run push again
7. Verify page updated correctly
8. Clean up: delete the created test page

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| remark-directive doesn't parse Docusaurus syntax correctly | Test early; fall back to regex-based admonition detection |
| Notion API block creation limits (100 per call) | Batch in writer; test with large pages |
| `<details>` parsing fragile (HTML string parsing) | Keep regex simple; document limitations |
| Toggle children in Notion have depth limits | Test with nested toggles; warn on deep nesting |
| Rate limiting during bulk writes | Reuse existing rate limiter; add progress reporting |
| Block deletion before append is not atomic | Accept risk per ADR-003; state file tracks success |

## Implementation Order

1. **Setup**: Install dependencies, create directories
2. **Parser**: `markdown-parser.ts` — foundation for everything
3. **Rich text**: `md-to-rich-text.ts` — needed by all block converters
4. **Blocks**: `md-to-blocks.ts` — core conversion logic
5. **Properties**: `fm-to-properties.ts` — frontmatter reverse mapping
6. **File reader**: `file-reader.ts` — directory scanning
7. **Notion writer**: `notion-writer.ts` — API write operations
8. **State extension**: Update `state.ts` for bidirectional tracking
9. **Engine**: Add `syncGitToNotion` to `engine.ts`
10. **CLI**: Add `push` subcommand
11. **Bidirectional**: Conflict detection + `sync --bidirectional`
12. **Polish**: Build, test, E2E verification
