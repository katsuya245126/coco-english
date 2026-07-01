# Milestones

Historical record of shipped project milestones.

## v1.0 — Teacher-Linked Speaking Homework MVP

**Status:** Shipped 2026-07-01
**Branch:** `chore/reconcile-phase5-phase6-tracking`
**Phases:** 7
**Plans:** 26
**Requirements:** 60/60 verified
**Audit:** `passed` — 28/28 integration wired, 4/4 E2E flows

### Delivered

- Privacy-first classroom workflow foundation with server-owned assignment status transitions, audit events, child-voice metadata, retention fields, and real/demo data separation.
- Teacher account, class, roster, join-code/QR, remembered-class, student-name, and 4-digit PIN access flows.
- Manual mission creation, immutable mission assignment snapshots, and per-student homework records.
- Guided student mission loop with Coco, meaning-first correction, required repetition, progressive hints, and deterministic completion.
- Short per-turn audio capture, private storage, transcription, transcript-first teacher review, and on-demand signed playback.
- Bounded AI mission drafting and turn evaluation with strict schemas, confidence handling, and teacher-review routing.
- Teacher status buckets, attempt detail, audited overrides, retry reopen flow, missed-homework cron, audio purge job, and structured logging.

### Archives

- [v1.0 roadmap](milestones/v1.0-ROADMAP.md)
- [v1.0 requirements](milestones/v1.0-REQUIREMENTS.md)
- [v1.0 audit](v1.0-MILESTONE-AUDIT.md)

### Known Deferred Items At Close

These are acknowledged manual pilot-readiness checks, not implementation blockers:

| Category | Item | Status |
|----------|------|--------|
| verification | Phase 02 browser/manual sign-off items in `02-VERIFICATION.md` | human_needed |
| verification | Phase 04 device/manual sign-off items in `04-VERIFICATION.md` | human_needed |
| verification | Phase 06 live AI quality and browser draft round-trip in `06-VERIFICATION.md` | human_needed |

### Carried Technical Debt

- Dead code: legacy typed answer/repeat actions and service helpers are orphaned after the audio-upload path became the live path.
- UX gap: `missed` and `teacher_review` assignments can still appear launchable as Late cards before failing with a generic toast.
- Type gap: generated `assignment_students.Row` database type is missing some runtime columns, currently bridged with casts.
- Cosmetic UI debt from `06-UI-REVIEW.md`, including some contracted student-string and typography divergences.

### Next Step

Run `/gsd-new-milestone` to start the next requirements and roadmap cycle.
