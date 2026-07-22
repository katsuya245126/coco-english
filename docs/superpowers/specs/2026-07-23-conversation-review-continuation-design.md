# Conversation Review Continuation and Answer Policy Design

**Date:** 2026-07-23
**Status:** Approved, including written-spec review

## Goal

Let students finish dynamic conversation missions normally when an internal AI
evaluation requires teacher review, while keeping the review auditable and all
subsequent audio, translation-hint, and TTS operations server-authorized.

Add a dynamic-conversation mission setting that lets teachers require
meaning-preserving complete-sentence corrections for understandable fragments.

## Root cause

A teacher-review evaluation currently makes both `assignment_students.status`
and `attempts.status` terminal immediately. The student client nevertheless
advances a non-final conversation turn. The generated Coco line can still appear
from the upload response, but persistence rejects the now-terminal attempt.
Translation hints and TTS therefore cannot resolve the unpersisted line, and the
next audio upload rejects the assignment because it is no longer `started` with
an `in_progress` attempt.

This conflict existed before the final-Coco-closing implementation. Commit
`66c0c44e` exposed it by advancing conversation-mode teacher-review turns using
the generated reply without reconciling the terminal server status.

## Product decisions

- A non-final teacher-review result must not end a dynamic conversation mission.
- Review routing is internal. Students do not see teacher-review wording or an
  extra review-specific Continue step.
- Students finish with the normal Coco closing, **Finish mission** button, and
  completion experience.
- A reviewed submission appears as **Completed** on student surfaces while
  remaining `teacher_review` on teacher surfaces.
- Dynamic conversation missions have a **Require complete-sentence answers**
  setting.
- The setting defaults to on and applies only to dynamic conversation mode.
- When enabled, an understandable fragment such as `School` should receive a
  meaning-preserving correction such as `I like to play soccer at school.` and
  enter the existing repeat flow.
- When disabled, a relevant fragment may be accepted directly.
- Preset-mode evaluation remains unchanged.

## Selected architecture

### Mission-owned answer policy

Persist a boolean mission field for the complete-sentence policy. Expose it in
the teacher mission form only while dynamic conversation mode is enabled. Copy
the value into `assignments.mission_snapshot` when assigning a mission so later
mission edits cannot change already-assigned homework.

The form model, mission row mapper, assignment snapshot, and snapshot schema all
carry the value. The database column and schema defaults are `true`, including
the parser default for legacy snapshots that omit the field. This preserves the
existing intended evaluator policy for old missions without changing preset
behavior.

### Evaluation behavior

Pass the snapshotted policy into the conversation-mode original-turn evaluator.
When complete sentences are required, the evaluator instructions explicitly
classify understandable answer fragments as `needs_correction`, preserve the
student's meaning, produce one short declarative `improvedSentence`, and require
the existing repeat step. The contract includes concrete information-question
examples such as `Where do you like to play soccer?` plus `School.`.

When the policy is disabled, the evaluator accepts a relevant understandable
fragment without requiring a correction. Provider failures, schema failures,
genuine ambiguity, unsafe uncertainty, and meaning that cannot be inferred
without invention still produce teacher review. The setting never converts an
uncertain answer into invented student speech.

### Deferred review lifecycle

Replace immediate terminal routing with an owned attempt-level review flag. On
a teacher-review evaluation, the server writes `attempts.needs_review_reason`
after independently proving student, assignment, and attempt ownership. It
leaves the assignment `started` and the attempt `in_progress`, allowing the
same authorization checks to protect later turns.

The atomic `complete_student_attempt` database operation becomes the only place
that terminalizes a normally finished reviewed conversation. It locks the
owned assignment and attempt, verifies the configured number of finished turns,
counts a teacher-review evaluation as a finished turn, and chooses the terminal
status:

- `teacher_review` when the attempt has a review reason;
- `completed` otherwise.

It stamps `submitted_at`, `completed_at`, and `latest_attempt_id`, updates both
status rows consistently, and writes one matching audit event. Repeated
completion requests remain idempotent for both terminal outcomes.

### Contextual continuation

Conversation generation receives the evaluation disposition along with the
server-rebuilt conversation history. For an internally reviewed turn, Coco's
next line follows this priority:

1. respond to the current student response when its meaning is usable;
2. otherwise continue from the most recent understandable student detail in
   owned attempt history;
3. otherwise use a safe scene-related neutral continuation.

The student client treats a teacher-reviewed original turn like an accepted
conversation turn: it advances automatically using the server-generated Coco
line and does not render teacher-review feedback. The server must persist the
line before returning it as usable. A persistence failure returns a retryable
submission failure instead of exposing an ephemeral line that TTS and
translation hints cannot resolve.

### Student and teacher presentation

The student mission shell never displays `Your teacher will check this answer`
for dynamic conversation review routing. A reviewed mission still shows the
normal final Coco closing and normal completion screen.

Student assignment queries map terminal `teacher_review` submissions into the
same Past-tab and **Completed** presentation as `completed`. Student history
remains readable through the same ownership checks. Teacher queues, evidence,
review reasons, transcript-first presentation, and signed per-turn audio access
continue to use the real `teacher_review` status.

## Failure handling and invariants

- UI reachability and caller-supplied identifiers never authorize a write.
- Review flagging, Coco-line persistence, completion, hint resolution, TTS
  resolution, and audio upload each prove ownership independently.
- A review flag is monotonic for an attempt. Later accepted turns do not clear
  it.
- Provider/schema failures remain reviewable and never fabricate corrections.
- An unpersisted dynamic line never advances the client.
- Preset missions retain their current evaluation, transition, review-pending,
  and completion behavior.
- Mission snapshots remain immutable assignment contracts.
- No public audio URLs are introduced; teacher playback remains signed on
  demand.

## Data migration

Add the mission-level boolean column with a database default of `true` and
update generated database types. Replace the completion RPC in a new migration
so reviewed turns can finish atomically and choose the correct terminal status.

Creating the migration file is local implementation work. Applying it to any
local, staging, or production Supabase environment requires separate explicit
approval naming that environment and action.

## Verification

Implementation is test-first and must cover:

- mission form parsing and teacher form visibility;
- create, edit, load, and assign persistence of the policy;
- snapshot immutability and legacy default behavior;
- evaluator instructions and decisions with the policy on and off;
- `School.` producing a complete-sentence correction when enabled;
- unchanged preset evaluation;
- teacher-review flagging that leaves assignment/attempt recordable;
- successful Coco-line persistence after a reviewed turn;
- working hint, TTS, and next audio upload contracts;
- retryable failure when Coco-line persistence fails;
- completion RPC source/schema behavior for reviewed and unreviewed attempts;
- idempotent terminal transitions and audit events;
- automatic reviewed-turn client advancement with no review wording;
- normal closing/completion UI and Completed/Past student presentation;
- unchanged teacher queue, evidence, ownership, and signed-audio behavior.

After focused tests, run the full suite, typecheck, and lint. Run the production
build only after confirming the checkout's active development server has been
stopped so both processes do not share `.next`. Final localhost UAT uses a
five-turn dynamic conversation containing both a corrected fragment and a
silently reviewed turn, then verifies the closing, completion screen, Past-tab
presentation, hint, TTS, recording, re-entry guard, and teacher evidence.

## Non-goals

- Changing preset mission evaluation or authored target-example behavior.
- Exposing review reasons or review status to students.
- Teacher-wide or class-wide answer-policy defaults.
- Changing pronunciation scoring thresholds.
- Replacing the existing bounded Coco conversation architecture.
- Applying a database migration, deploying, pushing, publishing, or mutating
  any external environment without separate approval.
