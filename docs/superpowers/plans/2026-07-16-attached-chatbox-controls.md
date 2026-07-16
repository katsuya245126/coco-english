# Attached Chatbox Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Coco's nameplate and the grouped Hint/replay actions onto one shared chatbox border while keeping Coco's message as the only content in the bubble.

**Architecture:** Split the existing absolute dialogue box into a positioning shell, a scrollable message surface, and sibling edge controls. Use the approved v7 mockup's transparent-bottom-border overlap to create one continuous line. Translation errors retry through the same Hint action, and the chatbox-specific TTS presentation suppresses extra error copy without changing other TTS placements.

**Tech Stack:** React 19, TypeScript, inline `CSSProperties` tokens, existing `CocoSpeechAudio`, Vitest source-boundary tests, Playwright/manual responsive UAT.

## Global Constraints

- Visual source of truth: `/Users/john/Desktop/my-portfolio/projects/coco-english/.claude/worktrees/phase11-dynamic-conversation-repair/.superpowers/brainstorm/10900-1784134612/content/dialogue-controls-layout-v7.html`.
- Change only the chatbox and its Coco/Hint/replay controls; do not change mascot artwork, sprite wrapper, stage size, position, animation, crop, expression, or backdrop.
- The visible action group contains only Hint and replay.
- Keep the nameplate upper-left and the grouped actions upper-right.
- Both groups overlap the chatbox by exactly its 2px border width.
- Their bottom border strip is transparent so the chatbox top border is the single visible shared edge; no gap and no doubled line.
- Keep Hint and replay at least 44px tall as touch targets, even if that requires scaling the v7 mock's 44px outer group to 48px while preserving its border relationship.
- No visible `Translation unavailable` retry control; failed Hint requests retry through the same visible `Hint` button.
- Existing inline phrase highlighting, Korean bubbles, stale-request cancellation, TTS behavior outside the chatbox, recording, and preset hints remain unchanged.
- Follow TDD and update both the YAML header and Current Position prose in `.planning/STATE.md` in every implementation commit, using `date -u +%Y-%m-%dT%H:%M:%SZ` for the exact timestamp.

---

## File Structure

- Modify `src/components/student/CocoDialogueBox.tsx`: render the shell, attached controls, message surface, and one-control translation retry state.
- Modify `src/components/student/CocoSpeechAudio.tsx`: add a chatbox-only presentation that remains icon-only on playback failure.
- Modify `src/components/student/MissionFlowShell.tsx`: opt only the mascot dialogue replay into that presentation.
- Modify `src/components/student/styles.ts`: own shared-border shell, surface, nameplate, action-group, Hint, and replay-wrapper styles.
- Modify `tests/domain/tts-ui-source.test.ts`: assert the approved structure, accessibility behavior, border geometry, and mascot invariants.
- Modify `.planning/STATE.md`: keep GSD execution state truthful.

---

### Task 1: Keep translation retry and chatbox replay inside the same two actions

**Files:**
- Modify: `src/components/student/CocoDialogueBox.tsx`
- Modify: `src/components/student/CocoSpeechAudio.tsx`
- Modify: `src/components/student/MissionFlowShell.tsx`
- Modify: `tests/domain/tts-ui-source.test.ts`
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: existing `TranslationUiState`, `loadTranslationHint`, and `CocoSpeechAudio` playback states.
- Produces: `CocoSpeechAudioProps.presentation?: "standalone" | "dialogue-tab"` and a stable Hint control whose failed-state accessible label is `Retry hint`.

- [ ] **Step 1: Replace old source expectations with failing two-action tests**

Update the translation-failure source test in `tests/domain/tts-ui-source.test.ts`:

```ts
it("retries translation through the same visible Hint action", () => {
  const dialogueSource = readSource("src/components/student/CocoDialogueBox.tsx");
  const shellSource = readSource("src/components/student/MissionFlowShell.tsx");

  expect(dialogueSource).toContain('const hintLabel =');
  expect(dialogueSource).toContain('translationState.kind === "error"');
  expect(dialogueSource).toContain('"Retry hint"');
  expect(dialogueSource).toContain("aria-label={hintLabel}");
  expect(dialogueSource).toMatch(/>\s*Hint\s*</);
  expect(dialogueSource).not.toContain("Translation unavailable");
  expect(shellSource).not.toMatch(
    /VoiceRecorderControl[\s\S]*disabled=\{.*translation/,
  );
});
```

Add a chatbox TTS presentation test:

```ts
it("uses an icon-only dialogue-tab replay without changing standalone TTS", () => {
  const audioSource = readSource("src/components/student/CocoSpeechAudio.tsx");
  const shellSource = readSource("src/components/student/MissionFlowShell.tsx");

  expect(audioSource).toContain('presentation?: "standalone" | "dialogue-tab"');
  expect(audioSource).toContain('presentation = "standalone"');
  expect(audioSource).toContain('presentation !== "dialogue-tab"');
  expect(shellSource).toContain('presentation="dialogue-tab"');
});
```

- [ ] **Step 2: Run the source test and verify RED**

Run:

```bash
npx vitest run tests/domain/tts-ui-source.test.ts
```

Expected: FAIL because the component renders a separate `Translation unavailable` button and `CocoSpeechAudio` has no chatbox presentation.

- [ ] **Step 3: Collapse failed translation into the existing Hint control**

In `CocoDialogueBox`, derive:

```ts
const hintLabel =
  translationState.kind === "error" ? "Retry hint" : "Hint";
```

Set the existing Hint button's `aria-label` and `title` to `hintLabel`, keep its visible text exactly `Hint`, and keep `onClick={loadTranslationHint}`. Delete the final conditional block that renders `Translation unavailable`. Do not change fetch cancellation, parsing, phrase expansion, or ready-state behavior.

- [ ] **Step 4: Add a chatbox-only replay presentation**

Extend `CocoSpeechAudioProps`:

```ts
presentation?: "standalone" | "dialogue-tab";
```

Default it in the function signature:

```ts
presentation = "standalone",
```

Add:

```ts
const dialogueTabButtonStyle: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  border: 0,
  borderRadius: 0,
  background: "transparent",
};
```

Apply it after `buttonStyle` when `presentation === "dialogue-tab"`. Render the existing `Voice unavailable` text only when:

```tsx
{isError && presentation !== "dialogue-tab" ? (
  <span role="status" style={errorTextStyle}>
    Voice unavailable
  </span>
) : null}
```

Keep the disabled error icon and accessible `aria-label="Play Coco"`; only the extra visible text is suppressed in the compact chatbox group.

In `MissionFlowShell`, add `presentation="dialogue-tab"` only to the `CocoSpeechAudio` passed through `MascotStage.voiceControl`. Do not change `CocoSpeechAudio` uses in step cards.

- [ ] **Step 5: Run the source test and verify GREEN**

```bash
npx vitest run tests/domain/tts-ui-source.test.ts
```

Expected: PASS.

- [ ] **Step 6: Update GSD state and commit**

Record that the chatbox now has stable Hint/replay states and shared-border layout remains.

```bash
git add src/components/student/CocoDialogueBox.tsx src/components/student/CocoSpeechAudio.tsx src/components/student/MissionFlowShell.tsx tests/domain/tts-ui-source.test.ts .planning/STATE.md
git commit -m "fix(11): keep chatbox actions compact"
```

---

### Task 2: Implement the approved shared-border layout

**Files:**
- Modify: `src/components/student/CocoDialogueBox.tsx`
- Modify: `src/components/student/styles.ts`
- Modify: `tests/domain/tts-ui-source.test.ts`
- Reference only: `.superpowers/brainstorm/10900-1784134612/content/dialogue-controls-layout-v7.html`
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: Task 1 stable Hint action and `dialogue-tab` replay.
- Produces: `mascotDialogueShellStyle`, `mascotDialogueBoxStyle`, `mascotDialogueTabsStyle`, and `mascotDialogueActionsStyle` matching the v7 shared-border relationship.

- [ ] **Step 1: Replace the old internal-tab test with failing shared-border assertions**

Replace `reserves the full tab row above dialogue text` in `tests/domain/tts-ui-source.test.ts` with:

```ts
it("attaches Coco and grouped actions to one shared chatbox border", () => {
  const dialogueSource = readSource("src/components/student/CocoDialogueBox.tsx");
  const stylesSource = readSource("src/components/student/styles.ts");

  expect(dialogueSource).toContain("mascotDialogueShellStyle");
  expect(dialogueSource).toContain("mascotDialogueActionsStyle");
  expect(stylesSource).toContain('top: -46');
  expect(stylesSource).toContain('height: 48');
  expect(stylesSource).toContain('border: "2px solid #2563EB"');
  expect(stylesSource).toContain('borderBottomColor: "transparent"');
  expect(stylesSource).toContain('backgroundClip: "padding-box"');
  expect(stylesSource).not.toContain('padding: "52px 16px 8px"');
});
```

Add mascot invariants:

```ts
it("changes the chatbox without moving or resizing the mascot", () => {
  const stageSource = readSource("src/components/student/MascotStage.tsx");
  const stylesSource = readSource("src/components/student/styles.ts");

  expect(stageSource).toContain("SPRITE_BY_EXPRESSION");
  expect(stageSource).toContain("mascotSpriteWrapStyle");
  expect(stylesSource).toContain("bottom: 120");
  expect(stylesSource).toContain("height: 180");
  expect(stylesSource).toContain('left: "clamp(24px, calc((100% - 226px) / 2), 72px)"');
});
```

- [ ] **Step 2: Run the source test and verify RED**

```bash
npx vitest run tests/domain/tts-ui-source.test.ts
```

Expected: FAIL because the current root is the scrollable message box, tabs start at `top: 0`, and message padding reserves an internal 52px control row.

- [ ] **Step 3: Split the positioning shell from the message surface**

In `src/components/student/styles.ts`, add/replace the dialogue tokens with:

```ts
export const mascotDialogueShellStyle: CSSProperties = {
  position: "absolute",
  left: 16,
  right: 16,
  bottom: 32,
  height: 104,
  overflow: "visible",
};

export const mascotDialogueBoxStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "#FFFFFF",
  border: "2px solid #2563EB",
  borderRadius: 8,
  padding: 22,
  boxSizing: "border-box",
  overflowY: "auto",
};

export const mascotDialogueTabsStyle: CSSProperties = {
  position: "absolute",
  left: 8,
  right: 8,
  top: -46,
  height: 48,
  zIndex: 2,
  display: "flex",
  alignItems: "stretch",
  pointerEvents: "none",
};
```

Use a 48px outer height so each inner action retains a 44px touch target. The `top: -46` placement leaves exactly 2px overlapping the message surface.

- [ ] **Step 4: Implement attached name and action-group tokens**

Use:

```ts
const mascotAttachedTabStyle: CSSProperties = {
  height: 48,
  boxSizing: "border-box",
  border: "2px solid #2563EB",
  borderBottomColor: "transparent",
  borderRadius: "12px 12px 0 0",
  backgroundClip: "padding-box",
  pointerEvents: "auto",
};

export const mascotNameTabStyle: CSSProperties = {
  ...mascotAttachedTabStyle,
  minWidth: 104,
  padding: "0 16px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#2563EB",
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: 700,
};

export const mascotDialogueActionsStyle: CSSProperties = {
  ...mascotAttachedTabStyle,
  marginLeft: "auto",
  display: "flex",
  alignItems: "center",
  overflow: "hidden",
  background: "#FFFFFF",
};

export const mascotHintTabStyle: CSSProperties = {
  minHeight: 44,
  padding: "0 12px",
  border: 0,
  borderRight: "1px solid #BFDBFE",
  borderRadius: 0,
  background: "transparent",
  color: "#2563EB",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

export const mascotVoiceTabStyle: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "auto",
};
```

Remove the old shared `mascotTabBaseStyle`; it encodes internal tabs and top-row padding that no longer apply.

- [ ] **Step 5: Restructure `CocoDialogueBox` without changing phrase rendering**

Import `mascotDialogueShellStyle` and `mascotDialogueActionsStyle`. Use this outer structure while preserving the current `segments.map(...)` body verbatim inside the paragraph:

```tsx
<div style={mascotDialogueShellStyle}>
  <div style={mascotDialogueTabsStyle}>
    <span style={mascotNameTabStyle}>{displayName}</span>
    {translationLine && dialogueText ? (
      <div style={mascotDialogueActionsStyle}>
        <button
          type="button"
          aria-label={hintLabel}
          title={hintLabel}
          aria-pressed={translationState.kind === "ready"}
          aria-busy={translationState.kind === "loading"}
          onClick={loadTranslationHint}
          style={{
            ...mascotHintTabStyle,
            ...(voiceControl ? null : { borderRight: 0 }),
          }}
        >
          Hint
        </button>
        {voiceControl ? <span style={mascotVoiceTabStyle}>{voiceControl}</span> : null}
      </div>
    ) : voiceControl ? (
      <div style={mascotDialogueActionsStyle}>
        <span style={mascotVoiceTabStyle}>{voiceControl}</span>
      </div>
    ) : null}
  </div>

  <div style={mascotDialogueBoxStyle}>
    {dialogueText ? <p style={mascotDialogueTextStyle}>{/* existing segments */}</p> : null}
  </div>
</div>
```

Do not modify `MascotStage` or any `mascotStageStyle`, `mascotBackdropStyle`, or `mascotSpriteWrapStyle` value.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
npx vitest run tests/domain/tts-ui-source.test.ts src/domain/ai/translation-hint.test.ts
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Update GSD state and commit**

Record that the approved v7 shared-border layout is code-complete and visual UAT remains.

```bash
git add src/components/student/CocoDialogueBox.tsx src/components/student/styles.ts tests/domain/tts-ui-source.test.ts .planning/STATE.md
git commit -m "feat(11): attach controls to Coco chatbox"
```

---

### Task 3: Verify chatbox regressions and hand off visual UAT

**Files:**
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: Tasks 1–2 and the approved v7 mockup.
- Produces: automated evidence plus phone/desktop comparison instructions.

- [ ] **Step 1: Run the focused UI and mission-flow matrix**

```bash
npx vitest run \
  tests/domain/tts-ui-source.test.ts \
  src/domain/ai/translation-hint.test.ts \
  src/domain/mission/student-question-state.test.ts \
  tests/server/translation-hint-route.test.ts \
  tests/server/translation-source.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 2: Run type, lint, full suite, and production build**

Stop any dev server using this worktree before the build, then run:

```bash
npm run typecheck
npm run lint
npx vitest run
npm run build
```

Expected: every command exits 0. The known pre-existing unused-variable warning in `scripts/check-student-feedback-states.mjs` may remain; no new warning is acceptable.

- [ ] **Step 3: Run credentialed deterministic screenshots when credentials are available**

With this worktree serving `http://localhost:3000` and disposable student credentials exported only in the shell:

```bash
FEEDBACK_STATE_CLASS_CODE="$FEEDBACK_STATE_CLASS_CODE" \
FEEDBACK_STATE_STUDENT_NAME="$FEEDBACK_STATE_STUDENT_NAME" \
FEEDBACK_STATE_PIN="$FEEDBACK_STATE_PIN" \
npm run test:student-feedback-states
```

Expected: exit 0 and screenshots generated for the existing feedback states. Do not commit credentials.

- [ ] **Step 4: Compare phone and desktop against the approved HTML**

Open:

`/Users/john/Desktop/my-portfolio/projects/coco-english/.claude/worktrees/phase11-dynamic-conversation-repair/.superpowers/brainstorm/10900-1784134612/content/dialogue-controls-layout-v7.html`

At 375px phone width and standard desktop width, verify:

1. Coco nameplate is upper-left and grows from the chatbox border.
2. Hint/replay are one upper-right group.
3. The group overlaps by 2px with no gap or doubled/thick border.
4. The message bubble contains only dialogue/inline phrase treatments.
5. Failed translation leaves visible `Hint`; tapping it retries; no `Translation unavailable` appears.
6. Controls do not collide or wrap.
7. Coco's sprite size, crop, position, and speaking pulse match the pre-change page.

- [ ] **Step 5: Record exact results and commit**

Update both GSD header/prose with exact automated counts. Mark visual and credentialed UAT pending unless each was actually run.

```bash
git add .planning/STATE.md
git commit -m "docs(11): record attached-chatbox verification"
```

