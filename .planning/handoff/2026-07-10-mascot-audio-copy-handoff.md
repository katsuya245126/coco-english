# Handoff — Mascot sprite / Coco audio / repeat-step copy (2026-07-10)

Session ran out of runway mid-debug. Everything below is **uncommitted, local-only**
(branch `main`, no git remote configured). Nothing has been pushed anywhere.

Run `git status` / `git diff` first thing — this doc describes the working tree as of
this handoff, but don't trust it blindly if more edits happened after.

## Current uncommitted diff (files touched this session)

```
 M public/images/coco-encouraging-alpha.png   (binary, replaced+cropped sprite)
 M public/images/coco-encouraging.png         (binary, replaced+cropped sprite)
 M src/app/student/missions/[assignmentStudentId]/page.tsx   (dropped repeatInstruction wiring)
 M src/components/student/CocoSpeechAudio.tsx  (AudioContext resume-order fix)
 M src/components/student/MissionFlowShell.tsx (dropped repeatInstruction prop/type)
 M src/components/student/StepImprovedRepeat.tsx (removed "Now try saying it this way:" paragraph)
 M src/domain/character/profile.ts             (removed repeatInstruction field)
 M tests/domain/character-profile.test.ts       (removed repeatInstruction assertions)
```

`npx tsc --noEmit` is clean. `npx vitest run tests/domain/character-profile.test.ts
tests/domain/tts-ui-source.test.ts` passes (27/27).

**IMPORTANT — user reports the fixes below are NOT actually working when they test
on their own `localhost:3000`.** This was last verified only against a *separate*
preview-tool dev server instance (auto-assigned port, e.g. 54459), not the user's
own terminal process. A stale/orphaned `node` process was found and killed on the
user's port 3000 mid-session (PID 15016, was serving pre-`.next`-clear code), but
the user says the bugs persist even after that. **Do not assume the fixes below are
verified correct in the user's actual environment — re-verify from scratch.**

---

## Task 1: Coco replay audio button — silent on click

### Original symptom
Clicking the speaker/play button next to any Coco line (mission prompt, "say this
now" repeat card, etc.) produced no sound, on every instance, not just one line kind.

### Root cause found (in `src/components/student/CocoSpeechAudio.tsx`)
`handleReplay()` called `ensureAnalyserReady()` (which lazily creates the shared
`AudioContext` via `getAudioContext()` and calls `ctx.createMediaElementSource(el)` —
a **permanent, one-way** operation per `<audio>` element) *before* calling
`resumeAudioContext()`. But `resumeAudioContext()` as originally written only
resumed an **already-existing** context:

```ts
async function resumeAudioContext() {
  const ctx = sharedAudioContext;          // null on first-ever call
  if (ctx?.state === "suspended") { ... }  // no-op when ctx is null
}
```

So on a user's very first click, the context gets created fresh (starts
`"suspended"` per the WebAudio spec), the source node gets wired into it and
connected to `ctx.destination`, and only *then* does `resumeAudioContext()` run —
but by then it's a no-op path timing-wise, and once `createMediaElementSource` has
captured an element, native unrouted playback is gone for that element's lifetime.
Net effect: permanently muted after the first click, silently (no thrown error,
`el.play()` still resolves, `currentTime` still advances — the element *looks* like
it's playing while producing no audio).

### Fix applied
```ts
async function resumeAudioContext() {
  const ctx = getAudioContext();      // now creates-if-needed too
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => {});
  }
}

async function handleReplay() {
  const el = audioRef.current;
  if (!el) return;
  await resumeAudioContext();   // moved BEFORE ensureAnalyserReady()
  ensureAnalyserReady();
  el.currentTime = 0;
  el.play().catch(() => setState("error"));
}
```

### Verification done (in a *separate* preview dev server, not the user's port 3000)
- Live-clicked "Play Coco" on `/student/missions/[id]` after logging in via
  `/join/ZJE9FT` → name `test` / pin `1234`.
- `<audio>` element's `currentTime` was observed advancing mid-playback
  (`1.62s` of a `3.216s` clip, `paused: false`) — confirms real progression, not an
  instant fast-forward.
- Screenshot showed the speaker button in its blue "playing" filled state and the
  mascot's mouth open/animating (driven by `onAmplitudeFrame` → proves the
  `AnalyserNode` is actually receiving live signal from a running, not suspended,
  context).

### Why the user says it's still broken — unresolved, needs fresh investigation
Possibilities not yet ruled out:
1. **The user was testing against stale served code.** A leftover `node` process
   was found bound to port 3000 (PID 15016) that predated this session's `.next`
   clear and the code fix — it was killed, but the user reports the bug persists
   *after* that kill too. Need to confirm: did they actually restart `npm run dev`
   fresh after the kill? Is there another zombie process on 3000 again?
2. **Browser-level AudioContext state may differ per real browser/device** vs. the
   preview tool's Chromium instance — Safari/iOS in particular has stricter
   suspended-context/gesture-unlock rules. If the user is testing on Safari or a
   phone, this needs dedicated repro there, not just the preview tool.
3. **Possible second bug not yet found.** Static reading of the full 430-line
   `CocoSpeechAudio.tsx` didn't surface anything else obviously wrong, but this
   file has a history of subtle AudioContext-lifecycle bugs (see prior commits
   `2695ece7` "stop touching AudioContext on autoplay, only on gesture" and
   `d104f16d` "attach analyser before resuming AudioContext in handleReplay" — this
   is at least the third pass at this exact bug class). Worth checking:
   - Is `sharedAudioContext` (module-scope singleton, `let sharedAudioContext:
     AudioContext | null = null` at line 52) getting reset/recreated unexpectedly
     across navigations (e.g. React StrictMode double-invoke, or HMR in dev
     specifically — dev-only bugs are plausible here and would explain "fixed in
     my test, broken for the user" if the user is also running dev mode with hot
     reload active while testing)?
   - Does `sourceNodeCache` / `analyserNodeCache` (both `WeakMap<HTMLMediaElement,
     ...>`) ever leak a stale node across `<audio src>` changes, given the `<audio>`
     element itself gets unmounted/remounted whenever `audioUrl` goes
     `null → string` between line kinds (see the conditional render at the bottom
     of the component, `{audioUrl ? <audio ...> : null}`)? Each new line fetch sets
     `setAudioUrl(null)` then eventually a new URL — check whether that unmount
     creates a **new** `<audio>` DOM node (new element = fresh, unfixed
     `sourceNodeCache` entry, so this specific bug shouldn't recur per-node) or
     reuses one.
   - Confirm in a real browser devtools console (not just `preview_eval`) what
     `sharedAudioContext.state` actually is after a real click — add a temporary
     `console.log` if needed.

**Recommended next step:** reproduce directly in the user's own browser (they
should open devtools Console + Network while clicking play), not through the agent
preview tool, since the preview tool's headless/automation context may behave
differently around user-gesture-driven audio unlocking than a real click does.

---

## Task 2: Remove redundant "Now try saying it this way:" text

### What was done
Removed the `<p>{repeatInstruction}</p>` block from
`src/components/student/StepImprovedRepeat.tsx`, and fully deleted the now-dead
`repeatInstruction` field/prop end-to-end through:
`src/domain/character/profile.ts` (`CharacterProfile` type + `DEFAULT_BUDDY` value)
→ `src/components/student/MissionFlowShell.tsx` (`CharacterProfileLines` type +
prop pass-through) → `src/app/student/missions/[assignmentStudentId]/page.tsx`
(object literal) → `src/components/student/StepImprovedRepeat.tsx` (prop + JSX).
Also cleaned up the two now-broken assertions in
`tests/domain/character-profile.test.ts`. Typecheck + affected unit tests pass.

### Discovered while investigating — the premise was wrong, this needs a real decision
The user's stated reason for removing the paragraph was "we already have a Say this
card that serves the same purpose." **That's not accurate for the real render
path.** `StepImprovedRepeat` has a `showCocoLine` prop that gates the entire "Say
this" card (the `<CocoSpeechAudio>` + `targetExample` block). Grepped every call
site in `MissionFlowShell.tsx` (lines 705, 730, 761, 780, 806, 818 — six sites,
including the repeat-step one at 761): **all six pass `showCocoLine={false}`.**
So the "Say this" card the user is referring to **does not currently render
anywhere in the app** — it's fully dead code behind a permanently-false flag. This
predates this session; I did not introduce it.

This means: removing the plain-text repeat instruction paragraph, on its own,
likely leaves the repeat step with **no visible instruction and no card** — i.e.
the student now sees the recorder with zero context about what to say. This is
almost certainly not what the user wants and needs to be re-examined before
shipping. Options to discuss with the user:
1. Flip `showCocoLine={true}` on the repeat-step call site (line ~761) so the
   actual "Say this" card renders (this seems to be what the user *believed* was
   already happening).
2. Or, if the mascot's spoken dialogue bubble (see Task 3 below — the `"Try this:
   ${sentence}"` line rendered in the buddy/dialogue box above the step content)
   is meant to be the sole source of the target sentence, then the removal is
   correct as-is, but should be a deliberate confirmed decision, not an assumption.

**This needs to go back to the user as a question, not be silently fixed either
way.**

---

## Task 3: "Encouraging picture still there" — investigated, inconclusive

### What was checked
- Confirmed `public/images/coco-encouraging.png` on disk is the new
  cropped/replaced sprite (viewed directly via Read tool — shows the intended
  cheerful/pointing-paw pose, not the old neutral one).
- Confirmed the dev server (in the separate preview instance) served that exact
  file — fetched `/images/coco-encouraging.png` and byte size matched the on-disk
  file exactly (623889 bytes), ruling out server-side caching in that instance.
- Confirmed `deriveExpression()` in `src/domain/character/expression.ts` **never
  returns `"encouraging"`** — it only returns `celebrate | sad | thinking | idle`
  based on flow step/feedback kind (see the function body, lines 27-41). No prop
  override sets it to `"encouraging"` anywhere in `MissionFlowShell.tsx` either
  (grepped, confirmed `expression` prop passed to `MascotStage` only ever resolves
  to `"thinking"`, `"celebrate"`, or `undefined`).
- **Conclusion at the time:** the encouraging sprite is structurally unreachable in
  the live app right now, so "still seeing the old encouraging pic" seemed most
  likely to be the user's own browser cache from before the file replacement, not
  a real app bug.

### Why this conclusion may be wrong / needs re-check
The user re-asserted the problem persists even after `rm -rf .next` on their end.
Since the sprite is unreachable via normal flow, "still seeing the old encouraging
pic" likely means one of:
1. The user is looking at a **different image entirely** than they think (e.g.
   confusing the "thinking" sprite — which IS reachable on wrong-answer/retry
   states per the user's newest message: *"showing 'thinking' one on wrong answer
   and redo"* — with what they call "encouraging"). **This is the most likely
   explanation** — worth explicitly confirming with the user which sprite file
   they're actually looking at (ask them to check Network tab for the exact
   `/images/coco-*.png` filename being requested when they see the "wrong" pose).
2. Genuine browser-level image cache (not server/Next cache) not cleared by
   `rm -rf .next` — that only clears the Next.js build cache, not the browser's
   HTTP cache for `/images/*.png` static assets. User should hard-reload
   (Cmd+Shift+R) or check with devtools Network tab "Disable cache" enabled.
3. A stale service worker, if one exists in this project (not checked this
   session — worth a quick `grep -r serviceWorker` / check `public/` for a
   `sw.js`).

**Not resolved. Needs the user to confirm exactly which image/expression they're
seeing and when (which flow step, what answer they gave).**

---

## Task 4 (raised in the newest user message, NOT yet investigated at all)

Direct quotes from the user, verbatim:
> "It's showing 'thinking' one on wrong answer and redo. Also the say this card is
> gone now. Coco should just say 'try this' but it's saying the answer in the
> chatbox too."

Partial investigation done (see Task 2 above re: "say this card is gone" — that's
explained by the pre-existing `showCocoLine={false}` on all call sites, not
something newly broken).

The "Coco should just say 'try this' but it's saying the answer in the chatbox
too" part: found the likely source in `MissionFlowShell.tsx` around lines 868-883,
in whatever function builds the mascot's dialogue-bubble text (search for the
`text:` / `line:` object return pattern — it's the function that maps `flow.step`
to `{ text, line }` for the buddy dialogue box):

```ts
if (flow.step === "repeat" && currentTurn) {
  const sentence = flow.improvedSentence ?? currentTurn.targetExample;
  return {
    text: `Try this: ${sentence}`,   // <-- speaks the FULL target sentence text
    line: { lineKind: "improved_sentence", turnOrder: currentTurn.turnOrder },
  };
}

if (flow.step === "aiFeedback" && flow.originalFeedback?.kind === "needsCorrection") {
  return {
    text: `Try this: ${flow.originalFeedback.improvedSentence}`,  // <-- same pattern
    line: currentTurn
      ? { lineKind: "improved_sentence", turnOrder: currentTurn.turnOrder }
      : null,
  };
}
```

This confirms the user's complaint: the dialogue box literally embeds the answer
sentence into the displayed/spoken text ("Try this: <full corrected sentence>")
rather than a generic "Try this" prompt with the sentence shown only in a separate
card. **This is very likely tangled with Task 2** — if this dialogue-bubble text IS
currently the only place the target sentence appears (since the "Say this" card is
dead via `showCocoLine={false}`), then this "Try this: <sentence>" line is
probably load-bearing/intentional as a workaround, not a bug — removing it without
also fixing Task 2's card-visibility gap would remove the sentence from the UI
entirely.

**Not fixed. Needs a design decision from the user first**, along the lines of:
"should the target sentence be spoken/shown inline in Coco's dialogue bubble, or
exclusively in the separate 'Say this' card (which would need `showCocoLine` wired
back to `true`), or both?" Don't just delete the sentence from one location without
confirming the other location actually renders it.

---

## Suggested order of operations for the next session

1. **Re-verify the audio fix from scratch** in the user's real environment (their
   own `npm run dev` on port 3000, real browser devtools, not the agent preview
   tool). Confirm whether the `resumeAudioContext`/`ensureAnalyserReady` ordering
   fix actually resolves it or whether there's a second bug. Consider adding
   temporary console logging of `sharedAudioContext.state` at each lifecycle point
   if it's still silent.
2. **Get the user to clarify Task 3** — exactly which sprite/expression they're
   seeing and in what flow state, since "thinking" (real, reachable) and
   "encouraging" (currently unreachable) may be getting conflated.
3. **Ask the user directly about the `showCocoLine` / dialogue-bubble-text
   tension** (Tasks 2 + 4 together) before changing any more copy — this is a
   real design fork, not a copy-cleanup task. Don't guess; the two plausible
   fixes (enable the card vs. keep the inline dialogue as the source of truth)
   have very different visual outcomes.
4. Only after 2 and 3 are resolved, make further edits — right now Task 2's edit
   (already made, described above) may have made things *worse* by deleting the
   only remaining instruction text if the "Say this" card truly never renders.
   Consider whether to revert the Task 2 diff pending the user's answer.

## Repro access used this session (for reference)
- Join code: `ZJE9FT`, name: `test`, PIN: `1234` → lands on `/student/home`,
  homework list includes "July 1st Homework" (2 turns) reachable via a "Continue"
  link to `/student/missions/b2bf475c-82f8-4e68-bbe6-9abc72172e66`.
