# Roadmap: English Speaking Practice App

## Overview

This roadmap delivers the teacher-linked speaking homework loop as a vertical MVP: a teacher can set up a class, assign a mission, students can complete guided voice practice with a supportive buddy, and the teacher can verify completion through transcript-first evidence and exception buckets. The build order reduces the biggest risks first: child-data privacy, classroom identity, deterministic workflow state, mobile audio, bounded AI behavior, and fast teacher review.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Data, Privacy, and Workflow Foundation** - Establish the relational source of truth, server-owned statuses, privacy boundaries, and demo-data separation.
- [x] **Phase 2: Teacher Classroom Access** - Teachers can manage classes and rosters, and students can enter homework without email/password accounts. (completed 2026-06-26)
- [x] **Phase 3: Manual Mission Assignment** - Teachers can manually create a mission and assign immutable homework to every student in a class. (completed 2026-06-26)
- [x] **Phase 4: Guided Student Attempt Loop** - Students can complete the mission flow with classroom-safe buddy prompts, recasts, repeats, hints, and completion rules. (completed 2026-06-27)
- [ ] **Phase 5: Voice Capture and Evidence Storage** - Students record short per-turn clips, transcripts and clip metadata are stored, and teachers can play audio on demand.
- [ ] **Phase 6: AI Mission and Turn Intelligence** - AI generates validated mission drafts and evaluates student turns with structured, bounded, reviewable outputs.
- [ ] **Phase 7: Teacher Review and Pilot Readiness** - Teachers can scan status buckets, review attempts, override outcomes, and run the MVP safely in a pilot.

## Phase Details

### Phase 1: Data, Privacy, and Workflow Foundation

**Goal**: The app has a trustworthy source of truth for teacher-linked homework, child voice metadata, status ownership, retention fields, and real-vs-demo data boundaries.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, ASGN-04
**Success Criteria** (what must be TRUE):

  1. System stores the core classroom, mission, assignment, attempt, turn, transcript, and audio metadata needed for the homework loop.
  2. System owns and records assignment status transitions instead of trusting client-side state.
  3. System can distinguish demo/sample data from real student data.
  4. System records short-clip audio metadata and retention fields without requiring full-session recordings.

**Plans**:

**Wave 1**

- `01-PLAN.md` — Walking skeleton and source-of-truth foundation: Next.js/Supabase scaffold, full workflow schema skeleton, server-owned status transitions, retention/demo boundaries, and smoke verification.

**Cross-cutting constraints:**

- Server-owned status transitions must write audit events.
- Demo/sample data must remain distinguishable from real class data.
- Audio is modeled as short per-turn clip metadata with retention/deletion fields, not full-session recordings.

### Phase 2: Teacher Classroom Access

**Goal**: As a student, I want to enter my class through a code or QR link, reuse a remembered class, pick my name, and unlock with a 4-digit PIN, so that I can reach my homework without an email or password account.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, CLASS-01, CLASS-02, CLASS-03, CLASS-04, STUD-01, STUD-02, STUD-03, STUD-04, STUD-05
**Success Criteria** (what must be TRUE):

  1. Teacher can create an account, stay logged in across refreshes, and log out.
  2. Teacher can create a class, manage its roster, and create or reset student PINs.
  3. Student can enter through a class code or QR/link, reuse a remembered class, select their name, and unlock homework with a 4-digit PIN.
  4. Student sees clear wrong-PIN, no-homework, and expired/closed-homework states.
  5. Teacher cannot access another teacher's classes, missions, assignments, or student attempts.

**Plans**: 4/4 plans complete

- [x] 02-01-PLAN.md
- [x] 02-02-PLAN.md
- [x] 02-03-PLAN.md
- [x] 02-04-PLAN.md

**Wave 1**

- [ ] `02-01-PLAN.md` — Teacher auth walking slice: @supabase/ssr clients, session middleware, RLS migration (+ schema push), teacher signup/verify/login/logout, profile bootstrap, protected dashboard shell.

**Wave 2**

- [ ] `02-02-PLAN.md` — Class management slice: create/edit/archive classes, stable join code generation/reset, and join-code/link/QR share dialog (RLS-bound).
- [ ] `02-03-PLAN.md` — Roster + PIN slice: bulk-paste/edit/archive students and auto-generated 4-digit PIN generation/reset (hash-only, server-side pepper).

**Wave 3**

- [ ] `02-04-PLAN.md` — Student access slice: class-code/QR/link entry, remembered-class context, typed-name + PIN unlock, no-homework home shell, generic mismatch errors, and cross-teacher RLS isolation proof.

**UI hint**: yes

### Phase 3: Manual Mission Assignment

**Goal**: Teachers can create a complete mission by hand, assign it to a class, and produce stable per-student homework records.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: MISS-01, MISS-04, ASGN-01, ASGN-02, ASGN-03
**Success Criteria** (what must be TRUE):

  1. Teacher can create a mission with target pattern, topic, level, required turns, due date, questions, target-form examples, and hints.
  2. Mission records a `characterId` while using the default v1 buddy.
  3. Teacher can assign a mission to a class and create one homework record per active student.
  4. Assigned homework uses a snapshot so later mission edits do not unexpectedly change existing student work.

**Plans**: 3/3 plans complete

- [x] 03-01-PLAN.md
- [x] 03-02-PLAN.md
- [x] 03-03-PLAN.md

**Wave 1**

- [ ] `03-01-PLAN.md` — Manual mission authoring slice: schemas, server actions, create/edit builder UI, required-turn validation, and default buddy character id.

**Wave 2**

- [ ] `03-02-PLAN.md` — Assign-to-class slice: full mission snapshot, atomic assignment RPC, per-active-student homework rows, assign dialog, and schema push gate.

**Wave 3**

- [ ] `03-03-PLAN.md` — Integrated workflow verification: Classes/Missions navigation, edit-after-assign notice, snapshot stability proof, and full Phase 3 verification.

**UI hint**: yes

### Phase 4: Guided Student Attempt Loop

**Goal**: Students can move through the assigned speaking mission with a supportive buddy, meaning-first correction, required repetition, hints, and deterministic completion.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: FLOW-01, FLOW-02, FLOW-04, FLOW-05, FLOW-06, FLOW-07, AI-06, CHAR-01, CHAR-02, CHAR-03, CHAR-04, PILOT-01
**Success Criteria** (what must be TRUE):

  1. Student can see assigned homework and start the mission on common phone and tablet browser sizes.
  2. Buddy asks short classroom-safe questions tied to the assigned mission and cannot continue into open-ended private chat.
  3. System shows a better target-form sentence after the student's original answer and requires a repeat attempt.
  4. Student can reveal progressive hints in order: target pattern, word bank, then full example.
  5. Mission completes only after the required number of turns and repeat attempts are satisfied.

**Plans**: 5/5 plans complete

- [x] 04-01-PLAN.md
- [x] 04-02-PLAN.md
- [x] 04-03-PLAN.md
- [x] 04-04-PLAN.md
- [x] 04-05-PLAN.md

**Wave 1**

- [x] `04-01-PLAN.md` — Swap-isolated foundation units: character-profile module (Coco), placeholder-eval shape, Phase 4 style tokens + db types, and the 4 Wave 0 test scaffolds (AI-06 structural test green). (completed 2026-06-27)

**Wave 2**

- [ ] `04-02-PLAN.md` — Student home assignment-list slice: SSR service-role read with read-time Start/Continue/Done/Closed badges, mobile-first list, launch-to-mission.
- [ ] `04-03-PLAN.md` — Mission-flow backend: start/resume, answer, repeat, hint service + server actions; deterministic completion helper; ownership-gated, audited, no AI call.

**Wave 3**

- [ ] `04-04-PLAN.md` — Mission-flow UI slice: SSR route + client step machine, buddy question, improved sentence + required repeat, in-order progressive hints (one screen per step).

**Wave 4**

- [ ] `04-05-PLAN.md` — Resume + deterministic server-owned audited completion + completion/transition screens; full mission walk green e2e on phone/tablet.

**UI hint**: yes

### Phase 5: Voice Capture and Evidence Storage

**Goal**: Students can answer and repeat by voice, the app stores short evidence clips with transcript records, and teachers can play clips only when needed.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: FLOW-03, AUDIO-01, AUDIO-02, AUDIO-03, AUDIO-04, AUDIO-05, REV-05, PILOT-02
**Success Criteria** (what must be TRUE):

  1. Student can record original answers and repeat attempts as short audio clips.
  2. Student sees understandable microphone permission, recording, upload retry, and upload failure states.
  3. System stores transcript text, audio reference, clip metadata, and processing status for each mission turn.
  4. Teacher can play short audio clips on demand from attempt details without making audio the default review path.

**Plans**: TBD
**UI hint**: yes

### Phase 6: AI Mission and Turn Intelligence

**Goal**: AI accelerates mission creation and turn evaluation while structured validation, confidence handling, and server rules keep outcomes reliable.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: MISS-02, MISS-03, MISS-05, AI-01, AI-02, AI-03, AI-04, AI-05
**Success Criteria** (what must be TRUE):

  1. Teacher can generate a draft mission from target pattern, topic, level, required turns, and due date.
  2. Teacher can preview and edit the generated mission before assignment.
  3. System rejects generated mission output that does not match the strict mission schema.
  4. System evaluates meaning, target-pattern attempt, improved target-form sentence, and repeat closeness for each turn.
  5. System routes low-confidence, failed-schema, or ambiguous AI results to teacher review instead of pretending certainty.

**Plans**: TBD
**UI hint**: yes

### Phase 7: Teacher Review and Pilot Readiness

**Goal**: Teachers can quickly verify class completion, handle exceptions, and run the MVP with basic operational visibility and retention/deletion support.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: ASGN-05, REV-01, REV-02, REV-03, REV-04, REV-06, PILOT-03, PILOT-04
**Success Criteria** (what must be TRUE):

  1. Teacher dashboard shows completed, not started, missed, needs retry, and teacher review buckets.
  2. Teacher can scan each student's status, attempt count, submitted time, and highest hint level used.
  3. Teacher can open attempt details showing original transcript, improved sentence, repeat transcript, target-pattern result, hint usage, and attempt count.
  4. Teacher can manually mark an attempt complete, needs retry, or teacher review.
  5. System marks overdue incomplete homework as missed and logs completion, audio processing, transcription, AI evaluation, and retention/deletion activity.

**Plans**: TBD
**UI hint**: yes

## Requirement Coverage

| Requirement Range | Phase |
|-------------------|-------|
| DATA-01 through DATA-05 | Phase 1 |
| AUTH-01 through AUTH-04 | Phase 2 |
| CLASS-01 through CLASS-04 | Phase 2 |
| STUD-01 through STUD-05 | Phase 2 |
| MISS-01, MISS-04 | Phase 3 |
| ASGN-01 through ASGN-03 | Phase 3 |
| FLOW-01, FLOW-02, FLOW-04 through FLOW-07 | Phase 4 |
| AI-06 | Phase 4 |
| CHAR-01 through CHAR-04 | Phase 4 |
| PILOT-01 | Phase 4 |
| FLOW-03 | Phase 5 |
| AUDIO-01 through AUDIO-05 | Phase 5 |
| REV-05 | Phase 5 |
| PILOT-02 | Phase 5 |
| MISS-02, MISS-03, MISS-05 | Phase 6 |
| AI-01 through AI-05 | Phase 6 |
| ASGN-05 | Phase 7 |
| REV-01 through REV-04, REV-06 | Phase 7 |
| PILOT-03, PILOT-04 | Phase 7 |

**Coverage:** 60/60 v1 requirements mapped exactly once.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data, Privacy, and Workflow Foundation | 1/1 | Complete | 2026-06-25 |
| 2. Teacher Classroom Access | 4/4 | Complete    | 2026-06-26 |
| 3. Manual Mission Assignment | 3/3 | Complete   | 2026-06-26 |
| 4. Guided Student Attempt Loop | 5/5 | Complete   | 2026-06-27 |
| 5. Voice Capture and Evidence Storage | 0/TBD | Not started | - |
| 6. AI Mission and Turn Intelligence | 0/TBD | Not started | - |
| 7. Teacher Review and Pilot Readiness | 0/TBD | Not started | - |
