---
phase: quick-260716-pzo
plan: 01
subsystem: testing
tags: [knip, depcheck, dead-code, audit, static-analysis]

requires: []
provides:
  - "Confidence-graded dead-code inventory (AUDIT.md) covering unused files, dependencies, exports, types, assets, and duplicate code"
affects: [future cleanup task]

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/quick/260716-pzo-audit-the-app-for-unused-files-dependenc/AUDIT.md
  modified: []

key-decisions:
  - "Pinned knip@5 via npx instead of latest knip@6, whose oxc-parser native binding requires Node >=20.19/22.12 and fails on this machine's Node v20.12.0"
  - "Every static-tool candidate was manually cross-checked against dynamic imports, Next.js conventions, CSS/config runtime-string references, and same-file internal usage before being labeled HIGH confidence"
  - "The 117 unused-exported-type findings were batched as one reviewable category (spot-checked, not individually re-verified) rather than exhaustively itemized, given they all follow the identical internal-only-usage false-positive pattern"

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "AUDIT.md produced with all required sections (Summary, Unused Files, Unused Dependencies, Unused Exports/Types, Unused Assets, Duplicate Code, Needs Review, Recommended Next Steps), each finding citing its evidence tool and confidence label"
    verification:
      - kind: other
        ref: "grep -qF section-header checks against AUDIT.md for all 8 required sections (all present)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Zero source/dependency/asset mutations caused by this audit (report-only constraint)"
    verification:
      - kind: other
        ref: "git status --porcelain diff against conversation-start baseline — identical except new untracked .planning/quick/.../ directory"
        status: pass
    human_judgment: false
  - id: D3
    description: "Framework-convention files, config/CSS-referenced deps, dynamic-import targets, and same-file-only usages are correctly quarantined under Needs Review, not listed as HIGH-confidence safe-to-delete"
    human_judgment: true
    rationale: "Correctness of the false-positive triage (e.g., shadcn CSS import, eslint-config-next string reference, internal-only exports) is a judgment call best spot-checked by a human familiar with the codebase before any deletion follow-up proceeds"

duration: 22min
completed: 2026-07-16
status: complete
---

# Quick Task 260716-pzo: Dead Code Audit Summary

**Static + manually-verified dead-code inventory for coco-english: 5 orphaned files (a superseded "manage classes" feature cluster), 3 genuinely-unused npm dependencies, 15 confirmed-dead exports, 10 unused sprite assets, and 1 duplicated server-action pair — all cross-checked against dynamic imports, Next.js conventions, and CSS/config runtime-string references to filter out the high false-positive rate typical of static tools on this stack.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-16T09:52:23Z (approx, first tool invocation)
- **Completed:** 2026-07-16T10:14:00Z (approx)
- **Tasks:** 2 completed
- **Files modified:** 0 (report-only; 1 new file created — AUDIT.md)

## Accomplishments
- Ran knip (pinned to v5 after v6's native binding failed on this machine's Node version) and depcheck via `npx --yes`, capturing raw findings without acting on them (Task 1)
- Manually verified every candidate against the plan's checklist (dynamic imports, Next.js route conventions, config/CSS references, test-only usage, internal-only exports) and produced the full categorized, confidence-graded AUDIT.md (Task 2)
- Discovered a coherent dead feature cluster (`classes/actions.ts` + `ClassForm.tsx` + `ClassList.tsx` + `ShareClassDialog.tsx` + `lib/supabase/browser.ts`) consistent with the previously-noted "Teacher nav restructure" project decision
- Found and documented one genuine code duplication: `markSubmissionReviewedAction`/`requestSubmissionRetryAction` exist as dead duplicates in `assignment-actions.ts` alongside the live versions in `evidence/[attemptId]/actions.ts`
- Resolved three knip-vs-depcheck tool disagreements (`qrcode`, `@tailwindcss/postcss`, `@types/react-dom`) via reachability/config-reference tracing

## Task Commits

No code commits were made. This plan is report-only per its constraints — no source, dependency, asset, or export was modified. Both tasks' `<done>` criteria (raw output captured / all sections present, package.json and package-lock.json unmodified) were verified directly rather than via commit.

**Plan metadata:** commit deferred to orchestrator per this quick-task's constraints (SUMMARY.md/STATE.md docs commit is handled outside this executor).

## Files Created/Modified
- `.planning/quick/260716-pzo-audit-the-app-for-unused-files-dependenc/AUDIT.md` - the full dead-code audit report (raw tool output + triaged, confidence-graded findings)

No files under `src/`, `public/`, `package.json`, or `package-lock.json` were created, modified, or deleted by this plan.

## Decisions Made
- Used `knip@5` instead of the latest `knip@6` because `knip@6`'s `oxc-parser` dependency requires Node `^20.19.0 || >=22.12.0` and this environment runs Node `v20.12.0`, producing a `Cannot find native binding` fatal error. `knip@5` ran cleanly with an equivalent scratchpad-only config.
- Treated knip's reachability-aware analysis as authoritative over depcheck's simpler import-scan when the two disagreed (e.g., `qrcode` — depcheck missed that its only consumer, `ShareClassDialog.tsx`, is itself unreachable).
- Batched the 117 unused-exported-type findings into one reviewable "Needs Review" category (with representative spot-checks) rather than individually re-verifying all 117, since every sampled case showed the identical internal-only-usage false-positive pattern and per-symbol verification of all 117 was out of proportion to this audit's scope.

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 auto-fixes were applicable since this is a report-only audit with no code changes to make.

## Issues Encountered
- `knip@6` (the latest version, resolved by default via `npx --yes knip`) failed outright due to a native-binding/Node-version mismatch (`oxc-parser` requiring Node 20.19+/22.12+ vs. this machine's 20.12.0). Resolved by pinning `npx --yes knip@5`, which produced complete, usable JSON output. Documented in AUDIT.md's tooling notes so a future audit run knows to expect/handle this if the environment's Node version hasn't changed.

## User Setup Required

None - no external service configuration required. This is a static-analysis report; no deployment or infrastructure changes were made.

## Next Phase Readiness

AUDIT.md is ready for a human review pass and, if approved, a separate follow-up cleanup task. The report's own "Recommended Next Steps" section suggests a five-step deletion order (assets → deps → confirmed-dead exports → orphaned files → the large batch of type-only over-exports as a lower-priority, separately-scoped pass). No blockers — this audit intentionally deferred all deletion decisions to the user, per its report-only constraint. Note that the repo currently has substantial pre-existing uncommitted work (sprite-swap in progress, several `src/app/teacher/missions/*` and `assignment-operations.ts` modifications) unrelated to this audit; those were left untouched and should not be conflated with this report's findings.

---
*Phase: quick-260716-pzo*
*Completed: 2026-07-16*

## Self-Check: PASSED

- AUDIT.md exists with all 8 required sections
- SUMMARY.md exists with status: complete
- git status diff against conversation-start baseline is identical (no src/public/package mutations caused by this plan)
