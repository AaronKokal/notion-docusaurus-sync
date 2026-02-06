# MANDATORY: Ralph Global Configuration

You MUST use skills instead of writing manual implementations when available.

## Project Context

- **Project**: Notion Docusaurus Sync
- **Purpose**: Bidirectional sync between Notion databases and Docusaurus markdown files
- **Tech Stack**: TypeScript (strict mode), Node.js 20+, ESM
- **Build Command**: `npm run build`
- **Test Command**: `npm run test`
- **Notion SDK**: `@notionhq/client` v5.9+ (SDK v5 dataSources API — MANDATORY per Constitution VIII)

## CRITICAL: SDK v5 API Pattern

All Notion API calls MUST use the dataSources indirection:

1. `databases.retrieve(database_id)` → get `data_sources[0].id`
2. `dataSources.retrieve(data_source_id)` → get properties
3. `dataSources.query(data_source_id)` → query pages

**NEVER** use legacy REST endpoints or `Notion-Version: 2022-06-28`.

## Required Skills by Task Type

No project-specific skills exist yet. As the project develops, this file
should be updated with skill mappings.

## Conventions

- Always read CLAUDE.md before starting work
- Read the constitution at `.specify/memory/constitution.md` for project principles
- Read the spec at `.specify/specs/002-core-sync-engine/spec.md` and plan at `plan.md` before implementing
- Commit after each successful task with message: "Ralph: T### - <description>"
- Run `npm run build` after code changes to verify compilation
- Run `npm run test` to verify unit tests pass
- For E2E tests requiring Notion API: source `.env` for `NOTION_TOKEN`
- Use `as any` casts where SDK v5 types lag behind the actual API (e.g., `data_sources` on database response)

## If No Skill Exists

Write manual code following patterns established in the codebase and constitution.
