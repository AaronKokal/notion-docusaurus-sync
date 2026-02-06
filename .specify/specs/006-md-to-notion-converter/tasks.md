# Tasks: Markdown-to-Notion Converter (Git → Notion)

**Input**: Design documents from `.specify/specs/006-md-to-notion-converter/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Unit tests for each module, E2E test creating a page in the live Notion test database.

**Organization**: Tasks are grouped by phase. Phases 2-5 can proceed in parallel once Phase 1 is done. Phases 6-7 depend on 2-5. Phases 8-10 integrate everything.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## IDs and References

- **Test DB ID**: `2ffc0fdf-942d-817f-ad7e-efd2e1887262`
- **Test DB Data Source ID**: `2ffc0fdf-942d-8181-b89d-000bab557711`
- **Notion Token**: Via `NOTION_TOKEN` env var (sourced from project `.env`)

---

## Phase 1: Setup (Dependencies & Infrastructure)

**Purpose**: Install new packages, create directory structure, extend existing types

- [x] T001 Install remark/unified packages: `npm install unified remark-parse remark-gfm remark-directive unist-util-visit @types/mdast`. Create directory: `src/parser/`. Verify build still works with `npm run build`.
- [x] T002 [P] Extend `src/types.ts` with Git→Notion types: Add `gitLastModified?: string` and `notionPageId?: string` fields to `PageStateEntry`. Add `MarkdownFileInfo` interface (filePath, slug, content, contentHash, lastModified). Add `NotionBlockPayload` type alias (use `any` for now — Notion SDK block request types are complex). Add `FrontmatterToPropertiesConfig` interface mirroring the reverse of `PropertyMapperConfig`.

**Checkpoint**: Dependencies installed, types extended, build passes

---

## Phase 2: User Story 1 — Markdown Parser (Priority: P1)

**Goal**: Parse markdown files into frontmatter + mdast AST.

**Independent Test**: Unit tests parsing various markdown constructs.

### Implementation

- [x] T003 [US1] Create `src/parser/markdown-parser.ts`:
  - `extractFrontmatter(content: string): { frontmatter: Record<string, unknown>, body: string }` — Split content on `---` delimiters, parse YAML with existing `yaml` package. Handle: no frontmatter, empty frontmatter, frontmatter only.
  - `parseMarkdown(body: string): Root` — Set up unified pipeline: `unified().use(remarkParse).use(remarkGfm).use(remarkDirective).parse(body)`. Returns mdast Root node.
  - `parseMarkdownFile(content: string): { frontmatter: Record<string, unknown>, ast: Root }` — Combines both: extract frontmatter, parse body, return both.

- [ ] T004 [US1] Create `test/unit/markdown-parser.test.ts` — Unit tests:
  - Test frontmatter extraction with valid YAML
  - Test frontmatter extraction with no frontmatter → empty object
  - Test frontmatter extraction with empty frontmatter (`---\n---`)
  - Test markdown parsing produces heading nodes with correct depth
  - Test markdown parsing produces code nodes with language
  - Test markdown parsing produces list nodes (ordered/unordered)
  - Test markdown parsing produces table nodes (GFM)
  - Test markdown parsing produces containerDirective nodes for `:::note` etc.
  - Test markdown parsing produces listItem nodes with `checked` for task lists
  - Test `parseMarkdownFile` combines frontmatter + AST correctly

**Checkpoint**: Parser correctly produces mdast AST from markdown strings

---

## Phase 3: User Story 3 — Inline Text to Rich Text Converter (Priority: P1)

**Goal**: Convert mdast phrasing content to Notion rich_text arrays.

**Independent Test**: Unit tests for each annotation type.

### Implementation

- [ ] T005 [P] [US3] Create `src/converter/md-to-rich-text.ts`:
  - `phrasesToRichText(nodes: PhrasingContent[]): RichTextPayload[]` — Walk mdast phrasing content depth-first. Maintain annotation context (bold, italic, code, strikethrough). At leaf `text` nodes, emit rich_text element with accumulated annotations. Handle `link` nodes by setting `text.link.url`. Handle `inlineCode` as a single rich_text with `code: true` annotation.
  - Type: `RichTextPayload = { type: 'text', text: { content: string, link?: { url: string } }, annotations: { bold?: boolean, italic?: boolean, code?: boolean, strikethrough?: boolean } }`
  - Handle empty/null input → empty array
  - Handle nested annotations: bold inside italic inside link → all annotations applied to the leaf text

- [ ] T006 [P] [US3] Create `test/unit/md-to-rich-text.test.ts` — Unit tests:
  - Plain text → single rich_text with no annotations
  - Bold text (`strong` node) → `bold: true`
  - Italic text (`emphasis` node) → `italic: true`
  - Inline code (`inlineCode` node) → `code: true`
  - Strikethrough (`delete` node) → `strikethrough: true`
  - Link (`link` node) → `text.link.url` set
  - Combined: bold + italic → both annotations true
  - Combined: bold text inside link → bold + link
  - Multiple segments with different formatting → array of rich_text
  - Empty input → empty array
  - Use remark to parse inline markdown, then pass phrasing nodes to converter

**Checkpoint**: Rich text conversion matches all acceptance scenarios from US3

---

## Phase 4: User Story 2 — AST-to-Notion Block Transformer (Priority: P1)

**Goal**: Convert mdast block nodes to Notion block creation payloads.

**Depends on**: Phase 3 (md-to-rich-text.ts) for inline text conversion within blocks.

### Implementation

- [ ] T007 [US2] Create `src/converter/md-to-blocks.ts`:
  - `mdastToNotionBlocks(nodes: Content[]): NotionBlockPayload[]` — Main entry point. Iterate over block-level Content nodes, dispatch to type-specific handlers. Return flat array of block payloads.
  - Handlers per node type:
    - `heading` (depth 1-3) → `heading_1`/`heading_2`/`heading_3` with rich_text from `phrasesToRichText(node.children)`
    - `paragraph` → `paragraph` with rich_text from `phrasesToRichText(node.children)`
    - `code` → `code` block with `language: node.lang || "plain text"`, `rich_text: [{ text: { content: node.value } }]`
    - `list` (ordered=false) → sequence of `bulleted_list_item` blocks, each with rich_text from list item's first paragraph children. If list item has sub-lists, include as `children`.
    - `list` (ordered=true) → sequence of `numbered_list_item` blocks, same pattern
    - `listItem` with `checked !== null` → `to_do` block with `checked` field
    - `blockquote` → `quote` block with rich_text from inner paragraphs
    - `table` → `table` block with `table_width` (column count), `has_column_header: true` (first row), children are `table_row` blocks each with `cells` array of rich_text arrays
    - `containerDirective` (name in note/tip/info/warning/danger) → `callout` block with appropriate icon (📝, 💡, ℹ️, ⚠️, 🔥), rich_text from children. Children blocks inside the callout should be included as block children.
    - `html` containing `<details><summary>` → `toggle` block. Parse summary text as toggle title (rich_text). Parse inner content: if it contains markdown, re-parse and convert recursively. If plain text, use as paragraph children.
    - `thematicBreak` → `divider` block (no content)
    - `image` → `image` block with `type: "external"`, `external: { url: node.url }`, caption from node.alt
    - Unsupported types (`html` that isn't details, `definition`, `footnote`, etc.) → log warning, skip
  - `ADMONITION_TO_ICON` mapping (reverse of blocks-to-md.ts): `{ note: "📝", tip: "💡", info: "ℹ️", warning: "⚠️", danger: "🔥" }`

- [ ] T008 [US2] Create `test/unit/md-to-blocks.test.ts` — Unit tests:
  - Paragraph with formatted text → paragraph block with correct rich_text
  - Headings h1-h3 → heading_1/2/3 blocks
  - Code block with language → code block
  - Bulleted list → sequence of bulleted_list_item blocks
  - Numbered list → sequence of numbered_list_item blocks
  - Nested list → list items with children
  - Task list (`- [x]`, `- [ ]`) → to_do blocks with checked
  - Blockquote → quote block
  - Table → table block with table_row children
  - `:::note` admonition → callout block with 📝 icon
  - `:::tip` → callout with 💡, `:::warning` → ⚠️, `:::danger` → 🔥, `:::info` → ℹ️
  - `<details><summary>` → toggle block
  - Image → image block with external URL
  - Thematic break → divider block
  - Unsupported type → skipped with no error
  - Multiple blocks → correct array of payloads
  - Parse real markdown strings with remark, then pass to transformer for realistic testing

**Checkpoint**: All 13 acceptance scenarios from US2 covered

---

## Phase 5: User Story 4 — Frontmatter-to-Properties Mapper (Priority: P1)

**Goal**: Convert frontmatter YAML back to Notion property update payloads.

**Independent Test**: Unit tests for each property type mapping.

### Implementation

- [ ] T009 [P] [US4] Create `src/converter/fm-to-properties.ts`:
  - `frontmatterToProperties(frontmatter: Record<string, unknown>, config: FrontmatterToPropertiesConfig): Record<string, any>` — Map frontmatter keys to Notion property names using reverse of the property mapping. Convert values to Notion property payloads.
  - Default reverse mapping: `{ title: "Name", slug: "Slug", description: "Description", tags: "Tags", sidebar_position: "Sidebar Position", date: "Published Date", sidebar_label: "Category" }`
  - Value converters per target property type:
    - title property: `{ title: [{ text: { content: value } }] }`
    - rich_text property (slug, description): `{ rich_text: [{ text: { content: value } }] }`
    - multi_select property (tags): `{ multi_select: value.map(v => ({ name: v })) }`
    - number property (sidebar_position): `{ number: value }`
    - date property: `{ date: { start: value } }` (value is already "YYYY-MM-DD" string)
    - select property (sidebar_label): `{ select: { name: value } }`
  - Skip unknown frontmatter keys with `console.warn`
  - Skip null/undefined/empty values
  - Config includes `propertyTypes` map: `{ Name: "title", Slug: "rich_text", Description: "rich_text", Tags: "multi_select", "Sidebar Position": "number", "Published Date": "date", Category: "select" }` — this tells the converter which Notion property type to create for each property name.

- [ ] T010 [P] [US4] Create `test/unit/fm-to-properties.test.ts` — Unit tests:
  - `title: "Getting Started"` → Name title property payload
  - `slug: "getting-started"` → Slug rich_text property payload
  - `description: "An intro"` → Description rich_text property payload
  - `tags: ["tutorial", "beginner"]` → Tags multi_select payload
  - `sidebar_position: 3` → Sidebar Position number payload
  - `date: "2026-02-06"` → Published Date date payload
  - `sidebar_label: "Tutorials"` → Category select payload
  - Unknown key → skipped with warning
  - null value → skipped
  - Empty object → empty result
  - Special characters in title → properly escaped in rich_text

**Checkpoint**: All 9 acceptance scenarios from US4 covered

---

## Phase 6: User Story 5 — File Reader & Notion Writer (Priority: P1)

**Goal**: Read markdown files from disk and write pages to Notion.

**Depends on**: Phases 2-5 for parser and converters.

### Implementation

- [ ] T011 [US5] Create `src/sync/file-reader.ts`:
  - `scanMarkdownFiles(outputDir: string): Promise<MarkdownFileInfo[]>` — Scan directory for `.md` files (non-recursive for now). For each file: read content, compute content hash (reuse `computeContentHash` from state.ts), get file mtime via `fs.stat`. Return array of `MarkdownFileInfo` objects.
  - `MarkdownFileInfo`: `{ filePath: string, slug: string, content: string, contentHash: string, lastModified: string }`
  - Slug derived from filename: strip `.md` extension, keep as-is (already kebab-case from file-writer)

- [ ] T012 [US5] Create `test/unit/file-reader.test.ts` — Unit tests:
  - Scan directory with 3 .md files → returns 3 MarkdownFileInfo objects
  - Scan empty directory → returns empty array
  - Correctly computes content hash (SHA-256)
  - Correctly extracts slug from filename
  - Ignores non-.md files
  - Uses temp directory for test files

- [ ] T013 [US5] Create `src/sync/notion-writer.ts` — `NotionWriter` class:
  - Constructor takes `NotionClientWrapper` and `dataSourceId`
  - `createPage(databaseId: string, properties: Record<string, any>, blocks: any[]): Promise<string>` — Create page via `client.rawClient.pages.create(...)`. If blocks.length > 100, include first 100 in creation, then append rest via `appendBlocks`. Returns the new page ID.
  - `replacePageContent(pageId: string, blocks: any[]): Promise<void>` — Fetch all existing child blocks via `client.getPageBlocks(pageId)`. Delete each block via `client.rawClient.blocks.delete(blockId)`. Then append new blocks.
  - `appendBlocks(pageId: string, blocks: any[]): Promise<void>` — Append blocks in batches of 100 via `client.rawClient.blocks.children.append(...)`.
  - `updateProperties(pageId: string, properties: Record<string, any>): Promise<void>` — Update via `client.rawClient.pages.update(...)`.
  - `archivePage(pageId: string): Promise<void>` — Update page with `archived: true` via `client.rawClient.pages.update(...)`.
  - All operations use `client.executeWithRateLimiting()` for rate limiting.

- [ ] T014 [US5] Create `test/unit/notion-writer.test.ts` — Unit tests:
  - `createPage` calls pages.create with correct properties and children
  - `createPage` with >100 blocks: first 100 in create, rest via append
  - `replacePageContent` deletes existing blocks then appends new ones
  - `appendBlocks` batches correctly (100 per call)
  - `updateProperties` calls pages.update with correct payload
  - `archivePage` sets archived: true
  - Rate limiting is applied (verify executeWithRateLimiting is called)
  - Mock all Notion API methods with `vi.fn()`

**Checkpoint**: File reader and Notion writer both unit tested

---

## Phase 7: State Extension & Git Change Detection

**Goal**: Extend sync state for bidirectional change detection.

**Depends on**: Phase 6 (file-reader for scanning files).

### Implementation

- [ ] T015 [US6] Extend `src/sync/state.ts`:
  - Add `detectGitChanges(state: SyncStateFile, files: MarkdownFileInfo[]): { changed: MarkdownFileInfo[], unchanged: string[], deleted: string[] }`:
    - `changed`: files where contentHash differs from `state.pages[pageId].gitContentHash`, or files with no matching page in state (new files matched by slug)
    - `unchanged`: slugs where content hash matches
    - `deleted`: page IDs in state where no matching file exists (by slug/filePath)
  - Add `findPageBySlug(state: SyncStateFile, slug: string): { pageId: string, entry: PageStateEntry } | null` — look up page entry by slug field
  - Add `detectConflicts(notionChanges: { changed: NotionPage[] }, gitChanges: { changed: MarkdownFileInfo[] }, state: SyncStateFile): ConflictRecord[]` — find pages that changed on both sides since last sync. Compare `notionLastEdited` vs stored and `gitContentHash` vs stored. Return conflict records.
  - Keep existing functions untouched.

- [ ] T016 [US6] Add tests to `test/unit/sync-state.test.ts` (extend existing test file):
  - Test `detectGitChanges` with new file (not in state) → in changed list
  - Test `detectGitChanges` with changed file (different hash) → in changed list
  - Test `detectGitChanges` with unchanged file (same hash) → in unchanged list
  - Test `detectGitChanges` with deleted file (in state, no file) → in deleted list
  - Test `findPageBySlug` returns correct entry
  - Test `findPageBySlug` with non-existent slug → null
  - Test `detectConflicts` with page changed on both sides → conflict record
  - Test `detectConflicts` with page changed on one side only → no conflict

**Checkpoint**: Bidirectional change detection working

---

## Phase 8: User Story 6 — Git-to-Notion Sync Engine (Priority: P1)

**Goal**: Orchestrate the full Git → Notion pipeline.

**Depends on**: ALL of Phases 2-7.

### Implementation

- [ ] T017 [US6] Add `syncGitToNotion(config: SyncConfig): Promise<SyncResult>` to `src/sync/engine.ts`:
  - Initialize NotionClientWrapper with config.notionToken (reuse if already initialized)
  - Resolve data source ID from config.databaseId (cached)
  - Load sync state from config.stateFile
  - Scan output directory for .md files via `scanMarkdownFiles`
  - Detect Git-side changes via `detectGitChanges`
  - For each changed file:
    - Parse frontmatter + markdown via `parseMarkdownFile`
    - Map frontmatter → properties via `frontmatterToProperties`
    - Transform mdast → blocks via `mdastToNotionBlocks`
    - Look up existing page by slug in state via `findPageBySlug`
    - If existing page: `replacePageContent` + `updateProperties`
    - If new file: `createPage` with properties and blocks
    - Update sync state entry with new contentHash, filePath, notionPageId
  - Handle deleted files: archive Notion page, remove from state
  - Save state
  - Return SyncResult with gitToNotion results
  - Support `--full` mode (skip change detection, push all)

- [ ] T018 [US6] Update `src/cli.ts` — Add `push` subcommand:
  - Parse args: `push` subcommand, `--full` flag, `--conflict <strategy>` override
  - Load config from environment variables (same as sync): `NOTION_TOKEN`, `NOTION_DATABASE_ID`
  - Default output dir: `./docs`
  - Call `syncGitToNotion(config)` and print summary (pages created/updated/archived/skipped/errors)
  - Clear error messages for missing config

- [ ] T019 [US6] Update `src/index.ts` — Export new modules:
  - Export `parseMarkdownFile`, `parseMarkdown`, `extractFrontmatter` from parser
  - Export `phrasesToRichText` from md-to-rich-text
  - Export `mdastToNotionBlocks` from md-to-blocks
  - Export `frontmatterToProperties` from fm-to-properties
  - Export `NotionWriter` from notion-writer
  - Export `scanMarkdownFiles` from file-reader

**Checkpoint**: `push` command works end-to-end

---

## Phase 9: User Story 7 — Bidirectional Sync (Priority: P2)

**Goal**: Combine both directions in one command with conflict resolution.

**Depends on**: Phase 8.

### Implementation

- [ ] T020 [US7] Add bidirectional sync to `src/sync/engine.ts`:
  - Add `syncBidirectional(config: SyncConfig): Promise<SyncResult>` function:
    1. Load sync state
    2. Detect Notion-side changes (query pages, compare timestamps)
    3. Detect Git-side changes (scan files, compare hashes)
    4. Detect conflicts (pages changed on both sides)
    5. Resolve conflicts per `config.conflictStrategy`
    6. Pull Notion → Git for Notion-won pages + non-conflicting Notion changes
    7. Push Git → Notion for Git-won pages + non-conflicting Git changes
    8. Save state
    9. Return combined SyncResult with both directions + conflict records
  - Update `syncNotionToGit` to accept optional `excludePageIds` parameter (skip pages that Git won in conflict)
  - Update `syncGitToNotion` to accept optional `excludeSlugs` parameter (skip files that Notion won in conflict)

- [ ] T021 [US7] Update `src/cli.ts` — Modify `sync` command:
  - Add `--bidirectional` flag to existing `sync` command
  - When `--bidirectional` is set: call `syncBidirectional` instead of `syncNotionToGit`
  - Add `--conflict <strategy>` flag (applies to both `sync --bidirectional` and `push`)
  - Print summary showing both directions + any conflicts resolved

**Checkpoint**: Bidirectional sync works with conflict resolution

---

## Phase 10: E2E Tests & Polish

**Purpose**: End-to-end verification, build checks, final cleanup.

### Implementation

- [ ] T022 [US6] Create `test/e2e/push.test.ts` — E2E test against live Notion test database:
  - Requires `NOTION_TOKEN` env var (skip if not available)
  - Create a temp markdown file with known frontmatter and content:
    ```
    ---
    title: "E2E Test Page"
    slug: "e2e-test-push"
    tags: [test, automated]
    sidebar_position: 99
    ---
    # Test Heading
    Paragraph with **bold** and *italic*.
    ```
  - Run `syncGitToNotion` against test DB
  - Read back the created page via Notion API
  - Assert: page exists with correct title, tags, sidebar_position
  - Assert: page has heading block, paragraph block with formatting
  - Modify the markdown (change title, add content)
  - Run push again
  - Assert: page updated (not duplicated)
  - Clean up: delete the test page from Notion
  - Timeout: 60 seconds (multiple API calls with rate limiting)

- [ ] T023 Verify `npm run build` succeeds with all new code
- [ ] T024 Verify `npm run test` passes all unit tests (existing + new)
- [ ] T025 Run E2E test: `NOTION_TOKEN=<token> npm run test -- test/e2e/push` — verify against live database

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1 Parser)**: Depends on Phase 1 (npm packages)
- **Phase 3 (US3 Rich Text)**: Depends on Phase 1 types. Can run in parallel with Phase 2.
- **Phase 4 (US2 Blocks)**: Depends on Phase 3 (uses md-to-rich-text). Can run in parallel with Phase 2, Phase 5.
- **Phase 5 (US4 Properties)**: Depends on Phase 1 types. Can run in parallel with Phases 2-4.
- **Phase 6 (US5 Reader+Writer)**: Can run in parallel with Phases 2-5 (different files).
- **Phase 7 (State Extension)**: Depends on Phase 6 (file-reader types). Can run in parallel with Phases 2-5.
- **Phase 8 (US6 Engine+CLI)**: Depends on ALL of Phases 2-7 being complete.
- **Phase 9 (US7 Bidirectional)**: Depends on Phase 8.
- **Phase 10 (Polish)**: Depends on Phase 9.

### Parallel Opportunities

```text
Phase 1 (Setup)
    ↓
┌───────────┬───────────┬───────────┬───────────┐
│  Phase 2  │  Phase 3  │  Phase 5  │  Phase 6  │  ← all parallel
│ US1:Parser│ US3:RichTx│ US4:Props │ US5:R/W   │
└─────┬─────┴─────┬─────┴─────┬─────┴─────┬─────┘
      │     Phase 4 (needs Phase 3) ↑     Phase 7 (needs Phase 6) ↑
      └───────────┴───────────┴───────────┘
                        ↓
                  Phase 8 (US6: Engine + CLI)
                        ↓
                  Phase 9 (US7: Bidirectional)
                        ↓
                  Phase 10 (Polish)
```

### Within Each Phase

- Implementation before tests (or TDD)
- All [P] tasks within a phase can run in parallel

---

## Implementation Strategy

### Sequential Execution (RALF)

1. Complete Phase 1 (T001-T002)
2. Complete Phase 2 (T003-T004) — Parser
3. Complete Phase 3 (T005-T006) — Rich text (can parallel with Phase 2 but sequential is fine for RALF)
4. Complete Phase 4 (T007-T008) — Blocks (needs Phase 3)
5. Complete Phase 5 (T009-T010) — Properties
6. Complete Phase 6 (T011-T014) — Reader + Writer
7. Complete Phase 7 (T015-T016) — State extension
8. Complete Phase 8 (T017-T019) — Engine + CLI
9. Complete Phase 9 (T020-T021) — Bidirectional
10. Complete Phase 10 (T022-T025) — E2E + Polish
11. **STOP and VALIDATE**: Run full test suite including E2E

### Commit Strategy

- Commit after each phase completion
- Commit message format: `feat(push): <description>`
- Phase 8 commit is the major milestone (push works)
- Phase 9 commit completes bidirectional sync

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to user story for traceability
- Test DB has 5 pages: 3 Published, 1 Draft, 1 Archived
- SDK v5 block creation payloads use `as any` casts where needed
- Rate limiting is critical — all writes go through NotionClientWrapper
- E2E tests must clean up created pages after test runs
- The parser does NOT need `remark-frontmatter` — we handle frontmatter extraction manually via string splitting (simpler, avoids another dependency)
