# Handoff — Coco replay audio STILL silent on re-click (2026-07-10, session 2)

Continues `2026-07-10-mascot-audio-copy-handoff.md`. Everything below is
**uncommitted, local-only** (branch `main`, no git remote). Run `git status` /
`git diff` first — this doc describes the tree as of this handoff.

## TL;DR of the one unsolved problem

**Coco's replay audio button plays on the FIRST click, then is SILENT on every
re-click.** Desktop Chrome. Two fixes have now been attempted across two sessions
and the user reports it is **still broken**. The card-copy and mascot-sprite work
(below) IS done and verified — only the audio re-click bug remains open.

Do NOT start another server without stopping it before yielding — the user runs
their own dev server on port 3000 and an agent-started server on any port
interferes with it. (Saved to memory: `coco-english-stop-server-before-turn`.)
No server is running as of this handoff.

---

## What we KNOW about the audio bug (hard evidence, not theory)

The user pasted real Chrome console logs from temporary instrumentation (since
removed). These are the ground truth:

**First click (WORKS, audible):**
```
click:        {ctxBefore: 'none', elPaused: true, elMuted: false, elVolume: 1, elReadyState: 4}
after resume: {ctxState: 'running'}
after attach: {ctxState: 'running', hasAnalyser: true}
play() resolved: {paused: false, currentTime: 0, ctxState: 'running'}
```

**Re-click (SILENT, but element thinks it's playing):**
```
click:        {ctxBefore: 'none', elPaused: true, ...}   ← ctxBefore is 'none' AGAIN
after resume: {ctxState: 'running'}
after attach: {ctxState: 'running', hasAnalyser: true}
play() resolved: {paused: false, currentTime: 0, ctxState: 'running'}
+250ms signal: {analyserSum: 0, elCurrentTime: 0.250926, elPaused: false}
```

### The decisive facts
1. On the **re-click**, `ctxBefore: 'none'` — the shared `AudioContext` singleton
   was **null again** at the start of the second click, even though the same
   `<audio>` DOM element persisted.
2. `analyserSum: 0` while `elCurrentTime` advances and `elPaused: false` — the
   element believes it is playing (time progresses) but **zero signal flows
   through the Web Audio graph**. No sound.
3. `play()` never rejects. `ctxState` is `running` throughout. So this is NOT a
   suspended-context / autoplay-gesture problem (that was session 1's wrong
   theory). It is a **dead audio graph** problem.

### Root-cause hypothesis (session 2)
`ctxBefore: 'none'` on the re-click strongly implies the module was **re-evaluated
between clicks** (React Fast Refresh / HMR in dev), which reset the old
module-scoped `let sharedAudioContext = null` while the `<audio>` element — and
its `createMediaElementSource`-captured source node — survived. `createMediaElement
Source` is a **one-way, permanent** capture: once an element is routed into a
context, its native output is gone forever, and it can only feed THAT context's
graph. When the context is replaced, the captured element feeds a dead graph →
silence.

**BUT this hypothesis is now in doubt** — see next section, because the session-2
fix targeting exactly this did NOT resolve it for the user.

---

## Fix attempts so far (BOTH failed to fully resolve)

### Session 1 fix (in tree): resume-before-attach ordering
Moved `await resumeAudioContext()` before `ensureAnalyserReady()` in
`handleReplay`, and made `resumeAudioContext` create-if-needed. **Result: did not
fix it.** (It only ever addressed the suspended-context path, which the logs prove
is not the actual failure.)

### Session 2 fix (in tree): HMR-safe singleton + context-mismatch guard
In `src/components/student/CocoSpeechAudio.tsx`:
- Moved the `AudioContext` + both node WeakMaps off module scope onto
  `globalThis.__cocoAudio__` (see lines ~52-88), so Fast Refresh no longer nulls
  the context out from under a live element.
- `getAudioContext()` now also recreates a `closed` context.
- `attachAnalyser()` now returns `AnalyserNode | null`: if a cached source node's
  `.context !== ctx` (stale/dead context), it returns `null` so the caller lets
  the element **play natively** instead of into a dead graph (lines ~106-132).
- `ensureAnalyserReady()` guards against the null analyser (lines ~158-176).

**Result: user reports STILL not working.**

### Why session-2's fix likely CAN'T work (key insight for next session)
The mismatch guard returns `null` → "let it play natively." **But native output
is already permanently dead** for that element: the *first* (working) click called
`createMediaElementSource(el)`, which irreversibly rerouted the element away from
the speakers into the Web Audio graph. Returning `null` later does NOT un-capture
the element — it just declines to build a new analyser. The element is muted for
the rest of its life regardless. **The guard came too late; the one-way capture
happened on the working first click.**

So the mismatch guard is dead code for this symptom. That is almost certainly why
the user still hears nothing.

---

## Recommended direction for the next session (untried)

The whole bug class stems from `createMediaElementSource`. Options, roughly in
order of promise:

1. **Stop using `createMediaElementSource` for the mouth-movement analyser.**
   The analyser only drives the mascot's mouth pulse (`onAmplitudeFrame`). If we
   drop Web Audio routing entirely and let every `<audio>` element play natively,
   replay works forever (native `<audio>` replays fine). Trade-off: lose the
   amplitude-driven mouth animation, OR drive the mouth from a cheaper signal
   (e.g. a fixed pulse while `state === "playing"`, or `requestAnimationFrame`
   timed to `el.currentTime`, no analyser). **This is the cleanest fix** and most
   directly matches "audio must always play; mouth animation is a nice-to-have."
   Check `MascotStage.tsx` for how `amplitudeRef`/`playing` drive the mouth — a
   playing-boolean pulse may be visually good enough.

2. **Create a fresh `<audio>` element per play**, or fully unmount/remount it, so
   each playback gets an uncaptured element. Fragile and fights React.

3. **Keep the analyser but NEVER let the context die** — the globalThis anchor was
   supposed to do this. If HMR is truly the only trigger, then in PRODUCTION
   (module evaluated once, no Fast Refresh) the bug may not reproduce at all.
   **This is worth confirming FIRST before more code changes:** ask the user to
   test a production build (`npm run build && npm run start`) and re-click. If it
   works in prod, the remaining dev-only breakage may be acceptable / a
   lower-priority dev-ergonomics issue. If it ALSO fails in prod, then HMR is a
   red herring and the real trigger is something else (element remount on state
   change, a second CocoSpeechAudio instance, etc.) — go to option 1.

### First concrete step next session
Re-add temporary logging (session-2 removed it) OR, better, have the user run a
**production build** and re-click. Distinguish:
- **Works in prod, fails in dev** → HMR-only; strongly prefer option 1 anyway to
  kill the class, but it's not shipping-critical.
- **Fails in prod too** → the globalThis/HMR theory is wrong; the element is being
  re-captured or the graph is broken for another reason. Instrument
  `el` identity (does the `<audio>` DOM node change between clicks?),
  `sourceNodeCache` hit/miss, and `source.context === getAudioContext()` on the
  re-click to see the real state. Then apply option 1.

### Diagnostic snippet to re-add to `handleReplay` if needed
```ts
// after el.play() resolves:
setTimeout(() => {
  const a = analyserRef.current;
  const buf = a && new Uint8Array(a.frequencyBinCount);
  if (a && buf) a.getByteFrequencyData(buf);
  console.log("[coco-audio]", {
    ctxState: cocoAudio.ctx?.state,
    analyserSum: buf ? buf.reduce((s, v) => s + v, 0) : "no-analyser",
    elCurrentTime: el.currentTime,
    elPaused: el.paused,
    sameElement: el === /* stash previous el in a ref to compare */ null,
  });
}, 250);
```

### IMPORTANT verification constraint
The agent **preview tool cannot reproduce this bug** — its headless Chromium
starts every `AudioContext` in state `"running"` and appears to auto-unlock audio,
so the failing path never executes there. Session 1 falsely "verified" the fix in
the preview tool for exactly this reason. **Only trust the user's real Chrome
(devtools Console open).** Do not claim the audio is fixed based on the preview
tool.

---

## Files touched this session (all uncommitted)

```
 M public/images/coco-encouraging-alpha.png   (cropped sprite — from session 1)
 M public/images/coco-encouraging.png         (cropped sprite — from session 1)
 M src/app/student/missions/[assignmentStudentId]/page.tsx   (repeatInstruction drop — session 1)
 M src/components/student/CocoSpeechAudio.tsx  (audio fixes — BOTH sessions; STILL BROKEN)
 M src/components/student/MissionFlowShell.tsx (card/bubble copy rework — session 2)
 M src/components/student/StepAiEvaluationFeedback.tsx (showSentenceCard prop — session 2)
 M src/components/student/StepImprovedRepeat.tsx (repeatInstruction drop — session 1)
 M src/domain/character/expression.ts          (encouraging on repeat step — session 2)
 M src/domain/character/profile.ts             (repeatInstruction field removed — session 1)
 M tests/domain/character-expression.test.ts   (encouraging assertions — session 2)
 M tests/domain/character-profile.test.ts       (repeatInstruction assertions removed — session 1)
 M tests/domain/tts-ui-source.test.ts           (updated for copy + cocoAudio.ctx rename — session 2)
```

`npx tsc --noEmit` clean. `npx vitest run tests/domain/character-expression.test.ts
tests/domain/character-profile.test.ts tests/domain/tts-ui-source.test.ts` = 35/35
pass. (Full suite NOT run this session — worth running before any commit.)

---

## What IS done and verified this session (the non-audio work — user approved)

These were explicit user decisions via AskUserQuestion and are complete:

### 1. Target sentence moved into the step card; Coco's bubble made generic
User decision: "bring back the card." The improved/target sentence now renders in
the dedicated step card, NOT embedded in Coco's dialogue-bubble text.
- `MissionFlowShell.tsx` repeat step (~line 761): `showCocoLine={true}`.
- `MissionFlowShell.tsx` two `StepAiEvaluationFeedback` call sites (aiFeedback
  ~730, repeatFeedback ~780): kept `showCocoLine={false}` but added new
  `showSentenceCard={true}`.
- `getMascotDialogue()` bubble text changed from `Try this: ${sentence}` /
  `Try again: ${sentence}` to generic `"Try this!"` / `"Try again!"`, with
  `line: null` so the sentence isn't spoken/duplicated in the bubble.
- `StepAiEvaluationFeedback.tsx`: added `showSentenceCard` prop (defaults to
  `showCocoLine`) that gates ONLY the "Try this:" sentence card, independent of
  the short-message headings ("Nice answer!", "Try again.") which stay
  bubble-only. This avoids re-introducing duplicate headings.

Rationale for the split prop: flipping `showCocoLine={true}` wholesale would have
un-suppressed the redundant in-card "Nice answer!"/"Try again." headings that the
mascot bubble already speaks. `showSentenceCard` isolates just the sentence card.

### 2. Encouraging mascot sprite on the retry recorder screen
User decision: encouraging on the retry recorder screen; keep thinking on the
wrong-answer *result* screen.
- `src/domain/character/expression.ts`: added `if (input.step === "repeat")
  return "encouraging";` (near top, after the `complete` check). The `repeat`
  step is reached ONLY when the student is re-recording the corrected sentence
  (verified: `continueToRepeat`, `retryWithImprovedSentence`, `retryRepeat` all
  route to `step: "repeat"`), so encouraging is correct there.
- Wrong-answer result screen = `aiFeedback` + `originalFeedbackKind:
  "needsCorrection"` → still returns `"thinking"` (unchanged). Confirmed correct.
- Sprite asset `public/images/coco-encouraging-alpha.png` serves (200, valid PNG,
  710976 bytes) and maps via `SPRITE_BY_EXPRESSION["encouraging"]` in
  `MascotStage.tsx`. The cropped pose is the cheerful pointing-paw Coco.
- NOTE: could not screenshot it in-flow because reaching the repeat step needs a
  real mic recording, which the preview tool can't drive. Verified by code +
  asset fetch + unit tests, not by eyeball. Worth a human eyeball once running.

### 3. `repeatInstruction` field fully removed (session 1, still in tree)
The "Now try saying it this way:" paragraph and its `repeatInstruction` field are
gone end-to-end (profile type + DEFAULT_BUDDY + MissionFlowShell + page.tsx +
StepImprovedRepeat + tests). This is now consistent with the card-based design
above (the card's own `improvedSentenceIntro` = "Nice! Here is a better way to say
it:" is the label).

---

## Repro access (unchanged from session 1)
- Join code `ZJE9FT`, name `test`, PIN `1234` → `/student/home`.
- A "Start"-state homework (e.g. "July 3rd Homework", 2 turns) starts fresh at the
  question step. To reach the audio re-click bug: click the 🔊 Play Coco button in
  Coco's dialogue bubble, let it finish, click it again → silent.
- To reach the repeat step / encouraging sprite: you must actually record an
  answer (real mic), get a `needsCorrection` result, then continue to repeat.

## Suggested order for next session
1. Have the user run a **production build** and re-click the audio — determines
   whether this is HMR-only (option 3) or a real prod bug (→ option 1).
2. If prod also fails (or to kill the class regardless): implement option 1 — drop
   `createMediaElementSource`, let `<audio>` play natively, drive the mascot mouth
   from a simpler `playing`-based pulse. Check `MascotStage.tsx` amplitude usage.
3. Re-verify ONLY in the user's real Chrome. Never claim fixed from the preview
   tool.
4. Consider reverting the session-2 mismatch-guard dead code in `attachAnalyser`
   if option 1 removes the analyser routing entirely.
5. Run the full test suite before committing anything.

---

## NEW open items (raised end of session 2, NOT yet implemented)

Two more requests from the user. Neither is done — both are pointer-only notes so
the next session can act fast. Neither depends on the audio fix.

### A. Retry-recorder card label is too wordy — restore the terse "Say this" style

**Symptom (user's words):** "when you click record again after failing once, it
says: *Nice! Here is a better way to say it:*. But previously we had *Say this* or
something in a different style. Less wordy the better for students. Recover that."

**Diagnosis — there are TWO different labels, and the terse one still exists:**
- The **retry recorder card** (`StepImprovedRepeat.tsx` line ~79) renders
  `{improvedSentenceIntro}` = **"Nice! Here is a better way to say it:"** — this is
  the verbose string the user is seeing. It comes from
  `src/domain/character/profile.ts` line 31 (`DEFAULT_BUDDY.improvedSentenceIntro`).
- The **AI-feedback card** (`StepAiEvaluationFeedback.tsx`) uses terser hardcoded
  labels: **"Try this:"** (line ~117) and **"Say this sentence:"** (line ~230).
  THIS is the "Say this" style the user remembers — it never left, it's just on a
  different screen.

**Recommended fix:** give `StepImprovedRepeat`'s card a short label matching the
feedback card ("Say this" or "Say this sentence:") instead of the verbose
`improvedSentenceIntro`.

**IMPORTANT — do NOT just edit `profile.improvedSentenceIntro` to be shorter.**
That field is reused in non-card contexts where the fuller phrasing may be wanted:
- `src/app/student/missions/[assignmentStudentId]/tts/route.ts` line 57 (TTS text
  fallback — Coco literally *speaks* this line)
- `src/server/mission/assign-service.ts` line 74 (assignment snapshot)
- `src/app/student/missions/[assignmentStudentId]/page.tsx` line 152 (passed into
  the shell)

So the clean change is one of:
  (a) Pass a short literal label into `StepImprovedRepeat` at its call site
      (`MissionFlowShell.tsx` ~line 758) instead of `characterProfile.
      improvedSentenceIntro` — e.g. a new prop/constant "Say this sentence:", OR
  (b) Add a separate short field to the character profile (e.g.
      `improvedSentenceLabel: "Say this sentence:"`) distinct from the spoken
      `improvedSentenceIntro`, and use it only for the card label.
Recommend (a) for a minimal change, or (b) if you want it themeable per character.

Keep it consistent with the feedback card's "Say this sentence:" so the two
screens read the same. Confirm final wording with the user if unsure.

**Tests:** `tests/domain/character-profile.test.ts` asserts on
`improvedSentenceIntro`'s value — if you change the profile field (option b) or its
value, update that test. If you only change the call-site label (option a), check
`tts-ui-source.test.ts` doesn't pin the old card label string.

### B. All mascot sprites sit too low — faces get cut off (esp. encouraging)

**Symptom (user's words):** "the encouraging sprite is cut off in the face. It
needs to be higher up. All the sprites are a bit too low. Could raise them a bit."

**Where the framing lives:**
- `src/components/student/MascotStage.tsx` line ~163:
  `style={{ objectFit: "cover", objectPosition: "center 18%" }}`
  With `object-fit: cover`, `objectPosition`'s vertical % chooses which slice of
  the (overflowing) sprite is visible. **Lower the percentage to show more of the
  TOP / face** — e.g. `center 18%` → try `center 6%` or `center 0%`. (Higher % =
  shows lower part = current "too low" problem.)
- `src/components/student/styles.ts` `mascotSpriteWrapStyle` (lines ~301-308):
  `bottom: 72, height: 198`. The sprite box is pinned 72px from the stage bottom.
  Raising the sprite can also be done here (increase `bottom`, and/or adjust
  `height`), but prefer the `objectPosition` lever first — it's the direct "which
  part of the image shows" control and won't change the box geometry that the
  dialogue bubble is laid out around.

**Per-sprite caveat:** the encouraging sprite is a head + raised-pointing-paw
composition that is framed differently (taller subject) than the neutral/thinking
poses, so a single global `objectPosition` may crop it more than the others. If one
global value can't satisfy all 6 sprites, consider a per-expression
`objectPosition` map (parallel to `SPRITE_BY_EXPRESSION`) so each pose can be
framed individually. Start by trying a single lower global value and eyeballing all
6; only go per-sprite if needed.

**Tests:** `tests/domain/tts-ui-source.test.ts` HARDCODES these framing values and
WILL fail when you change them — it asserts:
  `objectPosition: "center 18%"`, and in styles `bottom: 72`, `height: 198`.
Update those assertions to the new values (or loosen them) as part of this change.

**Verification:** must be eyeballed against the real sprites. The preview tool CAN
show the question-step sprite (neutral/thinking) via screenshot without a
recording, so at least those are checkable there; the encouraging sprite needs the
repeat step (real mic recording) OR temporarily forcing `expression="encouraging"`
on `<MascotStage>` to screenshot it. Remember to STOP any server before yielding.

---

## SESSION 3 UPDATE (2026-07-10, later same day) — Option 1 IMPLEMENTED

All three open items were implemented (still uncommitted, on `main`):

1. **Audio fix (option 1, as recommended above):** `CocoSpeechAudio.tsx` no longer
   touches Web Audio at all — no `AudioContext`, no `createMediaElementSource`,
   no analyser. The `<audio>` element always plays natively. The mascot mouth is
   driven by `syntheticSpeechLevel()` (layered sines, ~0.12–0.57) emitted every
   rAF while `state === "playing"`; cleanup emits 0. The dead-code mismatch
   guard from session 2 is gone with the rest. A comment-stripped source test in
   `tts-ui-source.test.ts` now BANS `createMediaElementSource` / `new
   AudioContext` / `createAnalyser` in that file.
2. **Item A:** repeat card now shows literal `improvedSentenceLabel="Say this
   sentence:"` at the MissionFlowShell call site; prop renamed
   (`improvedSentenceIntro` → `improvedSentenceLabel`); unused field dropped
   from `CharacterProfileLines` + page.tsx. Profile field itself untouched
   (still spoken by TTS).
3. **Item B (root cause was NOT objectPosition):** the encouraging sprite is
   LANDSCAPE (1024×734) — with the 228×198 box `cover` fits it by height, so
   `objectPosition` Y has zero effect on it. The face was hidden by the
   DIALOGUE BOX overlapping the sprite box (56px overlap: stage 300, box top
   y=172, sprite y=30..228). Fix: `mascotSpriteWrapStyle` `bottom: 72→120`,
   `height: 198→180` (only 8px now tucks behind the box) + `objectPosition
   18%→12%` for portrait-sprite ear headroom. Verified by offline crop
   simulation (all aspect ratios) AND live screenshot of the question step in
   real Chrome (user's dev server, port 3000): full face/ears visible.

`npx tsc --noEmit` clean; **full** vitest suite 48 files / 445 pass.

**Audio verification status:** the fix could NOT be ear-verified by the agent.
New finding: driving the user's real Chrome via the extension doesn't work
either — the automation tab is `document.visibilityState === "hidden"`, and
Chrome defers media buffering (readyState stays 0) and freezes the renderer, so
playback never produces sound there. Only the user clicking replay in a visible
tab settles it. Structurally, the failing path (element captured into a dead
graph) no longer exists in the code.
