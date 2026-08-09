# Teacher-Owned Pronunciation Reprocessing Implementation Plan

> For agentic workers: use the executing-plans or subagent-driven-development workflow to implement this plan task by task. Each step uses checkbox syntax and ends with a runnable check.

**Goal:** Let a teacher create one missing pronunciation assessment for an owned audio clip while the server-owned operation proves ownership, prevents duplicate Azure work, admits provider work in the required order, and cleans up handled failures.

**Architecture:** Keep authentication and evidence-page refresh in the server action. Deepen src/server/audio/pronunciation-reprocess.ts so its public seam receives { teacherId, audioClipId } and owns the complete workflow. Use three service-role-only Postgres functions: begin_pronunciation_reprocessing atomically proves ownership and claims the clip, complete_pronunciation_reprocessing proves ownership and persists the score while clearing the claim, and clear_pronunciation_reprocessing proves ownership and clears a handled or manually repaired claim.

**Tech Stack:** Next.js App Router server actions, TypeScript, Supabase Postgres migrations and RPCs, Supabase Storage, the existing Azure pronunciation scorer adapter, Vitest, and local-Supabase integration tests.

## Global Constraints

- Preserve teacher authentication, action results unauthorized/already_scored/unavailable/failed/rate_limited, evidence-page revalidation, signed audio playback, student mission behavior, mission snapshots, RLS, and per-turn audio storage.
- Every new database function independently joins audio_clips through attempt_turns, attempts, assignment_students, assignments, and classes and matches classes.teacher_id to p_teacher_id.
- The three new functions are security definer, set search_path = public, revoke execution from public/anon/authenticated, and grant execution only to service_role.
- The active marker is nullable audio_clips.pronunciation_reprocessing_started_at. Add no timeout and no automatic abandoned-marker clearing.
- begin returns clip values only for ok. Unauthorized, already_scored, and unavailable rows contain null clip values.
- Ordering is begin/ownership and marker claim, private Storage download, teacher_provider budget admission, Azure scoring, ownership-proving score persistence.
- Handled download, budget, scorer, and persistence failures clear the marker through clear_pronunciation_reprocessing. A stopped process may leave an abandoned marker for the documented manual repair path.
- Unit tests inject the scorer and budget decision. No test calls Azure. Do not apply a migration to a remote environment.
- Add no dependency, direct audio_clips repair SQL, public repair endpoint, application repair page, or unrelated refactor.
- Preserve the pre-existing untracked CONTEXT.md and docs/adr/0001-prevent-concurrent-pronunciation-reprocessing.md. Stage only the files listed in each task.

## File Structure

- Create supabase/migrations/202608090001_teacher_owned_pronunciation_reprocessing.sql.
- Create tests/schema/pronunciation-reprocessing-schema.test.ts.
- Create tests/server/pronunciation-reprocessing.integration.test.ts.
- Modify src/lib/db/types.ts.
- Modify src/server/audio/pronunciation-reprocess.ts and tests/server/pronunciation-reprocess.test.ts.
- Modify src/app/teacher/evidence/[attemptId]/actions.ts and tests/server/pronunciation-reprocess-action.test.ts.
- Modify src/server/teacher/audio-evidence.ts only to remove the now-unused caller-side ownership helper.
- Create docs/operations/pronunciation-reprocessing.md.
- Update and archive TASK.md only after implementation and verification.

## Public Interfaces

The deep module must expose:

    export type ReprocessPronunciationResult =
      | { ok: true; scored: true }
      | {
          ok: false;
          error:
            | "unauthorized"
            | "already_scored"
            | "unavailable"
            | "failed"
            | "rate_limited";
        };

    export type ReprocessPronunciationDeps = {
      scorePronunciation?: typeof scorePronunciation;
      consumeRequestBudget?: typeof consumeRequestBudget;
    };

    export function reprocessClipPronunciation(
      input: { teacherId: string; audioClipId: string },
      deps?: ReprocessPronunciationDeps,
    ): Promise<ReprocessPronunciationResult>;

The database RPC contracts are:

    begin_pronunciation_reprocessing(
      p_teacher_id uuid,
      p_audio_clip_id uuid
    ) returns table (
      outcome text,
      object_key text,
      duration_ms integer,
      reference_text text
    );

    complete_pronunciation_reprocessing(
      p_teacher_id uuid,
      p_audio_clip_id uuid,
      p_accuracy_score numeric,
      p_fluency_score numeric,
      p_completeness_score numeric,
      p_pronunciation_score numeric,
      p_star_band smallint,
      p_word_scores jsonb
    ) returns text;

    clear_pronunciation_reprocessing(
      p_teacher_id uuid,
      p_audio_clip_id uuid
    ) returns text;

begin outcomes are unauthorized, already_scored, unavailable, and ok. complete outcomes are ok, already_scored, and not_found. clear outcomes are ok and not_found.

---

### Task 1: Add the ownership-proving database seam

**Files:**

- Create: supabase/migrations/202608090001_teacher_owned_pronunciation_reprocessing.sql
- Create: tests/schema/pronunciation-reprocessing-schema.test.ts
- Create: tests/server/pronunciation-reprocessing.integration.test.ts
- Modify: src/lib/db/types.ts

**Interfaces:**

- Consumes existing audio, attempt, ownership, and pronunciation-score tables.
- Produces the three RPCs above; only service_role can execute them.

- [ ] Step 1: Write the failing schema-contract test.

Read the new migration with readFileSync, lowercase it, and normalize whitespace. Assert all of the following:

    add column pronunciation_reprocessing_started_at timestamptz
    create function public.begin_pronunciation_reprocessing
    create function public.complete_pronunciation_reprocessing
    create function public.clear_pronunciation_reprocessing
    for update of ac
    pronunciation_reprocessing_started_at is null
    insert into public.pronunciation_scores
    on conflict (audio_clip_id) do nothing
    set pronunciation_reprocessing_started_at = null

Assert that the normalized SQL contains c.teacher_id = p_teacher_id and each of the five ownership joins three times. Assert that it contains security definer, set search_path = public, and the revoke/grant pair three times, with each grant ending in to service_role. Assert that the marker column is not declared not null.

- [ ] Step 2: Run the schema test and verify red.

Run:

    npm test -- --run tests/schema/pronunciation-reprocessing-schema.test.ts

Expected: FAIL because the migration file does not exist.

- [ ] Step 3: Add the migration.

Create the marker column without a default and without not null.

Implement begin_pronunciation_reprocessing as security definer with search_path public. Select the clip and turn fields through this exact ownership chain:

    audio_clips ac
    join attempt_turns t on t.id = ac.attempt_turn_id
    join attempts at on at.id = t.attempt_id
    join assignment_students ast on ast.id = at.assignment_student_id
    join assignments a on a.id = ast.assignment_id
    join classes c on c.id = a.class_id

Filter ac.id = p_audio_clip_id and c.teacher_id = p_teacher_id, and lock the owned clip with for update of ac. Return one unauthorized row with all clip fields null when no owned row exists. Before claiming, return already_scored if a pronunciation_scores row exists. Return unavailable when the marker is non-null, the object key is null, deleted_at is non-null, processing_status is deleted or failed, or the reference text is empty.

Resolve original_answer reference text from btrim(t.original_transcript). Resolve repeat_attempt reference text from btrim(t.improved_sentence), falling back to btrim(t.repeat_transcript). Set the marker to clock_timestamp() only after every check, then return ok with object_key, duration_ms, and reference_text. The row lock serializes only the short begin transaction; Storage and Azure work happen after the RPC returns.

Implement complete_pronunciation_reprocessing with the same six-table ownership join and p_teacher_id filter. Require a non-null marker. Derive the same reference text inside the function. Insert one row into pronunciation_scores with provider azure_speech and the scorer arguments, using on conflict (audio_clip_id) do nothing. Clear the marker in the same transaction. Return already_scored when the insert conflicts with an existing score, ok when it inserts, and not_found when ownership or the active marker is absent.

Implement clear_pronunciation_reprocessing with the same ownership join and p_teacher_id filter. Set the marker to null and updated_at to clock_timestamp(). Return ok when an owned row was updated and not_found otherwise. It must be idempotent.

For each function, add security definer, set search_path = public, revoke all on the exact function signature from public, anon, authenticated, and grant execute on the exact signature to service_role. Do not grant authenticated or public execution.

- [ ] Step 4: Extend the generated database type shape.

In src/lib/db/types.ts, add pronunciation_reprocessing_started_at: string | null to audio_clips.Row and an optional nullable field to audio_clips.Insert.

Add these exact function declarations:

    begin_pronunciation_reprocessing: {
      Args: { p_teacher_id: string; p_audio_clip_id: string };
      Returns: {
        outcome: string;
        object_key: string | null;
        duration_ms: number | null;
        reference_text: string | null;
      }[];
    };
    complete_pronunciation_reprocessing: {
      Args: {
        p_teacher_id: string;
        p_audio_clip_id: string;
        p_accuracy_score: number;
        p_fluency_score: number | null;
        p_completeness_score: number | null;
        p_pronunciation_score: number;
        p_star_band: number;
        p_word_scores: Json;
      };
      Returns: "ok" | "already_scored" | "not_found";
    };
    clear_pronunciation_reprocessing: {
      Args: { p_teacher_id: string; p_audio_clip_id: string };
      Returns: "ok" | "not_found";
    };

- [ ] Step 5: Write the local-Supabase integration test.

Create tests/server/pronunciation-reprocessing.integration.test.ts. Reuse the local-only environment gate and inert realtime transport from tests/server/provider-request-budgets.integration.test.ts. Seed one teacher, class, student, mission, assignment, assignment student, attempt, attempt turn, and audio_clips row with the service-role client. Create a second teacher for cross-owner calls. Use unique auth emails and delete auth users and teacher profiles in finally; cascading foreign keys remove linked fixtures.

Cover these exact cases:

1. Two concurrent begin calls for the same owned clip return one ok and one unavailable, and the unavailable row has null object_key, duration_ms, and reference_text.
2. A begin call with the other teacher returns unauthorized.
3. After the owner begins, complete and clear called with the other teacher return not_found and leave the active marker non-null.
4. Owner begin followed by complete creates exactly one pronunciation_scores row and leaves the marker null.
5. A second begin after completion returns already_scored.
6. An original-answer fixture returns the original transcript; a repeat-attempt fixture returns improved_sentence before repeat_transcript.
7. An anon client and a signed-in authenticated client receive errors from all three RPCs.

Skip only when local Supabase URL, anon key, or service-role key is absent. Delete only the test fixtures created by this file.

- [ ] Step 6: Run database seam checks.

Run:

    npm test -- --run tests/schema/pronunciation-reprocessing-schema.test.ts tests/server/pronunciation-reprocessing.integration.test.ts
    npm run typecheck

Expected: schema tests pass; the integration test passes against local Supabase or is explicitly skipped by its environment gate; typecheck passes.

- [ ] Step 7: Commit the database seam.

Stage only:

    git add supabase/migrations/202608090001_teacher_owned_pronunciation_reprocessing.sql tests/schema/pronunciation-reprocessing-schema.test.ts tests/server/pronunciation-reprocessing.integration.test.ts src/lib/db/types.ts
    git commit -m "feat: add owned pronunciation reprocessing RPCs"

---

### Task 2: Deepen the pronunciation reprocessing module

**Files:**

- Modify: src/server/audio/pronunciation-reprocess.ts
- Modify: tests/server/pronunciation-reprocess.test.ts

**Interfaces:**

- Consumes the Task 1 RPCs, private student-audio Storage, consumeRequestBudget, and scorePronunciation.
- Produces reprocessClipPronunciation({ teacherId, audioClipId }, deps) with the public result union.

- [ ] Step 1: Replace the old fixture with an RPC-aware fake and write failing seam tests.

Keep the service-client mock, but replace the table-query fake with a fake that records RPC, Storage, budget, scorer, and cleanup events. The default begin row is:

    {
      outcome: "ok",
      object_key: "as-1/att-1/1/original_answer-clip-1.webm",
      duration_ms: 4200,
      reference_text: "I wake up at seven."
    }

The fake complete RPC returns ok and the fake clear RPC returns ok. Add tests that assert:

- unauthorized begin returns unauthorized and performs no download, budget, scorer, complete, or clear call;
- already_scored and unavailable begin outcomes perform no provider work;
- success produces events exactly in this order: begin, download, budget, azure, complete;
- budget receives actorId teacher-1 and operation teacher_provider;
- scorer receives the downloaded Blob, begin reference text, and begin duration;
- download failure calls clear once and returns failed;
- budget denial calls clear once, makes no scorer call, and returns rate_limited;
- scorer failure calls clear once and returns failed;
- complete RPC error calls clear once and returns failed;
- complete already_scored returns already_scored without a second clear;
- two concurrent calls sharing a begin fake produce one scorer call when the second begin outcome is unavailable;
- repeat-attempt begin data is passed to the scorer unchanged.

- [ ] Step 2: Run focused module tests and verify red.

Run:

    npm test -- --run tests/server/pronunciation-reprocess.test.ts

Expected: the new tests fail because the module accepts only audioClipId, does not call the RPCs, does not own budget admission, and does not clean up a claim.

- [ ] Step 3: Implement ordered module orchestration.

In src/server/audio/pronunciation-reprocess.ts:

1. Import consumeRequestBudget and add it to ReprocessPronunciationDeps.
2. Call begin_pronunciation_reprocessing with both IDs. Treat RPC errors, missing rows, unknown outcomes, or an ok row missing object_key/reference_text as failed.
3. Map begin unauthorized, already_scored, and unavailable directly to the public result.
4. Download the returned object_key from the configured private bucket.
5. On download failure, call clear_pronunciation_reprocessing once and return failed.
6. Call the injected/default consumeRequestBudget with the teacher ID and teacher_provider. On denial, clear once and return rate_limited.
7. Call the injected/default scorer with the Blob, returned reference text, and duration defaulted to zero when null. On scorer failure, log the existing failure event, clear once, and return failed.
8. Call complete_pronunciation_reprocessing with teacher ID, clip ID, accuracy, fluency, completeness, pronunciation, star band, and word scores. Return ok for ok and already_scored for already_scored. On RPC error or not_found, clear once and return failed.
9. Use a local cleanup helper that invokes clear through the service client. Do not clear a marker for a begin outcome that did not claim it.
10. Keep logging limited to the existing clip ID and score outcome. Do not log audio, reference text, teacher IDs, or provider input.

The direct service-role from audio_clips and from pronunciation_scores queries must disappear from this module. All service-role audio and score access must flow through the ownership-proving RPCs.

- [ ] Step 4: Run module tests and typecheck.

Run:

    npm test -- --run tests/server/pronunciation-reprocess.test.ts
    npm run typecheck

Expected: all module tests pass and typecheck passes.

- [ ] Step 5: Commit the deep module.

    git add src/server/audio/pronunciation-reprocess.ts tests/server/pronunciation-reprocess.test.ts
    git commit -m "feat: deepen owned pronunciation reprocessing"

---

### Task 3: Thin the server action and remove duplicate authorization

**Files:**

- Modify: src/app/teacher/evidence/[attemptId]/actions.ts
- Modify: tests/server/pronunciation-reprocess-action.test.ts
- Modify: src/server/teacher/audio-evidence.ts

**Interfaces:**

- Consumes requireTeacherProfile and the Task 2 deep module seam.
- Produces the unchanged action result union and evidence-page refresh.

- [ ] Step 1: Write the failing thin-boundary action tests.

Remove caller-side ownership and budget mocks. Configure only requireTeacherProfile, reprocessClipPronunciation, and revalidatePath. Add tests that assert:

- successful module result is called once with { teacherId: "teacher-1", audioClipId: "clip-1" } and revalidates /teacher/evidence/attempt-1;
- each of unauthorized, already_scored, unavailable, failed, and rate_limited is returned unchanged and does not revalidate;
- an empty audioClipId returns unavailable before authentication or module invocation.

- [ ] Step 2: Run the action test and verify red.

Run:

    npm test -- --run tests/server/pronunciation-reprocess-action.test.ts

Expected: the tests fail because the action still calls teacherOwnsAudioClip, consumes the budget itself, and omits teacherId from the module call.

- [ ] Step 3: Make the action a thin authenticated boundary.

In src/app/teacher/evidence/[attemptId]/actions.ts:

1. Remove teacherOwnsAudioClip and consumeRequestBudget imports.
2. Keep the empty clip guard and requireTeacherProfile.
3. Call the module once with teacherId: profile.id and the input audioClipId.
4. On success, revalidate /teacher/evidence/{attemptId} and return { ok: true }.
5. On failure, return the same error without reimplementing ownership, budget, or provider mapping.
6. Keep unrelated assignment actions unchanged.

In src/server/teacher/audio-evidence.ts, delete only the now-unused teacherOwnsAudioClip function and its comment. Do not change signed URL loading or evidence queries.

- [ ] Step 4: Run action and adjacent evidence tests.

Run:

    npm test -- --run tests/server/pronunciation-reprocess-action.test.ts tests/server/audio-evidence.test.ts
    npm run typecheck

Expected: both test files pass and typecheck passes. A search for teacherOwnsAudioClip in the action returns no matches.

- [ ] Step 5: Commit the action boundary.

    git add 'src/app/teacher/evidence/[attemptId]/actions.ts' tests/server/pronunciation-reprocess-action.test.ts src/server/teacher/audio-evidence.ts
    git commit -m "refactor: keep pronunciation authorization in module"

---

### Task 4: Document manual abandoned-marker repair

**Files:**

- Create: docs/operations/pronunciation-reprocessing.md

**Interfaces:**

- Consumes an authorized database maintainer, a confirmed inactive Azure request, the teacher profile ID, and audio clip ID.
- Produces an idempotent clear through clear_pronunciation_reprocessing; no direct table update.

- [ ] Step 1: Write the operations document.

The document must say that the marker is not a timeout, that no automatic clearing exists, that the maintainer must confirm no Azure request is active, and that separate approval must name the exact environment and clear action. It must show this only as an approved database-session example:

    select public.clear_pronunciation_reprocessing(
      '<teacher_profile_id>'::uuid,
      '<audio_clip_id>'::uuid
    );

It must explain ok, not_found, idempotence, retrying from the evidence page, and that direct audio_clips updates and application repair endpoints are forbidden.

- [ ] Step 2: Review the document for safety and scope.

Confirm it contains no reusable access value, secret, direct audio_clips update, application endpoint, timeout recommendation, or production authorization.

- [ ] Step 3: Commit the repair documentation.

    git add docs/operations/pronunciation-reprocessing.md
    git commit -m "docs: document pronunciation marker repair"

---

### Task 5: Verify, review, and finish the task record

**Files:**

- Modify: TASK.md.
- Create: docs/tasks/archive/2026-08-09-teacher-owned-pronunciation-reprocessing.md after completion.

**Interfaces:**

- Consumes implementation commits and issue #16 acceptance criteria.
- Produces fresh verification evidence, two-axis review findings, a final current-branch commit, and an archived task record.

- [ ] Step 1: Run the complete focused test set.

    npm test -- --run tests/server/pronunciation-reprocess.test.ts tests/server/pronunciation-reprocess-action.test.ts tests/schema/pronunciation-reprocessing-schema.test.ts tests/server/pronunciation-reprocessing.integration.test.ts

Expected: all non-environment-gated tests pass. The local integration test may skip only when its local Supabase environment is absent.

- [ ] Step 2: Run repository checks separately.

    npm run typecheck
    npm run lint
    npm test -- --run
    npm run build

Each command must exit 0. Record exact output summaries. A skipped local integration test remains skipped; do not apply a remote migration or mutate production to make it run.

- [ ] Step 3: Inspect the final ownership surface.

Use the base commit captured before implementation and run:

    git status --short
    git diff --stat <base-sha>...HEAD
    rg -n 'from\\("audio_clips"\\)|from\\("pronunciation_scores"\\)|teacherOwnsAudioClip' src/server/audio/pronunciation-reprocess.ts 'src/app/teacher/evidence/[attemptId]/actions.ts'

Expected: no direct service-role audio/score table access or caller-side ownership helper remains in the deep module/action. Pre-existing CONTEXT.md and ADR changes stay unstaged.

- [ ] Step 4: Run the required two-axis code review.

Use the fixed base commit and review git diff <base-sha>...HEAD against PROJECT.md, AGENTS.md, TASK.md, CONTEXT.md, the pronunciation ADR, and issue #16. Check every acceptance criterion: ownership in all three RPCs, role denial, no provider work for unauthorized calls, marker concurrency, download/budget/Azure ordering, handled-failure cleanup, retry behavior, unchanged action results, and no unrelated diff. Resolve every actionable finding, rerun its focused test, and rerun the full checks after review edits.

- [ ] Step 5: Update and archive TASK.md.

Only after evidence exists, mark the plan and done checks complete, record commit IDs and test summaries, set status complete, set current position implemented and verified, and move the completed task text to docs/tasks/archive/2026-08-09-teacher-owned-pronunciation-reprocessing.md with Status: Complete. Do not remove the active task until the archive contains final evidence.

- [ ] Step 6: Commit the final task record.

    git add TASK.md docs/tasks/archive/2026-08-09-teacher-owned-pronunciation-reprocessing.md
    git commit -m "chore: close teacher pronunciation reprocessing task"

The final handoff must include the commit ID, fresh verification output, skipped local integration checks, and confirmation that no push, deployment, production migration, or paid Azure request occurred.

## Self-Review Checklist

- [ ] Every issue #16 acceptance criterion maps to a task and a test or verification command.
- [ ] The plan contains no incomplete marker, placeholder implementation, or undefined function name.
- [ ] TypeScript RPC names, argument names, return values, and migration signatures match in every task.
- [ ] The only public caller passes teacherId and audioClipId; no caller-supplied ID is authorization without the database ownership join.
- [ ] A denied budget clears the marker, and no Azure scorer call occurs before budget admission.
- [ ] A failed or concurrent begin does not clear a marker it did not claim.
- [ ] Score persistence and marker clearing occur in the ownership-proving complete RPC.
- [ ] Manual repair uses the ownership-proving clear RPC, never a direct table update.
- [ ] The plan does not authorize remote mutation, deployment, push, or paid-provider testing.
