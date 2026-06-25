# Phase 1: Data, Privacy, and Workflow Foundation - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase defines the app's source of truth before UI implementation: core data model, assignment status ownership, child voice metadata, retention fields, and demo-vs-real student data boundaries.

It should not build teacher dashboards, student login UI, mission creation UI, audio recording UI, transcription, or AI evaluation. Those belong to later roadmap phases. Phase 1 should give those later phases stable tables, enums, service boundaries, and policies to build on.

</domain>

<decisions>
## Implementation Decisions

### Data Boundaries

- **D-01:** Use a full workflow skeleton from the start. Phase 1 should model the real nouns of the homework loop: teacher, class, class-scoped student, mission, assignment, per-student assignment state, attempt, turn, transcript/evaluation fields, audio clip metadata, and review/status state.
- **D-02:** Keep many fields minimal until later phases need them, but create the core table boundaries now to avoid privacy/status rewrites.
- **D-03:** Separate mission definition from assigned homework. Teachers may edit missions later, but each assignment stores an immutable mission snapshot representing the exact version students complete.
- **D-04:** Use class-scoped student records for v1. The same child in two classes is represented as two roster records. Do not build global student identity or real student accounts in this phase.

### Status Rules

- **D-05:** Use a server-owned state machine for homework and attempt statuses. Client UI and AI providers can request actions or provide evidence, but application/server logic owns final transitions.
- **D-06:** Phase 1 should define legal statuses for per-student homework: `assigned`, `started`, `completed`, `missed`, `needs_retry`, and `teacher_review`.
- **D-07:** A scheduled due-date job should mark incomplete homework as `missed` after the due date. Do not rely on teacher manual action or read-time-only computed status as the long-term source of truth.
- **D-08:** Teachers may override automated status outcomes, but overrides must include audit data: who changed it, when it changed, previous status, new status, and a reason or reason code.

### Child Data Posture

- **D-09:** Build a pilot-ready cautious foundation even if early use starts with demo data. Assume real child data may eventually enter the system.
- **D-10:** Audio storage should be private by default. Store only short per-turn clips, not full-session recordings.
- **D-11:** Default audio retention should be 30 days. Phase 1 should include fields such as `audioExpiresAt` and deletion state so later phases can implement retention jobs cleanly.
- **D-12:** The model should support deletion/expiry tracking for audio clips from the beginning. Full consent/export workflows are not in Phase 1.

### Demo vs Real Classes

- **D-13:** Add an explicit data mode from the start, such as `dataMode: demo | real`, at the class or workspace level. Demo/sample records must be distinguishable from real student records.
- **D-14:** Do not build a polished public demo workspace in Phase 1. The goal is the schema and boundary that prevents demo/test records from mixing with real student records.

### the agent's Discretion

- The agent may choose exact table names, enum names, column names, and migration tooling as long as they preserve the decisions above and align with the researched stack.
- The agent may decide whether `dataMode` belongs on teacher workspace, class, or both, but downstream planning should explain the tradeoff and choose one clear source of truth.
- The agent may choose the exact shape of audit tables/events, but teacher overrides and status transitions must be auditable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning

- `.planning/PROJECT.md` — product purpose, core value, active requirements, constraints, and key decisions.
- `.planning/REQUIREMENTS.md` — v1 requirement IDs and Phase 1 traceability.
- `.planning/ROADMAP.md` — Phase 1 boundary, dependencies, success criteria, and requirement mapping.
- `.planning/STATE.md` — current GSD state and current focus.

### Research

- `.planning/research/SUMMARY.md` — synthesized stack, architecture, feature, and pitfall findings.
- `.planning/research/ARCHITECTURE.md` — source-of-truth model, component boundaries, status transition guidance, and build order implications.
- `.planning/research/PITFALLS.md` — privacy, AI drift, child data, audio retention, and teacher workload risks.
- `.planning/research/STACK.md` — recommended stack and version-sensitive notes.

### Original Product Context

- `english-speaking-practice-app-spec.md` — initial product spec and MVP non-goals.
- `english-speaking-practice-app-handoff.md` — early product discussion and decisions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- No implementation code exists yet.

### Established Patterns

- No code patterns exist yet.
- Planning is GSD-managed. Follow `AGENTS.md` and `.planning/ROADMAP.md`.

### Integration Points

- Phase 1 is the foundation for future Next.js/Supabase implementation.
- Later phases depend on Phase 1 exposing stable schema/status/privacy boundaries.

</code_context>

<specifics>
## Specific Ideas

- The user chose the most cautious practical options for Phase 1: full skeleton, immutable snapshots, class-scoped students, server-owned state, scheduled missed job, audited teacher overrides, pilot-ready privacy, 30-day audio retention, and explicit demo-vs-real marking.
- The user is open to future school SSO, LMS/Google Classroom-style sync, and textbook/unit mission libraries, but those are not v1 requirements and should not complicate Phase 1.

</specifics>

<deferred>
## Deferred Ideas

- Full public demo workspace UX — future enhancement after the data boundary exists.
- Full consent/export/admin compliance workflows — future pilot/school-readiness enhancement beyond Phase 1 foundation.

</deferred>

---

*Phase: 1-Data, Privacy, and Workflow Foundation*
*Context gathered: 2026-06-25*
