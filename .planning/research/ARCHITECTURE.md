# Architecture Patterns

**Domain:** Teacher-linked AI ESL speaking homework web app
**Researched:** 2026-06-25
**Overall confidence:** HIGH for product architecture, MEDIUM for exact AI provider implementation details

## Recommended Architecture

Build a conventional web app with a thin client, a server-side application layer, a relational database, object storage for short audio clips, and AI/audio providers behind narrow service adapters.

The product should not start as a general chat app. The durable domain model is a teacher-created speaking mission assigned to a class, completed by a rostered student through a bounded attempt, then reviewed by the teacher through status buckets and transcript-first attempt details. AI is an implementation detail inside mission generation and turn evaluation, not the source of truth for assignment state.

Recommended high-level shape:

```text
Teacher UI
  -> App server: auth, classes, roster, mission drafts, assignments, review
  -> Database: teacher/class/student/mission/assignment/attempt/turn records

Student UI
  -> App server: class-code lookup, PIN session, homework list, attempt state
  -> Audio adapter: record/upload short turn clips
  -> AI adapter: transcription + turn evaluation + target-form sentence

Storage
  -> Database owns metadata, transcripts, statuses, audit fields
  -> Object storage owns short audio clips with lifecycle expiration

External AI
  -> Mission generator
  -> Transcription/realtime audio
  -> Structured evaluator
  -> Optional buddy speech generation later
```

## Component Boundaries

| Component | Responsibility | Owns Data | Communicates With |
|-----------|----------------|-----------|-------------------|
| Teacher account/auth | Email/password teacher login, teacher session, teacher-scoped authorization | Teacher account, auth identity, session | Teacher UI, app server |
| Class and roster service | Class creation, class code/QR identity, student display names, 4-digit PIN hashes, roster status | Classes, students, class membership, PIN hash metadata | Teacher UI, student access service |
| Student access service | Class-code lookup, remembered class, name selection, PIN verification, short-lived student session | Student session, last-access metadata | Student UI, class/roster service |
| Mission authoring service | Teacher inputs, AI-generated mission draft, teacher edits, publish/assign action | Mission draft, assigned mission, target language, required turns, due date, `characterId` | Teacher UI, AI mission generator, assignment service |
| Assignment service | Creates one student-work item per assigned student, computes dashboard buckets, locks assignment snapshot | Assignment, assignee list, due date, current status | Teacher dashboard, student homework list, attempt service |
| Attempt service | Starts attempts, enforces turn order, records attempts and final result, prevents inconsistent transitions | Attempt, turn sequence, attempt status, completion timestamps | Student UI, turn service, assignment service |
| Turn processing service | Receives student audio, stores clip, transcribes, evaluates meaning/target pattern/repeat, persists result | Turn transcript, audio reference, evaluation result, hint level, improved sentence | Audio storage, transcription adapter, evaluator adapter |
| Teacher review service | Presents status buckets and attempt details, lets teacher mark reviewed/needs retry if needed | Teacher review decision, review notes, override status | Teacher UI, assignment/attempt records |
| AI mission generator adapter | Converts teacher target/topic/level/turn count into editable structured mission draft | No durable source-of-truth data; returns draft payload | Mission authoring service, AI provider |
| AI evaluator adapter | Returns structured per-turn judgment and improved target-form sentence | No durable source-of-truth data; returns schema output | Turn processing service, AI provider |
| Audio/transcription adapter | Handles browser microphone path, transcription, and optional realtime session credentials | Provider request IDs only; no core domain ownership | Student UI, turn service, AI/audio provider |
| Audio storage service | Stores short audio clips per original answer/repeat attempt, signs playback URLs, expires audio | Object key, retention policy, content type, duration | Turn service, teacher review UI |
| Status scheduler | Marks overdue incomplete work as `missed`, expires stale started attempts if needed | Derived status updates and job audit logs | Assignment service, database |

## Domain Data Model

Use a relational model because the core product is workflow state, ownership, and review queries rather than unstructured conversation history.

| Entity | Purpose | Important Fields |
|--------|---------|------------------|
| `Teacher` | Authenticated adult user who owns classes and missions | `id`, `email`, `name`, `createdAt` |
| `Classroom` | Teacher-managed class container | `id`, `teacherId`, `name`, `classCode`, `createdAt`, `archivedAt` |
| `Student` | Roster identity inside one class, not a global login account | `id`, `classroomId`, `displayName`, `pinHash`, `active` |
| `Mission` | Reusable teacher-authored mission content | `id`, `teacherId`, `title`, `targetPattern`, `topic`, `level`, `requiredTurns`, `characterId`, `status` |
| `MissionTurnTemplate` | Planned buddy question and target examples | `id`, `missionId`, `order`, `question`, `expectedExamples`, `hintLadder` |
| `Assignment` | Published mission snapshot for a class | `id`, `missionId`, `classroomId`, `dueAt`, `assignedAt`, `status` |
| `AssignmentStudent` | Per-student homework state | `id`, `assignmentId`, `studentId`, `status`, `attemptCount`, `submittedAt`, `highestHintLevel` |
| `Attempt` | One student run through the assigned mission | `id`, `assignmentStudentId`, `status`, `startedAt`, `completedAt`, `needsReviewReason` |
| `AttemptTurn` | One original answer plus required repeat cycle | `id`, `attemptId`, `templateTurnId`, `order`, `phase`, `transcript`, `improvedSentence`, `evaluationJson`, `audioObjectKey`, `durationMs`, `hintLevelUsed` |
| `Review` | Teacher decision or override | `id`, `assignmentStudentId`, `teacherId`, `decision`, `note`, `reviewedAt` |

Do not store a free-form AI conversation transcript as the main record. Store normalized turn records. This keeps teacher review fast, makes status derivation explainable, and avoids later rewrites when the buddy/character layer changes.

## Status Ownership and Transitions

`AssignmentStudent.status` should be the teacher dashboard source of truth. It can be derived from attempts plus due date, but persisting the current status makes bucket queries cheap and auditable.

Recommended statuses:

```text
assigned -> started -> completed
assigned -> missed
started  -> missed
started  -> needs_retry
started  -> teacher_review
needs_retry -> started
teacher_review -> completed
teacher_review -> needs_retry
completed -> teacher_review (only if later anomaly/manual review is added)
```

Rules:

- `assigned`: row exists for student; no active attempt.
- `started`: latest attempt exists and is not terminal.
- `completed`: required original-answer and repeat cycles are complete and evaluator confidence is sufficient.
- `missed`: due date passed and status is `assigned` or `started`.
- `needs_retry`: attempt ended but required repeat/target-pattern work was not completed.
- `teacher_review`: transcription/evaluation confidence is low, audio upload failed after transcript capture, policy/safety flag occurred, or the turn state is internally inconsistent.

Keep `Attempt.status` separate:

```text
in_progress -> completed
in_progress -> abandoned
in_progress -> needs_retry
in_progress -> teacher_review
```

The status scheduler may mark `AssignmentStudent` as `missed`, but it should not mutate completed attempts. Teacher decisions should create `Review` records and update the assignment-student status through one review service, not direct client updates.

## Data Flow

### 1. Teacher Mission Creation to Assignment

```text
Teacher enters target pattern/topic/level/turn count/due date
  -> Mission authoring service validates inputs
  -> AI mission generator returns structured draft:
       title, opening question, follow-ups, expected examples, hints
  -> Teacher edits draft
  -> Mission saved as draft
  -> Teacher assigns to class
  -> Assignment service snapshots mission and creates AssignmentStudent rows
  -> Student homework list now shows assigned mission
```

Architecture implications:

- Treat AI-generated mission content as a draft until the teacher assigns it.
- Store the assigned mission snapshot so later edits do not rewrite already assigned homework.
- Keep `characterId` on mission and assignment records even while MVP has one default buddy.
- Validate mission structure server-side before assignment: required turns, at least one question per turn, target pattern present, due date present.

### 2. Student Access to Homework

```text
Student opens QR/class link or enters class code
  -> Student access service resolves classroom
  -> Student selects roster name
  -> Student enters PIN
  -> Server verifies PIN hash and issues short-lived student session
  -> Student sees AssignmentStudent rows for that student
```

Architecture implications:

- Student identity is class-scoped; do not create global student accounts for MVP.
- PINs should be stored as hashes, never plaintext.
- The client can remember class code/device preference, but the server still verifies student PIN each session.
- Authorization checks should always scope student reads/writes to `studentId + classroomId`.

### 3. Student Attempt and Turn Processing

```text
Student starts assignment
  -> Attempt service creates Attempt(in_progress)
  -> Buddy asks turn template question
  -> Browser records short original-answer clip
  -> Turn service stores audio object and metadata
  -> Transcription adapter returns transcript
  -> Evaluator adapter returns structured judgment:
       understandable, targetAttempted, improvedSentence, confidence, retry/review flag
  -> App shows supportive response + improved target-form sentence
  -> Browser records repeat clip
  -> Transcription/evaluation checks repeat closeness
  -> Next turn unlocks, or attempt becomes completed/needs_retry/teacher_review
  -> AssignmentStudent bucket updates
```

Architecture implications:

- Persist each original answer and repeat as separate `AttemptTurn` records or separate turn phases. Teachers need to see what the student first said and what they repeated.
- Do not wait for the full mission to finish before saving turn data. Save after each audio upload/transcription/evaluation step so interrupted sessions can resume or be reviewed.
- Make turn processing idempotent using client-generated turn upload IDs or server-issued turn tokens. Voice flows are prone to retries.
- Store evaluator outputs as structured JSON plus selected indexed fields (`understandable`, `targetAttempted`, `repeatAccepted`, `confidence`, `reviewFlag`) for dashboard queries.

### 4. Teacher Review

```text
Teacher opens assignment dashboard
  -> Assignment service returns bucket counts and student rows
  -> Teacher filters completed / not started / missed / needs retry / teacher review
  -> Teacher opens one student attempt
  -> Review service returns transcript-first turn detail
  -> Audio service signs short-lived playback URLs only for requested clips
  -> Teacher optionally marks reviewed, needs retry, or complete
```

Architecture implications:

- Dashboard should load from database summaries, not from audio or AI providers.
- Audio playback URLs should be generated on demand and expire quickly.
- Teacher review should not require replaying AI state. The attempt detail should be fully reconstructable from stored mission snapshot, turn transcripts, improved sentences, and audio references.

## AI, Audio, and Transcription Boundaries

### Recommended Boundary

Use provider adapters with internal app-facing interfaces:

```typescript
type GenerateMissionInput = {
  targetPattern: string;
  topic: string;
  level: string;
  requiredTurns: number;
};

type EvaluateTurnInput = {
  targetPattern: string;
  question: string;
  transcript: string;
  level: string;
  phase: "original_answer" | "repeat";
  expectedSentence?: string;
};

type EvaluateTurnResult = {
  understandable: boolean;
  targetAttempted: boolean;
  repeatAccepted?: boolean;
  improvedSentence?: string;
  confidence: "high" | "medium" | "low";
  nextStatus: "continue" | "needs_retry" | "teacher_review";
  reasonCode?: string;
};
```

Keep this interface stable even if the underlying provider changes. The app should not scatter model names, prompt strings, realtime session shapes, or JSON schemas throughout UI code.

### Audio Path Recommendation

For MVP, prefer request/response turn processing over fully autonomous realtime conversation:

1. Browser records one short clip for the current turn.
2. Client uploads clip to the app server or directly to object storage using a server-issued signed upload.
3. Server calls transcription/evaluation.
4. Server returns transcript, improved sentence, and next UI state.

This is easier to debug, cheaper to bound, and better aligned with teacher review than an open voice-agent session. A realtime path can be added later for lower latency, but only behind the same turn-processing boundary.

Current OpenAI docs support browser/mobile realtime sessions through server-created ephemeral credentials and WebRTC calls, which is relevant for future low-latency voice. For this MVP, use server-side API keys only and issue ephemeral client credentials only if a realtime path is intentionally selected.

### Structured Evaluation

Turn evaluation should use structured outputs with a strict schema where supported. This matters because status transitions depend on machine-readable fields, not prose. The evaluator should be asked for narrow judgments only:

- Is the meaning understandable?
- Was the target pattern attempted?
- What is the best simple target-form sentence?
- Did the repeat closely match the improved sentence?
- Should this continue, need retry, or go to teacher review?

Never let AI directly update database statuses. The evaluator returns a recommendation; the turn service applies deterministic transition rules.

### Safety and Minor-User Boundary

Because the product serves elementary learners, architecture must minimize personal data and keep child voice data controlled:

- Do not collect student email addresses for MVP.
- Store display name, class membership, PIN hash, transcripts, and short voice clips only.
- Retain audio only for the product need window, such as 30 or 60 days, then delete through object-storage lifecycle rules.
- Keep transcripts longer only if needed for teacher records and product validation.
- Add an internal `studentSafetyContext` or equivalent metadata to AI requests where provider guidance supports youth-aware safety handling.
- Avoid general free chat; the mission engine should only send bounded context for the current turn.

OpenAI's under-18 guidance says developers serving minors should add safeguards and comply with child safety/privacy law; it also cautions against processing personal data of children under 13 without appropriate data-retention controls. The FTC COPPA FAQ treats a child's voice recording as personal information and requires reasonable retention limits. This reinforces the short-clip, limited-retention design.

## Patterns to Follow

### Pattern 1: Workflow State Machine Around Attempts

**What:** Attempt and assignment statuses move only through server-side transition functions.

**When:** Any operation that starts homework, saves a turn, finishes an attempt, marks missed, or applies teacher review.

**Example:**

```typescript
function nextAssignmentStatus(input: {
  current: AssignmentStudentStatus;
  attemptStatus?: AttemptStatus;
  dueAt: Date;
  now: Date;
  reviewDecision?: ReviewDecision;
}): AssignmentStudentStatus {
  if (input.reviewDecision === "complete") return "completed";
  if (input.reviewDecision === "needs_retry") return "needs_retry";
  if (input.current !== "completed" && input.now > input.dueAt) return "missed";
  if (input.attemptStatus === "teacher_review") return "teacher_review";
  if (input.attemptStatus === "needs_retry") return "needs_retry";
  if (input.attemptStatus === "completed") return "completed";
  if (input.attemptStatus === "in_progress") return "started";
  return input.current;
}
```

### Pattern 2: Mission Snapshot on Assignment

**What:** Assignment stores the mission content as assigned, or points to immutable mission-version rows.

**When:** Teacher can edit mission drafts and may later reuse or revise missions.

**Why:** Students and teachers must review the same prompt/target that was assigned at the time, not a later edited version.

### Pattern 3: Adapter Layer for AI Providers

**What:** `MissionGenerator`, `Transcriber`, `TurnEvaluator`, and optional `SpeechGenerator` are app interfaces with provider-specific implementations.

**When:** All AI/audio calls.

**Why:** Model APIs, pricing, latency, and safety controls change. The product's core workflow should survive provider changes.

### Pattern 4: Transcript-First Review Projection

**What:** Build teacher review views from stored turn summaries and sign audio URLs only on demand.

**When:** Assignment dashboard and attempt detail.

**Why:** Teachers need to scan many students quickly. Audio exists for verification, not as the primary review workload.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Open-Ended Chat as the Core Data Model

**What:** Store a generic chat transcript and infer homework status from messages.

**Why bad:** Status buckets become ambiguous, teacher review slows down, and the app drifts away from teacher-assigned target language.

**Instead:** Store mission templates, attempts, and normalized per-turn records.

### Anti-Pattern 2: Client-Owned Completion

**What:** The browser marks an assignment complete after the last screen.

**Why bad:** Audio upload, transcription, repeat check, and AI confidence can fail independently. Client-owned completion creates false positives.

**Instead:** Server completes only after required turn records and repeat evaluations exist.

### Anti-Pattern 3: AI-Owned Status Transitions

**What:** Ask the model to decide and persist `completed`, `needs_retry`, or `teacher_review`.

**Why bad:** Models can be inconsistent, and auditability matters for teachers.

**Instead:** AI returns structured evidence; deterministic app code applies transitions.

### Anti-Pattern 4: Long Session Recordings

**What:** Record the entire 2-3 minute mission as one audio blob.

**Why bad:** Teacher review becomes slower, retry handling is harder, and retention costs/privacy risk grow.

**Instead:** Store short clips per original answer and repeat attempt.

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| Database | Single managed Postgres database is enough | Add indexes on `assignmentId/status/studentId`, job queue for missed status | Partition/archive old attempts and transcripts by class/assignment/date |
| Audio storage | Single object bucket with lifecycle expiration | Direct signed uploads and CDN/signed playback URLs | Regional buckets, lifecycle policies, async virus/content checks if required |
| AI calls | Synchronous turn processing is acceptable | Queue or async job fallback for transcription/evaluation retries | Dedicated worker fleet, rate-limit per class/teacher, provider failover |
| Teacher dashboard | Live queries over assignment rows | Precomputed bucket counts per assignment | Materialized summaries and event-driven projection updates |
| Student sessions | Cookie/session table | Short-lived signed sessions with server verification | Device/session risk controls and anomaly monitoring |
| Cost control | Hard code conservative max turns/audio duration | Per-teacher/class quotas and spend alerts | Multi-provider routing, batch analysis for non-interactive review tasks |

## Suggested Build Order

Build in vertical slices, not layers. The first milestone should prove that one teacher can assign one mission and review one student's completed speaking attempt.

1. **Domain foundation and teacher shell**
   - Create teacher auth, class, roster, and student PIN data model.
   - Verify by creating a class, adding students, and resolving a student through class code + PIN.

2. **Manual mission and assignment vertical**
   - Build mission creation without AI first: target pattern, questions, required turns, due date, `characterId`.
   - Assign to a class and create per-student `AssignmentStudent` rows.
   - Verify teacher dashboard can show assigned/not-started rows.

3. **Student attempt with mocked AI/audio**
   - Let student start homework, submit text or mocked transcript per turn, repeat target sentence, and complete.
   - Verify status transitions and teacher review from stored turn records.
   - This de-risks the product workflow before spending time on realtime voice.

4. **Audio capture and storage**
   - Add browser recording for short clips, object storage, playback URL signing, and audio retention policy.
   - Verify each original/repeat clip is attached to the correct turn and playable from teacher review.

5. **Transcription and structured turn evaluation**
   - Add provider adapters for transcription and evaluator outputs.
   - Use strict structured schemas where available and deterministic server-side transitions.
   - Verify understandable-but-imperfect answers produce improved target-form repeat prompts.

6. **AI mission generation**
   - Add teacher-assisted mission draft generation after the manual mission path is stable.
   - Teacher must edit/approve before assignment.
   - Verify assigned mission snapshots remain stable after later draft edits.

7. **Teacher review polish and operational jobs**
   - Add missed-status scheduler, needs-retry/review filters, hint-level summaries, attempt count, and review overrides.
   - Verify dashboard buckets match the state machine after due dates and teacher decisions.

Defer full realtime voice-agent sessions, a large character system, parent accounts, school SSO, and numerical grading until teachers repeatedly use the basic homework loop.

## Roadmap Implications

- Phase 1 should not be "set up AI." It should be "teacher creates class, assigns a manual mission, student completes a mocked speaking attempt, teacher reviews it." That validates the product workflow and data model.
- AI generation belongs after manual mission assignment because generated content still needs the same mission schema, assignment snapshot, and teacher approval path.
- Audio capture belongs before realtime AI because short-clip storage and teacher playback are core product requirements regardless of provider.
- Realtime voice is an optimization, not an MVP dependency. The architecture should leave room for it through adapters, but the first implementation can be request/response turn processing.
- Teacher review should be implemented early because it defines what data the attempt flow must persist.

## Sources

- Local project context: `.planning/PROJECT.md` and `english-speaking-practice-app-spec.md` (HIGH confidence; product source of truth)
- OpenAI Realtime and audio docs: https://developers.openai.com/api/docs/guides/realtime (HIGH confidence for current OpenAI realtime boundary; checked 2026-06-25)
- OpenAI Speech to text docs: https://developers.openai.com/api/docs/guides/speech-to-text (HIGH confidence for current transcription guidance; checked 2026-06-25)
- OpenAI Structured outputs docs: https://developers.openai.com/api/docs/guides/structured-outputs (HIGH confidence for structured evaluator recommendation; checked 2026-06-25)
- OpenAI data controls docs: https://developers.openai.com/api/docs/guides/your-data (HIGH confidence for provider data-retention considerations; checked 2026-06-25)
- OpenAI Under 18 API Guidance: https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance (HIGH confidence for minor-user safety considerations; checked 2026-06-25)
- FTC COPPA FAQ: https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions (HIGH confidence for child voice recording/privacy implications in U.S. contexts; checked 2026-06-25)

## Research Notes

The local GSD `research-plan` seam could not run because `/Users/john/.codex/gsd-core/bin/gsd-tools.cjs` failed while requiring a missing `../../../package.json`. I used the project source docs plus official OpenAI and FTC sources directly. The architecture recommendation is still high confidence because the product workflow is explicit in the project docs and the external sources mainly validate integration boundaries, structured outputs, realtime credentials, and youth/audio privacy constraints.
