# Local Documentation Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep durable project documentation tracked while hiding temporary agent notes in an ignored `docs/local/` workspace.

**Architecture:** Add one narrow ignore rule for `docs/local/`, move the current temporary handoff there, and commit the remaining durable document cleanup. Do not ignore or reorganize the rest of `docs/`.

**Tech Stack:** Git, Markdown, `.gitignore`

## Global Constraints

- Keep product specifications, approved designs and plans, testing guides, and archived task records tracked.
- Use `docs/local/` only for temporary handoffs, session notes, scan output, and agent scratch work.
- Do not change application code, dependencies, or runtime behavior.
- Do not push or deploy.
- Preserve the ignored local handoff after cleanup.

---

### Task 1: Establish the local documentation workspace

**Files:**
- Modify: `.gitignore`
- Delete: `.continue-here.md`
- Rename: `english-speaking-practice-app-spec.md` to `docs/english-speaking-practice-app-spec.md`
- Move locally: `docs/tasks/2026-07-28-audio-retry-and-transition-step-handoff.md` to `docs/local/2026-07-28-audio-retry-and-transition-step-handoff.md`
- Add: `docs/superpowers/plans/2026-07-31-student-access-security-remediation.md`
- Add: `docs/tasks/archive/2026-07-31-conversation-feedback-repair.md`

**Interfaces:**
- Consumes: the approved convention in `docs/superpowers/specs/2026-07-31-local-document-workspace-design.md`
- Produces: an ignored `docs/local/` workspace and a clean Git working tree

- [ ] **Step 1: Add the narrow ignore rule**

Append this block to `.gitignore`:

```gitignore
# Temporary local agent/session documentation
docs/local/
```

- [ ] **Step 2: Move the temporary handoff into the ignored workspace**

Run:

```bash
mkdir -p docs/local
mv docs/tasks/2026-07-28-audio-retry-and-transition-step-handoff.md \
  docs/local/2026-07-28-audio-retry-and-transition-step-handoff.md
```

Expected: the handoff remains available locally but disappears from ordinary
`git status` output.

- [ ] **Step 3: Verify the document classification**

Run:

```bash
git check-ignore -v docs/local/2026-07-28-audio-retry-and-transition-step-handoff.md
git show HEAD:english-speaking-practice-app-spec.md |
  cmp - docs/english-speaking-practice-app-spec.md
test -f docs/superpowers/plans/2026-07-31-student-access-security-remediation.md
test -f docs/tasks/archive/2026-07-31-conversation-feedback-repair.md
test ! -e .continue-here.md
```

Expected: every command exits 0. The app specification is byte-identical to
its tracked root version.

- [ ] **Step 4: Stage only durable documentation**

Run:

```bash
git add .gitignore \
  .continue-here.md \
  english-speaking-practice-app-spec.md \
  docs/english-speaking-practice-app-spec.md \
  docs/superpowers/plans/2026-07-31-student-access-security-remediation.md \
  docs/tasks/archive/2026-07-31-conversation-feedback-repair.md
git status --short
```

Expected: Git reports the ignore-rule modification, stale handoff deletion,
app-spec rename, and two new durable records. Nothing under `docs/local/` is
staged.

- [ ] **Step 5: Commit the cleanup**

Run:

```bash
git commit -m "docs: organize local documentation"
```

Expected: the commit succeeds without application-code or dependency changes.

- [ ] **Step 6: Verify the final repository state**

Run:

```bash
git diff --check HEAD^..HEAD
git ls-files docs/local
git status --short
```

Expected: `git diff --check` exits 0; the other two commands print nothing.
The ignored local handoff remains present on disk.
