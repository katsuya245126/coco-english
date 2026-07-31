# Provider Request Budgets Design

**Status:** Approved in conversation on 2026-07-31; written-review pending

## Outcome

Prevent an authenticated caller from turning the student audio, AI, TTS, translation, pronunciation reprocessing, or mission-authoring helpers into unbounded provider work. Bound resulting `audio_clips` growth while retaining the current responsive first-recording experience.

## Constraints

- Preserve the existing HMAC-signed, eight-hour student cookie. Do not add individual revocation or student Supabase Auth.
- Preserve every student and teacher ownership check, RLS policy, mission snapshot, and signed-audio boundary.
- Add no dependency, external limiter, WAF rule, or dashboard configuration.
- Do not store or log raw student IDs, teacher IDs, network addresses, transcripts, or provider input in limiter state.
- Do not apply migrations, deploy, push, or mutate a remote environment.
- Keep evaluator warm-up; it protects first-recording latency.

## Design

### Atomic request-budget primitive

Add one RLS-enabled `request_budgets` table with `(actor_digest, operation)` as its primary key, plus `window_started_at`, `request_count`, and `updated_at`. An atomic, `security invoker` PostgreSQL RPC increments or resets a fixed window and returns whether that request is permitted. Both table and RPC are service-role-only; `public`, `anon`, and `authenticated` have no access.

A server-only `request-budget` module derives HMAC-SHA-256 actor digests from `STUDENT_ACCESS_SECRET` with a distinct `request-budget:v1` purpose prefix. It accepts only a small operation enum, calls the RPC using the existing service client, and fails closed on a missing/invalid secret or database failure. The literal quota values stay in this module rather than becoming runtime configuration:

| Operation | Actor | Budget |
| --- | --- | --- |
| `student_audio` | student ID | 24 requests / 10 minutes |
| `student_helper` | student ID | 60 TTS-or-translation requests / 10 minutes |
| `teacher_provider` | teacher profile ID | 10 provider-triggering actions / 10 minutes |
| `evaluator_warmup` | fixed system actor | 1 admission / 90 seconds |

The fixed system actor is never derived from student data. It exists solely to coordinate provider-schema warm-up across server instances.

### Gate placement

Validate authentication, request shape, and resource ownership before consuming a budget, so malformed or foreign resource IDs cannot consume a caller's allowance. Consume before any provider invocation and, for audio, before reading the `Blob`, inserting `audio_clips`, or uploading Storage data.

- `uploadAttemptAudioClip` consumes `student_audio` after its assignment/attempt ownership and status checks.
- Student TTS consumes `student_helper` after the owned line resolves and before cache lookup/signing. Translation consumes it after resolving its owned source and before cache lookup/generation.
- Teacher server actions consume `teacher_provider` after `requireTeacherProfile` and input validation but before premise/opener generation, mission create/update answer-shape classification, assignment TTS warm-up, or pronunciation reprocessing.
- The mission page retains `after(() => warmEvaluators(...))`, but only dispatches it when `evaluator_warmup` admits the global refresh. A denied warm-up is a no-op, never a page error.

Audio budget denial is the growth bound: an audio request cannot create a row or object after its student reaches the window ceiling. Keep the existing 30-day purge and its 1,000-row batch; a retention-policy redesign is not required once authenticated upload intake is bounded.

### Public behavior

HTTP student routes return `429` with `{ ok: false, error: "rate_limited" }` and `Retry-After` for the remaining fixed-window time. Student UI presents a distinct wait-and-retry message instead of treating a limit as a provider outage. Teacher server actions return their existing typed error result with rate-limit copy and do not call a provider. Pronunciation reprocessing adds `rate_limited` to its existing action result.

## Failure behavior

- Missing/invalid `STUDENT_ACCESS_SECRET`, limiter RPC error, or unexpected counter result: fail closed before provider work.
- A denied evaluator warm-up: skip it; the normal recorded-turn evaluator remains available and may be slower on a cold provider cache.
- A denied student request: return 429 without exposing an identifier, quota count, or provider detail.
- A denied teacher action: return the generic rate-limit copy without changing mission, assignment, review, audio, or provider state.

## Verification

- Schema tests assert the digest-only table, RLS, grants, operation allow-list, atomic reset, quota behavior, and no public RPC access.
- Local-Supabase integration tests prove concurrent budget enforcement, role denial, reset windows, and a single warm-up admission.
- Unit tests prove HMAC purpose separation, fail-closed secret handling, and warm-up skip behavior.
- Route/service tests prove denial occurs before audio reading, clip insertion, storage upload, cache/provider work, and teacher provider calls; they also prove 429/typed error presentation.
- Run focused tests, then `npm test -- --run`, `npm run typecheck`, `npm run lint`, and `npm run build`.

## Non-goals

- Individual student-session revocation or opaque sessions.
- Per-IP/global edge rate limiting, CAPTCHAs, device fingerprinting, or a Redis/service-based limiter.
- Changing audio retention duration, deleting historical clips, or altering teacher evidence semantics.
- Applying the migration, deploying, pushing, or changing production configuration.

## Accepted tradeoffs

- The per-actor budget cannot stop a coordinated attack using many valid accounts. Add verified edge controls only if observed traffic warrants them.
- The 90-second global warm-up lease may occasionally permit a cold evaluation after a provider-side cache eviction. It avoids per-page duplicate paid requests without removing the latency optimization.
- Existing purge batches remain intentionally bounded to keep cron work predictable; observe backlog before changing their schedule or size.
