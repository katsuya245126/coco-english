# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Teacher-Linked Speaking Homework MVP

**Shipped:** 2026-07-01
**Phases:** 7 | **Plans:** 26

### What Was Built

- End-to-end teacher-linked speaking homework loop from class setup through teacher review.
- Student access without accounts using class code/QR, remembered class, roster name selection, and 4-digit PIN.
- Guided voice mission flow with Coco, short audio evidence, transcription, structured AI evaluation, and review routing.
- Pilot operations for missed homework, retention/deletion, structured logging, and audited teacher overrides.

### What Worked

- Vertical phase sequencing kept privacy, classroom identity, assignment state, voice evidence, AI, and review concerns separated until each foundation was verified.
- Fake-client AI and transcription adapters kept automated tests paid-call-free while preserving source-contract coverage.
- Goal-backward verification caught missing Phase 5/6 verification artifacts before milestone close.

### What Was Inefficient

- Phase 5 and Phase 6 were initially marked complete without `VERIFICATION.md`, forcing late reconciliation.
- Some manual UAT and verification states used different artifacts, making milestone readiness harder to read.
- UI review findings for Phase 6 were generated late and not fully reconciled before close.

### Patterns Established

- Server-owned status transitions with audit events are the source of truth for assignment lifecycle changes.
- Student audio remains private by default; teacher playback uses short-lived signed URLs on demand.
- AI outputs must be strict-schema validated and routed to teacher review on ambiguity instead of pretending certainty.
- Mission snapshots protect assigned homework from later mission edits.

### Key Lessons

1. Every phase needs a closeout artifact pair that clearly distinguishes automated goal verification from human/pilot UAT.
2. Manual pilot checks should be recorded as explicit deferred items before milestone completion, not rediscovered during archival.
3. Generated DB types should be refreshed or patched as part of schema-changing phases to avoid cast debt accumulating.

### Cost Observations

- Model mix: planning and verification used stronger models; implementation used balanced execution.
- Sessions: multiple GSD sessions over 2026-06-25 through 2026-07-01.
- Notable: fake-client adapters avoided paid OpenAI calls during automated test runs.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | multiple | 7 | Established vertical MVP delivery with phase-level plans, summaries, UAT, validation, and verification artifacts. |

### Cumulative Quality

| Milestone | Requirements | Integration | E2E Flows |
|-----------|--------------|-------------|-----------|
| v1.0 | 60/60 verified | 28/28 wired | 4/4 complete |

### Top Lessons

1. Treat missing verification artifacts as blockers before milestone close.
2. Keep pilot-only human checks visible as deferred items if they are not required for code completion.
