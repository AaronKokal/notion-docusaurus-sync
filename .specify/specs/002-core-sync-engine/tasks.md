# Tasks: Core Sync Engine (Notion → Git)

**Input**: Design documents from `.specify/specs/002-core-sync-engine/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Unit tests for each module, E2E test against live Notion test database.

**Organization**: Tasks are grouped by user story. User stories 1-3 can proceed in parallel once foundational work is done. Stories 4-5 depend on 1-3. Story 6 integrates everything.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## IDs and References

- **Test DB ID**: `2ffc0fdf-942d-817f-ad7e-efd2e1887262`
- **Test DB Data Source ID**: `2ffc0fdf-942d-8181-b89d-000bab557711`
- **Notion Token**: Via `NOTION_TOKEN` env var (sourced from project `.env`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add dependencies, create directory structure, extend existing types

- [x] T001 Install `yaml` package: `npm install yaml`. Create directories: `src/notion/`, `src/converter/`. Verify build still works with `npm run build`.
- [x] T002 [P] Extend `src/types.ts` with sync state types matching ADR-008 state file format: `SyncStateFile` (version, databaseId, dataSourceId, lastSyncTime, pages map), `PageStateEntry` (notionLastEdited, gitContentHash, slug, filePath). Keep existing types untouched.
- [x] T003 [P] Create `src/notion/types.ts` — Re-export useful Notion SDK types and define helper types: `NotionPage` (page result from dataSources.query), `NotionBlock` (block from blocks.children.list), `NotionRichText` (rich text array element), `NotionProperty` (property value union). Use SDK types where possible, `as any` casts where SDK types lag behind v5 API.
- [x] T004 [P] Create `test/unit/` directory. Create a `test/helpers.ts` with mock factories: `mockNotionPage()`, `mockBlock(type, content)`, `mockRichText(text, annotations)` — these produce realistic Notion API response shapes for unit tests.

**Checkpoint**: Project structure ready, types defined, test helpers available

---

## Phase 2: User Story 1 — Notion Client Wrapper (Priority: P1)

**Goal**: SDK v5 client wrapper that handles data source resolution, pagination, rate limiting, and recursive block fetching.

**Independent Test**: Unit tests with mocked Notion API responses.

### Implementation

- [x] T005 [US1] Create `src/notion/client.ts` — `NotionClientWrapper` class:
  - Constructor takes `{ token: string }`, creates SDK `Client` instance internally
  - `getDataSourceId(databaseId: string): Promise<string>` — calls `databases.retrieve`, extracts `data_sources[0].id`, caches result
  - `queryPages(dataSourceId: string, filter?: object): Promise<NotionPage[]>` — calls `dataSources.query` with pagination (handles `has_more` + `start_cursor`), returns all pages
  - `getPageBlocks(pageId: string): Promise<NotionBlock[]>` — calls `blocks.children.list` with pagination, recursively fetches children for blocks with `has_children: true`
  - Rate limiting: simple delay between requests (minimum 334ms between calls = 3 req/s). On 429 response, retry with exponential backoff (1s, 2s, 4s, max 3 retries)
  - All methods use the SDK v5 API. No legacy REST calls.

- [x] T006 [US1] Create `test/unit/notion-client.test.ts` — Unit tests for NotionClientWrapper:
  - Test `getDataSourceId` returns correct ID from mocked `databases.retrieve` response
  - Test `getDataSourceId` caches result (second call doesn't hit API)
  - Test `queryPages` handles pagination (mock two pages of results with `has_more: true` then `has_more: false`)
  - Test `getPageBlocks` recursively fetches children (mock parent block with `has_children: true`, mock nested blocks response)
  - Test rate limiting: verify requests are spaced appropriately (mock timers)
  - Use `vi.fn()` to mock the Notion SDK Client methods

**Checkpoint**: Client wrapper tested with mocks, all 4 acceptance scenarios covered

---

## Phase 3: User Story 2 — Block-to-Markdown Converter (Priority: P1)

**Goal**: Convert Notion blocks to Docusaurus-compatible markdown strings.

**Independent Test**: Unit tests for each supported block type.

### Implementation

- [x] T007 [P] [US2] Create `src/converter/rich-text.ts` — `richTextToMarkdown(richTexts: NotionRichText[]): string`:
  - Handle annotations: bold (`**`), italic (`*`), strikethrough (`~~`), code (`` ` ``), underline (ignored — no standard MD equivalent)
  - Handle links: `[text](url)`
  - Handle multiple annotations on same text (e.g., bold + italic = `***text***`)
  - Handle empty/null rich text arrays → empty string
  - Handle color annotations: skip (no MD equivalent, Docusaurus doesn't use them)

- [x] T008 [P] [US2] Create `test/unit/rich-text.test.ts` — Unit tests:
  - Plain text, bold, italic, code, strikethrough, links
  - Combined annotations (bold + italic, bold + link)
  - Empty/null input
  - Multiple rich text segments concatenated

- [x] T009 [US2] Create `src/converter/blocks-to-md.ts` — `blocksToMarkdown(blocks: NotionBlock[]): string`:
  - Handle each block type as a function: `paragraph`, `heading_1/2/3`, `bulleted_list_item`, `numbered_list_item`, `code`, `quote`, `callout`, `divider`, `table`, `toggle`, `image`, `to_do`, `bookmark`
  - **paragraph**: Use `richTextToMarkdown` for content, blank line after
  - **heading_1/2/3**: `#`/`##`/`###` + richTextToMarkdown
  - **bulleted_list_item**: `- ` + content. Handle nested children with 2-space indent
  - **numbered_list_item**: `1. ` + content. Handle nested children with 3-space indent
  - **code**: Fenced code block with language annotation (````language\n...\n````)
  - **quote**: `> ` prefix on each line
  - **callout**: Map to Docusaurus admonitions — icon/color → `:::note`, `:::tip`, `:::warning`, `:::danger`, `:::info` (default to `:::note`)
  - **divider**: `---`
  - **table**: Pipe-table syntax with header row separator
  - **toggle**: `<details><summary>title</summary>\n\ncontent\n\n</details>`
  - **image**: `![caption](url)` with placeholder note that URL may be temporary (spec 005 handles image download)
  - **to_do**: `- [ ] text` or `- [x] text`
  - **bookmark**: `[url](url)` simple link
  - **unsupported types**: Log warning, output `<!-- Unsupported block type: {type} -->`
  - Consecutive list items of the same type should NOT have blank lines between them
  - Non-list blocks should have blank lines between them

- [x] T010 [US2] Create `test/unit/blocks-to-md.test.ts` — Unit tests:
  - One test per block type (paragraph, headings, code, lists, quote, callout, divider, table, toggle, image, to_do, bookmark)
  - Test nested list items (indentation)
  - Test callout-to-admonition mapping
  - Test toggle with children
  - Test table with header row
  - Test unsupported block type → comment
  - Test consecutive list items (no extra blank lines)
  - Test rich text formatting within blocks
  - Use mock helpers from `test/helpers.ts`

**Checkpoint**: All 11 acceptance scenarios from spec covered by tests

---

## Phase 4: User Story 3 — Property-to-Frontmatter Mapper (Priority: P1)

**Goal**: Convert Notion database properties to Docusaurus frontmatter YAML.

**Independent Test**: Unit tests with various property types.

### Implementation

- [x] T011 [P] [US3] Create `src/converter/properties-to-fm.ts`:
  - `propertiesToFrontmatter(properties: Record<string, NotionProperty>, config: { statusProperty: string, publishedStatus: string }): { frontmatter: Record<string, unknown>, shouldPublish: boolean }`
  - Property type handlers:
    - `title` → `title: "Page Name"`
    - `rich_text` (Slug) → `slug: the-slug`
    - `rich_text` (Description) → `description: "The description"`
    - `multi_select` (Tags) → `tags: [tag1, tag2]`
    - `number` (Sidebar Position) → `sidebar_position: 3`
    - `date` (Published Date) → `date: 2026-02-06`
    - `select` (Category) → `sidebar_label: Tutorials`
    - `select` (Status) → Not in frontmatter, used for `shouldPublish` filtering
  - Property name to frontmatter key mapping: configurable via a map, with sensible defaults matching the CMS template:
    - `Name` → `title`, `Slug` → `slug`, `Description` → `description`, `Tags` → `tags`, `Sidebar Position` → `sidebar_position`, `Published Date` → `date`, `Category` → `sidebar_label`
  - `frontmatterToYaml(fm: Record<string, unknown>): string` — serialize to YAML string using `yaml` package, wrapped in `---` delimiters
  - Skip null/empty property values

- [x] T012 [P] [US3] Create `test/unit/properties-to-fm.test.ts` — Unit tests:
  - Test each property type mapping (all 8 acceptance scenarios from spec)
  - Test `shouldPublish` filtering: Published → true, Draft → false, Archived → false
  - Test empty/null values are skipped
  - Test YAML output format (proper `---` delimiters)
  - Test special characters in title/description are properly YAML-escaped

**Checkpoint**: All 8 acceptance scenarios from spec covered

---

## Phase 5: User Story 4 — Sync State Management (Priority: P1)

**Goal**: Track sync state so only changed pages are re-synced.

**Independent Test**: Unit tests for state file CRUD and change detection.

### Implementation

- [x] T013 [US4] Create `src/sync/state.ts`:
  - `loadState(stateFilePath: string): Promise<SyncStateFile>` — Read JSON state file. If file doesn't exist, return empty state with `version: 1`. If corrupted/unparseable, log warning and return empty state (triggers full re-sync).
  - `saveState(stateFilePath: string, state: SyncStateFile): Promise<void>` — Write JSON state file atomically (write to .tmp, rename)
  - `detectChanges(state: SyncStateFile, pages: NotionPage[]): { changed: NotionPage[], unchanged: string[], deleted: string[] }`:
    - `changed`: pages where `last_edited_time > state.pages[id].notionLastEdited` OR pages not in state
    - `unchanged`: page IDs where timestamps match
    - `deleted`: page IDs in state but not in current pages list
  - `updatePageState(state: SyncStateFile, pageId: string, entry: PageStateEntry): void` — update a single page in state
  - `removePageState(state: SyncStateFile, pageId: string): void` — remove a deleted page from state
  - `computeContentHash(content: string): string` — SHA-256 hash of file content (for future Git → Notion change detection)

- [x] T014 [US4] Create `test/unit/sync-state.test.ts` — Unit tests:
  - Test `loadState` with no file → empty state
  - Test `loadState` with valid file → parsed state
  - Test `loadState` with corrupted file → empty state + warning
  - Test `saveState` writes valid JSON
  - Test `detectChanges` with new page → in changed list
  - Test `detectChanges` with edited page (newer timestamp) → in changed list
  - Test `detectChanges` with unchanged page (same timestamp) → in unchanged list
  - Test `detectChanges` with deleted page → in deleted list
  - Test `computeContentHash` produces consistent SHA-256

**Checkpoint**: All 5 acceptance scenarios from spec covered

---

## Phase 6: User Story 5 — File Writer (Priority: P1)

**Goal**: Write markdown files with frontmatter to the output directory.

**Independent Test**: Integration test writing actual files to a temp directory.

### Implementation

- [x] T015 [US5] Create `src/sync/file-writer.ts`:
  - `writeMarkdownFile(outputDir: string, slug: string, frontmatter: string, body: string): Promise<string>` — Writes `{outputDir}/{slug}.md` with content `{frontmatter}\n{body}`. Creates output directory if it doesn't exist. Returns the file path written.
  - `deleteMarkdownFile(filePath: string): Promise<void>` — Deletes a file. No error if file doesn't exist.
  - `slugFromTitle(title: string): string` — Convert title to kebab-case slug: lowercase, replace spaces/special chars with hyphens, collapse consecutive hyphens, trim leading/trailing hyphens.

- [x] T016 [US5] Create `test/unit/file-writer.test.ts` — Unit tests:
  - Test `writeMarkdownFile` creates file with correct content
  - Test `writeMarkdownFile` creates directory if missing
  - Test `writeMarkdownFile` with slug containing only safe chars
  - Test `deleteMarkdownFile` removes file
  - Test `deleteMarkdownFile` on non-existent file → no error
  - Test `slugFromTitle` with various inputs: "Getting Started" → "getting-started", "What's New?" → "whats-new", "API / REST" → "api-rest"
  - Use `os.tmpdir()` for test file operations

**Checkpoint**: All 4 acceptance scenarios from spec covered

---

## Phase 7: User Story 6 — Sync Engine & CLI Command (Priority: P1)

**Goal**: Orchestrate the full pipeline and expose via a basic CLI command.

**Independent Test**: E2E test against the live Notion test database.

### Implementation

- [x] T017 [US6] Create `src/sync/engine.ts` — `syncNotionToGit(config: SyncConfig): Promise<SyncResult>`:
  - Initialize NotionClientWrapper with config.notionToken
  - Resolve data source ID from config.databaseId
  - Load sync state from config.stateFile
  - Query all pages via dataSources.query
  - Filter by status (only publishedStatus pages, unless configured otherwise)
  - Detect changes via state comparison
  - For each changed page:
    - Fetch blocks (recursive)
    - Convert blocks → markdown (blocksToMarkdown)
    - Map properties → frontmatter (propertiesToFrontmatter + frontmatterToYaml)
    - Determine slug (from Slug property or slugFromTitle)
    - Write file (writeMarkdownFile)
    - Update sync state
  - Handle deleted pages: delete file, remove from state
  - Save state
  - Return SyncResult with summary
  - Support `--full` mode (skip change detection, re-sync all)

- [x] T018 [US6] Update `src/cli.ts` — basic `sync` command:
  - Parse minimal args: `sync` subcommand, `--full` flag, `--output` dir override
  - Load config from environment variables: `NOTION_TOKEN`, `NOTION_DATABASE_ID`
  - Default output dir: `./docs`
  - Default state file: `./.notion-sync-state.json`
  - Default status property: `Status`, default published value: `Published`
  - Call `syncNotionToGit(config)` and print summary (pages created/updated/deleted/skipped/errors)
  - Clear error messages for missing config (no token, no database ID)

- [x] T019 [US6] Update `src/sync/notion-to-git.ts` — Replace stub with re-export from engine.ts (or inline delegation). Keep `syncNotionToGit` as the public API function. Update `src/index.ts` exports to include new modules: `NotionClientWrapper`, `blocksToMarkdown`, `propertiesToFrontmatter`.

- [x] T020 [US6] Create `test/e2e/sync.test.ts` — E2E test against live Notion test database:
  - Requires `NOTION_TOKEN` env var (skip if not available)
  - Run full sync against test DB ID `2ffc0fdf-942d-817f-ad7e-efd2e1887262`
  - Assert 3 markdown files created (Published pages only, not Draft/Archived)
  - Assert files contain valid frontmatter (title, slug, tags present)
  - Assert files contain markdown body content
  - Run sync again → assert no files modified (incremental sync)
  - Clean up temp output directory after test

**Checkpoint**: All success criteria met — SC-001 through SC-005

---

## Phase 8: Polish & Verification

**Purpose**: Final checks, build verification, documentation

- [x] T021 Verify `npm run build` succeeds with all new code
- [x] T022 Verify `npm run test` passes all unit tests
- [x] T023 Run E2E test: `NOTION_TOKEN=<token> npm run test -- test/e2e/` — verify against live database
- [x] T024 Update `src/index.ts` with complete public API exports
- [ ] T025 Add `.notion-sync-state.json` to `.gitignore`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1 Client)**: Depends on Phase 1 types (T002, T003)
- **Phase 3 (US2 Converter)**: Depends on Phase 1 types (T003) and helpers (T004). Can run in parallel with Phase 2.
- **Phase 4 (US3 Frontmatter)**: Depends on Phase 1 types (T003). Can run in parallel with Phases 2 and 3.
- **Phase 5 (US4 State)**: Depends on Phase 1 types (T002). Can run in parallel with Phases 2-4.
- **Phase 6 (US5 File Writer)**: No Phase 2-5 dependencies. Can run in parallel.
- **Phase 7 (US6 Engine + CLI)**: Depends on ALL of Phases 2-6 being complete.
- **Phase 8 (Polish)**: Depends on Phase 7.

### Parallel Opportunities

```text
Phase 1 (Setup)
    ↓
┌───────────┬───────────┬───────────┬───────────┐
│  Phase 2  │  Phase 3  │  Phase 4  │  Phase 5  │  ← all parallel
│ US1:Client│ US2:Blocks│ US3:Props │ US4:State │
└─────┬─────┴─────┬─────┴─────┬─────┴─────┬─────┘
      │     Phase 6 (US5:Writer) also parallel ↑
      └───────────┴───────────┴───────────┘
                        ↓
                  Phase 7 (US6: Engine + CLI)
                        ↓
                  Phase 8 (Polish)
```

### Within Each Phase

- Models/types before implementation
- Implementation before tests (though TDD is fine too)
- All [P] tasks within a phase can run in parallel

---

## Implementation Strategy

### Sequential Execution (RALF)

1. Complete Phase 1 (T001-T004)
2. Complete Phases 2-6 sequentially by user story (T005-T016)
3. Complete Phase 7 integration (T017-T020)
4. Complete Phase 8 verification (T021-T025)
5. **STOP and VALIDATE**: Run full test suite including E2E

### Commit Strategy

- Commit after each phase completion
- Commit message format: `feat(sync): <description>`
- Phase 7 commit is the major milestone

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to user story for traceability
- Test DB has 5 pages: 3 Published, 1 Draft, 1 Archived
- SDK v5 requires `as any` casts for `data_sources` property on database response (types may lag)
- Rate limiting is critical — Notion will 429 us without it
- Image URLs in output are temporary (S3, ~1hr expiry) — this is expected, spec 005 fixes it
