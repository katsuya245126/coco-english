# Kakao Hydration Compatibility and Conversation Scene-Card Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Silence KakaoTalk's root-element hydration mismatch and remove the redundant visible scene card from conversation-mode student missions while preserving scene grounding for Coco.

**Architecture:** Treat the hydration warning as a root-boundary compatibility issue: suppress warnings only on the `<html>` and `<body>` elements Kakao mutates. Treat the scene card as presentation only: gate its render by `conversationMode` while keeping `scenePremise` in mission props, snapshots, opener generation, and dynamic reply generation.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest source-contract tests.

## Global Constraints

- Preserve server-owned assignment and attempt state transitions, ownership checks, RLS, mission snapshots, and the preset/conversation split.
- Preserve scene-premise generation, storage, snapshot serialization, opener grounding, and dynamic-reply grounding.
- Preset missions retain their current scene-card behavior.
- Suppress hydration warnings only on root `<html>` and `<body>` elements; do not suppress application-content mismatches.
- Do not add dependencies, database migrations, or browser-sniffing code.
- Do not push or deploy without separate approval for the exact target.
- Preserve unrelated working-tree changes and the pre-existing untracked `docs/superpowers/plans/2026-07-20-minimal-effort-answer-guard.md`.

## File map

- Create `tests/server/root-layout-source.test.ts`: source contract for narrowly scoped root hydration suppression.
- Modify `src/app/layout.tsx`: add `suppressHydrationWarning` to `<html>` and `<body>`.
- Modify `tests/server/student-mission-page.test.ts`: source contract for conversation-only scene-card suppression and retained premise flow.
- Modify `src/components/student/MissionFlowShell.tsx`: gate the scene card to non-conversation missions at turn one.
- Modify `TASK.md`: keep status and verification evidence factual while executing.

---

### Task 1: Tolerate Kakao root-style injection

**Files:**
- Create: `tests/server/root-layout-source.test.ts`
- Modify: `src/app/layout.tsx`
- Modify: `TASK.md`

**Interfaces:**
- Consumes: Next.js root layout JSX in `src/app/layout.tsx`.
- Produces: React root elements with `suppressHydrationWarning` and a deterministic source contract guarding that scope.

- [ ] **Step 1: Mark implementation active in the task brief**

Change the status line in `TASK.md` to:

```markdown
**Status:** Implementation in progress
```

Change its next step to:

```markdown
## Next step

Implement the Kakao root hydration compatibility contract test-first.
```

- [ ] **Step 2: Write the failing root-layout source contract**

Create `tests/server/root-layout-source.test.ts` with:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(
  resolve(__dirname, "../../src/app/layout.tsx"),
  "utf8",
);

describe("root layout hydration compatibility", () => {
  it("limits hydration-warning suppression to the root elements Kakao mutates", () => {
    expect(layoutSource).toMatch(
      /<html\b[^>]*\bsuppressHydrationWarning\b[^>]*>/,
    );
    expect(layoutSource).toMatch(
      /<body\b[^>]*\bsuppressHydrationWarning\b[^>]*>/,
    );
  });
});
```

- [ ] **Step 3: Run the contract to verify RED**

Run:

```bash
npx vitest run tests/server/root-layout-source.test.ts
```

Expected: FAIL because neither root element contains `suppressHydrationWarning`.

- [ ] **Step 4: Add the minimal root-element suppression**

In `src/app/layout.tsx`, change only the root tags so the layout render is:

```tsx
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={cn("font-sans", inter.variable)}
      suppressHydrationWarning
    >
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: [
              "*, *::before, *::after { box-sizing: border-box; }",
              "body { margin: 0; }",
              ":focus-visible { outline: 2px solid #2563EB; outline-offset: 2px; }",
              "@keyframes spin { to { transform: rotate(360deg); } }",
              ".spinner { display: inline-block; width: 1em; height: 1em; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: -0.15em; }",
              "@keyframes thinking-dot-bounce { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }",
              "@media (prefers-reduced-motion: reduce) { .thinking-dot { animation: none !important; opacity: 1 !important; } }",
            ].join("\n"),
          }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
```

Do not add client-side style removal, user-agent detection, or broader suppression.

- [ ] **Step 5: Run the contract to verify GREEN**

Run:

```bash
npx vitest run tests/server/root-layout-source.test.ts
```

Expected: 1 test passed.

- [ ] **Step 6: Commit the isolated hydration fix**

```bash
git add tests/server/root-layout-source.test.ts src/app/layout.tsx TASK.md
git commit -m "fix(ui): tolerate Kakao root style injection"
```

---

### Task 2: Hide the redundant scene card in conversation mode

**Files:**
- Modify: `tests/server/student-mission-page.test.ts`
- Modify: `src/components/student/MissionFlowShell.tsx`
- Modify: `TASK.md`

**Interfaces:**
- Consumes: `conversationMode: boolean`, `startingTurnIndex: number`, and `scenePremise: string | null` already supplied to `MissionFlowShell`.
- Produces: `ScenePremiseCard` only for non-conversation missions starting at turn zero; no prop, schema, or AI-input changes.

- [ ] **Step 1: Write the failing scene-card source contract**

Add this test inside the existing `describe("student mission resume state", ...)` block in `tests/server/student-mission-page.test.ts`:

```ts
it("hides the scene card in conversation mode without removing scene grounding", () => {
  expect(pageSource).toContain("scenePremise={snapshot.scenePremise}");
  expect(shellSource).toContain("scenePremise: string | null");
  expect(shellSource).toContain(
    'import { ScenePremiseCard } from "@/components/student/ScenePremiseCard";',
  );
  expect(shellSource).toMatch(
    /\{!conversationMode && startingTurnIndex === 0 && \([\s\S]*?<ScenePremiseCard scenePremise=\{scenePremise\} \/>[\s\S]*?\)\}/,
  );
});
```

- [ ] **Step 2: Run the contract to verify RED**

Run:

```bash
npx vitest run tests/server/student-mission-page.test.ts
```

Expected: FAIL because the existing render condition checks only `startingTurnIndex === 0`.

- [ ] **Step 3: Gate only the scene-card presentation**

In `src/components/student/MissionFlowShell.tsx`, replace the existing scene-card block with:

```tsx
{/* Scene premise (SCENE-01): preset missions may render it once above turn 1.
    Conversation missions keep the premise as AI grounding but do not repeat it
    as a separate student-facing card. */}
{!conversationMode && startingTurnIndex === 0 && (
  <ScenePremiseCard scenePremise={scenePremise} />
)}
```

Do not remove the `scenePremise` prop, `ScenePremiseCard` component, page-level prop wiring, snapshot field, or generator inputs.

- [ ] **Step 4: Run the source contract to verify GREEN**

Run:

```bash
npx vitest run tests/server/student-mission-page.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 5: Verify the preserved grounding paths**

Run:

```bash
npx vitest run tests/server/student-mission-page.test.ts src/server/ai/opener-generator.test.ts src/server/ai/conversation-generator.test.ts src/domain/ai/conversation-generation.test.ts
```

Expected: all four files pass, demonstrating that the presentation change did not alter opener or dynamic-reply grounding.

- [ ] **Step 6: Update the task milestone**

In `TASK.md`, check the test-first implementation item and set the next step to:

```markdown
## Next step

Run focused and release verification.
```

- [ ] **Step 7: Commit the isolated presentation change**

```bash
git add tests/server/student-mission-page.test.ts src/components/student/MissionFlowShell.tsx TASK.md
git commit -m "fix(student): hide scene card in conversation mode"
```

---

### Task 3: Run release verification and record the handoff

**Files:**
- Modify: `TASK.md`

**Interfaces:**
- Consumes: the two committed implementation tasks.
- Produces: current-tip verification evidence and an explicit Kakao real-device recheck handoff.

- [ ] **Step 1: Run the focused regression matrix**

Run:

```bash
npx vitest run tests/server/root-layout-source.test.ts tests/server/student-mission-page.test.ts src/server/ai/opener-generator.test.ts src/server/ai/conversation-generator.test.ts src/domain/ai/conversation-generation.test.ts
```

Expected: all five files pass.

- [ ] **Step 2: Run the full automated release gate sequentially**

Run each command after the previous command finishes; do not run `typecheck` concurrently with `build` because both access `.next/types`.

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

Expected:

- Full test suite exits 0 with no failed tests.
- Typecheck exits 0.
- Lint exits 0; the known warning at `scripts/check-student-feedback-states.mjs:435` may remain, but no errors may be introduced.
- Production build exits 0.

If the three localhost socket tests fail with `listen EPERM`, rerun the full suite in an environment that permits binding `127.0.0.1` and `0.0.0.0`; do not classify those sandbox failures as application regressions.

- [ ] **Step 3: Record exact evidence in `TASK.md`**

Set the status to:

```markdown
**Status:** Implemented and verified; awaiting Kakao real-device recheck
```

Check all implementation and automated-verification items. Add a verification section containing the actual commands, exit status, passed/skipped counts, and the exact lint warning count observed. Do not claim a Kakao device pass from source tests or localhost evidence.

Set the next step to:

```markdown
## Next step

Open a conversation mission in the KakaoTalk in-app browser and confirm the
root hydration warning is absent and the visible “The scene” card is gone.
```

- [ ] **Step 4: Review the final diff**

Run:

```bash
git status --short --branch
git diff --check
git diff HEAD~2..HEAD -- src/app/layout.tsx src/components/student/MissionFlowShell.tsx tests/server/root-layout-source.test.ts tests/server/student-mission-page.test.ts TASK.md
```

Expected: only the planned root-layout, scene-card, tests, and task-bookkeeping changes; no schema, server AI, database, or unrelated edits.

- [ ] **Step 5: Commit final verification bookkeeping if `TASK.md` changed after Task 2**

```bash
git add TASK.md
git commit -m "docs: verify Kakao compatibility fixes"
```

Do not push or deploy. Hand the user the branch/commit state and the single Kakao real-device recheck above.
