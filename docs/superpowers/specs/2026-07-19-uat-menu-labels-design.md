# Human-readable UAT menu labels and Exit option

**Status:** Implemented and verified

## Goal

Make `npm run uat` identify each checkout by its purpose rather than internal branch and filesystem names, and let the user leave the menu without starting a server.

## User experience

The menu keeps `main` first and adds `Exit` last:

```text
Select the checkout to serve for phone UAT:
1. Main
2. Worktree-aware UAT launcher
3. Pin serverless functions to Seoul region
4. Dynamic dialogue pagination
5. Phase11 dynamic conversation repair
6. Record repeat-step target-sentence fix
7. UAT menu labels
8. Exit
Selection:
```

The menu does not show branch names or paths by default. After a checkout is selected, the launcher continues to print its branch, absolute path, commit, and UAT URL before starting Next.js.

Selecting `Exit` prints `Exited. No server was started.`, returns exit code 0, and performs no port, lock, dependency, environment, or server-launch work.

## Label resolution

The worktree whose branch is `main` always displays as `Main` and sorts first, even when the launcher itself is running from a linked feature worktree.

For a descriptive non-main branch, the cleaned branch is the stable purpose label. Descriptive cleanup removes the known `worktree-`, `codex/`, and `claude/` prefixes; replaces hyphens and underscores with spaces; trims repeated whitespace; capitalizes the first character; and renders the standalone token `uat` as `UAT`. Examples:

- `codex/uat-menu-labels` → `UAT menu labels`
- `worktree-dynamic-dialogue-pagination` → `Dynamic dialogue pagination`
- `worktree-phase11-dynamic-conversation-repair` → `Phase11 dynamic conversation repair`

A branch is treated as generated rather than descriptive only when it matches `worktree-agent-<hex>` or `claude/<slug>-<hex>`, where `<hex>` is at least six hexadecimal characters. Detached worktrees use the same generated-name fallback path. Generated or detached worktrees use the first available label in this order:

1. The first Markdown H1 in the worktree's root `TASK.md`, but only when the entire task file is readable and differs from main's root `TASK.md`.
2. The subject of the worktree's latest Git commit.
3. The cleaned generated branch name, or the worktree directory name when detached.

If main's task file is missing or unreadable, a non-main task title is not trusted because inherited ownership cannot be proven; resolution continues to the commit subject. This prevents completed feature worktrees—which restore main's unrelated task during closeout—from being mislabeled.

Latest-commit labels remove a leading conventional-commit type and optional scope, including forms such as `perf:`, `fix(11):`, and `docs(quick):`, then trim whitespace and capitalize the first character. A subject with no recognized prefix keeps its wording and receives the same capitalization.

Only the first single-line H1 is extracted from an eligible `TASK.md`; no environment files or secrets are read. Missing, unreadable, inherited, or malformed task files and failed Git-subject lookups are ordinary fallback conditions, not launcher errors.

If two worktrees resolve to the same label when compared case-insensitively, duplicates receive their worktree directory name in brackets so the user can distinguish them. The real `main` record always remains exactly `Main`; when another worktree also resolves to `Main`, only the other record receives a suffix. Unique labels remain free of technical suffixes.

## Architecture and data flow

Git porcelain parsing remains unchanged. Sorting changes from launcher-root-first to `main`-branch-first, with the launcher root retained only as the fallback first choice when no `main` branch is present. A small label-resolution layer enriches the parsed records before the menu is printed:

1. Parse and sort worktree records.
2. Read main's root task file once as the inherited-task baseline when available.
3. Classify each non-main branch as descriptive or generated.
4. Resolve one purpose label per record using pure branch cleanup plus injected task-file and Git-subject readers.
5. Disambiguate duplicate labels.
6. Print worktree choices followed by `Exit`.
7. Parse the numbered selection as either a checkout, Exit, or invalid input.
8. For a checkout, run the existing preflight and launch path unchanged.
9. For Exit or invalid input, return before preflight. Exit returns 0; invalid input keeps the existing exit code 1.

Pure formatting, cleanup, duplicate handling, and selection logic stay in `scripts/uat-worktree-lib.mjs`. Filesystem and Git command access stay in `scripts/uat-worktree.mjs` and are injected into `runUatLauncher` for deterministic tests.

## Error handling

- Descriptive branch: use its cleaned branch label without consulting task or commit metadata.
- Generated or detached checkout with a distinct readable task: use its task H1.
- Missing, malformed, unreadable, or inherited `TASK.md`: fall back to the latest commit subject.
- Missing or unreadable main `TASK.md`: do not trust non-main task ownership; fall back to commit subject.
- Failed or empty commit-subject lookup: fall back to the cleaned branch or directory name.
- Duplicate purpose labels: append directory-name disambiguators.
- Invalid number or non-numeric input: print the existing invalid-selection message, return 1, and do not run preflight.
- Exit: print the exit confirmation, return 0, and do not run preflight.
- Existing checkout, dependency, port, lock, and environment handling remains unchanged.

## Testing

Focused tests will verify:

- `Main` is fixed and first.
- `codex/uat-menu-labels` displays as `UAT menu labels` even when its restored `TASK.md` is byte-identical to main's unrelated task.
- Descriptive branches use stable cleaned branch labels.
- Generated branches use a distinct task H1, then commit subject, then cleaned generated branch.
- An inherited task identical to main is skipped.
- Missing main task data prevents non-main task titles from being trusted.
- Prefix, separator, whitespace, and generated-suffix cleanup is deterministic.
- Sorting returns equality for the same record and preserves the clarified main/repoRoot ranking.
- Duplicate labels receive stable directory disambiguators.
- Exit is printed last, returns 0, and invokes none of the preflight or launch dependencies.
- Invalid selections remain errors and never launch.
- Invalid-selection tests prove that all port, lock, checkout, dependency, environment, and launch dependencies are skipped.
- Checkout selection still prints provenance and launches the fixed port-3200 command.

Verification will run the focused launcher tests, the full test suite, typecheck, lint, and an interactive smoke check covering Exit and one real checkout selection.

## Non-goals

- Manual worktree naming or a label configuration file.
- A general worktree-to-task ownership schema beyond inherited-main detection.
- Additional duplicate-label hardening beyond the existing directory suffix behavior.
- Renaming, removing, unlocking, or otherwise managing worktrees from the launcher.
- Hiding checkout provenance after selection.
- Changing port 3200, ngrok behavior, `npm run dev`, or application behavior.
