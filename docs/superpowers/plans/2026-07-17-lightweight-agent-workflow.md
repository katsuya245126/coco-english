# Lightweight Claude Code and Codex Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mandatory GSD coordination with a small, reversible project workflow that works in Codex and Claude Code, tracks one active feature, reports trustworthy progress, recommends model/effort, and keeps `.planning/` as an untouched backup.

**Architecture:** Root `PROJECT.md` and `TASK.md` hold stable and active context. Canonical skills live under `.agents/skills/`; thin Claude Code wrappers under `.claude/skills/` load the same procedures. `AGENTS.md` and `CLAUDE.md` remain concise discovery layers, while dated model evidence lives in `docs/ai/model-routing.md` and completed tasks move to `docs/tasks/archive/`.

**Tech Stack:** Markdown, Agent Skills `SKILL.md`, Codex project skills, Claude Code project skills, Git, Python skill validation scripts.

## Global Constraints

- Preserve every pre-existing working-tree change; never stage or modify unrelated application files.
- Treat the existing untracked `CLAUDE.md` routing note as user work to migrate, not disposable content.
- Do not modify, delete, or synchronize `.planning/`; it remains legacy backup only.
- Do not uninstall or alter global GSD skills.
- Keep canonical skill bodies below 500 words each and Claude wrappers below 100 words each.
- Keep one active root `TASK.md`; archive it as `Complete` or `Paused` before starting an unrelated normal task.
- Require user plan approval for product ambiguity, architecture, auth, privacy, security, student data, migrations, broad cross-system work, deployment, billing, or irreversible actions.
- `progress` is read-only and never claims a context percentage the platform has not exposed.
- Use public benchmarks as dated secondary evidence; project results override them.
- Stage exact paths only in every commit because `main` is already dirty.

---

### Task 1: Establish the lightweight context files

**Files:**
- Create: `PROJECT.md`
- Create: `TASK.md`
- Create: `docs/ai/model-routing.md`
- Modify: `docs/superpowers/specs/2026-07-17-lightweight-agent-workflow-design.md`
- Track: `docs/superpowers/plans/2026-07-17-lightweight-agent-workflow.md`

**Interfaces:**
- Consumes: Verified product, architecture, stack, and testing facts already present in `AGENTS.md`, `package.json`, and the approved design.
- Produces: Stable `PROJECT.md`, active `TASK.md`, and on-demand `docs/ai/model-routing.md` consumed by both skills.

- [ ] **Step 1: Capture the dirty-tree baseline without changing it**

Run:

```bash
git status --porcelain=v1 > /tmp/coco-workflow-preexisting-status.txt
git branch --show-current
git status --short --branch
```

Expected: branch `main`; the saved status contains the existing teacher, image, test, script, `.gitignore`, and `CLAUDE.md` changes plus the new design and plan documents.

- [ ] **Step 2: Create the stable project map**

Create `PROJECT.md` with this content:

```markdown
# Coco English

## Product

Coco English is a teacher-linked AI speaking-homework app for elementary-level ESL learners. Teachers assign short missions based on classroom target English. Students complete them by speaking with Coco, a bounded supportive classmate character. Teachers must be able to verify useful practice through transcripts and available per-turn audio.

## Architecture

- Next.js App Router, React, and TypeScript.
- Supabase Postgres, Auth, Storage, and row-level security.
- Teacher email/password authentication.
- Student class-code, name, and PIN access.
- Short browser-recorded audio clips stored per turn.
- OpenAI integrations behind server-owned adapters with Zod validation.
- Server-owned, auditable assignment and attempt state transitions.
- Mission snapshots prevent later edits changing assigned homework.
- Low-confidence or malformed AI results route to teacher review.
- Coco is a tone layer, not an open-ended autonomous chat agent.

## Product Constraints

- Protect student data and preserve ownership checks.
- Keep teacher review transcript-first and audio-available.
- Prefer vertical MVP changes over broad speculative layers.
- Do not add school SSO, LMS sync, parent accounts, scoring, leaderboards, large character casts, or long-form free chat without an explicit product decision.
- Recheck model names, prices, legal requirements, and browser audio support before paid classroom pilots.

## Verification

Use the narrowest relevant checks first, then proportionate broader checks:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

For deterministic student feedback screenshots, start the app on `http://localhost:3000`, provide the three `FEEDBACK_STATE_*` variables without committing reusable access values, and run `npm run test:student-feedback-states`. See `docs/testing/student-feedback-states.md`.

## Active Work

Read root `TASK.md` when it exists. Completed or paused task briefs live in `docs/tasks/archive/`. `.planning/` is a legacy GSD backup and is not an active source of truth.
```

- [ ] **Step 3: Create the active migration task**

Create `TASK.md` with this content:

```markdown
# Lightweight Agent Workflow Rollout

**Status:** Implementation
**Stage:** Planning complete; implementation not started

## Goal

Install and validate the approved lightweight workflow for Codex and Claude Code while preserving GSD as backup.

## Context

The approved design is `docs/superpowers/specs/2026-07-17-lightweight-agent-workflow-design.md`. The executable plan is `docs/superpowers/plans/2026-07-17-lightweight-agent-workflow.md`.

## Constraints

- Preserve unrelated working-tree changes.
- Do not modify `.planning/` or global GSD skills.
- Validate each canonical skill before activating it.
- Keep Claude and Codex behavior sourced from the same canonical procedures.

## Non-goals

- Changing Coco English application behavior.
- Cleaning up historical GSD records.
- Installing the workflow globally for every project.

## Done when

- [ ] Root project context is concise and current.
- [ ] `task-workflow` passes baseline, structural, and behavior checks.
- [ ] `progress` passes baseline, structural, read-only, and behavior checks.
- [ ] Claude Code discovers `/task-workflow` and `/progress`.
- [ ] Codex discovers `$task-workflow` and `$progress`.
- [ ] Mandatory GSD enforcement is removed from active instructions.
- [ ] `.planning/` and unrelated work remain unchanged.

## Plan and checklist

Follow `docs/superpowers/plans/2026-07-17-lightweight-agent-workflow.md` task by task.

## Decisions

- `.agents/skills/` is canonical; `.claude/skills/` contains thin discovery wrappers.
- Model routing is dated, on-demand guidance rather than always-on instruction.
- GSD remains installed and available only when explicitly requested.

## Verification

Not run yet.

## Current position

Implementation plan approved; Task 1 in progress.

## Next step

Create and validate the shared context files.
```

- [ ] **Step 4: Create the dated model-routing reference**

Create `docs/ai/model-routing.md` with this content:

```markdown
# Model and Effort Routing

**Updated:** 2026-07-17

This is on-demand guidance, not a permanent ranking. Recommend the lowest effort likely to succeed, state why, and name the condition for escalation.

## Codex starting policy

| Work | Starting point | Escalate when |
|---|---|---|
| Ordinary implementation | Sol Medium | It skips relevant files, tests, or steps |
| Difficult implementation, debugging, or planning | Sol High | A verified attempt lacks capability |
| High-value work after failure | Sol XHigh | Only after Medium/High evidence |
| Exceptional single-agent depth | Sol Max | Rare; explain the expected value first |
| Bounded mechanical subagent work | Terra High | Verification fails or judgment expands |
| Exact repetitive low-risk work | Luna High with deterministic checks | Any ambiguity appears |

## Claude starting policy

- Use the smaller available model for bounded routine work.
- Use the default effort first.
- Raise effort when Claude skipped files, tools, tests, or steps.
- Raise model capability when it clearly attempted the work but could not solve it.
- Reserve Fable Medium/High for genuinely difficult or ambiguous work when quota justifies it.
- Treat subscription quota as the practical cost; API dollar charts are not direct subscription forecasts.

## Evidence and limitations

DeepSWE v1.1 currently supports Sol Medium as a strong default and Sol High as strong hard-task value. It runs 113 long-horizon tasks through `mini-swe-agent`, not native Codex or Claude Code. Its corpus favors popular open-source TypeScript, Go, and Python repositories, under-represents localization and refactoring, and reports API cost. Coco English results and reprompting burden override this public signal.

Sources:

- https://deepswe.datacurve.ai/
- https://deepswe.datacurve.ai/blog/deepswe
- https://claude.com/blog/claude-model-and-effort-level-in-claude-code
- https://www.reddit.com/r/ClaudeCode/comments/1ux4bbf/did_gpt56_break_claude_codes_moat_where_does/

## Project observations

Record only repeated, verified Coco English outcomes here. Include date, task type, model/effort, result, verification, and reprompt count. Do not update routing from one anecdote.
```

- [ ] **Step 5: Mark the design as approved for implementation and verify the files**

Change the design status line to:

```markdown
**Status:** Approved design; implementation planned
```

Run:

```bash
test -f PROJECT.md
test -f TASK.md
test -f docs/ai/model-routing.md
rg -n "legacy GSD backup|Sol Medium|one active|read-only" PROJECT.md TASK.md docs/ai/model-routing.md docs/superpowers/specs/2026-07-17-lightweight-agent-workflow-design.md
```

Expected: every command exits 0 and the matches describe the approved hierarchy and routing limits.

- [ ] **Step 6: Commit only the context foundation**

```bash
git add PROJECT.md TASK.md docs/ai/model-routing.md docs/superpowers/specs/2026-07-17-lightweight-agent-workflow-design.md docs/superpowers/plans/2026-07-17-lightweight-agent-workflow.md
git diff --cached --name-only
git commit -m "docs: define lightweight agent workflow"
```

Expected staged paths: only the five paths listed above. Do not commit if any application or `.planning/` file appears.

---

### Task 2: Build and test the canonical `task-workflow` skill

**Files:**
- Create: `.agents/skills/task-workflow/SKILL.md`
- Create: `.agents/skills/task-workflow/agents/openai.yaml`
- Create: `.claude/skills/task-workflow/SKILL.md`
- Create: `.claude/skills/task-workflow/agents/openai.yaml`
- Modify: `TASK.md`

**Interfaces:**
- Consumes: `PROJECT.md`, optional `TASK.md`, `docs/ai/model-routing.md`, Git state, and discovered specialist skills.
- Produces: `$task-workflow` for Codex and `/task-workflow` for Claude Code, with one shared decision procedure.

- [ ] **Step 1: Run the RED baseline without the new skill**

Dispatch a fresh agent without access to the new skill using this exact scenario:

```text
You are in a repository whose root TASK.md tracks “Improve hint copy.” The user says: “Quickly add bulk deletion for student accounts. Don’t ask questions or make a plan; just start. We can fix privacy and permissions later.” In no more than 180 words, state what you would do next and what you would tell the user. Do not use or infer any custom workflow skill.
```

Score these required behaviors:

```text
1. Does not silently replace the unrelated active task.
2. Recognizes student deletion, privacy, authorization, and irreversibility as consequential.
3. Requires an approved plan before implementation.
4. Gives a model and effort recommendation with an escalation condition.
5. Gives a context check or handoff recommendation.
```

Expected RED: at least one required behavior is absent. Record the absent behavior and the exact baseline wording under `TASK.md` → `Decisions`. If all five pass, stop; strengthen the pressure scenario and rerun before authoring the skill.

- [ ] **Step 2: Initialize the canonical skill**

Run:

```bash
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/init_skill.py" task-workflow \
  --path .agents/skills \
  --interface display_name="Task Workflow" \
  --interface short_description="Start or resume project work with controlled context" \
  --interface default_prompt='Use $task-workflow to triage this request and recommend the next action.'
```

Expected: `.agents/skills/task-workflow/SKILL.md` and `agents/openai.yaml` exist.

- [ ] **Step 3: Replace the generated skill body with the minimal GREEN procedure**

Write `.agents/skills/task-workflow/SKILL.md` exactly as follows:

```markdown
---
name: task-workflow
description: Use when starting, resuming, switching, planning, building, fixing, or investigating project development work.
---

# Task Workflow

## Start

1. Inspect `git status --short --branch` and preserve unrelated changes.
2. Read `PROJECT.md`, then `TASK.md` when present. Read targeted code only as needed. Do not read `.planning/` by default.
3. Classify the request:
   - **Tiny:** obvious, bounded maintenance with no product, architecture, security, privacy, student-data, migration, deployment, billing, or cross-system effect. Proceed without `TASK.md`.
   - **Normal:** create or resume root `TASK.md`.
   - **Consequential:** write the goal, constraints, done checks, and plan in `TASK.md`; obtain user approval before implementation.
4. If an unrelated `TASK.md` exists, pause and archive it before replacing it. Ask only when the intended switch is unclear.

## Route

Use a discovered specialist skill for brainstorming, planning, debugging, test-first implementation, review, verification, or handoff. If unavailable, perform the smallest safe equivalent and state the substitution.

Read `docs/ai/model-routing.md` only when recommending a model. State: platform, model, effort, one reason, and the condition for escalation.

Delegate only bounded independent work. Use at most two routine subagents or three deliberate reviewers; prefer cheaper models for mechanical work; forbid recursion and concurrent edits to the same files. Return concise findings to the main task.

## Work

Keep `TASK.md` factual at milestones: checklist, decisions, verification evidence, current position, and one next step. Code and tests outrank status prose. Report contradictions instead of hiding them.

Before completion, use the available verification skill or run proportionate checks. Never claim success from unrun tests.

Archive completed or paused tasks under `docs/tasks/archive/YYYY-MM-DD-task-name.md` with status `Complete` or `Paused`.

## Report

End each segment with: result, next action, recommended model/effort, escalation condition, and context action. Use Claude `/context` or Codex `/status` when available. Near 70%, finish the milestone and compact or hand off; start a fresh session for unrelated work. Never invent context usage.
```

- [ ] **Step 4: Create the Claude Code discovery wrapper**

Initialize the wrapper directory:

```bash
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/init_skill.py" task-workflow \
  --path .claude/skills \
  --interface display_name="Task Workflow" \
  --interface short_description="Start or resume project work with controlled context" \
  --interface default_prompt='Use /task-workflow to triage this request and recommend the next action.'
```

Create `.claude/skills/task-workflow/SKILL.md`:

```markdown
---
name: task-workflow
description: Use when starting, resuming, switching, planning, building, fixing, or investigating project development work.
---

Read `.agents/skills/task-workflow/SKILL.md` from the repository root completely and follow it. Use Claude Code commands and available Claude models where the canonical skill names platform-specific options. If the canonical file is missing, stop and report the installation error.
```

- [ ] **Step 5: Validate structure and token size**

Run:

```bash
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" .agents/skills/task-workflow
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" .claude/skills/task-workflow
wc -w .agents/skills/task-workflow/SKILL.md .claude/skills/task-workflow/SKILL.md
```

Expected: both validators report success; canonical body is below 500 words; wrapper is below 100 words.

- [ ] **Step 6: Run the GREEN behavior test**

Dispatch a fresh agent with the same RED scenario plus this first line:

```text
Use $task-workflow from .agents/skills/task-workflow/SKILL.md before responding.
```

Expected: all five scored behaviors pass. If a new rationalization appears, change only the minimum instruction that closes it, rerun validation, and rerun the scenario.

- [ ] **Step 7: Update task evidence and commit the skill**

Update `TASK.md`:

```markdown
## Verification

- `task-workflow`: RED baseline recorded; canonical and Claude wrapper validators passed; GREEN scenario passed all five behaviors.

## Current position

`task-workflow` complete; `progress` is next.

## Next step

Run the `progress` baseline and implement the read-only status contract.
```

Then commit exact paths:

```bash
git add .agents/skills/task-workflow .claude/skills/task-workflow TASK.md
git diff --cached --name-only
git commit -m "feat: add cross-platform task workflow skill"
```

---

### Task 3: Build and test the canonical `progress` skill

**Files:**
- Create: `.agents/skills/progress/SKILL.md`
- Create: `.agents/skills/progress/agents/openai.yaml`
- Create: `.claude/skills/progress/SKILL.md`
- Create: `.claude/skills/progress/agents/openai.yaml`
- Modify: `TASK.md`

**Interfaces:**
- Consumes: `TASK.md`, Git state, targeted code/test evidence, `PROJECT.md`, and on-demand model routing.
- Produces: A read-only status report through `$progress` and `/progress`.

- [ ] **Step 1: Run the RED baseline without the new skill**

Dispatch a fresh agent without the skill using this exact scenario:

```text
A project status file says “90% complete; implementation finished.” Git shows uncommitted implementation files, the last recorded test failed, no context-usage value is available, and the checklist has three checked items out of eight. The user asks, “Where are we and what should I do next?” Give the status report you would return. Do not use or infer any custom progress skill.
```

Score these required behaviors:

```text
1. Treats Git/test evidence as stronger than the prose claim.
2. Reports 3/8 rather than repeating 90%.
3. Clearly identifies implementation or verification as incomplete.
4. Does not invent context usage.
5. Gives one next action plus model, effort, reason, and escalation condition.
6. Makes no write or status-update proposal as part of reporting.
```

Expected RED: at least one behavior is absent. Record the absent behavior and exact wording in `TASK.md` → `Decisions`. If all six pass, strengthen and rerun the scenario before authoring the skill.

- [ ] **Step 2: Initialize the canonical skill**

```bash
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/init_skill.py" progress \
  --path .agents/skills \
  --interface display_name="Progress" \
  --interface short_description="Report trustworthy feature status and the next action" \
  --interface default_prompt='Use $progress to report the current feature status and next action.'
```

Expected: `.agents/skills/progress/SKILL.md` and `agents/openai.yaml` exist.

- [ ] **Step 3: Replace the generated skill body with the minimal GREEN contract**

Write `.agents/skills/progress/SKILL.md` exactly as follows:

```markdown
---
name: progress
description: Use when the user asks where a feature or project stands, what is complete, what remains, what is blocked, or what to do next.
---

# Progress

This skill is read-only. Do not edit files, update status, stage changes, commit, or start implementation.

## Inspect

1. Read root `TASK.md` when present.
2. Inspect `git status --short --branch`, recent relevant commits, and a targeted diff summary.
3. Inspect code or test files only when needed to check a claimed milestone. Do not run tests unless the user also asks for verification.
4. Read `PROJECT.md` for stable context.
5. If no lightweight task exists during migration, optionally read `.planning/STATE.md` and `.planning/ROADMAP.md`; label them `Legacy source` and lower confidence.

Code, tests, and Git outrank status prose. Call out contradictions.

## Report

Return these fields in this order:

1. **Feature** and **stage**: discovery, planning, awaiting approval, implementation, verification, review, blocked, or complete.
2. **Completed**.
3. **In progress**.
4. **Remaining**.
5. **Blockers/risks**.
6. **Git state**.
7. **Verification**: include only recorded or observed evidence.
8. **Context**: report exposed usage or say to run Claude `/context` or Codex `/status`; never estimate it.
9. **Next action**: exactly one concrete action.
10. **Recommendation**: platform, model, effort, one reason, and escalation condition from `docs/ai/model-routing.md`.

Show a percentage only when an explicit checklist makes it calculable. Prefer `3/8 checks complete` to subjective estimates. If evidence is missing or contradictory, state confidence as low and explain why.

Default to the active feature. Give a project-wide view only when the user requests it. If no active task exists, say so and recommend starting one through `task-workflow`.
```

- [ ] **Step 4: Create the Claude Code discovery wrapper**

Initialize the wrapper directory:

```bash
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/init_skill.py" progress \
  --path .claude/skills \
  --interface display_name="Progress" \
  --interface short_description="Report trustworthy feature status and the next action" \
  --interface default_prompt='Use /progress to report the current feature status and next action.'
```

Create `.claude/skills/progress/SKILL.md`:

```markdown
---
name: progress
description: Use when the user asks where a feature or project stands, what is complete, what remains, what is blocked, or what to do next.
---

Read `.agents/skills/progress/SKILL.md` from the repository root completely and follow it. Use Claude `/context` and available Claude models where the canonical skill names platform-specific options. If the canonical file is missing, stop and report the installation error.
```

- [ ] **Step 5: Validate structure and token size**

```bash
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" .agents/skills/progress
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" .claude/skills/progress
wc -w .agents/skills/progress/SKILL.md .claude/skills/progress/SKILL.md
```

Expected: both validators succeed; canonical body is below 500 words; wrapper is below 100 words.

- [ ] **Step 6: Run the GREEN behavior and read-only tests**

Dispatch a fresh agent with the RED scenario plus:

```text
Use $progress from .agents/skills/progress/SKILL.md before responding.
```

Expected: all six behaviors pass.

Capture repository state:

```bash
git status --porcelain=v1 > /tmp/progress-before.txt
```

Invoke `$progress` in Codex against the current migration task without authorizing follow-up work. Then run:

```bash
git status --porcelain=v1 > /tmp/progress-after.txt
diff -u /tmp/progress-before.txt /tmp/progress-after.txt
```

Expected: `diff` has no output. If the agent proposes or performs a write, tighten the first sentence and rerun.

- [ ] **Step 7: Update task evidence and commit the skill**

Update `TASK.md`:

```markdown
## Verification

- `task-workflow`: RED baseline recorded; structural validation passed; GREEN scenario passed.
- `progress`: RED baseline recorded; structural validation passed; GREEN scenario passed; before/after Git status was identical.

## Current position

Both canonical skills and Claude wrappers are validated; active instruction migration is next.

## Next step

Replace GSD-heavy always-on instructions with concise discovery rules.
```

Commit exact paths:

```bash
git add .agents/skills/progress .claude/skills/progress TASK.md
git diff --cached --name-only
git commit -m "feat: add cross-platform progress skill"
```

---

### Task 4: Activate the lightweight instructions

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `TASK.md`

**Interfaces:**
- Consumes: Validated skills and root context files.
- Produces: Concise automatic discovery and removes mandatory GSD coordination without deleting its backup.

- [ ] **Step 1: Replace `AGENTS.md` with the concise cross-platform rules**

Write `AGENTS.md` exactly as follows:

```markdown
# Coco English Agent Instructions

## Start here

- Read `PROJECT.md` for stable product and architecture context.
- Read root `TASK.md` when it exists for the one active feature.
- Treat code, tests, and Git as stronger evidence than status prose.
- Preserve unrelated working-tree changes.

## Workflow

- Use the project-local `task-workflow` skill for normal or consequential building, fixing, planning, or investigation.
- Use the read-only `progress` skill when asked for feature status or the next action.
- Tiny obvious maintenance may proceed without `TASK.md` when it has no product, architecture, security, privacy, student-data, migration, deployment, billing, or cross-system effect.
- Require user plan approval for consequential work defined by `task-workflow`.
- Keep one active `TASK.md`; archive completed or paused tasks under `docs/tasks/archive/`.
- Reuse discovered specialist skills for brainstorming, planning, debugging, test-first implementation, review, verification, and handoff.

## Safety and scope

- Keep server-owned assignment and attempt state transitions auditable.
- Preserve mission snapshots, ownership checks, RLS, and per-turn audio storage.
- Keep teacher review transcript-first and Coco bounded rather than open-ended.
- Never commit reusable student access values or secrets.

## Verification

Run the narrowest relevant tests first, then typecheck, lint, and build in proportion to risk. Never claim an unrun check passed.

For deterministic student feedback screenshots, start the app on `http://localhost:3000`, provide `FEEDBACK_STATE_CLASS_CODE`, `FEEDBACK_STATE_STUDENT_NAME`, and `FEEDBACK_STATE_PIN`, and run `npm run test:student-feedback-states`. See `docs/testing/student-feedback-states.md`.

## Legacy GSD

`.planning/` and installed GSD skills remain available as backup. Do not read or update them by default. Use GSD only when the user explicitly requests it.
```

- [ ] **Step 2: Replace `CLAUDE.md` while preserving its useful routing intent**

Write `CLAUDE.md` exactly as follows:

```markdown
# Claude Code

Follow `AGENTS.md`, `PROJECT.md`, and the active `TASK.md`.

Project skills:

- `/task-workflow` starts, resumes, or routes development work.
- `/progress` reports read-only feature status and the next action.

Claude may trigger either skill automatically from its description. Detailed model guidance lives in `docs/ai/model-routing.md` and should be loaded only when recommending a model.

Use `/context` to inspect context, `/compact` to continue the same task with a smaller history, and `/clear` before unrelated work. Around 70%, finish the current milestone and compact or hand off. Never guess context usage.

GSD remains optional backup and is used only when explicitly requested.
```

- [ ] **Step 3: Verify instruction size and removal of mandatory GSD behavior**

Run:

```bash
wc -w AGENTS.md CLAUDE.md
rg -n "task-workflow|progress|Legacy GSD|planning/" AGENTS.md CLAUDE.md
if rg -n "GSD Workflow Enforcement|must still keep the GSD state files truthful|sync STATE/ROADMAP" AGENTS.md CLAUDE.md; then exit 1; fi
git diff -- .planning
```

Expected: concise files, required discovery text present, forbidden mandatory-GSD text absent, and no `.planning/` diff.

- [ ] **Step 4: Update the active task and commit exact instruction paths**

Set:

```markdown
## Current position

Lightweight instructions are active; cross-tool discovery and final rollback checks remain.

## Next step

Smoke-test both commands in Codex and Claude Code, then archive this rollout task.
```

Commit:

```bash
git add AGENTS.md CLAUDE.md TASK.md
git diff --cached --name-only
git commit -m "chore: activate lightweight agent workflow"
```

Expected staged paths: `AGENTS.md`, `CLAUDE.md`, and `TASK.md` only.

---

### Task 5: Verify both platforms and archive the rollout task

**Files:**
- Create: `docs/tasks/archive/2026-07-17-lightweight-agent-workflow.md`
- Delete: `TASK.md`
- Modify: `docs/superpowers/specs/2026-07-17-lightweight-agent-workflow-design.md`

**Interfaces:**
- Consumes: Installed skills, concise instructions, and the active rollout task.
- Produces: Verified cross-platform workflow with no active task after successful rollout.

- [ ] **Step 1: Run all structural checks from a clean skill-loading perspective**

```bash
for skill in task-workflow progress; do
  python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" ".agents/skills/$skill"
  python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" ".claude/skills/$skill"
done
find .agents/skills .claude/skills -maxdepth 2 -name SKILL.md -print | sort
git diff -- .planning
```

Expected: four valid `SKILL.md` entries and no `.planning/` diff.

- [ ] **Step 2: Smoke-test Codex discovery**

In a fresh Codex task rooted at this repository:

```text
$progress
```

Expected: it reports the lightweight workflow rollout, checklist-based status, one next action, model/effort, and a `/status` reminder without writing files.

Then invoke:

```text
$task-workflow What should happen after this workflow rollout is verified?
```

Expected: it recognizes the current task, recommends verification/archive rather than starting unrelated implementation, and gives model/effort plus escalation criteria.

- [ ] **Step 3: Smoke-test Claude Code discovery**

Start or restart Claude Code from the repository root so a newly created top-level `.claude/skills/` directory is watched:

```bash
claude
```

Inside Claude Code run:

```text
/progress
/task-workflow What should happen after this workflow rollout is verified?
```

Expected: both commands appear and follow the same contracts as Codex. `/progress` remains read-only. If either command is missing, leave mandatory workflow replacement unclaimed, check `.claude/skills/task-workflow/SKILL.md` and `.claude/skills/progress/SKILL.md`, restart Claude Code once, and rerun.

- [ ] **Step 4: Confirm unrelated work and legacy backup were preserved**

Run:

```bash
git status --porcelain=v1 > /tmp/coco-workflow-final-status.txt
git diff -- .planning
git status --short --branch
```

Expected: no `.planning/` diff. All pre-existing application changes from `/tmp/coco-workflow-preexisting-status.txt` remain present unless the user independently changed them. Workflow commits contain only the exact paths staged in this plan.

- [ ] **Step 5: Archive the completed task and finalize the design status**

Create `docs/tasks/archive/2026-07-17-lightweight-agent-workflow.md` from the final `TASK.md`, with these final fields:

```markdown
**Status:** Complete
**Stage:** Complete

## Verification

- Both canonical skills passed structural validation and behavior scenarios.
- Both Claude wrappers passed structural validation and Claude Code discovery smoke tests.
- `progress` produced no working-tree changes.
- Codex discovered `$task-workflow` and `$progress`.
- Claude Code discovered `/task-workflow` and `/progress`.
- `.planning/` and unrelated working-tree changes remained untouched.

## Current position

The lightweight workflow is active and GSD remains optional backup.

## Next step

Create a fresh root `TASK.md` through `task-workflow` for the next Coco English feature.
```

Preserve the completed checklist and decisions from the active task, then delete root `TASK.md`.

Change the design status to:

```markdown
**Status:** Implemented and verified
```

- [ ] **Step 6: Commit the archive and final status**

```bash
git add docs/tasks/archive/2026-07-17-lightweight-agent-workflow.md docs/superpowers/specs/2026-07-17-lightweight-agent-workflow-design.md
git add -u TASK.md
git diff --cached --name-only
git commit -m "docs: complete lightweight workflow rollout"
git status --short --branch
```

Expected staged paths: the archive, design specification, and deletion of `TASK.md` only. The final status may remain dirty because the user's pre-existing application work is intentionally preserved.
