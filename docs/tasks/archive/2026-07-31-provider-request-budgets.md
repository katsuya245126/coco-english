# Provider Request Budgets

**Status:** Paused — Conversation Feedback Repair resumed to address review findings

**Class:** Consequential — student data, service-role access, external-provider cost, database migration

## Goal

Bound authenticated callers' paid-provider work and student-audio growth without slowing the first speaking turn. Preserve the signed, eight-hour stateless student session; individual revocation is out of scope.

## Scope

- Add an atomic, service-role-only Supabase request-budget primitive.
- Limit authenticated student audio, TTS, and translation requests; limit teacher-triggered provider work.
- Retain evaluator warm-up, but allow only one global refresh per 90 seconds.
- Return a clear rate-limited result before provider work or audio-clip insertion.

## Non-goals

- Opaque/revocable student sessions, CAPTCHA, edge/WAF configuration, a new limiter service, production migration/deploy, or a retention redesign.

## Done checks

- Concurrent calls cannot exceed each budget threshold.
- Budget state stores no raw student/teacher identifier or student content.
- A denied audio request creates no clip and invokes no provider.
- Only one warm-up is admitted in each 90-second global window.
- Existing ownership checks, signed URLs, and first-turn warm-up behavior remain intact.

## Next step

Write and approve the implementation plan; obtain approval again before implementation.
