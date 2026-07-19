# Human-readable UAT menu labels and Exit option

**Status:** Approved design awaiting written-spec review

## Goal

Make `npm run uat` identify each checkout by its purpose rather than internal branch and filesystem names, and let the user leave the menu without starting a server.

## User experience

The menu keeps `main` first and adds `Exit` last:

```text
Select the checkout to serve for phone UAT:
1. Main
2. Worktree-aware UAT launcher
3. Pin serverless functions to Seoul region
4. Dynamic dialogue pagination and open follow-ups
5. Restore hints and clear Coco face
6. Record repeat-step target-sentence fix
7. Exit
Selection:
```

The menu does not show branch names or paths by default. After a checkout is selected, the launcher continues to print its branch, absolute path, commit, and UAT URL before starting Next.js.

Selecting `Exit` prints `Exited. No server was started.`, returns exit code 0, and performs no port, lock, dependency, environment, or server-launch work.

## Label resolution

`main` always displays as `Main`. Other worktrees use the first available purpose label in this order:

1. The first Markdown H1 in the worktree's root `TASK.md`.
2. The subject of the worktree's latest Git commit.
3. A cleaned branch name.
4. The worktree directory name for a detached checkout with no other label.

Automatic branch cleanup removes the known `worktree-` and `claude/` prefixes, replaces hyphens and underscores with spaces, removes a trailing hyphenated hexadecimal identifier of at least six characters, trims repeated whitespace, and capitalizes the first character. It does not maintain a manual label registry.

Only the first single-line H1 is read from `TASK.md`; no environment files or secrets are read. A missing or unreadable task file and a failed Git-subject lookup are ordinary fallback conditions, not launcher errors.

If two worktrees resolve to the same label when compared case-insensitively, each duplicate receives its worktree directory name in brackets so the user can distinguish them. Unique labels remain free of technical suffixes.

## Architecture and data flow

Git porcelain parsing and deterministic root-first sorting remain unchanged. A small label-resolution layer enriches the parsed records before the menu is printed:

1. Parse and sort worktree records.
2. Resolve one purpose label per record using injected filesystem and Git-subject readers.
3. Disambiguate duplicate labels.
4. Print worktree choices followed by `Exit`.
5. Parse the numbered selection as either a checkout, Exit, or invalid input.
6. For a checkout, run the existing preflight and launch path unchanged.
7. For Exit or invalid input, return before preflight. Exit returns 0; invalid input keeps the existing exit code 1.

Pure formatting, cleanup, duplicate handling, and selection logic stay in `scripts/uat-worktree-lib.mjs`. Filesystem and Git command access stay in `scripts/uat-worktree.mjs` and are injected into `runUatLauncher` for deterministic tests.

## Error handling

- Missing or malformed `TASK.md`: fall back to the latest commit subject.
- Failed or empty commit-subject lookup: fall back to the cleaned branch or directory name.
- Duplicate purpose labels: append directory-name disambiguators.
- Invalid number or non-numeric input: print the existing invalid-selection message, return 1, and do not run preflight.
- Exit: print the exit confirmation, return 0, and do not run preflight.
- Existing checkout, dependency, port, lock, and environment handling remains unchanged.

## Testing

Focused tests will verify:

- `Main` is fixed and first.
- `TASK.md` H1 wins over commit subject and branch name.
- Missing task metadata falls back to commit subject, then cleaned branch, then detached directory.
- Prefix, separator, whitespace, and generated-suffix cleanup is deterministic.
- Duplicate labels receive stable directory disambiguators.
- Exit is printed last, returns 0, and invokes none of the preflight or launch dependencies.
- Invalid selections remain errors and never launch.
- Checkout selection still prints provenance and launches the fixed port-3200 command.

Verification will run the focused launcher tests, the full test suite, typecheck, lint, and an interactive smoke check covering Exit and one real checkout selection.

## Non-goals

- Manual worktree naming or a label configuration file.
- Renaming, removing, unlocking, or otherwise managing worktrees from the launcher.
- Hiding checkout provenance after selection.
- Changing port 3200, ngrok behavior, `npm run dev`, or application behavior.
