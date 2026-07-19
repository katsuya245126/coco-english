# Worktree-aware UAT launcher design

**Date:** 2026-07-19
**Status:** Approved

## Problem

Coco English currently uses `npm run dev` from the repository root for local
development on `main`, normally at `http://localhost:3000`. An ngrok tunnel to
port 3000 therefore exposes `main` to a phone even when the feature being tested
lives in a separate Git worktree. Clearing `.next` only rebuilds the checkout
that owns the port; it does not move worktree changes into `main`.

Typing a worktree-specific `npm --prefix ...` command is error-prone and does
not scale as worktrees are created and removed.

## Goal

Provide one reusable command, `npm run uat`, that lets the user select any Coco
English checkout—including `main`—and serves that checkout on a permanent UAT
port. ngrok can remain pointed at that port while the selected checkout changes.

## Non-goals

- Starting, stopping, configuring, or authenticating ngrok.
- Merging, switching, creating, deleting, or modifying Git worktrees.
- Copying or reading `.env.local` or any other secret file.
- Clearing `.next` caches.
- Silently terminating an existing development server.
- Replacing the normal `npm run dev` workflow.

## User workflow

### Normal local development

The existing workflow remains unchanged:

```bash
npm run dev
```

This serves the repository-root checkout, normally `main`, on port 3000.

### Phone UAT

ngrok is started separately and kept pointed at the fixed UAT port:

```bash
ngrok http 3200
```

The user then runs:

```bash
npm run uat
```

The launcher displays all Coco English worktrees as a numbered list. Each entry
shows its branch name and enough of its path to distinguish it from the others.
The repository-root checkout is included and labeled `main` when it is on the
main branch.

After the user selects an entry, the launcher prints the selected branch,
absolute checkout path, current commit, and UAT URL. It then runs that checkout's
existing development command on `http://localhost:3200`.

The ngrok URL continues forwarding to port 3200. Switching versions means
stopping `npm run uat`, running it again, selecting another checkout, and
refreshing the phone browser. ngrok does not need to restart.

To test `main` through UAT, the user first stops any `npm run dev` process already
serving the same root checkout on port 3000, then selects `main` in `npm run uat`.
This avoids competing Next.js development processes sharing one `.next`
directory.

## Launcher behavior

The launcher is a small repository-owned Node.js command invoked through the
root `package.json`.

1. Resolve the repository root without assuming the current shell directory.
2. Read `git worktree list --porcelain` and retain only checkouts belonging to
   this repository.
3. Resolve a readable branch label for every checkout. Detached checkouts remain
   selectable but are labeled clearly.
4. Present a deterministic numbered list and require an explicit selection.
5. Reject invalid or empty selections without starting a server.
6. Before launch, check whether port 3200 is occupied. If it is, report the
   conflict and exit without killing anything.
7. Detect whether another process currently holds the selected checkout's
   Next.js development lock. Explain that the user must stop that server first;
   do not treat the mere presence of a stale lock file as proof, and do not
   terminate any process automatically.
8. Check only whether `.env.local` exists in the selected checkout. If absent,
   warn that local environment setup may be required, but continue because the
   environment may be supplied another way. Do not inspect, copy, print, or
   symlink secret contents.
9. Start `npm run dev -- -p 3200` with the selected checkout as the working
   directory. Forward terminal input/output and shutdown signals normally.

The command must work for worktrees outside `.claude/worktrees`; Git is the
source of truth for discovery.

## Safety and failure handling

- The selected branch, checkout path, commit, and port are printed before the
  server starts so the UAT environment is auditable.
- An occupied port, missing checkout, stale worktree record, missing dependency
  installation, active Next.js development lock, or failed child process
  produces a concise actionable error and a non-zero exit status. A missing
  `.env.local` produces a warning only.
- The launcher never edits Git state, worktree contents, dependencies, caches,
  environment files, or running processes.
- No student access values, API keys, or other secrets are logged.

## Testing

Automated tests cover the launcher logic without starting a real Next.js server:

- parsing multiple `git worktree list --porcelain` entries;
- labeling `main`, named branches, detached heads, and paths outside
  `.claude/worktrees`;
- deterministic selection and invalid-selection failures;
- construction of the selected checkout's development command;
- occupied-port and active-development-lock failures plus the missing-environment
  warning;
- confirmation that no destructive process or Git operation is issued.

A manual smoke check verifies that selecting the pagination worktree serves it on
port 3200, selecting `main` serves `main` after the port-3000 process is stopped,
and an ngrok tunnel already targeting port 3200 continues to work across that
switch.

## Success criteria

- The user can start phone UAT with `npm run uat` without typing or editing a
  worktree path.
- The launcher can serve either `main` or any discovered worktree on port 3200.
- The same ngrok tunnel remains usable when the selected checkout changes.
- The existing `npm run dev` behavior remains unchanged.
- The launcher refuses ambiguous or unsafe startup conditions with actionable
  messages and without changing external state.
