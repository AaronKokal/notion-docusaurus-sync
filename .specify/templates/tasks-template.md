# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Include test tasks only if explicitly requested in the specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- Adjust based on plan.md structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize project with dependencies
- [ ] T003 [P] Configure linting and formatting tools

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Setup database/storage layer
- [ ] T005 [P] Implement core utilities and helpers
- [ ] T006 [P] Setup error handling and logging
- [ ] T007 Create base models/entities that all stories depend on
- [ ] T008 Configure environment and configuration management

**Checkpoint**: Foundation ready - user story implementation can begin

---

## Phase 3: User Story 1 - [Title] (Priority: P1) MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Implementation for User Story 1

- [ ] T010 [P] [US1] Create [Entity1] model in src/models/
- [ ] T011 [P] [US1] Create [Entity2] model in src/models/
- [ ] T012 [US1] Implement [Service] in src/services/ (depends on T010, T011)
- [ ] T013 [US1] Implement [endpoint/feature] in src/
- [ ] T014 [US1] Add validation and error handling
- [ ] T015 [US1] Add logging for user story 1 operations

**Checkpoint**: User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Implementation for User Story 2

- [ ] T016 [P] [US2] Create [Entity] model in src/models/
- [ ] T017 [US2] Implement [Service] in src/services/
- [ ] T018 [US2] Implement [endpoint/feature] in src/
- [ ] T019 [US2] Integrate with User Story 1 components (if needed)

**Checkpoint**: User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Implementation for User Story 3

- [ ] T020 [P] [US3] Create [Entity] model in src/models/
- [ ] T021 [US3] Implement [Service] in src/services/
- [ ] T022 [US3] Implement [endpoint/feature] in src/

**Checkpoint**: All user stories should now be independently functional

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] Documentation updates
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance optimization
- [ ] TXXX Security hardening

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational completion
  - Can proceed in parallel (if staffed) or sequentially by priority
- **Polish (Final)**: Depends on desired user stories being complete

### Within Each User Story

- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All [P] tasks can run in parallel within their phase
- Once Foundational completes, user stories can start in parallel
- Different team members can work on different stories

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Setup + Foundational
2. Complete User Story 1
3. **STOP and VALIDATE**: Test independently
4. Deploy/demo if ready

### Incremental Delivery

1. Foundation ready
2. Add User Story 1 → Test → Deploy (MVP!)
3. Add User Story 2 → Test → Deploy
4. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
