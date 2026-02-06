# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

## Summary

[Extract from feature spec: primary requirement + technical approach]

## Technical Context

<!--
  ACTION REQUIRED: Replace with the technical details for this project.
-->

**Language/Version**: [e.g., Python 3.11, TypeScript 5.x]
**Primary Dependencies**: [e.g., FastAPI, Express, React]
**Storage**: [if applicable, e.g., PostgreSQL, SQLite, files]
**Testing**: [e.g., pytest, Jest, cargo test]
**Target Platform**: [e.g., Linux server, browser, mobile]
**Project Type**: [single/web/mobile - determines source structure]
**Performance Goals**: [domain-specific, e.g., 1000 req/s, <200ms latency]
**Constraints**: [domain-specific, e.g., memory limits, offline-capable]
**Scale/Scope**: [domain-specific, e.g., 10k users, single-tenant]

## Constitution Check

*GATE: Must pass before proceeding. Re-check after design.*

- [ ] Principle I: [Check against first constitutional principle]
- [ ] Principle II: [Check against second principle]
- [ ] Principle III: [Check against third principle]

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── spec.md              # WHAT and WHY
├── plan.md              # This file - HOW
├── research.md          # Decisions and alternatives
├── tasks.md             # Executable tasks
├── checklist.md         # Quality gates
└── contracts/           # API specs if applicable
    └── api.yaml
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace with the concrete layout for this feature.
-->

```text
# Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# Option 2: Web application
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/
```

**Structure Decision**: [Document the selected structure]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., extra dependency] | [current need] | [why simpler approach insufficient] |

## Research Notes

<!--
  Key decisions, alternatives considered, and rationale.
  Move detailed research to research.md if extensive.
-->

### Approach Chosen

[Describe the selected approach]

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| [Option A] | | | |
| [Option B] | | | |

### Open Questions

- [ ] [Question that needs resolution before implementation]
- [ ] [Another open question]

## Next Steps

1. Create tasks.md with `/speckit.tasks`
2. Validate against checklist with `/speckit.checklist`
3. Begin implementation with `/speckit.implement`
