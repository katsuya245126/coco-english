# Normalize Coco Sprites and Reconcile Mission Layout

**Status:** Implementation
**Stage:** Pre-merge verification complete; local merge authorized

## Goal

Make every Coco expression attach to the dialogue box by its visible artwork boundary, without desktop face cropping, mobile floating gaps, or expression-to-expression scale jumps.

## Context and ownership

- The operator explicitly selected “Reconcile normalized sprites first” in this task.
- Session `019f6971-5098-7662-80f5-59dd076a538a` approved preserving visible artwork, normalizing transparent canvases, capping desktop size, and using one mobile/desktop attachment rule.
- `main` contains user-owned, uncommitted replacement artwork for `coco-happy-alpha.png` and `coco-thinking-alpha.png`. Those selected replacements must be preserved and must not be modified in the main checkout.
- This isolated branch owns the current mascot geometry commit and the uncommitted fluid-control preview.

## Scope

- Reconcile the selected happy/thinking replacements with the other four active alpha sprites.
- Derive a deterministic normalization rule from rendered comparisons of all six expressions.
- Normalize assets without AI regeneration or resampling the visible artwork.
- Replace magic transparent-canvas offsets with the smallest layout rule that uses the normalized visible boundary.
- Re-evaluate the uncommitted fluid mobile controls against the normalized sprites.

## Non-goals

- Dialogue pagination, Hint spinner/behavior, or conversation-generation changes.
- Editing or deleting the user’s archived/opaque sprite files on `main`.
- Merging, pushing, deploying, or mutating production.

## Done checks

- [x] Confirm the earlier session’s approved mascot direction.
- [x] Prove the happy/thinking replacements on `main` are new artwork on oversized canvases, not normalized files.
- [x] Compare safe normalization rules across all six real sprites without overwriting assets.
- [x] Select individual alpha-trim plus bottom-aligned contain as the stable rule.
- [x] Add a failing asset/layout contract before changing tracked assets or layout code.
- [x] Normalize the six selected sprites in this worktree and preserve visible pixels without resampling.
- [x] Remove superseded geometry offsets created only to compensate for transparent padding.
- [x] Verify focused tests, typecheck, lint, and `git diff --check`.
- [x] Capture labeled localhost screenshots for all expressions at desktop and mobile sizes.
- [x] Obtain visual approval before any local implementation commit or merge.

## Updated sprite diagnostic — 2026-07-19

- [x] Compare the operator's updated main-checkout sprites with the approved normalized worktree set.
- [x] Preserve the previously approved normalized sprites in `/private/tmp/coco-approved-sprites-20260718`.
- [x] Losslessly normalize and reconcile the five changed sprites; retain the byte-identical thinking sprite.
- [x] Capture fresh all-expression desktop/mobile localhost diagnostics.
- [x] Capture fresh real-mission desktop/mobile localhost evidence.
- [x] Remove the temporary diagnostic route and its generated Next type entry.
- [x] Re-run focused tests, typecheck, lint, and `git diff --check`.
- [x] Obtain visual approval for the updated sprite set.

## Verification evidence

- Main/worktree/archive alpha-bound comparison recorded 2026-07-18.
- Main happy/thinking replacements retain 1792×2400 canvases with roughly 905px transparent bottom padding.
- Active expressions have materially different artwork bounds and aspect ratios, so blind trimming is unsafe without a rendered comparison.
- Synthetic strategy comparison: `coco-normalization-strategies-synthetic.png` in the task visualization directory.
- Normalization output sizes: neutral 967×1246, happy 902×1253, celebrate 1709×1960, encouraging 1024×734, thinking 872×1254, sad 1114×1164.
- The normalizer verified the decoded RGBA pixels of every output against the corresponding source crop.
- Fresh verification on 2026-07-18: 35 focused tests passed; typecheck passed; lint passed with zero errors and the known unrelated warning in `scripts/check-student-feedback-states.mjs`; `git diff --check` passed.
- Localhost neutral-expression captures at 1440×900 and 390×844 show the full head and a 10px visible-art overlap with the dialogue border.
- The operator approved the real-mission desktop/mobile captures on 2026-07-18.
- All six expressions were then rendered through the real `MascotStage` component in a temporary localhost-only diagnostic route at desktop and mobile widths. The route was removed after capture and is not part of the implementation.
- All-expression localhost evidence: `coco-all-expressions-localhost-desktop.png` and `coco-all-expressions-localhost-mobile.png` in the task visualization directory.
- Fresh post-preview verification on 2026-07-18: 35 focused tests passed; typecheck passed after removing the preview's stale generated `.next/types` entry; lint passed with zero errors and the known unrelated warning; `git diff --check` passed.
- On 2026-07-19, neutral, happy, celebrate, encouraging, and sad changed; thinking remained byte-identical. New normalized sizes: neutral 902×1253, happy 950×1251, celebrate 1526×1254, encouraging 1155×1253, thinking 872×1254, sad 1076×1254.
- Updated localhost diagnostics: `coco-all-expressions-localhost-desktop-2026-07-19.png`, `coco-all-expressions-localhost-mobile-2026-07-19.png`, `coco-updated-localhost-mission-desktop-2026-07-19.png`, and `coco-updated-localhost-mission-mobile-2026-07-19.png` in the task visualization directory.
- Fresh 2026-07-19 verification after removing the diagnostic route: 35 focused tests passed; typecheck passed; lint passed with zero errors and the known unrelated warning; `git diff --check` passed.
- The operator approved the updated 2026-07-19 desktop/mobile diagnostics on 2026-07-19.
- The operator explicitly authorized a local commit on `codex/coco-mascot-layout` on 2026-07-19. This does not authorize merge, push, deployment, or production mutation.
- The approved implementation was committed locally on `codex/coco-mascot-layout` on 2026-07-19. No merge, push, deployment, or production mutation was performed.
- Pre-merge full-suite verification initially exposed one stale `mascot-layout.test.ts` assertion for the superseded 16px overlap. The contract was updated to the approved 10px geometry; the final full suite passed 720 tests with 4 skipped across 82 files.
- The operator explicitly authorized a local merge into `main` on 2026-07-19. This does not authorize push, deployment, or production mutation.

## Current position

The visually approved implementation is committed locally on `codex/coco-mascot-layout` with the corrected 10px geometry contract and a passing full suite. It uses the operator's 2026-07-19 sprite set, losslessly normalized, bottom-aligned `contain`, and the approved fluid mobile controls. Fresh real-mission and all-expression localhost evidence is approved. A local merge into `main` is authorized; no push or deployment is authorized.

## Next action

Preserve `main`'s unrelated dirty changes and overlapping raw sprite sources, merge `codex/coco-mascot-layout` into `main` locally, verify the merged result, then clean up the owned worktree and feature branch. Do not push, deploy, or mutate production.
