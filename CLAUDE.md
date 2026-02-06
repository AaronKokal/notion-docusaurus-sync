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
