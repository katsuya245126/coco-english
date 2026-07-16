---
phase: quick-260716-pzo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260716-pzo-audit-the-app-for-unused-files-dependenc/AUDIT.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "A findings report AUDIT.md exists in the quick task directory with categorized dead-code candidates"
    - "No source file, dependency, asset, or export is deleted or modified by this plan"
    - "Every high-confidence finding is manually cross-checked against dynamic imports, Next.js route conventions, and config references before being listed as safe-to-delete"
    - "Each finding carries a confidence label (HIGH / NEEDS-REVIEW) and the evidence tool that flagged it"
  artifacts:
    - ".planning/quick/260716-pzo-audit-the-app-for-unused-files-dependenc/AUDIT.md"
  key_links:
    - "knip/depcheck output → manual verification pass → categorized AUDIT.md sections"
---

<objective>
Audit the coco-english app (Next.js 15 + TypeScript, 187 src files, 20 public assets, 33 routes) for unused files, dependencies, exports, components, routes, assets, and duplicate code. Produce a single findings report and DELETE NOTHING.

Purpose: Give the user a reviewed, confidence-graded inventory of dead code so a follow-up cleanup task can delete safely. Static tools alone produce false positives on this stack (dynamic imports, Next.js route/page conventions, config-referenced files, cron endpoints, test-only utilities), so every candidate must be human-verified before it is called safe-to-delete.

Output: `.planning/quick/260716-pzo-audit-the-app-for-unused-files-dependenc/AUDIT.md`
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@package.json
@tsconfig.json
@next.config.ts
</context>

<constraints>
- REPORT ONLY. Do not delete, move, or edit any source file, dependency, asset, export, or route. The only file this plan creates or writes is AUDIT.md.
- Do not run `npm uninstall`, `rm`, `git rm`, or any mutation of tracked files other than writing AUDIT.md.
- Tools are NOT installed (knip, depcheck, ts-prune absent from package.json). Run them via `npx --yes` so nothing is added to package.json. Do not commit lockfile/package.json changes from npx.
- The user's dev server may be on port 3000; this audit is static analysis only and must not start a server.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Run static dead-code tooling and capture raw output</name>
  <files>.planning/quick/260716-pzo-audit-the-app-for-unused-files-dependenc/AUDIT.md</files>
  <action>
Run the following static analyzers via npx (none are installed; use `--yes` so nothing is added to package.json) and capture raw output for later triage. Do NOT act on any result yet — this task only gathers evidence.

1. knip — the primary tool for this Next.js + TS app. Create a minimal `knip.json` ONLY IN THE SCRATCHPAD directory (`/private/tmp/claude-501/-Users-john-Desktop-my-portfolio-projects-coco-english/<session>/scratchpad/knip.json`), NOT in the repo, pointing entry at Next.js conventions (`src/app/**/{page,layout,route,loading,error,not-found,template,default}.tsx`, `src/app/**/route.ts`, `next.config.ts`, `middleware.ts`, `scripts/*.mjs`, test globs `tests/**`, `**/*.test.ts`, playwright/vitest configs) and project files at `src/**`. Run `npx --yes knip --config <scratchpad>/knip.json --no-exit-code --reporter json` from the repo root. Capture: unused files, unused dependencies, unused devDependencies, unused exports, unused exported types, duplicate exports. If knip cannot resolve the `@/*` alias, confirm it reads tsconfig.json paths; pass `--tsConfig tsconfig.json` if needed.

2. depcheck — cross-check dependency findings. Run `npx --yes depcheck --json`. Capture `dependencies` (unused), `devDependencies` (unused), and `missing`. Treat depcheck as a second opinion on deps only; knip is authoritative for code.

3. Raw grep passes for evidence knip may miss — capture counts and file lists, do not judge yet:
   - Assets: for each of the 20 files under `public/`, grep the codebase for the basename (both with and without extension) across `src/**` and `next.config.ts`. Note that `public/images/archive/` is a manual archive dir (already git-status untracked) — flag its members separately as likely-intentional-archive, not tool-flagged.
   - `scripts/` (`check-student-feedback-states.mjs`, `cleanup-test-data.mjs`): grep package.json scripts and any docs references; both are referenced by npm scripts / manual ops, so expect them USED.

Write the raw captured output into a new section `## Raw Tool Output` in AUDIT.md (knip JSON summary counts, depcheck lists, grep asset table). Keep raw output; Task 2 triages it.
  </action>
  <verify>
    <automated>test -f ".planning/quick/260716-pzo-audit-the-app-for-unused-files-dependenc/AUDIT.md" && grep -q "Raw Tool Output" ".planning/quick/260716-pzo-audit-the-app-for-unused-files-dependenc/AUDIT.md" && git status --porcelain package.json package-lock.json | grep -q . && echo "UNEXPECTED: package files mutated" || echo "OK: raw output captured, package files clean"</automated>
  </verify>
  <done>AUDIT.md exists with a `## Raw Tool Output` section containing knip JSON summary counts, depcheck unused/missing lists, and a per-asset grep reference table. package.json and package-lock.json are unmodified (npx did not persist anything).</done>
</task>

<task type="auto">
  <name>Task 2: Manually verify candidates and write the categorized findings report</name>
  <files>.planning/quick/260716-pzo-audit-the-app-for-unused-files-dependenc/AUDIT.md</files>
  <action>
Triage every candidate from Task 1's raw output and produce the reviewed report. The core value is false-positive elimination: static tools over-report on this stack. For EACH candidate, apply the verification checklist below and assign a confidence label before listing it.

Verification checklist (a candidate is downgraded to NEEDS-REVIEW if ANY apply):
- Dynamic import: grep the identifier/path against `import(` usages (4 files in src use dynamic import) and any string-built module paths.
- Next.js convention file: `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `middleware.ts`, `default.tsx`, route-group `(workspace)` dirs, and dynamic `[param]` segments are entrypoints the framework loads by filename — never mark these unused even if knip flags them.
- Config reference: check `next.config.ts`, `tsconfig.json`, `postcss`/`tailwind` config, `vitest`/`playwright` configs, and `package.json` scripts for string references (e.g. ffmpeg-static, microsoft-cognitiveservices-speech-sdk, sdk peer usage, tailwind plugins like tw-animate-css / @tailwindcss/postcss, shadcn/base-ui component libs).
- Test-only usage: an export used only by `tests/**` or `*.test.ts` is USED, not dead (knip with test entries should already count these — verify).
- Type-only / re-export barrels: exported types consumed across module boundaries or re-exported from index barrels.
- Runtime-string deps: deps referenced only via runtime strings or dynamic requires (e.g. ffmpeg-static path, speech SDK) that depcheck/knip miss.

Then write AUDIT.md with these sections (replacing/augmenting the raw section, which stays at the bottom):

1. `## Summary` — one-paragraph overview + a counts table: candidates found vs. confirmed-safe (HIGH) vs. needs-review per category.
2. `## Unused Files (HIGH confidence)` — path, why safe (tool + manual check passed), estimated LOC.
3. `## Unused Dependencies (HIGH confidence)` — package, evidence from both knip and depcheck agreeing, note the npm command a future cleanup would use (do NOT run it).
4. `## Unused Exports / Components / Types (HIGH confidence)` — file:symbol, kind.
5. `## Unused Assets (HIGH confidence)` — public/ file, grep-confirmed zero references; keep `public/images/archive/**` in its own clearly-labeled archive subsection.
6. `## Duplicate Code` — knip duplicate-export findings plus any obvious duplicated logic spotted (character/flow/conversation domains are the likely hotspots); describe the duplication, do not refactor.
7. `## Needs Review (do NOT auto-delete)` — every downgraded candidate with the specific reason it failed the checklist (dynamic import, framework convention, config ref, test-only, runtime string).
8. `## Recommended Next Steps` — explicit statement that deletion is a separate, user-approved follow-up; suggest the order (assets → unused deps → unused exports → files) and note anything requiring live verification.

Every listed item must cite its evidence source (knip / depcheck / grep) and its confidence label. Nothing in the HIGH sections may have failed a checklist item.
  </action>
  <verify>
    <automated>F=".planning/quick/260716-pzo-audit-the-app-for-unused-files-dependenc/AUDIT.md"; for s in "## Summary" "Unused Files" "Unused Dependencies" "Unused Exports" "Unused Assets" "Duplicate Code" "Needs Review" "Recommended Next Steps"; do grep -qF "$s" "$F" || { echo "MISSING SECTION: $s"; exit 1; }; done; test -z "$(git status --porcelain src public package.json)" && echo "OK: all sections present, no source/asset/package mutations" || { echo "UNEXPECTED: tracked source/asset/package files changed"; exit 1; }</automated>
  </verify>
  <done>AUDIT.md contains all eight sections. Every HIGH-confidence finding passed the verification checklist and cites its evidence tool. Framework-convention files, config-referenced deps, dynamic-import targets, and test-only exports appear only under Needs Review or not at all — never under HIGH. No file under `src/` or `public/`, and neither package.json nor package-lock.json, was modified.</done>
</task>

</tasks>

<verification>
- AUDIT.md exists in the quick task directory with all required sections.
- `git status --porcelain` shows no changes to `src/`, `public/`, `package.json`, or `package-lock.json` attributable to this plan (only AUDIT.md is new).
- Every finding in a HIGH-confidence section names the tool that flagged it and confirms it survived the manual verification checklist.
- Next.js entrypoints (page/layout/route/loading/error/not-found/middleware, `[param]` and `(group)` segments), cron routes, config-referenced deps, and test-only exports do not appear as safe-to-delete.
</verification>

<success_criteria>
- A reviewed, confidence-graded AUDIT.md is produced covering files, dependencies, exports, components, routes, assets, and duplicate code.
- Zero deletions or source/dependency/asset mutations occurred.
- False-positive-prone candidates (dynamic imports, framework conventions, config references, runtime-string deps, test-only usage) are correctly quarantined under Needs Review.
- The report ends with a clear statement that deletion is a separate user-approved step.
</success_criteria>

<output>
Create `.planning/quick/260716-pzo-audit-the-app-for-unused-files-dependenc/260716-pzo-SUMMARY.md` when done.
</output>
