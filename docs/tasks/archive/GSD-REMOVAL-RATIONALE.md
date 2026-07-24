# GSD Workflow Removal — Rationale & Record

**Date:** 2026-07-24
**Decision by:** repository owner (John)
**Scope:** global Claude config (`~/.claude`) + this project's docs

## Why GSD was removed

The project historically used the **GSD workflow** (`gsd-core`, `.planning/` state, and a
large stack of `gsd-*` Claude Code hooks) to drive planned/phased development. The owner
**stopped using GSD** some time ago because it consumed a large number of tokens, and replaced
it with a lighter home-grown skill, **`task-workflow`** (plus the read-only **`progress`**
skill). Those replacement skills are fully independent of GSD (verified: zero `gsd` references
in `~/.claude/skills/task-workflow/`).

However, GSD was never actually decoupled from the environment. It remained active through:

1. **`~/.claude/settings.json` hooks** — GSD registered ~14 hooks across `SessionStart`,
   `PreToolUse`, `PostToolUse`, `SubagentStop`, `Stop`, `PreCompact`, `FileChanged`, plus a
   GSD `statusLine`. Several (`gsd-context-monitor.js`, injection/prompt/read/workflow guards)
   fired on **every matching Bash/Edit/Write/Read/Agent/Task call** and could inject advisory
   text back into context. This was recurring, per-tool-call token overhead — the drain the
   owner had noticed.
2. **Project docs** — `AGENTS.md` and `PROJECT.md` still described `.planning/` as GSD state.
3. **Disk** — `~/.claude/gsd-core/` (6 MB), 18 `~/.claude/hooks/gsd-*` scripts, and this
   project's `.planning/` (35 MB).

## What was changed

**Token-cost removal (Tier 1):**
- Removed all `gsd-*` hooks and the GSD `statusLine` from `~/.claude/settings.json`
  (backed up to `~/.claude/gsd-removal-backup-<ts>/settings.json.bak`).
- Removed the `Bash(npx gsd-core *)` allow entry.
- Updated `AGENTS.md` and `PROJECT.md` "legacy planning records" notes to state GSD is retired
  and `.planning/` is archived. (Project `CLAUDE.md` already referenced only `task-workflow`/
  `progress` — no change needed.)

**Disk cleanup (Tier 2):**
- `.planning/` archived to `docs/tasks/archive/gsd-planning-archive-<ts>.tar.gz`
  (integrity-verified, 377 entries) before any deletion.
- Deletion of `.planning/`, the `~/.claude/hooks/gsd-*` scripts, and `~/.claude/gsd-core/`
  requires owner approval (Claude Code auto-mode classifier blocks bulk deletes); see the
  session that produced this note for status.

## Guidance for future agents

- **Do not** recreate GSD hooks, `gsd-core`, or `.planning/`, and do not treat `.planning/`
  as a source of truth. Use `task-workflow` and `progress` as the operational entrypoints.
- For historical phase context, extract the archived tarball under `docs/tasks/archive/` for a
  one-off lookup only.
- The MEMORY.md phase-state notes (Phases 1–13) predate this change; they remain valid history
  but their `.planning/`-file references now resolve inside the archive tarball, not the tree.

## Note on the trigger

This cleanup was prompted while diagnosing an unrelated issue: the `claude-security` plugin's
`Workflow` tool would not attach to sessions, blocking security scans. **GSD was investigated
and ruled out as the cause** (the GSD hooks are advisory and cannot suppress a tool). The scan
block was addressed separately by reinstalling the `claude-security` plugin; GSD removal was an
independent housekeeping decision made in the same session.
