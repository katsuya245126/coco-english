# Pronunciation Practice Screen Redesign

Status: Complete
Spec: `docs/superpowers/specs/2026-08-19-pronunciation-practice-screen-design.md`
Plan: `docs/superpowers/plans/2026-08-19-pronunciation-practice-screen-design.md`
Branch: `feature/pronunciation-practice`

## Delivered

- Rebuilt `PronunciationPracticeShell` around the reusable `MascotStage`.
- Added sound-first per-try feedback and per-sound micro-tips while preserving scoring, storage, evidence, and route contracts.
- Replaced percentage progress with accessible five-dot progress states.
- Added attached word/sound/verdict audio controls and preserved word-audio loading/retry behavior.
- Removed practice-time stars and moved whole-word stars to the finish view only.
- Updated component, domain, server, and pronunciation E2E coverage.
- Added a scoped 44px touch-target override and meaningful nested audio-tab test coverage after review.

## Verification

- `npm test -- --run`: 129 files passed; 1,573 passed; 10 skipped.
- `npm run typecheck`: passed.
- `npm run lint`: passed with one pre-existing warning in `scripts/check-student-feedback-states.mjs:435`; 0 errors.
- `npm run build`: passed; ffmpeg trace assertion passed.
- Final release review approved `2134e142..16733519` with no findings.
- Local app launched with `npm run local` on port 3200. The `LOCALF` / `john` fixture was restored in local Supabase only because the existing local volume did not contain it. Local screenshots checked 375x812 and 1440x900 prompt, encourage, celebrate, and finish states; practice showed no stars and finish showed five star groups.

## Evidence limitation

The visual practice verdicts used the localhost app with a browser fake recorder and Playwright provider doubles for deterministic encourage/celebrate outcomes; the finish view used local Supabase fixture evidence. These are localhost/test-environment observations, not production evidence. The real Supabase-backed pronunciation E2E was skipped because its dedicated prerequisites were not set.

## Scope and handoff

No schema, scoring, storage, teacher-evidence, route-contract, Korean transcript, word-audio guarantee, silent-failure logging, or error-bucketing changes were made. `scripts/local/`, `scripts/dev-local.sh`, and `.env.local` were left unmodified and unstaged. The branch was committed locally and not pushed or merged.
