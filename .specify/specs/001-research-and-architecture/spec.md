# Feature Specification: Research and Architecture Foundation

**Feature Branch**: `001-research-and-architecture`
**Created**: 2026-02-06
**Status**: Complete
**Input**: Deep research into existing tooling, Notion API capabilities, Docusaurus integration patterns, bidirectional sync strategies, and architecture decisions for a publishable Notion ↔ Git sync tool.

## Deliverables

### 1. Architecture Decision Records

A consolidated research and architecture document at `docs/research/architecture-decisions.md` containing 9 numbered ADRs covering all major technical decisions:

- ADR-001: Pre-build file sync (not a Docusaurus plugin)
- ADR-002: SDK v5 dataSources API (no legacy REST fallbacks)
- ADR-003: Page-level sync granularity
- ADR-004: Simple conflict resolution rules (latest-wins default)
- ADR-005: Pluggable image strategy (local, Google Drive, custom)
- ADR-006: Notion-to-markdown conversion (notion-to-md v4 or custom)
- ADR-007: Markdown-to-Notion conversion (unified/remark AST pipeline)
- ADR-008: Incremental sync via state file
- ADR-009: MD output format (not MDX by default)

Plus: existing tool landscape evaluation, Notion API key facts, and CMS database template.

### 2. Project Constitution (v2.1.0)

`.specify/memory/constitution.md` — 8 core principles, technology stack, architecture overview, conflict resolution flow, and 10-spec roadmap.

### 3. Test Infrastructure

- TypeScript project with ESM, tsup build, vitest testing
- Docusaurus v3 test site (verified building)
- Notion test database with 8 CMS properties and 5 sample pages
- Connectivity tests verifying SDK v5 dataSources API

### 4. Key Findings

- **SDK v5 breaking change**: `databases.query` → `dataSources.query` with data source ID indirection
- **No existing tool** handles bidirectional sync (all are Notion → MD only)
- **Notion webhooks** now available (page.content_updated, page.properties_updated)
- **Status property**: Must use `select` type, not classic `status` (fails programmatically)
- **Image expiry**: ~1 hour S3 URLs, requires pluggable download strategy
- **notion-to-md v4**: Has renderer plugin system for Docusaurus-specific output

## Success Criteria (Met)

- [x] Architecture decisions document exists with 9+ ADRs
- [x] Notion block type mapping documented with bidirectional conversion notes
- [x] Build-vs-extend recommendation documented (build custom, use notion-to-md v4 as dep)
- [x] Conflict resolution: 3 strategies documented with recommended default
- [x] CMS database template implemented and tested
- [x] End-to-end connectivity verified (Notion API, Docusaurus build, test suite)
