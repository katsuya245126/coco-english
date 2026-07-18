# Replace D-19 Incomplete Badge Semantics

**Status:** Complete

## Goal

Make the teacher Incomplete badge attention-scoped: count missed assignments and assignments due within three days, while excluding Later work.

## Scope

- `src/components/teacher/TeacherQueueViews.tsx`
- `src/domain/teacher/assignment-operations.ts`
- `tests/domain/assignment-operations.test.ts`

## Decision

The user approved replacing D-19's all-outstanding badge count on 2026-07-19. Later work remains visible in the collapsed Later section but does not contribute to the badge.

## Done Checks

- [x] Due soon includes deadlines exactly three days away.
- [x] Deadlines beyond three days and undated work remain Later.
- [x] Badge counts missed and due-soon items only.
- [x] Teacher-facing copy says three days.
- [x] Focused domain tests pass.
- [x] Typecheck passes.

## Verification

- `npm test -- --run tests/domain/assignment-operations.test.ts` — 10 tests passed.
- `npm run typecheck` — passed.

## Result

Preserved the approved unstaged production implementation and separated regression coverage for the three-day boundary and attention-scoped badge count. No commit or external action was performed.
