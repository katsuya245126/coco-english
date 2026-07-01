# Phase 8: Coco Voice (TTS) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-07-01T11:44:45Z
**Phase:** 8-Coco Voice (TTS)
**Areas discussed:** Playback timing, Lines voiced, Replay UX

---

## Playback Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Student taps Play Coco | Most reliable with browser autoplay rules; gives the student control before recording. | |
| Automatically after first student interaction | Feels more alive, but needs a fallback when browsers block autoplay. | |
| Automatically whenever a new step appears | Most immersive; chosen because students use their own devices and Coco should feel alive. | yes |

**User's choice:** Try to autoplay whenever a new step appears.
**Notes:** Text should appear immediately. Cached/fast audio should feel synchronized with text, but audio readiness should not block reading or recording. Recording stays available while audio loads or plays. If autoplay is blocked, show a clear play button and continue normally.

---

## Lines Voiced

| Option | Description | Selected |
|--------|-------------|----------|
| Mission prompts only | Smallest reliable slice: Coco speaks the actual question/prompt for each turn. | |
| Prompts + improved/target sentence | Coco asks the question and models the better sentence before repeat. | |
| Prompts + all Coco static flow text | Livelier, but can become chatty and create more TTS/cache states. | partial |
| Character-like lines only | Voice prompts, target sentences, short encouragement/transition, Coco-style evaluation feedback, and completion celebration; do not voice UI/status labels. | yes |

**User's choice:** More than prompts/model sentences, but not every static UI/helper line.
**Notes:** Coco should speak as a character. Voiced lines include prompts, improved/model target sentences, short encouragement/transition, Coco-style AI evaluation feedback, and a short completion celebration. Do not voice student transcripts or mechanical UI/status text.

---

## Replay UX

| Option | Description | Selected |
|--------|-------------|----------|
| Inline inside Coco speech card | Best for kids: the play button is right next to the line Coco said. | yes |
| One fixed audio control near the top | Cleaner visually, but less obvious which line will replay. | |
| Native audio controls everywhere | Reliable, but bulky and not very child-friendly. | |

**User's choice:** Replay control lives inline inside the Coco speech card.
**Notes:** Use an icon-only speaker/play button, visually obvious and consistently placed, with an accessible label such as `aria-label="Play Coco"`. Every voiced line can be replayed while visible. If audio fails, keep text visible and show a small disabled/error state. No teacher-facing replay tracking in v2.1.

---

## the agent's Discretion

- Exact server/API structure for TTS generation and cache lookup.
- Exact cache schema/storage layout, provided it supports content-hash cache hits by text + character + voice + provider + format.
- Technical logging and retries, provided voice failure never blocks homework completion.

## Deferred Ideas

None.
