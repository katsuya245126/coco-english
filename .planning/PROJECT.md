# Coco English

## What This Is

**Coco English** is a teacher-linked AI speaking homework app for elementary-level ESL learners. Teachers assign short speaking missions based on the target English taught in class, and students complete those missions after class by speaking with a recurring supportive classmate character named **Coco**.

**Naming:** Full name *Coco English* (teacher-facing / marketing / app store). Short form *Coco* (what students see and say in-app). The recurring buddy character is also named *Coco*. The name is chosen to be easy for Korean/ESL learners to pronounce, warm for kids, and credible to teachers.

The app helps teachers close the practice gap between classes: students get more spoken English reps, and teachers can check who completed homework, who missed it, and what each student said.

## Core Value

Students must complete useful spoken English practice outside class, and teachers must be able to verify that it happened.

## Current State

Milestone v1.0 shipped on 2026-07-01. The teacher-linked speaking homework MVP is complete across seven phases: teachers can set up classes, author and assign missions manually, students can complete guided voice practice with Coco, and teachers can review transcript-first evidence with optional audio playback and operational status buckets. The teacher-facing AI mission-draft feature was removed after pilot use; AI remains in the student turn-evaluation path.

The project is between milestones. Start the next requirements and roadmap cycle with `/gsd-new-milestone`.

## Business Context

- **Customer**: ESL teachers, academies, and schools that assign speaking homework.
- **Primary users**: Teachers and elementary-level ESL students.
- **Revenue model**: Not decided yet; keep the MVP focused on validating classroom usefulness before pricing.
- **Success metric**: Teachers repeatedly assign missions and can quickly identify completed, missed, and needs-retry homework.

## Requirements

### Validated

- [x] DATA-01 through DATA-05 validated in Phase 1: relational workflow schema, server-owned status audit path, short audio metadata, retention fields, and demo/real data boundary.
- [x] ASGN-04 validated in Phase 1: assignment statuses include assigned, started, completed, missed, needs retry, and teacher review.
- [x] Teacher can log in with email and password. — Validated in Phase 2 (AUTH-01..04)
- [x] Teacher can create a class and manage a student roster. — Validated in Phase 2 (CLASS-01..04)
- [x] Student can access homework without an email/password account using a class code or QR link, remembered class, name selection, and 4-digit PIN. — Validated in Phase 2 (STUD-01..05)
- [x] Teacher can manually author a speaking mission from today's target English, topic, level, and required turns. — Validated in Phase 3 (MISS-01/04)
- [x] Teacher can edit a mission before assigning it. — Validated in Phase 3
- [x] Student can complete a 2-3 minute speaking mission by voice. — Validated in Phase 4/5 (FLOW-01..07, AUDIO-01..05)
- [x] Mission flow accepts understandable meaning first, then shows a better target-form sentence and requires repetition. — Validated in Phase 4 (FLOW-04/05) and Phase 6 (AI-01..05, meaning/target-pattern evaluation)
- [x] The app captures transcripts and short audio clips per speaking turn. — Validated in Phase 5 (AUDIO-01..05)
- [x] Teacher can see homework status buckets: completed, not started, missed, needs retry, and teacher review. — Validated in Phase 7 (REV-01)
- [x] Teacher can open an attempt and review transcript-first details with optional audio playback. — Validated in Phase 7 (REV-02/03/04/06) and Phase 5 (REV-05)
- [x] The MVP uses one recurring supportive classmate buddy while keeping the character model open to later change. — Validated in Phase 4 (CHAR-01..04)

### Active

*(defined per-category during v2.0 requirements; see Current Milestone below)*

## Current Milestone: v2.0 Coco Comes Alive (VN-feel overhaul)

**Goal:** Transform Coco English from a functional homework form into an immersive, character-driven speaking experience — Coco speaks, appears on screen, converses naturally, and scores pronunciation — while keeping the teacher-linked homework loop and teacher-verifiability intact.

**Product thesis — "VN feel, homework substance":** Borrow the visual-novel *feel* (Coco is present, speaks, frames each mission as a scene), not the VN *structure* (no branching storyline, no arc across missions). Free-talk practice stays the substance; the standalone Visual Novel remains a separate, deferred product. Each mission gets a lightweight scene premise generated from the target pattern being taught.

**Target features (each ships as its own verified point release, ordered lightest → heaviest):**
- **v2.1 — Coco Voice (TTS):** Coco speaks the AI/mission text aloud (ElevenLabs and/or a cloned teacher voice), real-time.
- **v2.2 — Pronunciation scoring:** per-word/phoneme feedback (SpeechAce / Azure Speech Assessment / ELSA) shown to student and surfaced in teacher review; reuses v1 stored audio + target sentences.
- **v2.3 — Mascot (VN-style):** 2D Coco on-screen (waist-up, background scene, dialogue box) with expression/speaking state synced to voice.
- **v2.4 — Dynamic turns + scene framing ("Coco Chat"):** natural contextual replies anchored to the target pattern (Coco shares first, has personality, bounded ~5 turns, teacher-verifiable transcript) plus a per-mission scene premise generated from the target pattern.
- **v2.5 — UI overhaul:** one cohesive visual pass, last — so layout isn't redone after mascot/voice/chat land.

**Key context:** 6 elementary ESL students, 1 class/week; teacher uses own product; ~$30/mo AI budget (ample at this scale). Each release verified in production before the next begins.

### Out of Scope

- Full standalone visual novel *product* (branching storyline, arc across missions, story-first experience) — remains deferred as a separate product. Note: v2.0 adds VN *atmosphere* (Coco on-screen, per-mission scene framing) to the homework loop, which is distinct from the VN story system.
- Large character cast — start with one recurring buddy to keep MVP scope small.
- Romance or dating mechanics — not appropriate for the classroom use case.
- Student email/password account management — too much friction for elementary learners.
- Numerical grading — completion and simple review states are enough for v1.
- Long-form free chat — guided missions reduce AI drift and keep practice tied to teacher goals.
- Parent accounts — not needed to validate teacher-linked homework.

### Future Options

- School SSO, LMS/Google Classroom-style integrations, and textbook/unit mission libraries are not required for v1, but the project should avoid choices that make them unnecessarily hard to add later.

## Context

The product grew from a visual-novel/anime-classroom idea where learners speak English with characters. The stronger first wedge is teacher-linked speaking homework: the teacher assigns a short AI speaking mission after class, based on the English target taught that day.

The first target audience is elementary-level ESL learners, especially Korean/general ESL students who speak English in class but rarely practice outside class. The central classroom problem is not lack of content; it is lack of spoken output and accountability between lessons.

The character layer remains important for student motivation, but it should support the homework loop rather than drive the first product. The MVP uses one recurring supportive classmate buddy with friendly, simple, classroom-safe behavior. Missions should still reference a `characterId` so the app can later support a small classroom cast, seasonal characters, story missions, or mission-specific characters without rebuilding the speaking flow.

The student correction style should be balanced. The app accepts understandable meaning first, then shows the better target-form sentence and makes the student repeat it. It should avoid harsh failure language and avoid turning practice into long open-ended AI chat.

Teacher review should be fast. The teacher should scan status and transcripts first, then play short audio clips only when needed to verify speaking, pronunciation, effort, or suspicious transcripts.

Source planning docs:

- `english-speaking-practice-app-spec.md`
- `english-speaking-practice-app-handoff.md`

## Constraints

- **Scope**: Validate the teacher-linked speaking homework loop before building visual novel systems or a large character system.
- **Student access**: Avoid student email/password accounts in the MVP because elementary learners struggle with account management.
- **Teacher workload**: Review must be transcript-first because teachers do not have time to listen to every audio clip.
- **AI behavior**: Keep conversations guided by teacher target language, short follow-ups, and concrete completion rules.
- **Privacy and cost**: Store short per-turn audio clips rather than long session recordings; use limited audio retention such as 30 or 60 days.
- **Product flexibility**: Keep character assignment replaceable through `characterId`, even though v1 ships with one default buddy.
- **Future integrations**: Do not build school SSO, LMS integrations, or textbook/unit libraries now; keep core data clean enough that they can be added later if demand appears.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build teacher-linked speaking homework first | This directly addresses the classroom practice gap and is easier to validate than a full visual novel. | Validated — full v1 loop shipped across Phases 1-7 |
| Use one recurring supportive classmate buddy for MVP | Gives students continuity while keeping the character system simple. | Validated in Phase 4 |
| Keep the character model open with `characterId` | Allows later cast/story changes without rebuilding the mission flow. | Validated in Phase 4 |
| Use teacher email/password login | Teachers can manage classes and assignments with a normal account model. | Validated in Phase 2 |
| Use class code or QR, remembered class, name selection, and 4-digit PIN for students | Reduces login friction while still tracking individual homework. | Validated in Phase 2 |
| Store transcripts and short audio clips per speaking turn | Speaking verification needs audio, but teacher review must remain fast. | Validated in Phase 5 |
| Use completion/review states instead of numerical grades | Early product value is accountability and practice, not grading precision. | Validated in Phase 7 |
| Keep missions guided rather than open-ended free chat | Reduces AI drift and keeps practice tied to teacher-provided target English. | Validated in Phase 6 (AI-06) |
| Use class-level demo/real data mode copied to assignments | Students are class-scoped, and assignment-level copies simplify later audit and retention queries. | Validated in Phase 1 |
| Keep assignment status transitions server-owned and audited | Client UI, jobs, and future AI should provide requests or evidence, while app code owns final state changes. | Validated in Phase 1 |
| Name the product and buddy "Coco" (full name: Coco English) | Easy for Korean/ESL kids to pronounce, warm for students, descriptive enough for teachers; buddy and app share one identity. Movie ("Coco") overlap judged low-risk in a different category. | Decided 2026-06-25 |
| Past-due assignments show a "Late" badge and stay launchable (renamed from "Closed") | Live teacher UAT in Phase 7 showed blocking late submissions was the wrong default — students should still be able to submit late homework. | Validated in Phase 7 |
| Teacher-reopened attempts show a distinct "Retry" badge instead of reusing "Start" | Students need to know a homework item is a teacher-issued reopen, not a fresh assignment. | Validated in Phase 7 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:
1. Requirements invalidated? Move to Out of Scope with reason.
2. Requirements validated? Move to Validated with phase reference.
3. New requirements emerged? Add to Active.
4. Decisions to log? Add to Key Decisions.
5. "What This Is" still accurate? Update if drifted.

**After each milestone**:
1. Full review of all sections.
2. Core Value check: still the right priority?
3. Business Context check: customer, revenue model, and success metric still accurate?
4. Audit Out of Scope: reasons still valid?
5. Update Context with current state, feedback, and metrics.

---
*Last updated: 2026-07-01 after v1.0 milestone closeout*
