# Repeat Hangul Accented English Evaluation

Status: Complete
Branch: main
Base SHA: 6235bb9857c1ff5abf9775fe4dfcec6d8222527e
Plan: docs/superpowers/plans/2026-07-28-repeat-hangul-accented-english.md

## Goal

Implement the repeat-evaluation prompt and service contract needed so Hangul-script accented English in a repeat attempt can be judged against the English improved sentence, while genuine Korean repeats remain protected by the `non_english` path.

## Scope Completed

- Added `koreanSpans` to repeat evaluator input.
- Passed normalized transcript spans from repeat audio upload to repeat evaluation.
- Added prompt-contract and service-wiring tests.
- Preserved transcript storage and original-answer evaluation behavior.

## Non-Goals Preserved

- No transcript rewriting or romanized text storage.
- No production data changes.
- No deployment.
- No live OpenAI UAT.

## Implementation Commits

- b46b2df4
- cd86fb6a
- 654f7c1a

## Verification

- Focused verification passed: 138/138 tests passed with `npm test -- tests/server/turn-evaluator.test.ts tests/server/audio-upload.test.ts tests/server/transcription.test.ts tests/domain/hangul-romanization.test.ts --run`.
- Typecheck passed with `npm run typecheck`.
- Lint passed with `npm run lint`, with one unrelated pre-existing warning.
- Full suite is not globally green because of unrelated tests; do not claim the full suite passed.
- Live OpenAI UAT was not run and remains separately blocked pending explicit approval.

## Acceptance

Acceptance is limited to the locally verified prompt contract and service wiring.
