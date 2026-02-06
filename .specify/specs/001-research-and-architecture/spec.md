# Feature Specification: Research and Architecture Foundation

**Feature Branch**: `001-research-and-architecture`
**Created**: 2026-02-06
**Status**: Draft
**Input**: Deep research into existing tooling, Notion API capabilities, Docusaurus integration patterns, bidirectional sync strategies, and architecture decisions for a publishable Notion ↔ Git sync tool.

## User Scenarios & Testing

### User Story 1 - Evaluate Existing Solutions (Priority: P1)

As the project owner, I need a comprehensive evaluation of all existing Notion-to-Docusaurus and Notion-to-static-site tools so I can make informed build-vs-extend decisions.

**Why this priority**: Without understanding the landscape, we risk rebuilding what already exists or missing proven patterns.

**Independent Test**: A research document exists at `docs/research/existing-solutions.md` covering all major tools with pros/cons analysis.

**Acceptance Scenarios**:

1. **Given** the research document, **When** I read it, **Then** I find evaluations of at least: docu-notion, notion-to-md v4, notion-downloader, docusaurus-notion-mdx-plugin, react-notion-x, and Notion-Hugo
2. **Given** each tool evaluation, **When** I review it, **Then** it includes: architecture approach, block type coverage, image handling, bidirectional support (if any), limitations, and maintenance status

---

### User Story 2 - Notion API Deep Dive (Priority: P1)

As the project owner, I need detailed documentation of Notion API capabilities and constraints relevant to bidirectional content syncing, including webhooks and write capabilities.

**Why this priority**: The API's constraints (rate limits, recursive block fetching, image expiry, block creation API) directly shape the architecture for both directions.

**Independent Test**: A research document exists at `docs/research/notion-api-analysis.md` with actionable findings.

**Acceptance Scenarios**:

1. **Given** the API analysis, **When** I review it, **Then** I find: rate limit strategies, block type inventory with markdown mappings, image expiry handling patterns, webhook event types, and block creation/update API capabilities
2. **Given** the write API section, **When** I review it, **Then** I find documentation of how to create pages, append blocks, update blocks, and delete blocks -- the primitives needed for Git → Notion sync
3. **Given** the webhook section, **When** I review it, **Then** I find the specific events useful for sync, delivery guarantees, and security verification

---

### User Story 3 - Docusaurus Integration Patterns (Priority: P1)

As the project owner, I need documentation of how Docusaurus processes external content and what integration points are available.

**Why this priority**: Understanding Docusaurus's expectations (frontmatter, sidebars, MDX) determines what the converter must produce.

**Independent Test**: A research document exists at `docs/research/docusaurus-integration.md` with mapping tables and architecture recommendations.

**Acceptance Scenarios**:

1. **Given** the integration document, **When** I review it, **Then** I find: complete frontmatter field inventory, Notion-property-to-frontmatter mapping table (bidirectional), sidebar generation strategy, and MDX vs MD decision
2. **Given** the block mapping table, **When** I review it, **Then** every Notion block type has a corresponding Docusaurus output format (or is marked as unsupported with rationale)

---

### User Story 4 - Bidirectional Sync Research (Priority: P1)

As the project owner, I need research into how bidirectional sync between Notion and Git can work, including Markdown → Notion conversion and conflict resolution.

**Why this priority**: The Git → Notion direction is where no existing tool delivers. Understanding the feasibility and approach is critical before building.

**Independent Test**: A research document exists at `docs/research/bidirectional-sync.md` covering conversion, conflict resolution, and sync state management.

**Acceptance Scenarios**:

1. **Given** the bidirectional sync document, **When** I review it, **Then** I find: evaluation of markdown-to-Notion-blocks conversion approaches (unified/remark AST, custom parser, etc.), an assessment of what markdown features map cleanly back to Notion blocks and what is lossy
2. **Given** the conflict resolution section, **When** I review it, **Then** I find: a comparison of "latest-wins", "notion-wins", and "git-wins" strategies with pros/cons and the recommended default
3. **Given** the sync state section, **When** I review it, **Then** I find: how page-level sync state is tracked on both sides (Notion `last_edited_time`, git file timestamps/hashes), and how the sync engine detects which pages changed on which side

---

### User Story 5 - Architecture Decision Record (Priority: P2)

As the project owner, I need formal architecture decisions documented so future development is guided by clear rationale.

**Why this priority**: Decisions made now affect every subsequent spec. The bidirectional requirement especially needs clear ADRs.

**Independent Test**: An ADR document exists at `docs/research/architecture-decisions.md` with numbered decisions.

**Acceptance Scenarios**:

1. **Given** the ADR document, **When** I review it, **Then** I find decisions on: sync approach, converter libraries (both directions), output format (MD vs MDX), image strategy (pluggable: local, Google Drive, custom), conflict resolution default, page-level vs block-level sync granularity, and incremental sync mechanism
2. **Given** each decision, **When** I review it, **Then** it includes: context, options considered, decision, and consequences

---

### User Story 6 - Notion CMS Database Template (Priority: P3)

As the project owner, I need a recommended Notion database schema for CMS usage that maps cleanly to Docusaurus frontmatter in both directions.

**Why this priority**: A well-designed database template is essential for user experience but depends on the property-to-frontmatter mapping from P1 research.

**Independent Test**: A document exists at `docs/research/notion-cms-template.md` describing the recommended database schema.

**Acceptance Scenarios**:

1. **Given** the template document, **When** I review it, **Then** I find: property names, types, purposes, and how each maps bidirectionally to Docusaurus frontmatter
2. **Given** the property list, **When** I review it, **Then** it includes at minimum: Title, Status, Slug, Description, Tags, Sidebar Position, Published Date, and Category

---

### Edge Cases

- What happens when Notion block types are added that we don't support yet? (Graceful fallback with warning)
- How do we handle Notion content that uses features MDX doesn't support? (Document unsupported mappings)
- What if notion-to-md v4 stays in alpha indefinitely? (Have a fallback plan for custom conversion)
- What happens when markdown contains syntax that has no Notion equivalent? (Document lossy mappings for Git → Notion)
- How do we handle a page deleted on one side but edited on the other? (Conflict rule applies; log prominently)

## Requirements

### Functional Requirements

- **FR-001**: Research MUST cover all major existing Notion-to-static-site tools (minimum 6)
- **FR-002**: Research MUST document every Notion API block type and its markdown equivalent (both directions)
- **FR-003**: Research MUST document Notion webhook capabilities and delivery guarantees
- **FR-004**: Research MUST document Docusaurus frontmatter fields and sidebar generation
- **FR-005**: Architecture decisions MUST follow ADR format (context, options, decision, consequences)
- **FR-006**: Research MUST evaluate notion-to-md v4's renderer plugin system for Docusaurus-specific output
- **FR-007**: Research MUST document Notion API rate limits and recommend a sync strategy for sites with 100-1000 pages
- **FR-008**: Research MUST evaluate markdown-to-Notion-blocks conversion approaches (unified/remark, custom, etc.)
- **FR-009**: Research MUST document which markdown features are lossy when converting back to Notion
- **FR-010**: Research MUST evaluate conflict resolution strategies and recommend a default

### Key Entities

- **Notion Block Types**: The ~30 block types the API can return, each needing a bidirectional conversion strategy
- **Docusaurus Frontmatter Fields**: The ~25 frontmatter fields that control doc behavior
- **Sync State**: Per-page tracking of last-edited-time on both sides (Notion and Git)
- **Conflict Record**: Log of detected conflicts and how each was resolved

## Success Criteria

### Measurable Outcomes

- **SC-001**: All 6 research documents exist in `docs/research/` and are complete
- **SC-002**: The architecture decisions document contains at least 7 numbered ADRs
- **SC-003**: The Notion block type mapping covers all block types with bidirectional conversion notes
- **SC-004**: A clear build-vs-extend recommendation exists for converter libraries in both directions
- **SC-005**: The conflict resolution section documents at least 3 strategies with a recommended default
