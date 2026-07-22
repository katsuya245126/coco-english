# Kakao hydration compatibility and conversation scene-card removal

**Status:** Approved design

## Problem

KakaoTalk's in-app browser adds inline WebKit styles to the root `<html>` and
`<body>` elements before React hydrates. The server and React client do not
render those attributes, so React reports a hydration mismatch even though the
application's server and client output agree.

Conversation-mode student missions also render a visible “The scene” card
above the dialogue. The same scene premise already grounds Coco's generated
opener and every later dynamic reply, making the visible card redundant.

## Chosen design

### Kakao hydration compatibility

Add `suppressHydrationWarning` to both root elements in `src/app/layout.tsx`.
The suppression is intentionally limited to the two elements Kakao mutates. It
does not suppress mismatches inside application content and does not remove or
rewrite Kakao's browser styles.

Rejected alternatives:

- Stripping the injected styles before hydration adds timing-sensitive client
  code and could fight legitimate browser behavior.
- Ignoring the warning leaves a known compatibility error in development and
  obscures future root-level hydration findings.

### Scene-card behavior

Do not render `ScenePremiseCard` when `conversationMode` is true. Preserve the
scene premise in mission rows, snapshots, server orchestration, opener
generation, and dynamic-reply generation.

Preset missions retain their existing behavior. Older snapshots and future
preset missions with a scene premise remain compatible.

Rejected alternatives:

- Removing the card for every mission would unnecessarily change preset-mode
  behavior.
- Removing scene-premise generation or storage would weaken conversation
  grounding and require unrelated schema and server changes.

## Data flow

The teacher-side premise generation and assignment snapshot remain unchanged.
At student render time, conversation mode skips only the presentation card.
The stored premise continues through the existing server-owned input path to
Coco's opener and dynamic reply generators.

## Verification

Test first:

1. A root-layout source contract requires hydration-warning suppression on
   both `<html>` and `<body>`.
2. A mission-flow source contract requires the scene card to be gated to
   non-conversation missions while preserving the existing premise prop and
   generator references.

Then run the focused tests, full suite, typecheck, lint, and production build.
The Kakao result remains real-device evidence and must be rechecked in the
KakaoTalk browser after deployment or a reachable preview.

## Non-goals

- No database, snapshot, AI prompt, opener, or dynamic-reply changes.
- No preset-mode behavior change.
- No attempt to normalize arbitrary extension or browser DOM mutations below
  the root elements.
- No push or deployment without separate approval for the exact target.
