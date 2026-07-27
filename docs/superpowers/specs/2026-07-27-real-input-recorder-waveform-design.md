# Real-Input Recorder Waveform

**Status:** Approved for implementation

## Goal

Show students that recording has started and that the microphone is receiving
their voice, without adding scoring, transcript display, teacher evidence, or
stored waveform data.

## Design

- Keep the recorder inside the existing student mission flow and preserve the
  current browser `MediaRecorder` upload path.
- Before recording, show the existing single full-width recorder button with a
  mic icon and `Record`.
- While recording, keep a narrow countdown/timer bar above the button.
- While recording, replace the button label with a compact live waveform made
  from many vertical rounded bars drawn from the active microphone stream.
- The waveform must be driven by real time-domain audio samples from
  `AudioContext` and `AnalyserNode.getByteTimeDomainData()`.
- The waveform must stay flat or nearly flat when the microphone receives no
  meaningful input.
- The waveform must move irregularly from sampled input when the student speaks.
- The waveform must not use a fake pulse, equalizer loop, or repeating CSS
  animation to imply voice input.
- The waveform must not be a continuous line, smooth curve, or SVG path trace.
- If Web Audio is unavailable or fails, the button should still show a stable
  recording state, but it must not fake voice movement.
- Stop recording remains the button action while recording.
- The visualization is decorative for assistive technology; the existing text
  state and button label remain the accessible source of truth.
- Discard all analyser, animation-frame, stream, and waveform state immediately
  when recording stops or the component unmounts.

## Non-Goals

- Do not store waveform samples locally, in Supabase, or in teacher evidence.
- Do not add teacher-facing waveform playback.
- Do not change transcription, pronunciation scoring, AI evaluation,
  assignment state transitions, per-turn audio storage, or signed playback URLs.
- Do not add speech-to-text preview while recording.
- Do not add a red recording panel, `Your answer` label, or separate recording
  status text in the visual UI.
- Do not add a new dependency for waveform rendering.

## Architecture

Add one client-only waveform unit that consumes the already-open
`MediaStream`, owns a Web Audio analyser, samples the time-domain buffer during
recording, and renders a small SVG or canvas waveform. `VoiceRecorderControl`
continues to own recorder state, permissions, timers, and upload callbacks; it
passes its active `MediaStream` to the waveform only while recording.

Use a pure domain helper for converting byte time-domain samples into normalized
vertical bar heights. This keeps the microphone/Web Audio side thin and lets
quiet and voiced behavior be tested without a browser microphone.

## UX Details

- The pre-tap button remains a clear command: mic icon plus `Record`.
- The recording button remains the same full-width target and still stops the
  recording when tapped.
- The countdown bar remains visible only during recording.
- The waveform should be centered in the button and fit within the current
  recorder width on phone and desktop.
- Quiet input should render as a row of short, nearly flat rounded bars, so a
  student can tell that recording started even before speaking.
- Real input should look like a bar-style audio waveform: many vertical rounded
  bars of varying heights, not a continuous line or smooth curve.

## Accessibility

- Keep the recording button accessible name as `Stop recording` while recording.
- Keep the current `aria-live` status available to screen readers. If the visual
  text is removed, provide an off-screen `Recording... {secondsLeft}s` status.
- Mark the waveform graphic `aria-hidden="true"`.
- Respect `prefers-reduced-motion`; the sampled waveform may still update as
  live state, but there must be no decorative fallback animation.

## Verification

- Add deterministic unit tests for the sample-to-waveform helper:
  - constant centerline samples render flat bars;
  - voiced samples produce varying bar heights;
  - invalid or empty buffers fall back to flat bars.
- Add focused recorder source/component tests that prove:
  - `VoiceRecorderControl` passes the active stream to the waveform only while
    recording;
  - the recording button keeps the `Stop recording` accessible name;
  - no fake CSS animation is used for the waveform.
- Run the focused recorder tests, full test suite in proportion to risk,
  typecheck, lint, build, and `git diff --check`.
- Verify localhost screenshots at phone and desktop widths. The before-tap
  state should remain recognizable, and the recording state should show the
  timer bar plus waveform button without red panel styling.
