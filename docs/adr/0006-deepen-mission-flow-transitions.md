---
status: accepted
---

# Deepen Mission flow transitions

Mission-flow state reconstruction and transition policy live in one pure
`mission-transitions` module. Its public seam is
`reconstructMissionFlow(...)` plus `transitionMissionFlow(state, event)`, with
the existing Active-question chronology helpers reused inside the module.
The state keeps the current turn, feedback, retry, Coco-line, and dynamic
prompt fields together so resume, retry, advance, completion, and canonical
reset decisions have one owner.

The React shell remains an adapter for recording, network and action calls,
audio URL cleanup, stale-result protection, routing, state application, and
rendering. A completion decision carries the candidate state, but the shell
applies it only after `completeMissionAction` succeeds. No effect framework or
student-visible flow change is introduced.
