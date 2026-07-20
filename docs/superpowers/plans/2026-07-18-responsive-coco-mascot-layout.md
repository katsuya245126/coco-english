# Responsive Coco Mascot Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Coco's full head visible and close the visible sprite-to-chatbox gap on desktop and mobile dynamic talking missions.

**Architecture:** Adjust only the shared mascot geometry tokens used by `MascotStage`. Center a width-capped sprite frame with a narrow-screen safety inset, then add a small intentional overlap with the attached dialogue tabs. Lock both behaviors with focused style-geometry tests before changing production tokens.

**Tech Stack:** React, Next.js, TypeScript, inline `CSSProperties` tokens, Vitest

## Global Constraints

- Keep the sprite frame centered and cap its width at 226px while retaining a 24px minimum viewport inset on very narrow screens.
- Preserve the current 180px frame height and upper-body `cover` crop.
- Lower the frame only enough to hide transparent lower-edge pixels at the tab boundary.
- Do not modify sprite assets, mission behavior, or unrelated student UI.

---

### Task 1: Correct and verify responsive mascot geometry

**Files:**
- Modify: `tests/domain/mascot-layout.test.ts`
- Modify: `src/components/student/styles.ts`

**Interfaces:**
- Consumes: `mascotStageStyle`, `mascotSpriteWrapStyle`, `mascotDialogueShellStyle`, and `mascotDialogueTabsStyle` exported from `src/components/student/styles.ts`.
- Produces: a centered sprite frame whose CSS width is `min(226px, calc(100% - 48px))`, whose left inset is `max(24px, calc((100% - 226px) / 2))`, and whose lower edge overlaps the tabs by 10px.

- [ ] **Step 1: Write the failing regression tests**

Replace the existing test with two focused behaviors while retaining the numeric helper:

```ts
describe("mascot stage geometry", () => {
  it("caps Coco's centered frame at 226px with narrow-screen safety insets", () => {
    expect(mascotSpriteWrapStyle.left).toBe(
      "max(24px, calc((100% - 226px) / 2))",
    );
    expect(mascotSpriteWrapStyle.right).toBeUndefined();
    expect(mascotSpriteWrapStyle.width).toBe(
      "min(226px, calc(100% - 48px))",
    );
  });

  it("overlaps Coco's frame with the attached dialogue tabs by 10px", () => {
    const stageHeight = numericStyleValue(mascotStageStyle.height);
    const spriteBottom = numericStyleValue(mascotSpriteWrapStyle.bottom);
    const spriteHeight = numericStyleValue(mascotSpriteWrapStyle.height);
    const dialogueBottom = numericStyleValue(mascotDialogueShellStyle.bottom);
    const dialogueHeight = numericStyleValue(mascotDialogueShellStyle.height);
    const tabsTop = numericStyleValue(mascotDialogueTabsStyle.top);

    const spriteTop = stageHeight - spriteBottom - spriteHeight;
    const spriteEnd = spriteTop + spriteHeight;
    const tabsStart = stageHeight - dialogueBottom - dialogueHeight + tabsTop;

    expect(spriteEnd - tabsStart).toBe(10);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- --run tests/domain/mascot-layout.test.ts
```

Expected: FAIL because the current sprite frame has no `width`, still has a `right` inset, and overlaps the tabs by only 2px.

- [ ] **Step 3: Implement the minimal geometry token change**

Update only `mascotSpriteWrapStyle` in `src/components/student/styles.ts`:

```ts
export const mascotSpriteWrapStyle: CSSProperties = {
  position: "absolute",
  left: "max(24px, calc((100% - 226px) / 2))",
  width: "min(226px, calc(100% - 48px))",
  bottom: 172,
  height: 180,
  transformOrigin: "bottom center",
};
```

Update the adjacent comment to explain the 226px cap, 24px safety inset, and 10px tab overlap. Do not change `MascotStage.tsx` or its `object-fit: cover` image settings.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- --run tests/domain/mascot-layout.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Run proportionate static verification**

Run:

```bash
npm run typecheck
npm run lint
git diff --check
```

Expected: every command exits 0 with no new errors.

- [ ] **Step 6: Verify the rendered UI in Chrome**

Reload the existing localhost dynamic mission and capture screenshots at 1440x693 and 390x844. At both viewports, verify that Coco's full head is visible and the rendered sprite reaches the attached chat-box tabs without a background gap.

- [ ] **Step 7: Commit the implementation**

```bash
git add tests/domain/mascot-layout.test.ts src/components/student/styles.ts
git commit -m "fix: correct responsive Coco mascot framing"
```
