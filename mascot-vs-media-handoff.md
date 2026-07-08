# Handoff: Mascot vs. Generated-Media Dilemma (v2.3)

## Context
v2.3 of the roadmap ("Coco Comes Alive") was originally scoped as a VN-style animated mascot: a 2D Coco cat character, waist-up, with expression sprites (idle/happy/celebrate/encouraging) that react live to student answers, synced to TTS speaking state. This was fully planned — research, UI-SPEC, validation strategy, pattern map, and a 4-plan/3-wave phase plan are all committed to `main` (see `.planning/phases/` for Phase 10 docs), and the 7 cat sprites are already committed as assets. **None of the mascot UI has actually been built yet** — the plan sits ready for `/gsd-execute-phase 10`, and a separate `phase-10-mascot-wip` branch exists but hasn't diverged from main.

Before executing that plan, the user paused to reconsider the whole approach.

## The Alternative Idea
Instead of an illustrated cartoon mascot, use AI-generated images/video of the user (the actual teacher) placed into situations tied to the grammar pattern being taught — e.g., generating "you, at a restaurant" scenes the way one would for a VN-style comic panel. This isn't hypothetical: the user already does this informally for PowerPoint concept reviews (generating images of themselves in funny situations), and reports students respond well to it. The idea would replace Coco-the-character with the teacher-as-character, likely requiring an eventual app rename since "Coco" wouldn't make sense anymore (that renaming question is explicitly parked, not being decided now).

A related but distinct idea also surfaced and was intentionally parked for a separate future brainstorm: using the pronunciation data already being collected (Phase 9, Azure Speech Assessment scores) to generate targeted remediation videos once a student shows a consistent weak sound — different trigger, different content type, different success check than the general scene-media idea, so it shouldn't be designed as the same mechanism.

## The Real Fork: Personal Tool vs. Distributable Product
Nearly every trade-off between the two approaches collapses into one upstream question the user hasn't resolved: **is this staying a personal tool for the user's 6 students, or is there real intent to distribute it (Play Store / App Store, other teachers' classrooms)?**

- If it stays personal: generated-media-of-the-teacher wins clearly. It's already validated in the classroom, sidesteps the user's self-assessed weakness at character/mascot design, and solves "showing a situation" for free (character and scene arrive in one generated asset, no separate background-art pipeline needed).
- If real distribution is the goal: the mascot becomes close to necessary. Strangers who've never met the teacher can't relate to a real person's likeness the way the user's own students can; a multi-teacher platform can't reuse one teacher's face; and real-person-likeness content raises consent/privacy/COPPA-adjacent questions a fictional mascot never triggers.

One consideration doesn't split cleanly along this fork: letting teachers/users bring their own material into a lesson (custom content authoring) is a separate, orthogonal feature that could work under either character approach — it surfaced as "also useful" but isn't evidence for one side over the other.

## Pros / Cons Summary

**Mascot (Coco cartoon):**
- Pros: scales to strangers, no likeness/consent issues, runtime-reactive expression state (cheap per-interaction), one-time asset cost already sunk (sprites exist), fits a future standalone-VN identity.
- Cons: user is unsure they can design an appealing character (unvalidated taste risk), situations require a separate background-art pipeline the current plan deliberately scoped away (D-06: one fixed background, no per-scene variants), more engineering (expression state machine, audio-amplitude sync, perf-degrade path), no evidence yet it lands with actual students.

**Generated media (teacher-in-scenes):**
- Pros: already validated via the PowerPoint habit, situation + character arrive in one asset, sidesteps the character-design risk, simpler runtime (content library + assignment vs. live state machine), flexible (new situation = new generation, not new code).
- Cons: doesn't scale to strangers, blocks/complicates any distribution ambition, real-likeness consent/privacy questions, pre-produced rather than runtime-reactive (can't respond to what the student just said), unproven whether an occasional PowerPoint habit survives as a systematic per-mission production pipeline.

## Status
No decision made. This is an open dilemma, deliberately left unresolved pending the user's answer to the personal-vs-distributable question. Nothing on `main` needs to change yet — the Phase 10 docs and sprite assets are committed but inert (no UI built), so either direction remains fully available without unwinding any shipped code.

## Next Step (when ready)
Resolve the personal-vs-distributable question first. That answer should make the mascot-vs-media choice close to automatic. Once resolved, re-enter brainstorming to either (a) proceed with `/gsd-execute-phase 10` as planned, or (b) restart v2.3's design around generated-media scenes (and separately address the app-identity/naming question this would raise).
