# Fluid Mobile Dialogue Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Coco's attached name, Hint, and replay controls fluidly smaller on phones while retaining their current desktop sizes.

**Architecture:** Keep the current inline-style structure and replace only fixed dialogue-tab dimensions with bounded CSS `clamp()` values. Apply the replay clamp only to `dialogueTabButtonStyle`, leaving the standalone 44px replay target unchanged. Update the existing source-contract test so it covers both the approved mascot geometry and the new fluid control tokens.

**Tech Stack:** React, TypeScript, inline `CSSProperties`, CSS `clamp()`, Vitest

## Global Constraints

- Preserve the current attached-tab structure, borders, colors, labels, and behavior.
- Preserve the approved mascot width and 16px chatbox overlap.
- Preserve standalone replay buttons at 44px.
- Do not add component state, hooks, media queries, or unrelated layout changes.

---

### Task 1: Add and implement fluid dialogue-tab sizing

**Files:**
- Modify: `tests/domain/tts-ui-source.test.ts`
- Modify: `src/components/student/styles.ts`
- Modify: `src/components/student/CocoSpeechAudio.tsx`

**Interfaces:**
- Consumes: the existing `mascotAttachedTabStyle`, `mascotNameTabStyle`, `mascotHintTabStyle`, `mascotVoiceTabStyle`, `buttonStyle`, and `dialogueTabButtonStyle` objects.
- Produces: bounded mobile-to-desktop size strings exactly matching the approved design, with standalone replay sizing unchanged.

- [ ] **Step 1: Write the failing source-contract test**

Update the existing compact-tab test to read both style sources and assert:

```ts
it("fluidly compacts attached dialogue controls while preserving desktop caps", () => {
  const stylesSource = readSource("src/components/student/styles.ts");
  const audioSource = readSource(
    "src/components/student/CocoSpeechAudio.tsx",
  );

  expect(stylesSource).toContain('height: "clamp(40px, 10vw, 48px)"');
  expect(stylesSource).toContain('height: "clamp(32px, 8.5vw, 38px)"');
  expect(stylesSource).toContain('minWidth: "clamp(64px, 17vw, 76px)"');
  expect(stylesSource).toContain(
    'padding: "0 clamp(8px, 2.5vw, 12px)"',
  );
  expect(stylesSource).toContain('fontSize: "clamp(13px, 3.3vw, 14px)"');
  expect(stylesSource).toContain(
    'minHeight: "clamp(38px, 10vw, 44px)"',
  );
  expect(stylesSource).toContain(
    'minWidth: "clamp(38px, 10vw, 44px)"',
  );
  expect(audioSource).toMatch(
    /const buttonStyle:[\s\S]*minWidth: 44,[\s\S]*minHeight: 44/,
  );
  expect(audioSource).toMatch(
    /const dialogueTabButtonStyle:[\s\S]*minWidth: "clamp\(38px, 10vw, 44px\)"[\s\S]*minHeight: "clamp\(38px, 10vw, 44px\)"/,
  );
});
```

In the nearby mascot crop contract, replace the stale pre-fix expectations with:

```ts
expect(stylesSource).toContain("bottom: 120");
expect(stylesSource).toContain(
  'left: "max(24px, calc((100% - 226px) / 2))"',
);
expect(stylesSource).toContain(
  'width: "min(226px, calc(100% - 48px))"',
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- --run tests/domain/tts-ui-source.test.ts
```

Expected: the updated mascot expectations pass, while the fluid control assertions fail because the controls still use fixed numeric sizes.

- [ ] **Step 3: Implement the minimal fluid style tokens**

In `src/components/student/styles.ts`, apply these exact replacements:

```ts
const mascotAttachedTabStyle: CSSProperties = {
  height: "clamp(40px, 10vw, 48px)",
  // existing border and interaction properties unchanged
};

export const mascotNameTabStyle: CSSProperties = {
  ...mascotAttachedTabStyle,
  height: "clamp(32px, 8.5vw, 38px)",
  minWidth: "clamp(64px, 17vw, 76px)",
  padding: "0 clamp(8px, 2.5vw, 12px)",
  // existing layout and colors unchanged
  fontSize: "clamp(13px, 3.3vw, 14px)",
  fontWeight: 700,
};

export const mascotHintTabStyle: CSSProperties = {
  minHeight: "clamp(38px, 10vw, 44px)",
  padding: "0 clamp(8px, 2.5vw, 12px)",
  // existing border and colors unchanged
  fontSize: "clamp(13px, 3.3vw, 14px)",
};

export const mascotVoiceTabStyle: CSSProperties = {
  minHeight: "clamp(38px, 10vw, 44px)",
  minWidth: "clamp(38px, 10vw, 44px)",
  // existing layout unchanged
};
```

In `src/components/student/CocoSpeechAudio.tsx`, change only `dialogueTabButtonStyle`:

```ts
const dialogueTabButtonStyle: React.CSSProperties = {
  minWidth: "clamp(38px, 10vw, 44px)",
  minHeight: "clamp(38px, 10vw, 44px)",
  border: 0,
  borderRadius: 0,
  background: "transparent",
};
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- --run tests/domain/tts-ui-source.test.ts tests/domain/mascot-layout.test.ts
```

Expected: both files pass.

- [ ] **Step 5: Run static verification**

Run:

```bash
npm run typecheck
npm run lint
git diff --check
```

Expected: every command exits 0; the existing unrelated lint warning may remain.

- [ ] **Step 6: Verify desktop and mobile screenshots**

Reload the isolated localhost mission at 1440x693 and 390x844. Confirm the desktop controls match the approved screenshot, the phone controls are visibly smaller, the labels/icons remain legible, and the approved mascot-to-chatbox overlap is unchanged.

- [ ] **Step 7: Await visual approval before committing**

Do not commit, merge, push, or deploy the implementation until the user approves the new screenshots.
