# Dependency and asset cleanup

Status: Complete

## Result

- Removed the unused shadcn configuration, packages, imports, generated theme tokens, and `cn()` helper.
- Replaced the generated global theme scaffold with concrete font, color, border, and outline styles.
- Removed the eight obsolete images under `public/images/archive/`.
- Preserved Tailwind, the existing custom UI, and unrelated working-tree files.

## Verification

- `npm test -- --run tests/domain/mascot-assets.test.ts` — passed, 6 tests.
- `npm run typecheck` — passed.
- `npm run lint` — passed with one pre-existing warning in `scripts/check-student-feedback-states.mjs`.
- `npm run build` — passed, including the ffmpeg trace assertion.
