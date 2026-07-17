# Lightweight Claude Code and Codex Workflow Design

**Date:** 2026-07-17
**Scope:** Project development workflow and agent context management
**Status:** Implemented and verified

## Problem

The current repository carries a large GSD planning history, overlapping status sources, and always-on instructions that can consume context without reliably describing the current feature. Some planning records have also drifted from the code and Git history. This makes it harder for Claude Code or Codex to answer three basic questions consistently:

1. What are we building now?
2. What has actually been completed?
3. What should happen next, using which model and effort level?

The replacement must preserve useful project history while making the active workflow smaller, easier to inspect, and compatible with both Claude Code and Codex.

## Goals

- Keep the active project context small and controlled.
- Convert ordinary requests into clear goals, constraints, and completion checks.
- Require approval for consequential plans without interrupting bounded routine work.
- Reuse existing specialist skills instead of rebuilding their procedures.
- Delegate only independent, low-risk work and keep delegated context narrow.
- Recommend an appropriate model and effort level without treating public benchmarks as universal truth.
- Provide a read-only progress command for the current feature.
- Warn when context is becoming crowded and recommend a clean handoff.
- Preserve GSD and `.planning/` as a backup during the transition.

## Non-Goals

- Recreating GSD under a different name.
- Loading the full planning archive into every conversation.
- Automatically choosing expensive models for every task.
- Maintaining multiple simultaneous active task documents.
- Inventing progress percentages from subjective estimates.
- Letting subagents make product or architecture decisions independently.
- Deleting GSD skills, `.planning/`, or historical specifications during the initial rollout.

## Approved Source-of-Truth Hierarchy

The lightweight workflow uses the following hierarchy:

1. Code, tests, and Git describe what actually exists.
2. Root `TASK.md` describes the intent and status of the one active feature.
3. Root `PROJECT.md` describes stable product scope, architecture, and constraints.
4. Root `AGENTS.md` contains concise cross-platform operating rules.
5. Root `CLAUDE.md` contains only Claude-specific discovery and command guidance.
6. `docs/tasks/archive/` contains completed task briefs for historical lookup.
7. `.planning/` remains a legacy backup and is not read by default.

When these sources disagree, the agent must report the mismatch. It must not silently treat an old status document as more accurate than code, tests, or Git.

## Active Files

### `PROJECT.md`

`PROJECT.md` is the compact project map. It contains the product purpose, current architecture, important constraints, verification commands, and pointers to deeper documentation. It should remain stable and avoid feature-level progress notes.

### `TASK.md`

Normal feature work uses one root `TASK.md`. Its sections are:

- Goal
- Context
- Constraints
- Non-goals
- Done when
- Plan and checklist
- Decisions
- Verification
- Current position
- Next step

The task file is updated at meaningful milestones, not after every command. When the task is complete, it moves to `docs/tasks/archive/YYYY-MM-DD-task-name.md` with status `Complete`. If it must be paused to switch features, it moves to the same archive with status `Paused`; resuming it moves it back to root `TASK.md`. Tiny, obvious maintenance changes may proceed without creating `TASK.md` when they do not affect product behavior, architecture, security, privacy, or multiple systems.

Only one active task is allowed. If a new unrelated feature arrives, the workflow must finish, archive, or explicitly pause the current task before replacing it.

### Agent instruction files

`AGENTS.md` is short and cross-platform. It explains the source hierarchy, approval rules, verification expectations, and how to find project-local skills. It does not duplicate detailed skill procedures.

`CLAUDE.md` is a thin Claude Code wrapper. It points Claude to the same project files and explains Claude-specific commands such as `/context`, `/compact`, and `/clear`. Shared policy remains outside this wrapper.

## `task-workflow` Skill

The `task-workflow` skill is a traffic controller, not a complete development methodology. It may be invoked explicitly or triggered by ordinary requests to build, change, fix, investigate, or plan project work.

At the beginning of a task it:

1. Reads only the minimum project context required.
2. Classifies the request as tiny, normal, or consequential.
3. Creates or resumes `TASK.md` when appropriate.
4. Restates the goal, constraints, and completion checks in plain language.
5. Selects the relevant existing specialist skill.
6. Recommends a platform, model, effort level, and delegation strategy.
7. Identifies whether user approval is required before implementation.

The coordinator reuses existing skills where available:

- Brainstorming for unclear product or design work.
- Writing plans for multi-step implementation.
- Systematic debugging for defects and regressions.
- Test-driven development for code changes.
- Requesting code review for important work.
- Verification before completion before claiming success.
- Handoff when work pauses or context becomes crowded.

At the end of a working segment it states the current result, the next concrete action, the recommended model and effort for that action, and whether the session should continue, compact, or restart.

## Approval Policy

Tiny and normal work may proceed after the workflow has made the intended outcome and completion checks visible. The agent must request plan approval before implementing work that materially affects:

- Product scope or user behavior with multiple reasonable interpretations.
- Architecture or data ownership.
- Authentication, authorization, privacy, security, or student data.
- Database migrations or destructive operations.
- Broad changes spanning multiple subsystems.
- External deployment, billing, or irreversible state.

Clarification is required only when the missing answer could materially change the result. Routine implementation details remain the agent's responsibility.

## Delegation Policy

Subagents are optional and selective. The main agent owns the task, decisions, integration, and final verification.

Good delegation targets include bounded repository searches, mechanical edits in separate files, focused test runs, documentation lookup, and independent reviews. Product judgment, architecture decisions, ambiguous debugging, and overlapping file edits remain with the main agent.

Rules:

- Use at most two routine subagents concurrently.
- Use up to three independent reviewers only when deliberate review is valuable.
- Give each subagent a narrow prompt and only the files or facts it needs.
- Prefer a smaller or cheaper model for mechanical work.
- Do not allow recursive delegation.
- Do not let two agents edit the same files concurrently.
- Summarize useful findings back into the main task instead of dumping full trajectories into context.

## Model and Effort Recommendations

Both workflow skills use one on-demand reference, `docs/ai/model-routing.md`. The reference records its update date, current model roles, public evidence, known limitations, and Coco English observations. It is not loaded on every turn.

Every recommendation must include:

- Platform and model.
- Effort level.
- One-sentence reason.
- The condition that would justify escalating or switching.

Initial Codex guidance:

- Sol Medium for ordinary development.
- Sol High for difficult implementation, debugging, or planning.
- Sol XHigh for high-value work after Medium or High proves insufficient.
- Sol Max only for exceptional single-agent depth.
- Terra High for cheaper bounded subagent work.
- Luna only for exact, repetitive, low-risk work with deterministic verification.

Initial Claude guidance follows current Anthropic role guidance and available subscription quota: use smaller models for routine bounded work and reserve stronger models such as Fable for genuinely difficult tasks. Exact model names and effort defaults remain dated guidance rather than permanent rules.

The public DeepSWE v1.1 leaderboard is a useful secondary signal. Its July 2026 results support Sol Medium as a strong default and Sol High as strong hard-task value. However, DeepSWE runs all models through `mini-swe-agent`, measures API cost rather than subscription quota, focuses on long-horizon open-source tasks, and does not directly measure native Codex or Claude Code behavior. Project-specific results must eventually outweigh leaderboard and Reddit opinions.

The workflow must never claim that a benchmark proves one model is always better. If a model repeatedly needs reprompting, misses project conventions, or fails verification on Coco English, the routing reference should record that evidence and adjust future recommendations.

## `progress` Skill

The separate `progress` skill is read-only. It triggers when the user asks where a feature stands, what remains, whether work is blocked, or what should happen next. It defaults to the active feature; it gives a broader project view only when requested.

It reads, in order:

1. `TASK.md` for intended feature state.
2. Git branch, status, recent commits, and relevant diff summary.
3. Code and tests when needed to verify a claimed milestone.
4. `PROJECT.md` for stable project context.
5. `.planning/STATE.md` and `.planning/ROADMAP.md` only as clearly labeled legacy fallback when no active lightweight task exists during migration.

Its output contains:

- Current feature and stage.
- Completed work.
- Work in progress.
- Remaining work.
- Blockers and risks.
- Git state.
- Verification state.
- Context health or the command needed to inspect it.
- One recommended next action.
- Recommended model and effort for that action.

The stage vocabulary is discovery, planning, awaiting approval, implementation, verification, review, blocked, or complete. The skill shows a numeric percentage only when an explicit checklist makes it calculable, such as six of nine items complete. Otherwise it reports the stage and checklist without fabricating precision.

The skill never edits `TASK.md`, implementation files, Git state, or planning records. If status information is stale or contradictory, it says so and lowers its confidence.

## Context Management

The workflow treats context as a limited working set:

- Read summaries and targeted files before broad archives.
- Keep large research, logs, and historical plans out of always-on instructions.
- Pass subagents bounded context and return concise findings.
- Use Claude Code `/context` or Codex `/status` to inspect usage when available.
- Give an early warning as context approaches roughly 70%.
- Compact or create a handoff after the current milestone when continuing the same task.
- Start a fresh session, or use Claude `/clear`, when switching to an unrelated task.
- Never pretend to know the context percentage when the platform does not expose it.

## Claude Code and Codex Compatibility

The workflow has one canonical project policy. Canonical project-local skills live in `.agents/skills/task-workflow/` and `.agents/skills/progress/`. Claude Code receives minimal discovery wrappers in `.claude/skills/task-workflow/` and `.claude/skills/progress/` that load the canonical instructions instead of copying their full procedures. The implementation plan must verify discovery in both tools before replacing the current workflow.

Expected explicit invocations are `$task-workflow` and `$progress` in Codex, and `/task-workflow` and `/progress` in Claude Code. Natural-language project requests should also trigger the relevant skill without requiring the user to paste a setup prompt each time.

## GSD Transition

The initial rollout is reversible:

- Keep `.planning/` unchanged as a legacy backup.
- Keep installed GSD skills available but optional.
- Remove mandatory GSD enforcement from active project instructions only after the lightweight files and skills validate successfully.
- Do not import all historical GSD records into the new active documents.
- Seed `PROJECT.md` from verified current architecture and product constraints.
- Seed the first `TASK.md` from the actual active feature and Git evidence, not solely from `.planning/STATE.md`.
- Label any legacy fallback clearly so it cannot be mistaken for current truth.

## Failure and Drift Handling

- If `TASK.md` claims completion but tests or Git disagree, report the mismatch and return the task to verification.
- If the working tree contains unrelated user changes, preserve them and scope all work around them.
- If no active task exists, `progress` reports that fact and suggests creating one through `task-workflow`.
- If model availability changes, recommend by role and update the dated routing reference rather than failing on a hard-coded name.
- If a specialist skill is unavailable, use the smallest safe fallback workflow and state the substitution.

## Verification and Acceptance Criteria

Before the lightweight workflow replaces mandatory GSD behavior:

1. Validate both skill packages structurally.
2. Confirm Codex discovers and invokes both skills.
3. Confirm Claude Code discovers and invokes both wrappers.
4. Run `task-workflow` on one tiny request, one normal feature, and one consequential hypothetical request; verify the approval boundary differs correctly.
5. Run `progress` against an active task, a completed task, no task, and deliberately inconsistent task/Git evidence.
6. Confirm `progress` performs no writes.
7. Confirm subagent guidance prevents recursion and overlapping edits.
8. Confirm model recommendations include effort, reason, and escalation criteria while citing dated evidence.
9. Confirm context warnings never invent usage data.
10. Confirm `.planning/` and installed GSD skills remain intact.

The rollout succeeds when an ordinary feature request can start without a repeated setup prompt, the user can see and approve consequential plans, either tool can report trustworthy feature progress, and active context no longer depends on the full GSD archive.

## Research Basis

- [Anthropic: steering Claude Code with skills, hooks, rules, and subagents](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more)
- [Anthropic: Claude model and effort level guidance](https://claude.com/blog/claude-model-and-effort-level-in-claude-code)
- [OpenAI: how OpenAI uses Codex](https://openai.com/business/guides-and-resources/how-openai-uses-codex/)
- [OpenAI: Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [DeepSWE v1.1 leaderboard](https://deepswe.datacurve.ai/)
- [DeepSWE methodology and limitations](https://deepswe.datacurve.ai/blog/deepswe)
- [Reddit discussion of GPT-5.6, Claude Code, and the DeepSWE chart](https://www.reddit.com/r/ClaudeCode/comments/1ux4bbf/did_gpt56_break_claude_codes_moat_where_does/)
