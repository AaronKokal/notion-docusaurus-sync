# Notion Docusaurus Sync

Sync Notion databases with Docusaurus markdown content.

## Spec-Driven Development

This project uses spec-kit for structured development.

### Quick Reference

| Command | Description |
|---------|-------------|
| `/speckit.constitution` | Define project principles |
| `/speckit.specify` | Create feature specification |
| `/speckit.plan` | Create technical plan |
| `/speckit.tasks` | Generate task breakdown |
| `/speckit.implement` | Execute tasks |

### Artifacts

- **Constitution**: [.specify/memory/constitution.md](.specify/memory/constitution.md)
- **Specs**: [.specify/specs/](.specify/specs/)
- **Templates**: [.specify/templates/](.specify/templates/)

### Workflow

```text
Issue → /speckit.specify → spec.md
        /speckit.plan → plan.md
        /speckit.tasks → tasks.md
        /speckit.implement → PRs
```

## Ralph Wiggum Loop (Autonomous Execution)

This project uses [speckit-ralph](https://github.com/T-0-co/speckit-ralph) for autonomous task execution.

### Ralph Commands

| Command | Description |
|---------|-------------|
| `./ralph start <spec_dir>` | Start autonomous loop |
| `./ralph status <spec_dir>` | Check progress |
| `./ralph --dry-run <spec_dir>` | Preview without executing |
| `touch <spec_dir>/.ralph/.stop` | Graceful stop |

### Ralph Workflow

```text
/speckit.specify → /speckit.plan → /speckit.tasks → ./ralph start
```

### Monitoring

Run in a separate terminal for live dashboard:

```bash
.specify/ralph/bin/ralph-context.sh <spec_dir> --simple --loop
```

### Configuration

- **Global prompts**: `.specify/ralph/ralph-global.md` (skill mappings)
- **Per-spec prompts**: `<spec_dir>/ralph-spec.md` (feature-specific)
- **State files**: `<spec_dir>/.ralph/` (gitignored)

## Notion Test Environment

Test database for development and integration testing.

| Resource | ID |
| -------- | --- |
| Test Page (Personal Main db) | `2ffc0fdf-942d-81b2-b368-caffd931859b` |
| Docusaurus Sync Test DB | `2ffc0fdf-942d-817f-ad7e-efd2e1887262` |
| Personal Main db (parent) | `2aec0fdf-942d-81f8-be12-f51d51b9fb32` |

The test DB has 8 properties: Name (title), Status (select: Draft/Published/Archived), Slug (rich_text), Description (rich_text), Tags (multi_select), Sidebar Position (number), Published Date (date), Category (select).

5 sample pages with varied statuses and block types (headings, paragraphs, code, callouts, tables, quotes, numbered/bulleted lists, dividers).

## SDK v5 API (Mandatory)

All Notion API calls MUST use `@notionhq/client` v5 and its current API. No legacy REST fallbacks.

The v5 SDK uses a `dataSources` indirection for database queries:

1. `databases.retrieve(database_id)` → returns metadata + `data_sources[]` array (no properties)
2. `dataSources.retrieve(data_source_id)` → returns properties
3. `dataSources.query(data_source_id)` → queries pages

Cache data source IDs per sync run. The test DB's data source ID: `2ffc0fdf-942d-8181-b89d-000bab557711`

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript strict, ESM
- **Build**: tsup
- **Test**: vitest
- **Notion SDK**: @notionhq/client
- **Package Manager**: npm
