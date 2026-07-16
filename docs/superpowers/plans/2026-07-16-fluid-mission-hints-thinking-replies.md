# Fluid Mission, Immediate Hints, Thinking Sprite, and Natural Vague Replies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the student mission a responsive 640px-capped layout, make Hint reveal Korean on the first press, show Coco’s thinking sprite during generation, and make vague student replies produce natural narrowing questions.

**Architecture:** Replace the mission route’s shared panel wrapper with mission-specific fluid layout tokens while keeping meaningful cards and the mascot geometry intact. Keep translation data flow unchanged, but add small pure helpers that make first-phrase expansion and ready-state toggling testable. Extend the existing expression mapper and stateless conversation prompt contracts rather than adding new state, endpoints, persistence, or provider calls.

**Tech Stack:** Next.js App Router, React 19, TypeScript, inline `CSSProperties` tokens, Zod-backed conversation payloads, Vitest source/domain/server tests.

## Global Constraints

- Work only on branch `worktree-phase11-dynamic-conversation-repair`; do not merge to `main`.
- Mission page gutters are exactly `clamp(16px, 3vw, 32px)` and mission content is capped at exactly 640px.
- Remove the mission route’s outer white `panelStyle` only; shared panels on other pages remain unchanged.
- Keep the scene card, dialogue box, recorder, and feedback cards as bounded surfaces.
- Keep Coco’s 226px sprite framing, bottom offset, height, crop, animation, and speaking pulse unchanged.
- The Coco nameplate is 76px minimum width, 38px high, 14px bold text, and 12px horizontal padding.
- Hint/replay retain 48px outer height and at least 44px interactive touch targets.
- Hint success opens the first Korean phrase immediately; ready-state Hint presses toggle visibility without refetching.
- A failed/empty Hint result remains retryable through the same visible Hint action.
- `cocoThinking` selects the existing thinking sprite; status copy and other expression mappings stay unchanged.
- Vague replies are handled through the existing single stateless generation request; do not add another model call or deterministic output rewrite.
- Keep conversation history, moderation order, hard cap, canned fallback, preset missions, TTS, correction/repeat flow, and server-owned workflow state unchanged.
- Follow TDD: add each regression, run it and observe the expected failure, then implement the minimum production change.
- Every implementation commit updates both the YAML header and prose Current Position in `.planning/STATE.md`, using `date -u +%Y-%m-%dT%H:%M:%SZ` for `last_updated`.
- Preserve the pre-existing uncommitted `scripts/check-student-feedback-states.mjs` change and untracked `.superpowers/` directory; do not stage them.

---

## File Structure

- Modify `src/app/student/missions/[assignmentStudentId]/page.tsx`: use mission-specific fluid wrappers instead of the shared white panel.
- Modify `src/components/student/styles.ts`: own the mission width/gutter tokens and smaller attached nameplate geometry.
- Modify `tests/server/student-mission-page.test.ts`: lock the route-level removal of `panelStyle` and the 640px fluid column.
- Modify `tests/domain/tts-ui-source.test.ts`: lock smaller nameplate, unchanged action targets, shared-border geometry, and unchanged mascot framing.
- Modify `src/domain/ai/translation-hint.ts`: provide pure first-phrase/toggle helpers for the client component.
- Modify `tests/domain/translation-hint.test.ts`: verify first phrase selection and ready-state toggling.
- Modify `src/components/student/CocoDialogueBox.tsx`: auto-open the first Korean bubble and avoid ready-state refetches.
- Modify `src/domain/character/expression.ts`: map `cocoThinking` to `thinking`.
- Modify `tests/domain/character-expression.test.ts`: verify the thinking step and retain exhaustive expression coverage.
- Modify `src/domain/ai/conversation-generation.ts`: add the vague-answer narrowing contract to the user payload.
- Modify `src/domain/ai/conversation-generation.test.ts`: verify the domain prompt carries that contract.
- Modify `src/server/ai/conversation-generator.ts`: mirror the rule and normative “Anything” example in system instructions.
- Modify `src/server/ai/conversation-generator.test.ts`: verify the combined provider instructions prohibit vague-word echoing.
- Modify `.planning/STATE.md`: keep GSD execution state truthful after every task.

---

### Task 1: Replace the outer mission panel with a fluid capped column

**Files:**
- Modify: `tests/server/student-mission-page.test.ts`
- Modify: `src/components/student/styles.ts`
- Modify: `src/app/student/missions/[assignmentStudentId]/page.tsx`
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: existing `pageStyle` and `mascotStageStyle` conventions.
- Produces: `MISSION_CONTENT_MAX_WIDTH`, `missionPageStyle`, and `missionContentStyle` for the mission route and mascot stage.

- [ ] **Step 1: Write the failing route/layout regression**

Add `stylesSource` beside the existing `pageSource`, then add this test to `tests/server/student-mission-page.test.ts`:

```ts
const stylesSource = readFileSync(
  resolve(__dirname, "../../src/components/student/styles.ts"),
  "utf8",
);

it("uses a fluid mission column without the shared white panel", () => {
  expect(pageSource).toContain("missionPageStyle");
  expect(pageSource).toContain("missionContentStyle");
  expect(pageSource).not.toContain("panelStyle");
  expect(stylesSource).toContain("export const MISSION_CONTENT_MAX_WIDTH = 640");
  expect(stylesSource).toContain('padding: "clamp(16px, 3vw, 32px)"');
  expect(stylesSource).toMatch(
    /missionContentStyle[\s\S]*maxWidth: MISSION_CONTENT_MAX_WIDTH/,
  );
  expect(stylesSource).toMatch(
    /mascotStageStyle[\s\S]*maxWidth: MISSION_CONTENT_MAX_WIDTH/,
  );
});
```

- [ ] **Step 2: Run the route test and verify RED**

Run:

```bash
npx vitest run tests/server/student-mission-page.test.ts
```

Expected: FAIL because the route still imports/renders `panelStyle`, mission-specific layout tokens do not exist, and `MascotStage` inherits `panelStyle.maxWidth`.

- [ ] **Step 3: Add mission-specific fluid layout tokens**

In `src/components/student/styles.ts`, directly after `pageStyle`, add:

```ts
export const MISSION_CONTENT_MAX_WIDTH = 640;

export const missionPageStyle: CSSProperties = {
  ...pageStyle,
  padding: "clamp(16px, 3vw, 32px)",
};

export const missionContentStyle: CSSProperties = {
  width: "100%",
  maxWidth: MISSION_CONTENT_MAX_WIDTH,
  alignSelf: "flex-start",
};
```

Change only `mascotStageStyle.maxWidth`:

```ts
export const mascotStageStyle: CSSProperties = {
  width: "100%",
  maxWidth: MISSION_CONTENT_MAX_WIDTH,
  // keep every remaining property unchanged
};
```

Do not modify `panelStyle`; other student routes still use it.

- [ ] **Step 4: Use the fluid wrapper on the mission route**

In `src/app/student/missions/[assignmentStudentId]/page.tsx`, replace the style import:

```ts
import {
  missionContentStyle,
  missionPageStyle,
} from "@/components/student/styles";
```

Replace the outer render wrappers with:

```tsx
<main style={missionPageStyle}>
  <div style={missionContentStyle}>
    <MissionFlowShell
      // keep every existing prop unchanged
    />
  </div>
</main>
```

- [ ] **Step 5: Run the route and mascot-source tests**

Run:

```bash
npx vitest run tests/server/student-mission-page.test.ts tests/domain/tts-ui-source.test.ts
npm run typecheck
```

Expected: all selected tests PASS and typecheck exits 0. The existing mascot invariant test must still find the unchanged 226px framing, `bottom: 120`, and `height: 180`.

- [ ] **Step 6: Update GSD state and commit**

Set `.planning/STATE.md` to Phase 11 executing with `stopped_at` and Current Position stating that the fluid mission shell is complete and nameplate/Hint/expression/conversation tasks remain. Use the exact UTC timestamp.

```bash
git add src/app/student/missions/[assignmentStudentId]/page.tsx src/components/student/styles.ts tests/server/student-mission-page.test.ts .planning/STATE.md
git commit -m "feat(11): free the mission layout from the outer panel"
```

---

### Task 2: Reduce the attached Coco nameplate without shrinking actions

**Files:**
- Modify: `tests/domain/tts-ui-source.test.ts`
- Modify: `src/components/student/styles.ts`
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: existing `mascotDialogueTabsStyle`, `mascotNameTabStyle`, `mascotDialogueActionsStyle`, `mascotHintTabStyle`, and `mascotVoiceTabStyle`.
- Produces: a bottom-aligned 76×38px minimum nameplate while retaining the 48px action group and 44px action targets.

- [ ] **Step 1: Add the failing nameplate geometry test**

Add this test inside the Coco voice integration describe block in `tests/domain/tts-ui-source.test.ts`:

```ts
it("keeps a compact nameplate beside full-size Hint and replay actions", () => {
  const stylesSource = readSource("src/components/student/styles.ts");

  expect(stylesSource).toMatch(
    /mascotDialogueTabsStyle[\s\S]*alignItems: "flex-end"/,
  );
  expect(stylesSource).toMatch(
    /mascotNameTabStyle[\s\S]*height: 38[\s\S]*minWidth: 76[\s\S]*padding: "0 12px"[\s\S]*fontSize: 14[\s\S]*fontWeight: 700/,
  );
  expect(stylesSource).toMatch(
    /mascotAttachedTabStyle[\s\S]*height: 48/,
  );
  expect(stylesSource).toMatch(
    /mascotDialogueActionsStyle[\s\S]*\.\.\.mascotAttachedTabStyle/,
  );
  expect(stylesSource).toMatch(
    /mascotHintTabStyle[\s\S]*minHeight: 44/,
  );
  expect(stylesSource).toMatch(
    /mascotVoiceTabStyle[\s\S]*minHeight: 44/,
  );
});
```

- [ ] **Step 2: Run the source test and verify RED**

```bash
npx vitest run tests/domain/tts-ui-source.test.ts
```

Expected: FAIL because the tabs use `alignItems: "stretch"` and the nameplate still inherits 48px height with a 104px minimum width.

- [ ] **Step 3: Implement the compact bottom-aligned nameplate**

In `src/components/student/styles.ts`, change only these values:

```ts
export const mascotDialogueTabsStyle: CSSProperties = {
  // keep position, inset, size, z-index, display, and pointerEvents unchanged
  alignItems: "flex-end",
};

export const mascotNameTabStyle: CSSProperties = {
  ...mascotAttachedTabStyle,
  height: 38,
  minWidth: 76,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#2563EB",
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: 700,
};
```

Leave `mascotAttachedTabStyle.height`, `mascotDialogueActionsStyle`, `mascotHintTabStyle`, `mascotVoiceTabStyle`, `top: -46`, and the 2px border overlap unchanged.

- [ ] **Step 4: Run the focused UI tests and typecheck**

```bash
npx vitest run tests/domain/tts-ui-source.test.ts tests/server/student-mission-page.test.ts
npm run typecheck
```

Expected: all selected tests PASS and typecheck exits 0.

- [ ] **Step 5: Update GSD state and commit**

Record that the fluid shell and compact nameplate are complete; Hint, thinking expression, vague-reply prompting, and full verification remain.

```bash
git add src/components/student/styles.ts tests/domain/tts-ui-source.test.ts .planning/STATE.md
git commit -m "fix(11): shrink the attached Coco nameplate"
```

---

### Task 3: Reveal the first Korean phrase on the first Hint press

**Files:**
- Modify: `tests/domain/translation-hint.test.ts`
- Modify: `src/domain/ai/translation-hint.ts`
- Modify: `tests/domain/tts-ui-source.test.ts`
- Modify: `src/components/student/CocoDialogueBox.tsx`
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: `buildTranslationSegments`, `TranslationPhrase`, `TranslationUiState`, and the existing abort/token guarded fetch.
- Produces: `getFirstTranslationPhraseSegmentIndex(sourceText, phrases): number | null` and `toggleTranslationBubble(currentIndex, firstIndex): number | null`.

- [ ] **Step 1: Write failing pure interaction tests**

Extend the import in `tests/domain/translation-hint.test.ts`:

```ts
import {
  buildTranslationSegments,
  getFirstTranslationPhraseSegmentIndex,
  parseTranslationHint,
  toggleTranslationBubble,
  translationHintRequestSchema,
} from "@/domain/ai/translation-hint";
```

Add:

```ts
it("finds the first translated segment and toggles its bubble", () => {
  const text = "Please play soccer today.";
  const phrases = [
    {
      source: "play soccer",
      start: 7,
      end: 18,
      translation: "축구를 하다",
    },
  ];

  const firstIndex = getFirstTranslationPhraseSegmentIndex(text, phrases);
  expect(firstIndex).toBe(1);
  expect(toggleTranslationBubble(null, firstIndex)).toBe(1);
  expect(toggleTranslationBubble(1, firstIndex)).toBeNull();
  expect(toggleTranslationBubble(2, firstIndex)).toBeNull();
  expect(getFirstTranslationPhraseSegmentIndex(text, [])).toBeNull();
  expect(toggleTranslationBubble(null, null)).toBeNull();
});
```

- [ ] **Step 2: Run the domain test and verify RED**

```bash
npx vitest run tests/domain/translation-hint.test.ts
```

Expected: FAIL because the two pure interaction helpers do not exist.

- [ ] **Step 3: Implement the pure phrase-selection helpers**

Add to `src/domain/ai/translation-hint.ts` after `buildTranslationSegments`:

```ts
export function getFirstTranslationPhraseSegmentIndex(
  sourceText: string,
  phrases: TranslationPhrase[],
): number | null {
  const index = buildTranslationSegments(sourceText, phrases).findIndex(
    (segment) => segment.kind === "phrase",
  );
  return index >= 0 ? index : null;
}

export function toggleTranslationBubble(
  currentIndex: number | null,
  firstIndex: number | null,
): number | null {
  if (firstIndex === null) return null;
  return currentIndex === null ? firstIndex : null;
}
```

- [ ] **Step 4: Add a failing component source contract**

Add this test to `tests/domain/tts-ui-source.test.ts`:

```ts
it("opens the first Korean phrase immediately and toggles without refetching", () => {
  const dialogueSource = readSource(
    "src/components/student/CocoDialogueBox.tsx",
  );

  expect(dialogueSource).toContain(
    "getFirstTranslationPhraseSegmentIndex",
  );
  expect(dialogueSource).toContain("toggleTranslationBubble");
  expect(dialogueSource).toMatch(
    /translationState\.kind === "ready"[\s\S]*setExpandedPhraseIndex[\s\S]*return/,
  );
  expect(dialogueSource).toMatch(
    /setTranslationState\(\{ kind: "ready"[\s\S]*setExpandedPhraseIndex\(firstPhraseIndex\)/,
  );
  expect(dialogueSource).toMatch(
    /firstPhraseIndex === null[\s\S]*setTranslationState\(\{ kind: "error" \}\)/,
  );
  const readyBranchIndex = dialogueSource.indexOf(
    'if (translationState.kind === "ready")',
  );
  const fetchIndex = dialogueSource.indexOf("await fetch(");
  expect(readyBranchIndex).toBeGreaterThan(-1);
  expect(fetchIndex).toBeGreaterThan(readyBranchIndex);
  expect(dialogueSource).toContain(
    "aria-pressed={expandedPhraseIndex !== null}",
  );
});
```

- [ ] **Step 5: Run the source test and verify RED**

```bash
npx vitest run tests/domain/tts-ui-source.test.ts
```

Expected: FAIL because a successful Hint request leaves `expandedPhraseIndex` null and every Hint press enters the fetch path.

- [ ] **Step 6: Wire immediate reveal and ready-state toggle**

Extend the domain import in `src/components/student/CocoDialogueBox.tsx`:

```ts
import {
  buildTranslationSegments,
  getFirstTranslationPhraseSegmentIndex,
  parseTranslationHint,
  toggleTranslationBubble,
  type TranslatableCocoLine,
  type TranslationPhrase,
} from "@/domain/ai/translation-hint";
```

At the start of `loadTranslationHint`, after the existing descriptor guard and before aborting/creating a request, add:

```ts
if (translationState.kind === "ready") {
  const firstPhraseIndex = getFirstTranslationPhraseSegmentIndex(
    dialogueText,
    translationState.phrases,
  );
  setExpandedPhraseIndex((currentIndex) =>
    toggleTranslationBubble(currentIndex, firstPhraseIndex),
  );
  return;
}
```

Replace the successful parsed-state write with:

```ts
const firstPhraseIndex = getFirstTranslationPhraseSegmentIndex(
  dialogueText,
  parsed.hint.phrases,
);
if (firstPhraseIndex === null) {
  setTranslationState({ kind: "error" });
  return;
}
setTranslationState({ kind: "ready", phrases: parsed.hint.phrases });
setExpandedPhraseIndex(firstPhraseIndex);
```

Make the Hint button's pressed state describe bubble visibility rather than
whether translation data happens to be cached:

```tsx
aria-pressed={expandedPhraseIndex !== null}
```

Do not change request cancellation, request tokens, route payload, parsing, failed-state retry, phrase buttons, recording, or replay.

- [ ] **Step 7: Run Hint regressions and typecheck**

```bash
npx vitest run tests/domain/translation-hint.test.ts tests/domain/tts-ui-source.test.ts tests/server/translation-hint-route-source.test.ts tests/server/translation-source.test.ts
npm run typecheck
```

Expected: all selected tests PASS and typecheck exits 0.

- [ ] **Step 8: Update GSD state and commit**

Record that first-press Hint reveal and ready-state toggle are complete; thinking expression, vague replies, and full verification remain.

```bash
git add src/domain/ai/translation-hint.ts tests/domain/translation-hint.test.ts src/components/student/CocoDialogueBox.tsx tests/domain/tts-ui-source.test.ts .planning/STATE.md
git commit -m "fix(11): reveal Korean on the first Hint press"
```

---

### Task 4: Use the thinking sprite during provider waits

**Files:**
- Modify: `tests/domain/character-expression.test.ts`
- Modify: `src/domain/character/expression.ts`
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: existing `FlowStep` and `MascotExpression` union.
- Produces: `deriveExpression({ step: "cocoThinking" }) === "thinking"` without a new asset or component prop.

- [ ] **Step 1: Add the failing thinking-step regression**

Add `"cocoThinking"` to `allSteps`, exclude it from the neutral-step filter, and add this test in `tests/domain/character-expression.test.ts`:

```ts
it("uses the thinking expression while Coco generates a reply", () => {
  expect(deriveExpression({ step: "cocoThinking" })).toBe("thinking");
});
```

Update the neutral filter to:

```ts
const neutralSteps = allSteps.filter(
  (candidate) =>
    candidate !== "complete" &&
    candidate !== "repeat" &&
    candidate !== "cocoThinking",
);
```

- [ ] **Step 2: Run the expression test and verify RED**

```bash
npx vitest run tests/domain/character-expression.test.ts
```

Expected: FAIL because `cocoThinking` currently falls through to `idle`.

- [ ] **Step 3: Map the existing flow step to the existing asset**

In `src/domain/character/expression.ts`, add immediately after the complete-step rule:

```ts
if (input.step === "cocoThinking") return "thinking";
```

Do not modify `MascotStage`, `SPRITE_BY_EXPRESSION`, `StepCocoThinking`, or any feedback precedence.

- [ ] **Step 4: Run expression and mascot source tests**

```bash
npx vitest run tests/domain/character-expression.test.ts tests/domain/tts-ui-source.test.ts
```

Expected: all selected tests PASS; the existing source contract continues to find `coco-thinking-alpha.png`.

- [ ] **Step 5: Update GSD state and commit**

Record that layout, Hint, and thinking-state repairs are complete; vague-reply prompting and full verification remain.

```bash
git add src/domain/character/expression.ts tests/domain/character-expression.test.ts .planning/STATE.md
git commit -m "fix(11): show Coco thinking during reply generation"
```

---

### Task 5: Narrow vague answers instead of echoing them

**Files:**
- Modify: `src/domain/ai/conversation-generation.test.ts`
- Modify: `src/domain/ai/conversation-generation.ts`
- Modify: `src/server/ai/conversation-generator.test.ts`
- Modify: `src/server/ai/conversation-generator.ts`
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: the validated `conversationHistory`, existing under-12-word/one-question rules, and stateless Responses payload.
- Produces: matching domain/system instructions for vague-answer narrowing with the normative “Anything” example.

- [ ] **Step 1: Add the failing domain prompt regression**

Add to `src/domain/ai/conversation-generation.test.ts`:

```ts
it("requires a concrete narrowing question for a vague latest answer", () => {
  const prompt = buildConversationPrompt({
    ...input,
    conversationHistory: [
      history[0],
      {
        turnOrder: 2,
        cocoLine: "What do you and Minju talk about?",
        studentResponse: "Anything.",
      },
    ],
  });
  const instructions = prompt.instructions.join(" ");

  expect(instructions).toContain("minimally informative");
  expect(instructions).toContain("do not echo the vague word");
  expect(instructions).toContain("two concrete child-friendly choices");
  expect(instructions).toContain("Do not shame the learner");
});
```

- [ ] **Step 2: Run the domain test and verify RED**

```bash
npx vitest run src/domain/ai/conversation-generation.test.ts
```

Expected: FAIL because the domain prompt has no vague-answer rule.

- [ ] **Step 3: Add the domain payload instructions**

In `buildConversationPrompt`’s `instructions` array, directly after the known-history/new-information rules, add:

```ts
"Treat vague replies such as 'anything', 'something', or 'stuff' as minimally informative; do not echo the vague word as if it were a meaningful detail.",
"Acknowledge lightly, then ask one short scene-relevant narrowing question; prefer two concrete child-friendly choices when helpful.",
"Do not shame the learner or demand a more specific answer.",
```

- [ ] **Step 4: Add the failing server-adapter regression**

Add to `src/server/ai/conversation-generator.test.ts`:

```ts
it("forbids echoing a vague answer and provides a concrete-choice example", async () => {
  const { generateCocoReply } = await import("@/server/ai/conversation-generator");
  const client = createFakeClient(async () => ({
    output_parsed: {
      line: "Lots of things! Do you talk about games or school?",
    },
  }));

  await generateCocoReply(
    {
      ...baseInput,
      conversationHistory: [
        {
          turnOrder: 1,
          cocoLine: "Who do you talk with at school?",
          studentResponse: "I talk with Minju.",
        },
        {
          turnOrder: 2,
          cocoLine: "What do you and Minju talk about?",
          studentResponse: "Anything.",
        },
      ],
    },
    { apiKey: "test-key", client },
  );

  const call = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
  const system = call?.input.find((message) => message.role === "system")?.content ?? "";
  const user = call?.input.find((message) => message.role === "user")?.content ?? "{}";
  const prompt = JSON.parse(user) as { instructions?: string[] };
  const combined = `${system} ${prompt.instructions?.join(" ") ?? ""}`;

  expect(combined).toContain("minimally informative");
  expect(combined).toContain("Do not shame the learner");
  expect(combined).toContain("Talking about anything is fun");
  expect(combined).toContain("Lots of things! Do you talk about games or school?");
  expect(JSON.stringify(call)).not.toContain("previous_response_id");
});
```

- [ ] **Step 5: Run the server test and verify RED**

```bash
npx vitest run src/server/ai/conversation-generator.test.ts
```

Expected: FAIL because the system message does not contain the vague-answer contract or normative example.

- [ ] **Step 6: Mirror the rule in the server system message**

In `CONVERSATION_SYSTEM_MESSAGE`, directly after the known-history/new-information rules, add:

```ts
"Treat vague replies such as 'anything', 'something', or 'stuff' as minimally informative; do not echo the vague word as if it were a meaningful detail.",
"Acknowledge lightly, then ask one short scene-relevant narrowing question; prefer two concrete child-friendly choices when helpful.",
"Do not shame the learner or demand a more specific answer.",
"Example: after 'What do you and Minju talk about?' -> 'Anything.', do not say 'Talking about anything is fun.'; say 'Lots of things! Do you talk about games or school?'.",
```

Do not add output post-processing, a second provider call, or changes to history reconstruction/moderation.

- [ ] **Step 7: Run conversation regressions and typecheck**

```bash
npx vitest run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/server/student-access/conversation-history.test.ts src/server/student-access/audio-upload.test.ts
npm run typecheck
```

Expected: all selected tests PASS and typecheck exits 0.

- [ ] **Step 8: Update GSD state and commit**

Record that all five repair tasks are code-complete and full automated verification plus live UAT remain.

```bash
git add src/domain/ai/conversation-generation.ts src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.ts src/server/ai/conversation-generator.test.ts .planning/STATE.md
git commit -m "fix(11): narrow vague conversation replies naturally"
```

---

### Task 6: Verify the repair and hand off responsive/live UAT

**Files:**
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: Tasks 1–5 and the approved design spec.
- Produces: fresh automated evidence plus explicit credentialed and human UAT status.

- [ ] **Step 1: Run the focused regression matrix**

```bash
npx vitest run \
  tests/server/student-mission-page.test.ts \
  tests/domain/tts-ui-source.test.ts \
  tests/domain/translation-hint.test.ts \
  tests/domain/character-expression.test.ts \
  src/domain/ai/conversation-generation.test.ts \
  src/server/ai/conversation-generator.test.ts \
  src/server/student-access/conversation-history.test.ts \
  src/server/student-access/audio-upload.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 2: Run typecheck, lint, and the full suite**

```bash
npm run typecheck
npm run lint
npx vitest run
```

Expected: all commands exit 0. The one pre-existing unused `label` warning in `scripts/check-student-feedback-states.mjs` may remain; no new warning is acceptable.

- [ ] **Step 3: Run the production build safely**

Check for and stop only a `next dev` process whose command path points at this exact worktree, then run:

```bash
npm run build
```

Expected: exit 0. Do not run `next build` concurrently with a development server using this worktree’s `.next` directory.

- [ ] **Step 4: Run credentialed deterministic screenshots when credentials are available**

With this worktree serving `http://localhost:3000` and disposable credentials exported only in the shell:

```bash
FEEDBACK_STATE_CLASS_CODE="$FEEDBACK_STATE_CLASS_CODE" \
FEEDBACK_STATE_STUDENT_NAME="$FEEDBACK_STATE_STUDENT_NAME" \
FEEDBACK_STATE_PIN="$FEEDBACK_STATE_PIN" \
npm run test:student-feedback-states
```

Expected: exit 0. Do not commit access values. If the variables are unavailable, record this check as pending rather than claiming it ran.

- [ ] **Step 5: Perform responsive and interaction UAT**

At 375px, 768px, and a standard desktop width, verify:

1. The outer white panel/border is absent and gutters scale from 16px without horizontal scrolling.
2. The mission column never exceeds 640px.
3. Scene, mascot, dialogue, recorder, and feedback surfaces share the same column.
4. The Coco nameplate is 76×38px minimum and remains bottom-attached to the same 2px border.
5. Hint/replay remain at least 44px tall and do not collide.
6. One Hint press immediately opens the first Korean phrase.
7. Pressing ready Hint hides/reopens the first bubble without another network request.
8. A failed Hint keeps visible `Hint`, exposes `Retry hint` accessibly, and retries.
9. “Coco is thinking…” uses `coco-thinking-alpha.png`.
10. `Anything.` produces a concrete narrowing question, not “Talking about anything is fun.”
11. Coco’s sprite size, crop, position, speaking pulse, recorder, corrections, and preset missions are unchanged.

- [ ] **Step 6: Record exact results and commit**

Update the `.planning/STATE.md` YAML header and Current Position with exact focused/full test counts, type/lint/build exits, and honest screenshot/manual-UAT status. Keep the branch unmerged.

```bash
git add .planning/STATE.md
git commit -m "docs(11): record fluid mission repair verification"
```
