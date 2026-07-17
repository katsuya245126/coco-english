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
