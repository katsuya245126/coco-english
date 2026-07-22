# Kakao hydration compatibility and conversation scene-card removal

**Status:** Implementation in progress

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
- [ ] Focused and release verification complete.

## Next step

Run focused and release verification.
