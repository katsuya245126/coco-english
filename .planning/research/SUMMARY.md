# Project Research Summary

**Project:** English Speaking Practice App
**Domain:** Teacher-linked AI ESL speaking homework for elementary learners
**Researched:** 2026-06-25
**Confidence:** MEDIUM-HIGH

## Executive Summary

This product should be built as a narrow classroom homework workflow, not as a general ESL chatbot, LMS replacement, game, or grading platform. The durable product promise is: a teacher assigns a short spoken mission tied to today's target English, students complete it by voice with low-friction roster/PIN access, and the teacher can verify class completion quickly through transcript-first evidence and exception buckets.

The recommended approach is a single TypeScript web app using Next.js App Router on Vercel, Supabase Postgres/Auth/Storage, native browser recording for short per-turn clips, and OpenAI APIs behind server-side adapters for mission generation, transcription, and structured turn evaluation. Architecture should keep AI as evidence and assistance, not as the owner of assignment state. Mission assignments, student attempts, status transitions, review decisions, and audio retention must be deterministic, auditable, and database-backed.

The main risks are child voice privacy, weak student identity, brittle speech recognition for young ESL learners, open-ended buddy chat, and teacher review becoming an audio-grading queue. Mitigate them by storing only short clips with retention/deletion from the foundation, using class code plus roster name plus PIN, treating ASR and AI outputs as fallible signals routed to `teacher_review`, bounding all buddy dialogue to the assigned mission, and making the teacher dashboard action-first: completed, not started, missed, needs retry, and teacher review.

## Key Findings

### Recommended Stack

Build the MVP as a conventional managed full-stack web app. Next.js and Supabase are the strongest fit because the product needs fast teacher/student UI development, relational classroom data, private audio storage, secure server-side AI calls, and enough authorization discipline for child data without introducing microservices or enterprise LMS infrastructure.

AI should use OpenAI Responses and Speech-to-Text APIs through narrow adapters, with structured output validation via Zod. Browser MediaRecorder is sufficient for the MVP because the product needs bounded request/response speaking turns, not a live autonomous voice agent.

**Core technologies:**
- **Next.js App Router + React + TypeScript:** Full-stack web app, teacher dashboard, student flow, route handlers, server actions, and server-only AI access.
- **Tailwind CSS + shadcn/ui + Radix + lucide-react:** Fast accessible UI for dense teacher dashboards and mobile student flows without a heavy design system.
- **Supabase Postgres:** Relational source of truth for teachers, classes, rosters, missions, assignments, attempts, turns, and review states.
- **Supabase Auth:** Teacher email/password login; do not use it for elementary student accounts in v1.
- **Custom roster/PIN student sessions:** Class-scoped student access using class code or QR link, roster name, and hashed 4-digit PIN.
- **Supabase RLS and private Storage:** Defense-in-depth for teacher-owned data and private short audio clips with signed playback URLs.
- **OpenAI Responses API:** Structured mission generation and turn evaluation; app code applies status transitions.
- **OpenAI Speech-to-Text:** `gpt-4o-mini-transcribe` as the likely MVP default, with fallback to larger transcription when needed.
- **MediaRecorder/getUserMedia:** Native short-clip recording with MIME support detection and mobile browser testing.
- **Zod, React Hook Form, TanStack Query where needed:** Shared schema validation, teacher forms, and limited client async state for status/polling/audio URL flows.
- **Vitest + Playwright:** Unit coverage for status/session/AI schema logic and E2E coverage for teacher assignment plus student mission paths.

**Version-sensitive notes:** The research checked current framework and npm versions on 2026-06-25, but OpenAI model defaults, pricing, and quality should be rechecked before a paid classroom pilot.

### Expected Features

The v1 feature set should prove classroom accountability and low-friction spoken output. Teacher value comes from quick assignment creation and quick review, not from rich content, scores, gamification, parent workflows, or analytics.

**Must have (table stakes):**
- Teacher login, class creation, roster management, and student PIN reset.
- Student access by class code or QR link, remembered class, roster name selection, and 4-digit PIN.
- AI-assisted mission generation from target pattern, topic, level, required turns, and due date.
- Teacher edit-before-assign plus basic manual mission creation fallback.
- Due dates and per-student assignment statuses: assigned/not started, started, completed, missed, needs retry, teacher review.
- Voice-first short guided missions with a recurring supportive buddy.
- Per-turn recording, transcription, target-form recast, required repeat, and progressive hints.
- Meaning-first acceptance: understandable output can proceed to correction even when form is imperfect.
- Transcript-first teacher review with optional on-demand audio playback.
- Audio retention defaults and basic child-safe interaction boundaries.
- Mobile-responsive student flow with clear mic, upload, PIN, no-homework, and retry states.

**Should have (competitive):**
- Mission generation tightly linked to "today's English."
- Structured AI confidence routing into teacher-review buckets.
- Attempt evidence bundles: original transcript, improved sentence, repeat transcript, hint level, attempt count, submitted time, and audio references.
- Exception-first dashboard optimized for teacher action, not analytics spectacle.
- One recurring classroom-safe buddy with `characterId` retained as a future extension point.
- Manual retry targeting through statuses, with automation deferred until real teacher behavior is observed.

**Defer (v2+):**
- Numerical grades, fluency scores, pronunciation percentages, and class rankings.
- Parent accounts, school SSO, LMS integrations, gradebook sync, and exports unless a pilot requires them.
- Large character casts, visual novel systems, seasonal storylines, leaderboards, social features, or content marketplaces.
- Always-on AI companion, open-ended chat, realtime autonomous voice agent, and long session recordings.
- Rich analytics dashboards and target-pattern mastery reports until the core loop produces real pilot data.

### Architecture Approach

The architecture should be a thin client, server-side application layer, relational database, object storage for short audio clips, and provider adapters for AI/transcription. The source of truth is not a chat transcript; it is the normalized classroom workflow: teacher, class, student, mission snapshot, assignment, assignment-student state, attempt, turn, audio metadata, and review decision.

**Major components:**
1. **Teacher account/auth:** Teacher email/password sessions and teacher-scoped authorization.
2. **Class and roster service:** Classes, class codes/QRs, student display names, PIN hashes, active/archive state.
3. **Student access service:** Class lookup, roster selection, PIN verification, short-lived student sessions.
4. **Mission authoring service:** Teacher inputs, AI-generated drafts, manual mission editing, validation, assignment publishing.
5. **Assignment service:** Immutable assigned mission snapshots, per-student assignment rows, dashboard bucket queries.
6. **Attempt service:** Server-owned attempt lifecycle and deterministic status transitions.
7. **Turn processing service:** Audio upload, transcription, structured evaluation, recast generation, repeat validation, persistence.
8. **Teacher review service:** Transcript-first attempt detail, review decisions, retry/complete overrides.
9. **AI provider adapters:** Mission generation, transcription, and turn evaluation interfaces isolated from UI and status logic.
10. **Audio storage service:** Private clip storage, short-lived signed URLs, metadata, expiry, deletion.
11. **Status scheduler:** Missed assignment transitions and audio retention/deletion jobs.

**Key patterns to follow:**
- Server-side workflow state machine for assignment and attempt statuses.
- Mission snapshot or immutable version at assignment time.
- Structured evaluator outputs; deterministic app code applies transitions.
- Idempotent turn processing using upload IDs or server-issued turn tokens.
- Transcript-first review projections; sign audio URLs only on demand.
- Audio and AI model/version metadata for auditability and later quality/cost tuning.

### Critical Pitfalls

1. **Treating child voice data like ordinary homework text** — store only short per-turn clips, add `audioExpiresAt`/`deletedAt`, ship deletion jobs before real pilots, and prohibit vendor model-training use of child audio/transcripts.
2. **Assuming teacher signup solves school/parent approval** — separate demo/sample mode from real child data, add pilot-readiness checks, and build deletion/export primitives early.
3. **Overtrusting ASR for young ESL learners** — treat transcript as evidence, not truth; use tolerant rules, reason codes, retry paths, and teacher-review fallback.
4. **Letting the buddy become open-ended child chat** — constrain the buddy to mission context, fixed classroom-safe tone, hard turn limits, safety filters, and no private/romantic/parasocial framing.
5. **Turning review into an audio-grading queue** — build buckets, summaries, transcripts, reason codes, and optional audio playback; target full-class scanning in minutes.
6. **AI mission drift from today's target English** — generate into a strict schema, require teacher preview/edit, enforce one primary target pattern, and evaluate target attempt separately from meaning.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 0: Data, Privacy, and Workflow Foundation

**Rationale:** Child voice data, retention, authorization, and status ownership cannot be bolted on after pilots. The roadmap should start by defining the schema, RLS/server authorization model, retention fields, and deterministic state transitions.

**Delivers:** Supabase project/migrations, core tables, status enums, teacher-owned row scopes, private audio bucket design, retention/deletion fields, service-role boundaries, and demo vs real-child-data posture.

**Addresses:** Privacy defaults, assignment statuses, review states, audio metadata, source-of-truth workflow model.

**Avoids:** Child voice privacy failures, AI-owned statuses, long session recording, later data model rewrites.

### Phase 1: Classroom Shell and Student Access

**Rationale:** The first usability risk is classroom identity: teachers need classes and rosters; children need access without email/password; submissions must not be mistaken across students.

**Delivers:** Teacher login, class CRUD, roster CRUD, PIN hashing/reset, class code/QR access, remembered class, roster name selection, PIN verification, short-lived student session, no-homework and wrong-PIN states.

**Addresses:** Teacher auth, class creation, roster management, child-friendly access, student identity, mobile-friendly entry.

**Avoids:** Student account friction, weak identity, informal pilot misuse, shared-device confusion.

### Phase 2: Manual Mission and Assignment Vertical

**Rationale:** The mission schema, assignment snapshot, due dates, and teacher dashboard rows must exist before AI generation. A manual path de-risks the core product workflow without coupling progress to model behavior.

**Delivers:** Manual mission creation with target pattern/topic/level/questions/hints/required turns/characterId, teacher preview, assignment to class, immutable assignment snapshot, per-student `AssignmentStudent` rows, basic assigned/not-started dashboard.

**Addresses:** Mission structure, assignment containers, due dates, status initialization, teacher edit/approval path.

**Avoids:** AI mission drift, schema churn, generated content assigned without teacher control.

### Phase 3: Student Attempt State Machine With Mocked Audio/AI

**Rationale:** Before adding recording and provider calls, prove the student mission loop and server-owned status transitions using mocked transcripts/evaluations. This establishes completion rules, retry paths, and teacher-review fallback.

**Delivers:** Student homework list, start attempt, turn order, prompt display, mocked transcript submission, recast/repeat flow, hint ladder, attempt completion/needs_retry/teacher_review, persisted turn records, attempt detail view.

**Addresses:** Voice mission flow logic, meaning-first/repeat mechanic, progressive hints, completion rules, attempt evidence bundle.

**Avoids:** Client-owned completion, AI-owned transitions, punitive correction loops, hidden grading semantics.

### Phase 4: Audio Capture, Storage, and Teacher Playback

**Rationale:** Short-clip recording and private playback are core requirements independent of which AI provider is used. This phase should harden microphone and upload behavior before transcription/evaluation quality becomes the bottleneck.

**Delivers:** Mic preflight, mobile-friendly recording controls, short original/repeat clips, upload progress/retry, Supabase Storage integration, clip metadata, signed playback URLs, teacher audio buttons, audio retention/deletion job.

**Addresses:** Voice-first requirement, per-turn clips, audio evidence, teacher playback on demand, privacy retention.

**Avoids:** Full-session recordings, mobile browser failures, indefinite storage, teacher review starting with audio.

### Phase 5: Transcription and Structured Turn Evaluation

**Rationale:** Once the workflow and audio path are stable, add STT and AI evaluation behind adapters. Evaluation should return structured evidence and reason codes, while server code applies transitions.

**Delivers:** Transcription adapter, turn evaluator adapter, Zod schemas, model/version logging, confidence handling, reason codes, low-confidence teacher-review routing, tolerant repeat acceptance, cost/attempt telemetry.

**Addresses:** Speech transcription, meaning-first evaluation, target-pattern attempt, required repeat, needs_retry/teacher_review routing.

**Avoids:** Overtrusting ASR, exact transcript matching, fake precision scores, hard failures for children.

### Phase 6: AI Mission Generation and Teacher Editing

**Rationale:** AI generation is valuable only after the mission schema and assignment path are proven. It should accelerate teachers, not bypass teacher control.

**Delivers:** Target-pattern/topic/level/turn count generation, strict mission JSON schema, server validation, editable generated draft, manual fallback retained, automated target-pattern alignment checks where feasible.

**Addresses:** Fast post-class mission creation, edit-before-assign, generated mission draft, mission preview.

**Avoids:** Generic AI practice, off-target missions, teacher distrust, content assigned blindly.

### Phase 7: Pilot Hardening and Review Workflow Polish

**Rationale:** Real classroom pilots need reliability, supportability, and measurable teacher workload reduction. This phase should prepare the app for repeated teacher use without expanding scope into LMS, parent, or gamification systems.

**Delivers:** Missed-status scheduler, teacher review filters, review overrides, retry handling, audit logs, deletion/export support, child-safe prompt/output guardrails, PII detection/redaction path, Sentry/Product analytics, mobile browser test matrix, pilot checklist.

**Addresses:** Privacy operations, dashboard efficiency, teacher review shortcuts, child-safe AI behavior, classroom device/noise reality.

**Avoids:** Audio-grading queue, unsupported privacy requests, analytics overreach, open-ended buddy chat, pilot failures due to devices.

### Phase Ordering Rationale

- Data/privacy and status ownership come first because later audio, AI, and review features depend on the same schema and transition rules.
- Classroom identity precedes missions because the product is teacher-linked homework, not standalone language practice.
- Manual mission assignment precedes AI generation because generated missions still require the same schema, validation, snapshots, and teacher approval.
- Mocked attempts precede audio/AI because completion, retry, teacher review, and evidence bundles are workflow risks independent of provider quality.
- Audio capture precedes transcription/evaluation because clip storage and teacher playback are required whether AI succeeds or not.
- Teacher review remains visible throughout because it defines what attempt data must be captured and prevents building a student-only experience.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 0:** Needs privacy/compliance and retention decisions for child voice data, school/academy consent, vendor data-use restrictions, and deletion/export obligations.
- **Phase 4:** Needs device/browser research for iOS Safari, Android Chrome, mic permissions, supported MIME types, upload retries, and audio retention mechanics.
- **Phase 5:** Needs AI/STT model recheck, structured-output API details, evaluation rubric design, ASR confidence handling, and pilot evaluation-set planning.
- **Phase 7:** Needs operational and policy research for pilot readiness, PII detection, moderation boundaries, and teacher review-time measurement.

Phases with standard patterns that can skip a separate research-phase unless requirements change:
- **Phase 1:** Teacher auth, CRUD, roster management, and PIN hashing are established web-app patterns.
- **Phase 2:** Manual mission CRUD, assignment snapshots, and due-date rows are straightforward relational workflow patterns.
- **Phase 3:** Mocked state-machine implementation should rely on app-specific tests rather than external research.
- **Phase 6:** AI mission generation needs prompt/schema design, but the main architectural pattern is already defined by the manual mission schema.

## What Should Affect REQUIREMENTS.md

- Requirements should define the MVP as teacher-assigned speaking homework for elementary ESL learners, not a general chatbot or learning platform.
- Student identity must be class code or QR plus roster name plus 4-digit PIN; no student email/password accounts in v1.
- Completion must be based on required turn/repeat records and deterministic server rules, not client screens or AI prose.
- Teacher review must be transcript-first with optional audio-on-demand, reason codes, and exception buckets.
- Audio storage must be short per-turn clips only, with explicit retention, deletion, and private signed playback requirements.
- AI outputs must be structured, validated, model/version logged, and routed to teacher review on low confidence or schema failure.
- The buddy must be bounded, classroom-safe, mission-scoped, and unable to continue into open-ended private chat.
- MVP must exclude numerical grading, pronunciation percentages, parent accounts, SSO, LMS integrations, social features, leaderboards, and large character/story systems.

## What Should Affect ROADMAP.md

- Start with data/privacy/classroom foundations before AI, because pilots cannot proceed safely without them.
- Build a manual vertical workflow before AI generation: one teacher, one class, one mission, one student attempt, one teacher review.
- Add audio and AI in separate phases so workflow bugs are not confused with provider quality problems.
- Keep teacher dashboard/review in the roadmap early, not as polish, because it determines the evidence model.
- Include explicit pilot hardening before real classroom use: retention job, deletion support, mobile audio testing, safety guardrails, monitoring, and review-time validation.
- Use roadmap gates to prevent scope creep into LMS, parent, analytics, scoring, gamification, story, or live voice-agent systems before repeated teacher assignment is validated.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core Next.js/Supabase/TypeScript/Vercel/browser-audio recommendations are backed by official docs and fit the relational workflow. OpenAI model selection is MEDIUM because pricing and quality change quickly. |
| Features | MEDIUM-HIGH | Strong alignment across project source, classroom workflow norms, ESL pedagogy, and market comparisons. Some differentiators need validation with real teachers and elementary ESL learners. |
| Architecture | HIGH | Component boundaries and build order are strongly supported by the product model and official AI/audio/privacy docs. Exact provider integration details remain MEDIUM. |
| Pitfalls | MEDIUM-HIGH | Privacy and browser audio risks are high-confidence from official sources; ASR quality and teacher workload risks need pilot evidence. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **OpenAI model defaults and costs:** Recheck model catalog, transcription options, pricing, and structured-output support immediately before implementation and before paid pilots.
- **Child privacy/legal posture:** Confirm school/academy consent path, COPPA/FERPA applicability, vendor terms, retention duration, and deletion/export obligations before collecting real child audio.
- **ASR quality for Korean elementary ESL learners:** Build a consented pilot evaluation set and compare transcripts/evaluations against teacher review before trusting automation.
- **Mobile audio reliability:** Test iOS Safari, Android Chrome, desktop Chrome, shared-device flows, HTTPS permission prompts, background noise, and interrupted uploads.
- **Teacher review time:** Validate that a teacher can scan a class in under five minutes using transcript-first evidence and exception buckets.
- **Mission quality:** Validate generated missions stay aligned to one target pattern and can be answered with age-appropriate vocabulary.

## Sources

### Primary (HIGH confidence)

- `.planning/research/STACK.md` — current stack recommendations, official docs, npm version checks, and implementation notes.
- `.planning/research/FEATURES.md` — table-stakes features, differentiators, anti-features, dependencies, and phase guidance.
- `.planning/research/ARCHITECTURE.md` — component boundaries, domain model, data flows, patterns, anti-patterns, and build order.
- `.planning/research/PITFALLS.md` — critical/moderate/minor risks, prevention strategies, and phase-specific warnings.
- Local project docs: `.planning/PROJECT.md` and `english-speaking-practice-app-spec.md` — product source of truth referenced by research agents.
- Next.js docs — App Router/full-stack positioning and current version context.
- Supabase docs — Postgres, Auth, Storage, SSR, JavaScript client, and RLS guidance.
- OpenAI docs — Responses API, speech-to-text, structured outputs, model catalog, data controls, realtime boundary, and under-18 guidance.
- MDN docs — MediaRecorder and getUserMedia browser behavior.
- FTC COPPA FAQ and U.S. Department of Education student privacy resources — child voice/privacy, school consent, retention, and vendor terms.

### Secondary (MEDIUM confidence)

- ESL/task-based learning and corrective-feedback sources used in FEATURES.md.
- Research papers on young learner ASR, non-native child speech assessment, pronunciation assessment, AI education guardrails, and learning analytics dashboards.
- Classroom tool and AI speaking-practice market references used to identify table-stakes and anti-features.

### Tertiary (LOW-MEDIUM confidence)

- Current news and market signals on classroom AI and student privacy concerns, used only as risk indicators rather than product requirements.

---

*Research completed: 2026-06-25*
*Ready for roadmap: yes*
