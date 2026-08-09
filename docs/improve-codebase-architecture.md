# Improve Codebase Architecture

**Review date:** 2026-08-09  
**Status:** Findings recorded; implementation proceeds one candidate at a time  
**First candidate:** Teacher-owned pronunciation reprocessing

## Visual report

The review also generated a visual HTML report with before-and-after diagrams:

`/var/folders/50/0479x6w97xb02v8hkbdth29w0000gn/T/architecture-review-20260809-004718.html`

This is a temporary local file outside the repository. The operating system can
remove it. This Markdown document is the durable record of the findings.

## Purpose

This review finds places where callers must know rules that belong inside a
module. Each candidate deepens an existing module instead of adding a new
abstraction.

The repository has no `CONTEXT.md` or architecture decision records for these
areas. Product language comes from `PROJECT.md`. The review did not inspect the
archived `.planning/` history.

## Design vocabulary

- **Module:** Code with an interface and an implementation.
- **Interface:** Everything that a caller must know to use a module correctly.
- **Deep module:** A small interface hides substantial behavior.
- **Shallow module:** Its interface exposes almost as much complexity as its
  implementation.
- **Seam:** The location where a module interface connects to callers.
- **Adapter:** Code that connects a module to a dependency.
- **Locality:** Related rules, changes, and tests stay in one place.
- **Leverage:** One implementation provides behavior to many callers.

The deletion test asks what happens when a module disappears. A useful module
concentrates complexity. A shallow module only moves forwarding code.

## Order of work

1. Teacher-owned pronunciation reprocessing
2. Mission snapshot interpretation
3. Teacher assignment and attempt lifecycle operations
4. Provider admission for paid operations

The first candidate is next in order. No candidate enters design or
implementation until the owner explicitly starts it. Each candidate gets its
own grilling session at that time.

---

## 1. Deepen teacher-owned pronunciation reprocessing

**Recommendation:** Strong  
**Dependency category:** Mock adapter for Azure; local-substitutable Supabase

### Files

- `src/app/teacher/evidence/[attemptId]/actions.ts`
- `src/server/teacher/audio-evidence.ts`
- `src/server/audio/pronunciation-reprocess.ts`
- `src/server/security/request-budget.ts`
- `tests/server/pronunciation-reprocess-action.test.ts`
- `tests/server/pronunciation-reprocess.test.ts`

### Current flow

`reprocessPronunciationAction` performs three ordered calls:

1. `teacherOwnsAudioClip` proves teacher ownership.
2. `consumeRequestBudget` admits paid provider work.
3. `reprocessClipPronunciation` loads, scores, and writes the result.

The service-role reprocessing module accepts only `audioClipId`. Its audio query
does not include a teacher ownership join or filter. Its own module comment says
that callers must perform authorization first.

The current server action performs the ownership proof. The finding is not a
claim that this route currently exposes unauthorized audio. The architecture
permits a future internal caller to bypass the proof.

### Deletion test

If the action orchestration disappears, the next caller must rebuild the same
ownership, admission, and mutation sequence. If `teacherOwnsAudioClip`
disappears, its ownership join must move into reprocessing.

This cluster has one real responsibility that currently spans three modules.

### Problem

The interface makes each caller know a security-sensitive order. The
service-role mutation does not independently prove ownership, which conflicts
with the repository safety rule for audio mutations.

### Deepening direction

Move ownership proof, provider admission, clip loading, scoring, and score
persistence behind one server-owned reprocessing seam. Keep the Azure scorer as
an internal adapter. Keep web concerns, such as teacher authentication and page
refresh, in the server action.

Do not define the final interface until the grilling session settles the design
tree.

### Benefits

- Locality: ownership and mutation change together.
- Leverage: every future caller receives the same security behavior.
- Tests observe reprocessing outcomes through one interface.
- Action tests stop asserting internal call order.

### Active design questions

- Which module owns provider admission?
- Which public failures remain distinct?
- Does the reprocessing module accept teacher identity or an owned evidence
  value?
- Which Supabase adapter is used by focused tests?
- Which existing action and module tests survive at the new test surface?

### Existing security mechanisms

- `audio_clips` already has authenticated teacher-owner RLS through
  `is_attempt_turn_owner`.
- `pronunciation_scores` already has authenticated owner RLS through
  `is_audio_clip_owner` for reads and writes.
- The private `student-audio` bucket has no authenticated Storage download
  policy.
- No existing RPC performs owner-scoped pronunciation reprocessing.
- The existing teacher audio path proves ownership, then creates a short-lived
  signed URL for private audio.

The no-migration path can use authenticated RLS for table operations and the
existing owned signed-URL path for the immediate server-side audio fetch. A
fully authenticated Storage download requires a new policy and migration.

---

## 2. Deepen mission snapshot interpretation

**Recommendation:** Strong  
**Dependency category:** In-process

### Files

- `src/domain/mission/schemas.ts`
- `src/server/student-access/student-history.ts`
- `src/server/teacher/audio-evidence.ts`
- `src/server/student-access/mission-flow.ts`
- `src/app/student/missions/[assignmentStudentId]/page.tsx`
- `src/app/student/missions/[assignmentStudentId]/tts/route.ts`
- `src/server/student-access/translation-source.ts`
- `src/server/teacher/assignment-student-evidence.ts`

### Evidence

Strict consumers use `missionSnapshotSchema.parse` or `safeParse`. Student recap
and teacher evidence separately accept legacy `order` and current `turnOrder`.
Mission flow reads a partial shape through a type cast.

Ten application and server files interpret stored mission snapshots. A caller
must understand schema rules, legacy compatibility, preset behavior, and
conversation behavior.

### Deletion test

Deleting the schema spreads validation into several consumers. Deleting either
legacy parser spreads compatibility logic into recap and evidence modules. The
existing snapshot module provides value, but it does not hide all supported
interpretation.

### Problem

The effective interface includes stored JSON and caller-specific compatibility
knowledge. Two callers can disagree about a valid snapshot or turn order.

### Deepening direction

Deepen the existing mission snapshot module. Interpret current and legacy
snapshots in one place, then derive the teacher and student views from that
interpretation.

### Benefits

- Locality: snapshot compatibility lives in one module.
- Leverage: teacher and student reads use the same meaning.
- Tests use one surface for preset, conversation, and legacy behavior.

---

## 3. Deepen teacher assignment and attempt lifecycle operations

**Recommendation:** Worth exploring  
**Dependency category:** Local-substitutable Supabase

### Files

- `src/server/teacher/assignment-operations.ts`
- `src/app/teacher/evidence/[attemptId]/actions.ts`
- `src/app/teacher/assignment-actions.ts`
- `src/app/teacher/assignment-students/[assignmentStudentId]/actions.ts`
- `tests/server/teacher-review-actions.test.ts`
- `tests/server/teacher-assignment-operations.test.ts`
- `tests/server/teacher-override.test.ts`

### Evidence

The server module exports thirteen operations. Its interface exposes both
attempt IDs and assignment-student IDs.

`overrideAssignmentStatusAction` performs its own ownership query and resolves
the latest attempt. It then selects `requestSubmissionRetry` or
`markSubmissionReviewed`. The server module performs related ownership and
state checks again.

### Deletion test

Deleting `assignment-operations.ts` spreads ownership joins, latest-attempt
rules, transition guards, result mapping, and queue rules into many callers.
The module provides value, but its broad interface still leaks storage details.

### Problem

Callers must know whether work has an attempt, which identifier to use, how to
resolve the latest attempt, and which function matches the teacher intent.

### Deepening direction

Concentrate intent resolution, current-state loading, ownership proof,
transition validation, and persistence in the existing module. Do not add a
second adapter without a real second implementation.

### Benefits

- Locality: auditable transition rules stay together.
- Leverage: teacher pages and actions learn less storage detail.
- Tests observe lifecycle results instead of Supabase query-chain shape.

---

## 4. Move provider admission behind paid-operation seams

**Recommendation:** Worth exploring  
**Dependency category:** Mock adapters for external providers; local-substitutable budget RPC

### Files

- `src/server/security/request-budget.ts`
- `src/app/student/missions/[assignmentStudentId]/translation-hint/route.ts`
- `src/app/student/missions/[assignmentStudentId]/tts/route.ts`
- `src/app/teacher/missions/actions.ts`
- `src/app/teacher/evidence/[attemptId]/actions.ts`
- `src/server/ai/evaluator-warmup.ts`
- `src/server/student-access/audio-upload.ts`
- `tests/server/student-helper-budget-routes.test.ts`
- `tests/server/teacher-provider-budget-actions.test.ts`

### Evidence

Six production call sites know the budget operation name and the required order
of validation, ownership, cache access, admission, and provider work. Route and
action tests mock `consumeRequestBudget` beside each paid module.

### Deletion test

Deleting `request-budget.ts` duplicates its HMAC, limits, RPC validation, and
fail-closed behavior. That module is already deep. The weak seam is the caller
protocol: a paid operation remains callable without admission.

### Problem

Admission is optional caller behavior. A new caller can bypass it or consume a
budget before ownership and cache checks.

### Deepening direction

Make each paid-operation module own admission at the correct point. Preserve
provider mock adapters inside each implementation. Do not create a generic
provider module.

### Benefits

- Locality: each paid operation owns its cost control.
- Leverage: new callers receive admission automatically.
- Route and action tests focus on browser-facing outcomes.

## Review evidence

- Read `PROJECT.md`, the active `TASK.md`, and the design vocabulary.
- Traced production callers and focused tests for every candidate.
- Applied the deletion test to each candidate.
- Excluded the active student-practice UI rework from architecture findings.
- Made no application, schema, provider, or production change during review.
