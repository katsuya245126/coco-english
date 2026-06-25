# English Speaking Practice App

## What This Is

This is a teacher-linked AI speaking homework app for elementary-level ESL learners. Teachers assign short speaking missions based on the target English taught in class, and students complete those missions after class by speaking with a recurring supportive classmate character.

The app helps teachers close the practice gap between classes: students get more spoken English reps, and teachers can check who completed homework, who missed it, and what each student said.

## Core Value

Students must complete useful spoken English practice outside class, and teachers must be able to verify that it happened.

## Business Context

- **Customer**: ESL teachers, academies, and schools that assign speaking homework.
- **Primary users**: Teachers and elementary-level ESL students.
- **Revenue model**: Not decided yet; keep the MVP focused on validating classroom usefulness before pricing.
- **Success metric**: Teachers repeatedly assign missions and can quickly identify completed, missed, and needs-retry homework.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Teacher can log in with email and password.
- [ ] Teacher can create a class and manage a student roster.
- [ ] Student can access homework without an email/password account using a class code or QR link, remembered class, name selection, and 4-digit PIN.
- [ ] Teacher can generate a speaking mission from today's target English, topic, level, required turns, and due date.
- [ ] Teacher can edit the generated mission before assigning it.
- [ ] Student can complete a 2-3 minute speaking mission by voice.
- [ ] Mission flow accepts understandable meaning first, then shows a better target-form sentence and requires repetition.
- [ ] The app captures transcripts and short audio clips per speaking turn.
- [ ] Teacher can see homework status buckets: completed, not started, missed, needs retry, and teacher review.
- [ ] Teacher can open an attempt and review transcript-first details with optional audio playback.
- [ ] The MVP uses one recurring supportive classmate buddy while keeping the character model open to later change.

### Out of Scope

- Full visual novel story system — defer until the homework loop is validated.
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
| Build teacher-linked speaking homework first | This directly addresses the classroom practice gap and is easier to validate than a full visual novel. | — Pending |
| Use one recurring supportive classmate buddy for MVP | Gives students continuity while keeping the character system simple. | — Pending |
| Keep the character model open with `characterId` | Allows later cast/story changes without rebuilding the mission flow. | — Pending |
| Use teacher email/password login | Teachers can manage classes and assignments with a normal account model. | — Pending |
| Use class code or QR, remembered class, name selection, and 4-digit PIN for students | Reduces login friction while still tracking individual homework. | — Pending |
| Store transcripts and short audio clips per speaking turn | Speaking verification needs audio, but teacher review must remain fast. | — Pending |
| Use completion/review states instead of numerical grades | Early product value is accountability and practice, not grading precision. | — Pending |
| Keep missions guided rather than open-ended free chat | Reduces AI drift and keeps practice tied to teacher-provided target English. | — Pending |

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
*Last updated: 2026-06-25 after initialization*
