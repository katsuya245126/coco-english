---
phase: 05
slug: voice-capture-and-evidence-storage
status: draft
shadcn_initialized: false
preset: none
created: 2026-06-27
---

# Phase 05 - UI Design Contract

> Visual and interaction contract for Phase 5 frontend work. Continues the Phase 4 student mission style: mobile-first, one focused step card, Coco voice practice, transcript confirmation, and transcript-first teacher evidence.

## Design System

| Property | Value |
|----------|-------|
| Component library | none; continue local React components with inline `React.CSSProperties` |
| Icon library | none required for v1; use text labels for record, stop, retry, and load audio |
| Font | system sans stack already used by the app |
| Layout | continue `pageStyle`, `panelStyle`, `stepCardStyle`, `buddyCardStyle`, and `improvedSentenceCardStyle` from `src/components/student/styles.ts` |

No new design system dependency should be introduced for recorder controls.

## Spacing And Typography

Continue the Phase 4 scale:

| Role | Value |
|------|-------|
| Control minimum height | 44px |
| Step card padding | 24px |
| Section gap | 16px |
| Major vertical gap | 24px |
| Display | 28px, 600, 1.2 |
| Heading | 20px, 600, 1.25 |
| Body | 16px, 400, 1.5 |
| Label | 14px, 600, 1.4 |

Recorder buttons must keep 44px minimum height and full-width layout on phone viewports.

## Color

Continue existing tokens:

| Role | Value | Usage |
|------|-------|-------|
| Page background | `#F7F8FA` | Student route background |
| Card background | `#FFFFFF` | Step cards and teacher evidence rows |
| Accent | `#2563EB` | Primary actions, focus ring, recording-ready action |
| Text primary | `#111827` | Mission title, transcript, headings |
| Text secondary | `#4B5563` | Helper text, status text |
| Border | `#D1D5DB` | Inputs and audio cards |
| Soft border | `#E5E7EB` | Separators |
| Success | `#177245` | Transcript ready / uploaded |
| Warning | `#B45309` | Permission waiting / retry |
| Error | `#B42318` | Permission denied / upload failed |

Recorder-specific surfaces:

| Token | Value | Usage |
|-------|-------|-------|
| Recording surface | `#FEF2F2` | Active recording panel |
| Recording border | `#FCA5A5` | Active recording panel border |
| Processing surface | `#FFFBEB` | Uploading/transcribing panel |
| Processing border | `#FDE68A` | Uploading/transcribing panel border |

## Student Copy Contract

| State | Copy |
|-------|------|
| Ready original | Tap record and answer Coco. |
| Ready repeat | Tap record and repeat the sentence. |
| Primary ready CTA | Start recording |
| Recording status | Recording... |
| Stop CTA | Stop recording |
| Permission prompt | Your browser will ask to use the microphone. |
| Waiting permission | Waiting for microphone permission... |
| Permission denied | Microphone permission is blocked. Allow the microphone, then try again. |
| Unsupported | Recording does not work in this browser. Try another browser or ask your teacher. |
| Uploading | Saving your voice... |
| Transcribing | Listening to your answer... |
| Upload failed | We could not save that recording. Try again. |
| Transcription failed | We could not hear that clearly. Record again. |
| Transcript label original | We heard: |
| Transcript label repeat | Your repeat: |
| Retry CTA | Record again |
| Continue CTA after original | See the better sentence |
| Continue CTA after repeat | Continue |

Do not use technical terms such as codec, blob, MIME, signed URL, or transcription model in student-facing copy.

## Student Screen Contracts

### Original Answer Step

Replace the Phase 4 typed answer input inside `StepBuddyQuestion` with a voice recorder control.

Layout order:
1. Buddy question card remains unchanged.
2. Hint revealer remains below the buddy card.
3. Recorder panel appears below hints.
4. Transcript confirmation appears after successful transcription.
5. Primary continuation action appears only after transcript is available.

The recorder panel must show exactly one primary action at a time:
- Ready: "Start recording"
- Recording: "Stop recording"
- Failure: "Record again"
- Processing: disabled action area with status text
- Success: "See the better sentence"

### Repeat Step

Replace the Phase 4 typed repeat input inside `StepImprovedRepeat` with the same recorder control.

Layout order:
1. Original transcript display.
2. Improved sentence card remains unchanged.
3. Repeat instruction remains unchanged.
4. Recorder panel for repeat.
5. Repeat transcript confirmation.
6. Primary continuation action appears only after repeat transcript is available.

### Recorder Status

Use an `aria-live="polite"` region for status changes:
- permission prompt
- recording started
- upload/transcription progress
- transcript available

Use `role="alert"` only for denied permission, unsupported browser, upload failure, or transcription failure.

### Retry Behavior

Retry should replace the previous failed clip attempt for the same turn and clip kind in the UI. It may create a new storage object internally, but the student should see only one current attempt.

## Teacher Playback Contract

Teacher evidence is transcript-first.

Attempt evidence page order:
1. Student name and mission title.
2. Attempt status and submitted time.
3. Turn sections in order.
4. Original transcript and repeat transcript text.
5. Compact "Load audio" buttons for original and repeat clips.
6. `<audio controls>` appears only after a signed URL is requested.

Teacher copy:

| UI Location | Copy |
|-------------|------|
| Page heading | Attempt evidence |
| Original transcript label | Original answer |
| Repeat transcript label | Repeat attempt |
| Audio button | Load audio |
| Loading signed URL | Preparing audio... |
| Playback unavailable | Audio is not available for this clip. |
| Expired/deleted | This audio is no longer available. |

Do not autoplay audio. Do not show audio controls before the teacher requests a clip.

## Mobile Verification Contract

Manual device verification must check:

- iOS Safari on HTTPS or localhost: microphone prompt appears, recording starts/stops, upload/transcription retry states are understandable.
- Android Chrome on HTTPS or localhost: same checks.
- The active recorder control remains visible on a 375px-wide viewport.
- The teacher audio player does not autoplay and loads only after "Load audio".

## Accessibility

- Recorder buttons use real `<button>` elements.
- Status changes use `aria-live="polite"`.
- Error states use `role="alert"`.
- Audio playback uses native `<audio controls>`.
- Buttons must remain keyboard-focusable with the global focus ring.
- Do not rely on color alone for recording/failure/success state; visible text must name the state.

## Prohibited UI

- No waveform visualizer in Phase 5.
- No autoplay audio.
- No public audio URL display.
- No long chat transcript layout.
- No technical error strings in the student UI.
- No audio-first teacher dashboard; transcripts remain the default evidence.
