# Kakao hydration compatibility and conversation scene-card removal

**Status:** Implemented and verified; awaiting Kakao real-device recheck

## Goal

Prevent KakaoTalk's root-element style injection from producing a React
hydration warning, and remove the redundant visible scene card from dynamic
conversation missions without weakening Coco's scene grounding.

## Approval

The user approved the recommended design on 2026-07-23.

## Scope

- Suppress hydration warnings only on root `<html>` and `<body>` elements.
- Hide `ScenePremiseCard` only when `conversationMode` is true.
- Preserve scene generation, storage, snapshots, opener grounding, dynamic
  reply grounding, and preset-mode behavior.

## Non-goals

- Database, AI prompt, or state-transition changes.
- Removing the scene premise from the underlying mission model.
- Push or deployment.

## Done checks

- [x] Root cause identified from the Kakao error diff and root layout source.
- [x] Design approved.
- [x] Design spec written and self-reviewed.
- [x] Written spec reviewed by user.
- [x] Test-first implementation plan written and self-reviewed.
- [x] Test-first implementation complete.
- [x] Focused and release verification complete.

## Verification evidence (2026-07-23)

Focused regression matrix:

```
npx vitest run tests/server/root-layout-source.test.ts tests/server/student-mission-page.test.ts src/server/ai/opener-generator.test.ts src/server/ai/conversation-generator.test.ts src/domain/ai/conversation-generation.test.ts
```
Result: 5 files passed, 59 tests passed, 0 failed.

Full automated release gate, run sequentially:

```
npm test -- --run
```
Result: 89 files passed, 910 tests passed, 4 skipped, 0 failed. No `listen EPERM` socket failures observed.

```
npm run typecheck
```
Result: exit 0, no errors.

```
npm run lint
```
Result: exit 0. 1 pre-existing warning (`scripts/check-student-feedback-states.mjs:435`, unused `label` arg). No new errors or warnings introduced.

```
npm run build
```
Result: exit 0. Production build compiled successfully; all 9 static pages generated; no route or type errors.

## Next step

Open a conversation mission in the KakaoTalk in-app browser and confirm the
root hydration warning is absent and the visible "The scene" card is gone.
