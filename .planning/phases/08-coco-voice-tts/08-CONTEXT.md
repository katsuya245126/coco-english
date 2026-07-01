# Phase 8: Coco Voice (TTS) - Context

**Gathered:** 2026-07-01T11:44:45Z
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 delivers v2.1 Coco Voice: students hear Coco's mission-flow lines spoken aloud during the existing student attempt flow, with cache-first OpenAI TTS, replay, and low-end-device playback through a standard HTML audio element. This phase should make Coco feel present without changing the v1 homework loop, status machinery, recording/transcription path, teacher review model, mascot layer, pronunciation scoring, or dynamic chat behavior.

</domain>

<decisions>
## Implementation Decisions

### Playback Timing
- **D-01:** Coco should try to autoplay whenever a new mission-flow step appears, because students are doing homework on their own device and the experience should feel alive.
- **D-02:** Browser autoplay failure must be expected. If autoplay is blocked, show a clear play affordance and continue the mission normally.
- **D-03:** Prompt text appears immediately. Audio should feel synchronized when cached or fast, but audio generation/fetching must not block the student from seeing the prompt.
- **D-04:** Recording stays available even if Coco audio is loading or playing. TTS is presence/modeling, not a gate on homework completion.

### Lines Voiced
- **D-05:** Coco voices character-like lines, not every UI/status label.
- **D-06:** Voice the mission prompts.
- **D-07:** Voice improved/model target sentences so students hear the sentence they are expected to repeat.
- **D-08:** Voice short Coco-style encouragement and transition lines, such as "Good job! Ready for the next one."
- **D-09:** Voice AI evaluation feedback only when the line is phrased as Coco talking to the student, not as system/status text.
- **D-10:** Do not voice the student's transcript back to them. Coco should model and respond, not read speech-recognition output aloud.
- **D-11:** Voice a short completion celebration.

### Replay UX
- **D-12:** Replay controls live inline inside the Coco speech card, next to the line Coco said.
- **D-13:** Replay uses an icon-only speaker/play button. The icon must be visually obvious, consistently placed, and have an accessible label such as `aria-label="Play Coco"`.
- **D-14:** Every voiced line can be replayed while it is visible. Once the app moves to a new step and the line is no longer on screen, it does not need a replay control.
- **D-15:** If audio cannot load or TTS generation fails, keep the text visible and show a small disabled/error state on the speaker button. Voice failure must not block the homework flow.
- **D-16:** Do not surface replay counts or replay behavior to teachers in v2.1. Cache-hit/provider logging is enough for verification.

### the agent's Discretion
- Choose the exact server/API structure, cache table/storage layout, and preload timing as long as the implementation satisfies the product decisions above and the Phase 8 requirements.
- Use standard implementation judgment for technical logging, retries, and cache-hit verification. These should support debugging and acceptance tests without creating new teacher-facing product surface.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Source
- `.planning/ROADMAP.md` — Phase 8 goal, dependency, requirements, and success criteria.
- `.planning/REQUIREMENTS.md` — VOICE-01 through VOICE-04 and v2.0 scope boundaries.
- `.planning/PROJECT.md` — product thesis, no-harsh-failure tone, teacher-linked homework loop, and out-of-scope boundaries.
- `.planning/STATE.md` — current milestone state and accumulated project decisions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/student/MissionFlowShell.tsx`: owns the one-step-at-a-time student mission state machine. Phase 8 voice playback should integrate here or into child step components without converting the flow into a scrolling chat.
- `src/components/student/StepBuddyQuestion.tsx`: current prompt card for Coco's question; likely first integration point for inline replay in the Coco speech card.
- `src/components/student/StepImprovedRepeat.tsx`: current improved/model sentence step; target sentence audio belongs here.
- `src/components/student/StepTurnTransition.tsx` and `src/components/student/StepMissionComplete.tsx`: existing short transition and completion surfaces that can host the approved Coco-style spoken lines.
- `src/components/teacher/AudioClipPlayer.tsx`: existing example of standard HTML `<audio>` playback and on-demand signed URL loading, useful as a low-complexity playback reference even though student TTS playback should be child-facing and inline.

### Established Patterns
- Server-only OpenAI adapters already exist in `src/server/ai/mission-generator.ts` and `src/server/audio/transcription.ts`; tests inject fake clients so automated verification does not call paid APIs. TTS should follow that pattern.
- Student client components currently import no OpenAI client. Keep TTS generation behind server-side routes/actions.
- The student mission flow already prioritizes completion resilience. TTS must degrade to text-only instead of blocking recording, transitions, or completion.
- Existing character copy lives in `src/domain/character/profile.ts`; Phase 8 should preserve Coco's supportive, classroom-safe tone and avoid turning UI/status text into spoken character dialogue.

### Integration Points
- Student mission page/load path: `src/app/student/missions/[assignmentStudentId]/page.tsx` and `src/server/student-access/mission-flow.ts` provide assignment snapshot and character profile data to the mission shell.
- Student flow UI: `MissionFlowShell` renders `StepBuddyQuestion`, `StepImprovedRepeat`, `StepAiEvaluationFeedback`, `StepTurnTransition`, and `StepMissionComplete`; these are the surfaces where voiced lines and inline replay controls should be planned.
- AI/provider boundary: add a server-owned TTS adapter and cache lookup/generation path that can be verified with fake clients and cache-hit tests.

</code_context>

<specifics>
## Specific Ideas

- Use the product rule: Coco speaks as a character; the app does not read UI/status text aloud.
- Preferred examples of voiced lines include mission prompts, model target sentences, "Nice! Here is a better way to say it," "Good job! Ready for the next one," and a short completion celebration such as "Great work! Mission complete."
- Avoid speaking student transcripts because TTS could amplify recognition mistakes back to the child.
- The replay button should be an obvious speaker/play icon in the speech card, not native browser controls as the visible UI.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 8-Coco Voice (TTS)*
*Context gathered: 2026-07-01T11:44:45Z*
