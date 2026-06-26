# Phase 4: Guided Student Attempt Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-27
**Phase:** 4-Guided Student Attempt Loop
**Areas discussed:** Answer stand-in (input + evaluation), Turn & completion rules (resume + repeat gate), Hints & buddy bounds, Mobile flow & shell entry

The user selected "All" gray areas, then chose the recommended option in each turn.

---

## Answer Input (pre-Phase-5 voice)

| Option | Description | Selected |
|--------|-------------|----------|
| Typed text input | Student types the answer; fills the same `original_transcript`/`repeat_transcript` fields voice will later populate. Lowest rework, fully testable. | ✓ |
| Disabled 'record' placeholder | Show real but disabled voice UI; produces no answer text, can't exercise recast/repeat end-to-end. | |
| Tappable canned answers | Pick from pre-written samples; deterministic but unrealistic + throwaway sample data. | |

**User's choice:** Typed text input
**Notes:** Chosen so Phase 5 voice swaps onto the same transcript fields without touching flow logic.

---

## Placeholder Evaluation (pre-Phase-6 AI)

| Option | Description | Selected |
|--------|-------------|----------|
| Accept-any (non-empty) | Any non-empty answer is "understood"; always show improved sentence + require repeat. Evaluation is a clean Phase-6 swap point; never blocks a child on stand-in logic. | ✓ |
| Simple keyword/length check | Cheap deterministic gate that can recast; throwaway and risks unfairly rejecting a real answer. | |
| Always recast once, then accept | Force one recast cycle regardless of input; hard-codes behavior real AI won't follow. | |

**User's choice:** Accept-any (non-empty)
**Notes:** Placeholder result recorded in `attempt_turns.evaluation` jsonb for Phase 6 to replace.

---

## Resume Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Resume same attempt where left off | Re-entry continues the in-progress attempt at the next unfinished turn; completed turns stay done. | ✓ |
| Restart attempt from turn 1 | Returning starts over; prior partial attempt abandoned. Punishes dropped connections. | |
| Ask: resume or restart | Show a choice on return; extra decision screen for elementary users. | |

**User's choice:** Resume same attempt where left off
**Notes:** Matches `started` status already being set; one attempt per assignment until completion.

---

## Repeat Gate (FLOW-05/06)

| Option | Description | Selected |
|--------|-------------|----------|
| Repeat required, accept-any non-empty | Repeat mandatory to advance; any non-empty repeat accepted (`repeat_accepted=true`). Phase 6 swaps real closeness scoring. | ✓ |
| Repeat optional this phase | Lets student skip repeat; fails FLOW-05. | |
| Repeat required + loose match check | Require repeat + deterministic text match; throwaway logic, can unfairly block a child. | |

**User's choice:** Repeat required, accept-any non-empty
**Notes:** Consistent with the original-answer rule; deterministic completion contract for Phase 6 to build on.

---

## Hint Effect (FLOW-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Record only, no penalty | Hints reveal in order; record `highest_hint_level` but never block/downgrade completion. | ✓ |
| Full-example hint flags teacher review | Tier-3 routes to teacher_review; adds outcome branching better left to Phase 6/7, may discourage help use. | |
| Hints gated until after an attempt | Must try once before hints unlock; adds friction not required by FLOW-07. | |

**User's choice:** Record only, no penalty
**Notes:** Matches supportive, non-punitive tone (CHAR-02) and "review states not grades". Teacher visibility is Phase 7.

---

## Buddy Source & AI-06 Bounding

| Option | Description | Selected |
|--------|-------------|----------|
| Fully scripted from snapshot | Coco's questions ARE snapshot prompts; recasts/encouragement from a fixed template set. No chat endpoint exists → AI-06 enforced structurally. | ✓ |
| Scripted prompts + small canned variations | Larger phrasing pool for variety; more copy to review, no real benefit pre-AI. | |
| Stub LLM call behind a flag | Wire real chat call now (canned output); pre-builds Phase 6 plumbing but introduces AI/drift surface a phase early. | |

**User's choice:** Fully scripted from snapshot
**Notes:** Also satisfies CHAR-04 — character profile (static lines/tone) is separate from mission logic.

---

## Turn Layout (PILOT-01)

| Option | Description | Selected |
|--------|-------------|----------|
| One focused screen per step | Each step its own full-width card with one clear action; input stays above keyboard; "turn X of N" indicator. | ✓ |
| Scrolling chat thread | Messaging-style stack; invites open-ended chat mental model (tension with AI-06), space contention on small screens. | |
| Single long mission form | All turns on one scrollable page; overwhelming for kids, weakens guided pacing. | |

**User's choice:** One focused screen per step
**Notes:** Makes the required-repeat step unmissable; lowest cognitive load for elementary users.

---

## Home List & Closed/Expired Handling

| Option | Description | Selected |
|--------|-------------|----------|
| List with clear per-item state | List assignments with Start / Continue / Done / Closed-Expired badges; open items launch, done/closed are non-launchable; no-homework copy becomes empty-state fallback. | ✓ |
| Only the active mission, hide the rest | Show one open assignment, launch straight in; can't reach multiple concurrent assignments (Phase 3 D-11). | |
| Auto-launch newest, list as fallback | Jump into most recent open mission; surprising, skips the child's "start" choice. | |

**User's choice:** List with clear per-item state
**Notes:** Closed/expired is read-time display only based on `due_at`; Phase 4 does NOT flip status to `missed` (auto-miss is Phase 7 / ASGN-05).

---

## Claude's Discretion

- Exact student route structure and how the unlock-cookie gate extends to mission routes.
- Whether per-turn steps are client-state in one route or sub-routes (must honor resume + one-screen-per-step).
- Precise server-action surface (start attempt / submit answer / submit repeat / reveal hint / complete), all server-owned via service-role client.
- Shape of the `attempt_turns.evaluation` placeholder jsonb and the character-profile module/template format.
- Any minor schema additions strictly needed (extend, don't redesign).
- Visual/styling specifics (to be driven by a `04-UI-SPEC.md` from `/gsd-ui-phase 4`).

## Deferred Ideas

- Real voice capture / recording / upload (FLOW-03, AUDIO-*, PILOT-02) — Phase 5.
- Real AI turn evaluation + AI mission generation (AI-01..05, MISS-02/03/05) — Phase 6.
- Teacher review buckets / attempt detail / overrides (REV-01..04, REV-06) — Phase 7.
- Auto-miss overdue homework → missed (ASGN-05) — Phase 7.
- Character picker / multi-character cast UI — later / v2.
