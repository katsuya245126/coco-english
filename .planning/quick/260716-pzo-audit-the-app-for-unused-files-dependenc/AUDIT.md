# Dead Code Audit — coco-english

Generated 2026-07-16. Report-only; nothing was deleted or modified by this audit.

Tooling notes: knip@6 (latest via npx) failed to run in this environment — its `oxc-parser` native binding requires Node >=20.19/22.12 and this machine runs Node v20.12.0, producing `Cannot find native binding`. Pinned `knip@5` instead, which ran cleanly. `depcheck` ran via `npx --yes depcheck`. Neither tool's install persisted to `package.json`/`package-lock.json` (verified clean after each run).

## Summary

Static tools (knip@5, depcheck) flagged 6 unused files, 11 unused package.json dependencies (combined, with disagreement between tools), 43 unused value exports, and 117 unused exported types across this 187-file Next.js 15 + TypeScript app. Every candidate was manually cross-checked against dynamic imports, Next.js route conventions, CSS/config runtime-string references, and same-file/internal-only usage before being accepted as safe-to-delete. The false-positive rate was high, as expected for this stack: `shadcn` (CSS-imported, not JS-imported), `eslint-config-next` and `tailwindcss` (string-referenced from config, not `import`ed), `vite`/`@types/react-dom` (implicit ecosystem peers), and the large majority of "unused types" (117) and several "unused exports" (16 of 43) turned out to be used internally within their own defining file — over-exported, not dead. Two tool-vs-tool disagreements (`qrcode`, `@tailwindcss/postcss`/`@types/react-dom`) were resolved by tracing reachability and CSS/config references respectively.

The most valuable finding is a coherent, well-evidenced dead **feature cluster**: `src/app/teacher/classes/actions.ts` plus the three components it exclusively serves (`ClassForm.tsx`, `ClassList.tsx`, `ShareClassDialog.tsx`) plus `src/lib/supabase/browser.ts` are all unreachable from any route, consistent with the "Teacher nav restructure" noted in project memory (class management folded into the workspace shell). A second finding is genuine code duplication: three server-action functions in `src/app/teacher/assignment-actions.ts` are dead duplicates of same-named, actually-used functions in `src/app/teacher/evidence/[attemptId]/actions.ts`.

| Category | Tool-flagged candidates | Confirmed safe (HIGH) | Needs review |
|---|---|---|---|
| Files | 6 | 5 (1 cluster: browser.ts + 4 files below) | 0 |
| Dependencies | 11 (union of both tools) | 3 (`class-variance-authority`, `lucide-react`, `@vitejs/plugin-react`) | 8 (config/CSS/ecosystem false positives) |
| Exports (value-level) | 43 | 9 confirmed dead + 6 dead-badge-styles = 15 | 28 (internal-only over-exports, incl. 2 same-file JSX false positives) |
| Exported types | 117 | 0 (none independently verified as externally-referenced-then-removed; all are type-only over-exports) | 117 |
| Assets | 20 (public/ files) | 10 (6 duplicate/orphaned non-alpha sprites, 2 misc, 2 unmapped `surprised` variants) | 4 (archive dir, explicitly user-managed) |
| Duplicate code | knip: 0 duplicate-export findings | — | 1 confirmed duplication (3 functions, 2 files) |

## Unused Files (HIGH confidence)

All 6 knip-flagged files were manually verified: none are Next.js convention files (no `page/layout/route/loading/error/not-found/middleware` filenames among them), none are targeted by dynamic `import()` (a repo-wide `grep -rn "import(\|next/dynamic\|React.lazy\|require("` across `src/` returned zero hits), and none are imported by any reachable module. They form one coherent orphaned feature cluster — a prior "manage classes" UI, superseded per project memory by the teacher-workspace nav restructure. `class-service.ts` (the module these files call into) itself remains live via other consumers, so it is NOT included here.

| File | Why safe | Evidence |
|---|---|---|
| `src/app/teacher/classes/actions.ts` | Zero importers anywhere in `src/`; not a route/convention file (routes live under `src/app/teacher/classes/[id]/...` and `src/app/teacher/classes/page` equivalents, not this bare `actions.ts`) | knip unused-file + manual `grep -rln` for the module path (0 hits) |
| `src/components/teacher/ClassForm.tsx` | Only imported by the orphaned `classes/actions.ts` cluster; zero importers elsewhere | knip unused-file + manual grep |
| `src/components/teacher/ClassList.tsx` | Only imported by the orphaned cluster; zero importers elsewhere | knip unused-file + manual grep |
| `src/components/teacher/ShareClassDialog.tsx` | Only imported by the orphaned cluster; its `qrcode` import is the reason knip (correctly, via reachability) flags `qrcode` as an unused dependency below | knip unused-file + manual grep |
| `src/lib/supabase/browser.ts` | Zero importers; `createBrowserClient` from `@supabase/ssr` is otherwise only used via `src/lib/supabase/server.ts`/`middleware.ts` (server-side clients), not this browser-side one | knip unused-file + manual grep |

Estimated combined LOC: ~5 files, roughly 400-600 LOC (not individually counted; low-risk estimate based on typical component/action-file size in this codebase).

## Unused Dependencies (HIGH confidence)

| Package | Evidence | Future cleanup command (do NOT run) |
|---|---|---|
| `class-variance-authority` | knip AND depcheck both flag it; zero `import` hits anywhere in `src/`; zero references in `globals.css`/`postcss.config.mjs`/`components.json` | `npm uninstall class-variance-authority` |
| `lucide-react` | knip AND depcheck both flag it; zero `import` hits anywhere in `src/`; zero CSS/config references (icons in this app are hand-drawn inline SVG/emoji per `StatusBadge.tsx` header comment: "no Tailwind, shadcn, or icon libraries") | `npm uninstall lucide-react` |
| `@vitejs/plugin-react` | knip AND depcheck both flag it; `vitest.config.ts` has no `plugins: [react()]` entry and no separate `vite.config.*` file exists anywhere in the repo root | `npm uninstall -D @vitejs/plugin-react` |

Note: `qrcode` and `@types/qrcode` are flagged by knip but are **not** independently listed here — they are used, but only by the already-dead `ShareClassDialog.tsx` (see Unused Files above). Removing `ShareClassDialog.tsx` would make `qrcode`/`@types/qrcode` genuinely unused as a follow-up step; listing them as a dependency deletion now would be premature since the file deletion hasn't happened.

## Unused Exports / Components / Types (HIGH confidence)

### Confirmed dead value-level exports

| File:Symbol | Kind | Evidence |
|---|---|---|
| `src/app/student/missions/[assignmentStudentId]/actions.ts:submitAnswerAction` | server action function | knip; zero references anywhere besides its own declaration |
| `src/app/student/missions/[assignmentStudentId]/actions.ts:submitRepeatAction` | server action function | knip; zero references anywhere besides its own declaration |
| `src/app/teacher/missions/actions.ts:deleteMissionAction` | server action function | knip; zero references anywhere besides its own declaration |
| `src/server/student-access/assignment-list.ts:listStudentAssignments` | exported function | knip; zero references anywhere besides its own declaration |
| `src/server/classroom/roster-service.ts:updateStudent` | exported function | knip; zero references anywhere besides its own declaration |
| `src/app/teacher/assignment-actions.ts:markSubmissionViewedAction` | server action function | knip; zero external references — dead duplicate, see Duplicate Code section |
| `src/app/teacher/assignment-actions.ts:markSubmissionReviewedAction` | server action function | knip; zero external references — dead duplicate, see Duplicate Code section |
| `src/app/teacher/assignment-actions.ts:requestSubmissionRetryAction` | server action function | knip; zero external references — dead duplicate, see Duplicate Code section |

### Confirmed dead style-token exports (superseded component)

`src/components/student/styles.ts` contains a full "Phase 4: Status badge tokens" block that was superseded by the separately-implemented, self-contained `src/components/teacher/StatusBadge.tsx` (which hardcodes its own inline styles per its header comment: "Uses inline React.CSSProperties only"). These 7 tokens are unreferenced by `StatusBadge.tsx` or anywhere else:

| File:Symbol | Kind | Evidence |
|---|---|---|
| `src/components/student/styles.ts:statusBadgeBaseStyle` | CSSProperties constant | knip; zero consumers outside its own 6 sibling constants below |
| `src/components/student/styles.ts:badgeStartStyle` | CSSProperties constant | knip; zero consumers anywhere |
| `src/components/student/styles.ts:badgeContinueStyle` | CSSProperties constant | knip; zero consumers anywhere |
| `src/components/student/styles.ts:badgeDoneStyle` | CSSProperties constant | knip; zero consumers anywhere |
| `src/components/student/styles.ts:badgeClosedStyle` | CSSProperties constant | knip; zero consumers anywhere |
| `src/components/student/styles.ts:badgeLateStyle` | CSSProperties constant | knip; zero consumers anywhere |
| `src/components/student/styles.ts:badgeRetryStyle` | CSSProperties constant | knip; zero consumers anywhere |

No unused React components or unused routes were found beyond the file-level cluster above (all `page.tsx`/`layout.tsx`/`route.ts` files are live Next.js entrypoints and were excluded from consideration per the verification checklist).

## Unused Assets (HIGH confidence)

`public/` has 20 files. `MascotStage.tsx` maps the fixed 6-value `MascotExpression` type to exactly 6 literal filenames (`coco-neutral-alpha.png`, `coco-happy-alpha.png`, `coco-celebrate-alpha.png`, `coco-encouraging-alpha.png`, `coco-thinking-alpha.png`, `coco-sad-alpha.png`) — confirmed the only mascot-image code path in the app, and confirmed no dynamic/template-string path construction exists anywhere in `src/`.

| Asset | Why safe | Evidence |
|---|---|---|
| `public/images/coco.png` | No literal reference anywhere in `src/`; not one of the 6 mapped `-alpha` sprites | grep (0 hits) |
| `public/images/coco-fullsitting.png` | No literal reference anywhere in `src/` | grep (0 hits) |
| `public/images/coco-neutral-filled.png` | No literal reference anywhere in `src/` | grep (0 hits) |
| `public/images/coco-neutral.png` | No literal reference; superseded by `coco-neutral-alpha.png` | grep (0 hits) |
| `public/images/coco-sad.png` | No literal reference; superseded by `coco-sad-alpha.png` | grep (0 hits) |
| `public/images/coco-celebrate.png` | No literal reference; superseded by `coco-celebrate-alpha.png` | grep (0 hits) |
| `public/images/coco-encouraging.png` | No literal reference; superseded by `coco-encouraging-alpha.png` | grep (0 hits) |
| `public/images/coco-surprised.png` | No `surprised` value exists in `MascotExpression` — this expression was apparently designed but never wired up | grep (0 hits) + type-definition check |
| `public/images/coco-surprised-alpha.png` | Same as above | grep (0 hits) + type-definition check |
| `public/.DS_Store` | macOS filesystem artifact, not an app asset; should be gitignored rather than deleted as "dead code" | N/A |

**Not listed above (out of scope for this audit, currently mid-edit by the user):** `public/images/coco-happy.png` and `public/images/coco-thinking.png` already show as `git status: D` (deleted) in the working tree, and `public/images/coco-happy-alpha.png`/`coco-thinking-alpha.png` show as `M` (modified) — the user is actively replacing these two sprite pairs. This audit does not weigh in on in-progress uncommitted work.

### Archive subsection (explicitly user-managed, not a tool finding)

`public/images/archive/` (`coco-happy-alpha.png`, `coco-happy.png`, `coco-thinking-alpha.png`, `coco-thinking.png`) is a manually created, currently-untracked directory the user set up themselves as a save-point for the sprite files being replaced above. This is **not** a dead-code finding — it's an intentional archive the user is actively curating. Flagged here only for completeness per the plan's instruction to keep it in its own labeled subsection.

## Duplicate Code

knip's duplicate-export detector reported 0 findings (no two modules re-export the identical symbol from the identical source). Manual review of the areas the plan flagged as likely hotspots (character/flow/conversation domains) found the `src/domain/ai/*.ts` (pure schema/parse contracts) vs `src/server/ai/*.ts` (OpenAI adapter) split is an intentional, documented architecture pattern ("Mirrors the turn-evaluation.ts schema/parse-helper convention" — see file header comments), not duplication.

One genuine duplication was found outside the tool output, via cross-referencing the confirmed-dead exports above:

**`src/app/teacher/assignment-actions.ts` vs `src/app/teacher/evidence/[attemptId]/actions.ts`** — both files define server actions named `markSubmissionReviewedAction` and `requestSubmissionRetryAction` with near-identical bodies (call the same underlying `src/server/teacher/assignment-operations.ts` functions, then `revalidatePath`). Only the `evidence/[attemptId]/actions.ts` versions are imported (by `SubmissionReviewControls.tsx`, verified via grep). The `assignment-actions.ts` versions — plus a third dead function, `markSubmissionViewedAction`, which has no live counterpart at all — are stale leftovers from an earlier review-UI iteration. `assignment-actions.ts` itself remains live (its `reopenSubmissionReviewAction` and `updateClassReviewPolicyAction` exports ARE imported by `TeacherQueueViews.tsx` and `ClassReviewPolicyControl.tsx` respectively), so only the 3 dead functions within it are candidates, not the whole file.

## Needs Review (do NOT auto-delete)

### Dependencies — config/CSS/ecosystem string references (false positives, not independently verified elsewhere)

| Package | Flagged by | Why NOT safe to delete | Evidence |
|---|---|---|---|
| `shadcn` | knip, depcheck | Imported via CSS `@import "shadcn/tailwind.css"` in `src/app/globals.css:3` — a runtime-string reference neither tool's JS/TS import scanner sees | grep on `globals.css` + confirmed `node_modules/shadcn/dist/tailwind.css` exists |
| `tailwindcss` | depcheck (knip did not flag this one) | Imported via CSS `@import "tailwindcss"` in `globals.css:1` and referenced in `postcss.config.mjs` via the `@tailwindcss/postcss` plugin | grep on `globals.css`/`postcss.config.mjs` |
| `eslint-config-next` | knip, depcheck | Referenced via string in `eslint.config.mjs`: `compat.extends("next/core-web-vitals", "next/typescript")` — these strings resolve to the `eslint-config-next` package at runtime, not a static `import` | grep on `eslint.config.mjs`; confirmed package resolves via `require.resolve` |
| `tw-animate-css` | none (verified used, included for completeness since it was in the raw candidate sweep) | Directly imported in `globals.css:2` (`@import "tw-animate-css"`) | grep — already excluded from HIGH section, listed here only to document it was checked |
| `vite` | depcheck (knip did not flag this one) | `vitest.config.ts` imports from `"vitest/config"`, and `vite` is vitest's underlying engine / a standard implicit peer in the vitest ecosystem — no direct `vite` import exists, but removing it risks breaking `vitest`'s resolution | package.json dependency graph reasoning; not independently verified via a live `npm ls` in this audit |
| `@types/react-dom` | depcheck (knip did not flag this one) | `react-dom` itself is a real runtime `dependencies` entry (Next.js requires it for rendering) even though no `src/` file directly `import`s it; the matching `@types` package is standard devDependency convention paired with a used runtime package | package.json cross-reference |
| `qrcode` | knip | Used by `ShareClassDialog.tsx`, which is itself in the confirmed-dead file cluster above — genuinely removable, but only as a *follow-up* to deleting that file, not independently right now | grep confirms real `import QRCode from "qrcode"` usage inside the dead file |
| `@types/qrcode` | depcheck | Same reasoning as `qrcode` above — tied to the dead file cluster, not independently dead | package.json cross-reference |

### Exports — internal-only over-exports (used within their own file, not externally)

The majority of knip's "unused export"/"unused type" findings (28 of 43 value exports, and effectively all 117 type exports) are values or types that ARE used — but only within the same file that defines them (e.g., a `const` folded into another `export const` in the same module, or a Zod schema composed into a sibling schema, or a TS type used only as a local function's return-type annotation). knip flags these because nothing *outside* the file imports them, but deleting them would break the file that defines them. This is a distinct, lower-severity category from true dead code: the correct future action (if any) is removing the unnecessary `export` keyword, not deleting the code.

Representative sample (all individually verified with a targeted grep; the remaining ~100+ unused-type findings follow the identical pattern and were spot-checked rather than each individually re-verified):

- `src/components/student/styles.ts`: `MISSION_CONTENT_MAX_WIDTH`, `mascotSpeakerLabelStyle` — used elsewhere in the same file.
- `src/domain/classroom/join-code.ts`: `JOIN_CODE_DEFAULT_LENGTH` — default parameter value used in the same file's `generateJoinCode`.
- `src/domain/pronunciation/scoring.ts`: `STAR_BAND_THRESHOLDS`, `STAR_BAND_WEIGHTS`, `SoundToWorkOn` (type) — used in the same file's scoring logic.
- `src/domain/ai/translation-hint.ts`: `translationHintModelPhraseSchema`, `TranslationSegment`, `ParseTranslationHintResult` (types) — composed into sibling schemas/return types in the same file.
- `src/domain/audio/tts.ts`: `voiceEligibleLineKindSchema`, `normalizeTtsText`, `TtsRequest`, `TtsCacheHashInputParams`, `TtsCacheHashInput` (types) — used in the same file.
- `src/domain/ai/turn-evaluation.ts`: `aiEvaluationConfidenceSchema`, `aiEvaluationEnglishLanguageSchema` — composed into sibling schemas in the same file.
- `src/server/mission/mission-service.ts:countAssignmentsForMission`, `src/server/audio/tts-cache.ts:TTS_AUDIO_BUCKET`/`SIGNED_TTS_URL_TTL_SECONDS`, `src/server/classroom/roster-service.ts:generateStudentPin` — same pattern, server-side.
- `src/domain/classroom/schemas.ts:createClassSchema`/`updateClassSchema` and `src/domain/classroom/student-access-schemas.ts:joinCodeInputSchema`/`typedNameSchema`/`pinInputSchema` and `src/domain/classroom/roster-schemas.ts:studentNameSchema`/`studentSchema` — internal-only, though note `createClassSchema`/`updateClassSchema` are ALSO consumed by the dead `classes/actions.ts` cluster (double reason to not treat as independently actionable).
- `src/domain/conversation/fallback-lines.ts:CANNED_FALLBACK_LINES` — used within the same file's `pickFallbackLine`-style helper.
- All 117 "unused exported types" flagged by knip (`AttemptRow`, `TranscriptionError`, `CharacterProfile`, `IncompleteStatus`, and ~113 more across `src/domain/**`, `src/server/**`, `src/app/**`, `src/lib/db/types.ts`) — spot-checked representative samples from `src/lib/db/types.ts`, `src/server/audio/transcription.ts`, `src/domain/character/profile.ts`, and `src/domain/teacher/assignment-operations.ts` all showed the same in-file-only usage pattern (local function return-type annotations, discriminated union members). Treating 117 individual type exports as safe-to-delete would require per-symbol verification beyond this audit's scope; they are batched here as one reviewable category rather than exhaustively itemized.

### Exports — same-file JSX false positives (knip miscounts as unused)

| File:Symbol | Why NOT unused | Evidence |
|---|---|---|
| `src/components/teacher/TeacherQueueViews.tsx:ActivityOverflowMenu` | Referenced in JSX at line 60 of the same file (`{row.reviewedAt && <ActivityOverflowMenu attemptId={row.attemptId}/>}`) | grep on same file |
| `src/components/teacher/TeacherQueueViews.tsx:ReviewUndoToast` | Referenced in JSX at line 60 of the same file (`<ReviewUndoToast attemptId={reviewedAttemptId}/>`) | grep on same file |

### scripts/ — explicitly scoped as disposable, not a tool finding

`scripts/cleanup-test-data.mjs` is untracked (`git ls-files scripts/` omits it) and, per the project's own planning docs (`docs/superpowers/plans/2026-07-12-dismiss-incomplete-assignment.md`, `2026-07-12-no-attempt-assignment-evidence.md`), was intentionally built as a scratchpad tool "NOT committed as product code," slated for `rm` once its supporting cleanup decisions are finalized. It is not dead code in the audited sense (it's a live operational tool, currently in use) — flagged here only because it surfaced during the scripts/ reference check and its disposition is already documented elsewhere, so a future cleanup pass should NOT treat it as a "found" dead file requiring investigation.

## Recommended Next Steps

Deletion is a separate, user-approved follow-up to this audit — no action was taken here. If the user approves a cleanup pass, suggested order (lowest risk / highest confidence first):

1. **Assets** — delete the 10 confirmed-unused `public/images/*.png` files (non-alpha duplicates + unmapped `surprised` variants). Lowest risk: no code references them, and the app's mascot rendering exclusively uses the `-alpha` set.
2. **Unused dependencies** — `npm uninstall class-variance-authority lucide-react` then `npm uninstall -D @vitejs/plugin-react`; run the full test suite + `npm run build` afterward to confirm nothing implicitly relied on them (e.g., via a transitive type import).
3. **Unused exports (confirmed dead)** — remove the 8 dead server-action/function exports and the 7 dead `styles.ts` badge tokens; then remove the 3 duplicate functions from `assignment-actions.ts` as the Duplicate Code fix.
4. **Unused files** — delete the 5-file orphaned "manage classes" cluster (`classes/actions.ts`, `ClassForm.tsx`, `ClassList.tsx`, `ShareClassDialog.tsx`, `lib/supabase/browser.ts`) as one atomic change, then re-run knip to confirm `qrcode`/`@types/qrcode` become independently unused and remove those too in the same pass.
5. **Type-only over-exports (117 items)** — lowest priority and highest volume; consider a dedicated follow-up task with a stricter per-symbol review rather than bundling into a general cleanup, since correctness here hinges on confirming each type genuinely has no external consumers (this audit batched them by pattern, not by individual symbol).

Anything requiring live/runtime verification (e.g., confirming the `vite`/`@types/react-dom` NEEDS-REVIEW items are truly safe, or confirming no external tooling imports the deleted files) should be checked with `npm run build && npm run typecheck && npx vitest run` after each deletion batch, not assumed from static analysis alone.

## Raw Tool Output

### knip@5 summary counts

Config used (scratchpad-only, not committed): entry = Next.js convention files (`page/layout/route/loading/error/not-found/template/default`), `next.config.ts`, `middleware.ts`, `scripts/*.mjs`, `tests/**`, `src/**/*.test.ts`, playwright/vitest configs. Project = `src/**/*.{ts,tsx}`.

- Unused files: 6
- Unused exports (value-level): 43
- Unused exported types: 117
- Unlisted dependencies (used but not in package.json): 2 (`postcss` in `postcss.config.mjs`, `@eslint/eslintrc` in `eslint.config.mjs`)
- Unresolved imports: 0
- Duplicate exports: 0
- Unused `dependencies` (package.json): `@base-ui/react`, `class-variance-authority`, `lucide-react`, `qrcode`, `shadcn`, `tw-animate-css`
- Unused `devDependencies` (package.json): `@types/qrcode`, `@vitejs/plugin-react`, `eslint-config-next`, `tailwindcss`, `vite`

Raw unused-files list (knip):
```
src/lib/supabase/browser.ts
src/components/foundation/FoundationSmokePanel.tsx
src/components/teacher/ClassForm.tsx
src/components/teacher/ClassList.tsx
src/components/teacher/ShareClassDialog.tsx
src/app/teacher/classes/actions.ts
```

### depcheck summary

```
dependencies (unused): @base-ui/react, class-variance-authority, lucide-react, shadcn, tw-animate-css
devDependencies (unused): @tailwindcss/postcss, @types/react-dom, @vitejs/plugin-react, eslint-config-next, tailwindcss, vite
missing: @eslint/eslintrc
```

Note depcheck disagrees with knip on `qrcode` (knip flags unused, depcheck does not) and disagrees on `@tailwindcss/postcss`/`@types/react-dom` (depcheck flags unused, knip does not) — both are exactly the kind of static-analysis disagreement the manual verification pass below resolves.

### Asset reference grep (public/, 20 files)

Every `public/` file's basename (with and without extension) was grepped against `src/**`, `next.config.ts`, `middleware.ts`. `MascotStage.tsx` maps `MascotExpression` (6 fixed values: idle/happy/celebrate/encouraging/thinking/sad) to 6 literal filenames — no template-string or dynamic path construction was found anywhere in `src/` (`grep -rn "import(\|next/dynamic\|React.lazy\|require(" src` returned zero hits), so string-literal grep is a reliable signal here.

| File | Referenced in src/ (literal) |
|---|---|
| `public/images/coco-neutral-alpha.png` | YES — `MascotStage.tsx` (`idle`) |
| `public/images/coco-happy-alpha.png` | YES — `MascotStage.tsx` (`happy`) |
| `public/images/coco-celebrate-alpha.png` | YES — `MascotStage.tsx` (`celebrate`) |
| `public/images/coco-encouraging-alpha.png` | YES — `MascotStage.tsx` (`encouraging`) |
| `public/images/coco-thinking-alpha.png` | YES — `MascotStage.tsx` (`thinking`) |
| `public/images/coco-sad-alpha.png` | YES — `MascotStage.tsx` (`sad`) |
| `public/images/coco.png` | NO |
| `public/images/coco-fullsitting.png` | NO |
| `public/images/coco-neutral-filled.png` | NO |
| `public/images/coco-neutral.png` | NO |
| `public/images/coco-happy.png` | NO (also `git status: D` — user is mid-deleting this) |
| `public/images/coco-thinking.png` | NO (also `git status: D` — user is mid-deleting this) |
| `public/images/coco-sad.png` | NO |
| `public/images/coco-celebrate.png` | NO |
| `public/images/coco-encouraging.png` | NO |
| `public/images/coco-surprised.png` | NO (no `surprised` value exists in `MascotExpression`) |
| `public/images/coco-surprised-alpha.png` | NO (no `surprised` value exists in `MascotExpression`) |
| `public/.DS_Store` | N/A — macOS system file, not app asset |

`public/images/archive/` (4 files: `coco-happy-alpha.png`, `coco-happy.png`, `coco-thinking-alpha.png`, `coco-thinking.png`) is a **manual archive directory** the user created themselves (currently untracked per `git status`, sits alongside an in-progress uncommitted sprite swap of the live `coco-happy-alpha.png`/`coco-thinking-alpha.png` files). This is flagged separately as likely-intentional-archive below, not as a tool-found dead asset.

### scripts/ reference check

- `scripts/check-student-feedback-states.mjs` — referenced by `package.json` script `test:student-feedback-states`. USED.
- `scripts/cleanup-test-data.mjs` — **untracked** (`git ls-files scripts/` does not list it; `git status` shows `??`). Not referenced by any `package.json` script. Per `docs/superpowers/plans/2026-07-12-dismiss-incomplete-assignment.md` and `2026-07-12-no-attempt-assignment-evidence.md`, this was explicitly authored as a disposable scratchpad tool ("scratchpad copy; NOT committed as product code") slated for `rm` after the cleanup decisions it supports are finished. Not a knip/depcheck finding — flagged here from the docs cross-reference and git status.
