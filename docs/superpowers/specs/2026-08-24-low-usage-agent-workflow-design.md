# Low-Usage Agent Workflow Design

## Goal

Reduce Codex usage in Coco English without weakening implementation quality,
security checks, or final verification.

## Design

Add a short usage-efficiency section to `AGENTS.md` and one dependency-free
`npm run test:agent` command.

The instructions will require agents to:

- give subagents compact, task-specific context by default and inherit full
  history only when the task cannot be summarized safely;
- reuse existing subagents for follow-up work;
- run narrow tests during implementation and the full suite once for the final
  commit state;
- reuse verification tied to an unchanged commit and working tree instead of
  rerunning it solely to create a PR;
- complete a parent spec/standards preflight before formal parallel review, so
  the formal review normally runs once on the final diff;
- prefer targeted searches and line ranges over dumping large files or diffs;
- use compact non-interactive test output unless diagnosing a failure.

`test:agent` will run Vitest once with its compact dot reporter. It adds no
dependency and does not replace the existing `test` command.

## Boundaries

- Repository-only; no global Codex configuration changes.
- No application behavior, test semantics, or CI command changes.
- Security, authorization, data-loss prevention, and accessibility checks are
  never reduced to save usage.
- A changed commit, working tree, environment, or relevant dependency invalidates
  cached verification evidence and requires the appropriate checks again.
- Explicit user instructions and required skill workflows still take precedence.

## Verification

- Run `npm run test:agent` and confirm the suite result matches the normal test
  command's expected test count.
- Run `npm run typecheck` after changing `package.json`.
- Confirm the `AGENTS.md` rules are concise, unambiguous, and do not contradict
  its existing verification or delegation requirements.
