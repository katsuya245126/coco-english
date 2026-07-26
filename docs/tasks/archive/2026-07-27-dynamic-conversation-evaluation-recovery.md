# Dynamic Conversation Evaluation and Recovery Repair

**Status:** Complete
**Classification:** Consequential
**Started:** 2026-07-26

## Desired outcome

Make dynamic conversation feedback accurately distinguish a correct answer, a
meaning-preserving correction, a genuinely unclear answer, and an internal AI
failure. Students should see an actionable explanation when the application
can safely identify a language problem, and they should never enter a chain of
context-free `Hmm... Can you say it again?` prompts.

## Evidence source

- Local read-only export:
  `scripts/output/inspect-attempts-2026-07-26T14-50-06-564Z.txt`
- Runtime provenance in the affected attempt:
  `natural-conversation-v1`, `gpt-4.1-mini`, `local-dev`
- Current source, tests, and commits through `c460c2fd`

The export is localhost/runtime database evidence, not production application
evidence. Rejected generated reply candidates were not persisted, so the exact
text that failed `focus_mismatch` cannot be reconstructed from this artifact.

## Confirmed problems

1. **Contradictory evaluator results pass as teacher review.**
   Turns 2–5 record `meaningUnderstood: true`, `confidence: high`, and
   `englishLanguage: english` while also recording
   `outcome: teacher_review`, `reviewReason: ambiguous`,
   `correctionNeeded: false`, and no improved sentence. The decision function
   accepts `teacher_review` before validating the other fields, and upload
   repair only runs when an improved sentence exists.
2. **A no-op minor correction survives normalization.**
   Turn 1 stores the same original and improved sentence while retaining
   `correctionNeeded: true`, severity `minor`, and reason `grammar`.
   `guardNoOpCorrection` only handles `needs_correction`; conversation minor
   results have already become `accepted_original`.
3. **The reply focus contract is too lexical and under-observed.**
   Two provider attempts can fail `focus_mismatch` when the model's declared
   focus paraphrases or groups a learner detail instead of repeating the same
   lexical token in both the response and question. Only the violation name is
   retained, not the rejected structured parts, so the precise failing
   comparison is unavailable after the request.
4. **Internal failures become misleading learner prompts.**
   Any review-pending generation failure selects
   `Hmm... Can you say it again?`, even when the input was understandable and
   the failure was evaluator/reply-policy inconsistency. Dynamic mode silently
   advances teacher-review turns, so the line acts as the next turn's question
   rather than feedback on the current turn.
5. **The fallback loses semantic grounding on the following turn.**
   Once `Can you say it again?` is persisted as the next prompt, the next
   evaluator receives that generic line as `missionQuestion`, not the earlier
   beach question. Repeated fragments therefore have less grounding and can
   produce another ambiguous review, creating the observed cascade.
6. **Closing quality is not grounded deterministically.**
   The final line only generically acknowledges beach plans instead of the
   learner's latest food answer. Closing validation checks shape and
   punctuation but not whether the reaction acknowledges the latest usable
   response.
7. **The inspection report misstates turn context.**
   `attempt_turns.coco_line` is the line generated after the stored answer, but
   the formatter labels it `coco said`, implying it was the question answered.
   It also prints missing generated-turn policy as `fixed`, while upload
   runtime defaults generated conversation turns to `open`.

## Scope

- Original-turn evaluator semantic consistency and bounded repair.
- No-op correction canonicalization for both minor and material results.
- Dynamic reply focus validation and diagnostic evidence.
- Genuine-ambiguity versus internal-failure recovery behavior.
- Dynamic conversation history/prompt grounding after recovery.
- Closing grounding validation.
- Read-only attempt-report turn-context accuracy.
- Focused domain, server, flow, formatter, and regression tests.

## Non-goals

- No change to preset mission behavior unless a shared contract regression
  requires it.
- No weakening of ownership checks, RLS, mission snapshots, teacher review,
  moderation, per-turn audio storage, or signed audio playback.
- No scoring, pronunciation-model, billing, provider, model, migration, or
  historical-attempt rewrite.
- No paid-provider call, Supabase mutation, push, deployment, or publication
  without separate exact-target approval.

## Observable done checks

- Understandable grammar errors like
  `I will swimming and my family eat 삼겹살.` cannot become high-confidence
  ambiguous teacher review without a bounded consistency-repair attempt.
- A valid correction preserves the learner's meaning, shows the exact improved
  sentence, and follows the existing material repeat flow.
- An identical original/improved sentence persists as no correction:
  `accepted_original`, severity/reason `none`, `correctionNeeded: false`, and
  no improved sentence.
- A genuine ambiguity shows the transcript and exact `Hmm... Try again`
  feedback, requires one same-turn re-recording with no Continue action, and
  cannot create an unbounded or context-free retry chain.
- Reply-policy failure never presents `Can you say it again?` as though the
  student's understandable answer caused the internal failure.
- One-detail follow-ups pass when the declared focus is a safe paraphrase or
  grouping, while genuine question drift still fails.
- Dynamic closing text is grounded in the latest usable learner response or
  uses an explicitly neutral closing fallback.
- The inspector separately prints `prompt answered` and `next Coco line`, and
  labels generated conversation turns with the runtime `open` policy.
- Focused tests, full suite, typecheck, lint, and build pass before completion.
- A separately approved localhost real-provider replay covers the supplied
  utterances and is labeled localhost application evidence.

## Planning checklist

- [x] Inspect branch, working tree, project context, recent fixes, export, and
      relevant evaluator/generator/fallback/history/UI/report code.
- [x] Trace the repeated fallback chain across evaluation, generation,
      persistence, and the next turn.
- [x] Separate confirmed root causes from missing rejected-candidate evidence.
- [x] Propose one bounded same-turn retry for the first genuinely ambiguous
      answer, followed by teacher review and continuation if ambiguity recurs.
- [x] Compare prompt-only, contract-first, and larger state-machine designs.
- [x] Obtain approval for the presented contract-first hybrid design.
- [x] Write and self-review the design specification.
- [x] Obtain written-spec approval.
- [x] Write and self-review the definitive test-first implementation plan.
- [x] Obtain plan approval before runtime implementation.

## Implemented

- Added a pure original-evaluation contract with one shared repair budget.
  Contradictory outcome, correction, and English-language fields now repair
  once before app-owned fallback.
- Canonicalized identical corrections only when they are actual
  `needs_correction` results; review and non-English outcomes cannot be
  converted into success by the no-op guard.
- Added one persisted conversation ambiguity retry. The first genuine
  ambiguity stores transcript, audio clip, and evaluation evidence; incomplete
  and minimal-effort re-recordings preserve that budget; a second ambiguity
  advances to teacher review.
- Added `retryUnclearMeaning` resume/UI/TTS handling. Coco says exactly
  `Hmm... Try again`, the transcript remains visible, and no Continue action
  is provided.
- Removed live lexical `focus_mismatch` rejection while preserving its
  historical type, retained question-owned topic-drift validation, and added
  closing grounding.
- Replaced the internal-review fallback with
  `Thanks for trying! What else do you want to tell me?`.
- Persisted bounded rejected reply parts and attempt stage without prompt,
  history, object-key, access-value, or credential data.
- Corrected the attempt formatter to separate `prompt answered` from
  `next Coco line`, show soft conversation lesson context, and label generated
  turns `open (runtime default)`.
- Updated the private Git-ignored `scripts/inspect-attempts.mjs` caller locally
  to chain the prior Coco line into the tracked formatter. The private runner
  remains untracked and contains no committed access values.

## Acceptance evidence

- Contradictory understood review repair:
  `repairs a contradictory understood ambiguity exactly once`.
- No-op canonicalization and outcome guard:
  `canonicalizes an identical minor correction to no correction` and
  `does not canonicalize an identical sentence on a review outcome`.
- English/non-English coherence:
  three contract tests cover both contradictions and a valid non-English
  result.
- Bounded ambiguity and evidence:
  first ambiguity, second ambiguity, incomplete re-recording, and
  minimal-effort re-recording regressions in
  `src/server/student-access/audio-upload.test.ts`.
- Exact learner experience:
  resume and source-contract tests verify transcript visibility,
  `Hmm... Try again`, retry action, no Continue action, and matching TTS.
- Internal failure behavior:
  repair exhaustion persists internal review and continues with the neutral
  fallback rather than another same-turn ambiguity retry.
- Follow-up and closing quality:
  domain/server tests prove a paraphrased focus passes, genuine topic drift
  fails, normal closings are grounded, and rejected candidate evidence is
  retained.
- Inspector accuracy and privacy:
  five Node formatter tests cover prompt/next-line separation, runtime answer
  shape, soft context, rejected parts, legacy linkage, and secret-field
  exclusion.

## Final verification

- Focused regression set: 354 Vitest tests and 5 Node formatter tests passed
  before the independent review.
- Final full suite after review fixes:
  102 files passed; 1,172 tests passed; 4 skipped; 0 failed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with 0 errors and one pre-existing unused-argument
  warning in `scripts/check-student-feedback-states.mjs:435`.
- `npm run build`: passed.
- `node --check scripts/inspect-attempts.mjs`: passed against the private local
  runner.
- `git diff --check`: passed.
- Independent code review: both Important findings were fixed and re-reviewed;
  no remaining Critical or Important findings.

No paid-provider replay, Supabase mutation, push, deployment, publication, or
historical-attempt rewrite was performed. A localhost real-provider replay of
the supplied utterances remains an optional next action requiring separate
explicit approval.

The unrelated pre-existing main-checkout modification at
`.superpowers/sdd/task-1-report.md` remains untouched.
