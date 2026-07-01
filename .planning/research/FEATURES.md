# Feature Research

**Domain:** Character-driven speaking-practice UX for elementary ESL learners (TTS mascot voice, pronunciation scoring, VN-style presentation, bounded AI conversation) — v2.0 "Coco Comes Alive"
**Researched:** 2026-07-01
**Confidence:** MEDIUM (web-sourced, cross-checked across multiple vendors/products; no single-source claims treated as authoritative)

**Scope note:** This supersedes the v1.0-era FEATURES.md in this same path. v1 features (auth, roster, mission generation, guided voice flow, transcript-first review, etc.) are shipped and out of scope for this research — see PROJECT.md "Validated" section. This file covers only the five NEW v2.0 point releases: Coco Voice (TTS), pronunciation scoring, VN-style mascot, dynamic bounded conversation ("Coco Chat"), and the UI overhaul.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist once a product markets itself as "Coco talks to you" or "practice pronunciation." Missing these makes the v2.0 features feel broken or half-built, not just minimal.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| TTS plays automatically when Coco's line appears | If Coco has a "voice," silence when her line shows up reads as a bug, not a design choice. Duolingo characters speak every line they show. | LOW | Use a fast/low-latency model tier (e.g., ElevenLabs Flash ~75ms) so playback starts near-instantly on line render; don't block UI on audio generation — fetch/stream while text renders. |
| Replay / tap-to-hear-again on Coco's line | Kids need to re-hear a target sentence before repeating it; this is core to the existing "meaning-first, then repeat target sentence" flow. | LOW | Should reuse the same audio (cache per mission/line) rather than regenerate on each tap — cost and latency both benefit. |
| Overall pronunciation score is understandable at a glance (not raw numbers) | ELSA, Speechace, and Azure all expose 0-100 phoneme/word scores in their raw API, but every child-facing product wraps this in a simpler visual (stars, color, simple face/emoji) before showing kids. | LOW-MEDIUM | The 0-100 API score is an input signal, not the UI. Map to 3-4 bands (e.g., "got it" / "close" / "try again") rather than showing "62/100." |
| Word-level highlight of what to fix, not just a total score | Table stakes for phoneme-scoring products (Speechace, Azure, ELSA) — the whole value proposition of per-word scoring is showing *which* word needs work, not just a pass/fail. | MEDIUM | Directly reuses v1's per-turn transcript capture; needs the target sentence tokenized and aligned to the scoring API's word-level output. |
| Mascot has a visible "speaking" state distinct from "idle/listening" | Basic VN/character convention — if Coco is on screen at all, static-during-speech reads as broken lip sync or a frozen app. | LOW-MEDIUM | Does not require full lip-sync; a simple mouth-open/closed toggle or bounce animation synced to audio start/stop covers most of the perceived quality gap cheaply (see Anti-Features on lip-sync precision). |
| Dialogue box with clear, high-contrast text sized for kids | Base VN convention, doubles as an ESL accessibility need (many students are still building reading fluency in English). | LOW | Reuse existing mission-flow typography conventions; this is a styling task more than a new system. |
| Conversation has a visible/implied end (not infinite) | Every bounded-chat product researched (Duolingo Video Call, Univerbal, Talkpal) makes the boundary explicit — a fixed turn count or time cap communicated to the user, not a silent cutoff. | LOW-MEDIUM | v2.4 spec already says "~5 turns" — enforce this server-side (hard stop), and telegraph it in UI (e.g., a turn counter or Coco visibly wrapping up), matching Duolingo's "psst, say it's time to go" pattern. |
| Teacher can still read a plain transcript of the AI conversation | Non-negotiable per existing constraint: "Teacher review must be transcript-first." Any new AI-conversation feature must not regress this. | LOW (if transcript capture is reused from v1) | v2.4's "teacher-verifiable transcript" requirement in PROJECT.md — extend the existing per-turn transcript capture to cover Coco's dynamic turns, not just the fixed target-sentence turn. |

### Differentiators (Competitive Advantage)

Features that set Coco English apart within its niche (teacher-linked, classroom-anchored homework, not generic open-market language app). Not required for v2.0 to "work," but this is where the "VN feel, homework substance" thesis pays off.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Cloned teacher voice as an optional TTS voice | No competitor at this scale offers "your actual teacher's voice says the line." For a 6-student, teacher-operated class, this is a highly personal, low-cost differentiator (ElevenLabs voice cloning) that generic apps (Duolingo, ELSA) cannot replicate per-classroom. | MEDIUM | Needs a one-time teacher voice sample + consent flow; keep as an optional toggle, default to a stock friendly voice so it isn't a hard blocker for launch. |
| Per-mission scene premise generated from the target grammar pattern | This is the actual novel mechanic in v2.4 — turns "practice 'I went to the park'" into a tiny framed scene ("Coco just got back from a trip and wants to know about your weekend"). Univerbal/Talkpal do this generically (100+ canned scenarios); Coco's version is generated per-mission from teacher-input target English, so it is always aligned to what was taught in class that day. | MEDIUM-HIGH | Reuses the existing AI mission-generation pipeline (Phase 6) — this is an extension of "target English -> mission," not a new subsystem. Scene premise + Coco's opening line should be generated together so Coco always "shares first." |
| Coco has a stable, recognizable personality across missions | Continuity (same buddy, consistent voice/expressions/catchphrases) builds the parasocial rapport that keeps young learners motivated over weeks, which is the whole justification for the character layer per PROJECT.md context. | LOW-MEDIUM | Already decided in v1 (`characterId`, one recurring buddy) — v2.0 just needs voice/expression choices to stay consistent with the established Coco personality, not introduce a second "voice" for the character. |
| Word-level feedback visible to the teacher, not just the student | Table-stakes apps (Speechace, ELSA) are consumer-facing and stop at showing the student their own score. A teacher-linked product can differentiate by surfacing the same per-word breakdown in teacher review, turning pronunciation scoring into a diagnostic tool for the teacher, not just a student mini-game. | MEDIUM | Extends existing transcript-first review screen; reuse REV-0x review UI patterns from v1 rather than building a parallel view. |
| Expression state tied to conversational content, not just audio amplitude | A mascot that looks happy when praising a good attempt and encouraging (not sad/disappointed) on a miss reinforces the "balanced correction style, no harsh failure language" principle already established in v1's mission flow. | MEDIUM | 3-5 expression states (idle, speaking, happy/celebrating, encouraging/neutral-on-miss, thinking) is enough — do not build a large expression matrix (see anti-features on production cost). |

### Anti-Features (Commonly Requested, Often Problematic)

Features that look like natural extensions of "make Coco feel alive" but create real cost, safety, or product-focus problems for this specific product (young ESL kids, teacher-verifiability, single-teacher-operator budget).

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Raw numeric pronunciation score (e.g., "62/100") shown directly to the child | Scoring APIs (Speechace, Azure, ELSA) return exactly this number, so it's the "free" thing to expose | Numeric percentage scoring, especially precise/low scores, functions like a grade and can be discouraging for elementary learners still building confidence in a foreign language; research on gamification misuse shows controlling/precise feedback undermines intrinsic motivation in kids | Map score bands to 3-4 friendly buckets (e.g., "Nice!" / "Almost!" / "Let's try that word again") with color/icon, not a number; keep the raw score server-side for the teacher-facing view only |
| Heart/life-loss or streak-break mechanics tied to pronunciation misses | Common in mainstream apps (Duolingo hearts) and easy to bolt onto a scoring feature | Documented as an anxiety-inducing pattern that blocks practice entirely once "lives" run out — directly conflicts with the existing "no harsh failure language" principle and the goal of maximizing spoken output reps | Unlimited retries with light encouragement (matches ELSA's own approach: unlimited practice until pronounced correctly) |
| Full facial/lip-sync animation (frame-accurate viseme mapping like Duolingo's 15-20 shape system) | "If Duolingo does full lip sync, shouldn't Coco?" | Duolingo's viseme system required voice actors, ML-trained TTS per character, and a dedicated animation engine (Rive) built by a much larger team — wildly disproportionate to a single-teacher, 6-student product; largely decorative beyond a basic speaking/idle toggle | Binary or simple 3-state mouth animation (closed / open / mid) driven off audio playback start/stop events, not phoneme timing |
| Open-ended free chat with Coco (no scene, no turn limit) | "More conversation = more practice" is an intuitive but wrong inference | Explicitly called out as Out of Scope in PROJECT.md ("Long-form free chat... guided missions reduce AI drift"); also breaks teacher-verifiability — a teacher cannot quickly assess an unbounded transcript, and AI drift risk (off-topic, inappropriate, or ungraded content) rises with turn count | Fixed ~5-turn bounded exchange anchored to one scene premise and one target pattern, matching v2.4 spec; enforce server-side turn cap plus a "wrap up" system nudge (Duolingo pattern) rather than relying on the model to self-limit |
| Story arc / continuity across missions (Coco "remembers" past missions, references earlier events) | Natural next step once Coco has a personality and talks — feels like it would deepen engagement | Explicitly Out of Scope per PROJECT.md ("no branching storyline, no arc across missions... standalone VN remains a separate, deferred product"); scope creep toward the deferred VN product, risks turning teacher-verifiable homework review into story continuity tracking | Keep each mission self-contained; Coco's personality is consistent (same character traits/voice) but does not carry a plot memory between missions |
| Romance/relationship or "affection meter" mechanics with Coco | Common VN-genre convention that "VN feel" might be assumed to imply | Explicitly Out of Scope in PROJECT.md ("Romance or dating mechanics — not appropriate for the classroom use case"); serious child-safety and brand-trust risk for a classroom product used by elementary students and reviewed by teachers | None needed — the "VN feel" being targeted is presence/voice/scene-framing only, not VN relationship systems |
| Large expression/pose library or multiple outfits/scenes per character | Feels like "more content = more life" | High art/production cost for one recurring buddy at this scale (single teacher, ~$30/mo AI budget, no art budget implied); mostly decorative once the core 3-5 functional states (idle, speaking, happy, encouraging, thinking) exist | Ship a small, purposeful expression set tied to functional states, not a costume/pose gallery |
| Real-time conversational voice pipeline (low-latency speech-to-speech loop, barge-in/interruption handling) | "Real-time" sounds like the natural target once TTS + AI chat both exist | Full conversational voice AI (like OpenAI Realtime API or Duolingo's GPT-4o video call stack) is high complexity/cost and introduces new failure modes (interruption handling, background noise, latency stacking with STT+LLM+TTS) disproportionate to a bounded ~5-turn per-mission exchange for 6 students | Keep the existing turn-based flow: student speaks a turn -> transcribed (Whisper, already built) -> Coco's next line is generated and TTS'd -> played. Not a live duplex voice call. |
| Automatic strict pass/fail gating on pronunciation score (must re-record until score threshold met) | Feels rigorous, "makes sure they actually learned it" | Conflicts with existing philosophy of accepting understandable meaning first and avoiding harsh failure gates; could block homework completion for kids with real but non-disqualifying accent variation, undermining the "verify practice happened" core value | Show the score/feedback but let completion be governed by the existing status-bucket system (attempted/completed/needs retry), with score as *information* for the student/teacher, not a submission blocker |

## Feature Dependencies

```
Coco Voice (TTS) [v2.1]
    |__requires__> existing mission text generation (target sentence, Coco's lines) [v1, done]

Pronunciation scoring [v2.2]
    |__requires__> existing per-turn audio capture + target sentence text [v1, done]
    |__enhances__> teacher review UI (adds word-level detail to existing transcript view)

Mascot (VN-style) [v2.3]
    |__requires__> Coco Voice (TTS) [v2.1] for speaking-state sync
    |__enhances__> existing mission flow screens (adds visual presence, doesn't replace flow logic)

Dynamic turns + scene framing ("Coco Chat") [v2.4]
    |__requires__> Coco Voice (TTS) [v2.1] (Coco needs to speak her dynamic lines, not just fixed target sentences)
    |__requires__> Mascot presence [v2.3] recommended but not strictly blocking (text-only fallback is viable)
    |__requires__> existing AI mission-generation pipeline [v1 Phase 6] (scene premise generated from target pattern reuses this)
    |__conflicts__> Anti-feature "open-ended free chat" (must stay bounded ~5 turns, server-enforced)

UI overhaul [v2.5]
    |__requires__> v2.1-v2.4 all shipped (explicitly ordered last per PROJECT.md so layout isn't redone mid-stream)

Teacher-facing word-level pronunciation detail
    |__requires__> Pronunciation scoring [v2.2]
    |__requires__> existing transcript-first teacher review [v1 Phase 7]
```

### Dependency Notes

- **v2.3 (Mascot) requires v2.1 (Voice):** a speaking-state animation with no audio to sync to is either faked (bad) or meaningless; ship voice first so mascot's "speaking" state has a real signal to key off.
- **v2.4 (Coco Chat) requires v2.1 (Voice):** dynamic AI-generated turns still need to be spoken aloud to match the "Coco speaks" experience established in v2.1; doing v2.4 before v2.1 would mean shipping silent dynamic dialogue, then retrofitting voice onto a more complex system.
- **v2.4 enhances from v2.3 but does not strictly require it:** scene framing and bounded chat can function as a text+voice experience without the on-screen mascot, but pairing them is where the "VN feel" thesis is fully realized. Given v2.3 is scoped before v2.4 in the roadmap, this ordering is already correct.
- **Pronunciation scoring enhances teacher review, doesn't replace it:** the existing transcript-first review (v1 Phase 7) remains the primary surface; word-level scores are additive detail, not a new review paradigm. This keeps the "teacher review must be fast" constraint intact.
- **Anti-feature "open-ended chat" conflicts with v2.4:** the whole design challenge of v2.4 is implementing bounded conversation (scene + target pattern + turn cap) without sliding into the free-chat anti-pattern already ruled out in PROJECT.md. Use Duolingo's pattern: explicit system-level turn cap + "wrap it up" nudge, not reliance on the LLM's own judgment.

## MVP Definition (per point release, not a single v2.0 MVP)

Per PROJECT.md, v2.0 ships as five ordered point releases, each independently verified in production. Treat each as its own "launch with" set below.

### v2.1 Coco Voice — Launch With

- [ ] TTS playback of Coco's existing scripted lines (meaning-first prompt + target sentence) — this is the entire scope; no new content generation needed
- [ ] Tap-to-replay on Coco's line
- [ ] One default stock voice — essential to ship without waiting on teacher voice cloning/consent flow

### v2.1 Add After Validation

- [ ] Cloned teacher voice option — add once default voice pipeline is proven stable and consented recording workflow exists

### v2.2 Pronunciation Scoring — Launch With

- [ ] Word-level score computed against the existing stored per-turn audio + target sentence (reuses v1 data, no new capture needed)
- [ ] Simplified band-based feedback UI to student (not raw score)
- [ ] Word-level detail surfaced in existing teacher review screen

### v2.2 Add After Validation

- [ ] Phoneme-level (not just word-level) detail, if word-level proves too coarse for teacher diagnostic needs

### v2.3 Mascot — Launch With

- [ ] Static Coco character art, waist-up, one background scene
- [ ] 3 functional states: idle, speaking (synced to v2.1 audio), and one reaction state (happy/encouraging)
- [ ] Dialogue box UI

### v2.3 Add After Validation

- [ ] Additional expression states (thinking, celebrating variations) once base states are validated with real students
- [ ] Scene backgrounds per mission (currently one static scene is enough for MVP)

### v2.4 Coco Chat — Launch With

- [ ] Per-mission scene premise generated from target pattern (extends existing AI mission-generation pipeline)
- [ ] Coco opens the exchange first (matches "Coco shares first, has personality")
- [ ] Hard server-enforced ~5-turn cap with a wrap-up system nudge
- [ ] Full transcript capture of all dynamic turns, teacher-reviewable exactly like v1 turns

### v2.4 Add After Validation

- [ ] Persistent "facts learned about student" carried between missions (Duolingo pattern) — explicitly risks drifting toward Out-of-Scope story continuity; only add if a real teacher need emerges, and only as light personalization, not plot memory

### Future Consideration (beyond v2.0)

- [ ] Cloned teacher voice as default rather than optional — defer until enough teachers use the product to justify a smoother consent/recording UX
- [ ] Phoneme-level real-time visualization (waveform-style feedback) — defer until word-level scoring is validated as useful/actionable to teachers
- [ ] Any move toward the standalone VN product (story arcs, branching, large cast) — remains explicitly out of scope per PROJECT.md; do not let v2.3/v2.4 momentum pull the roadmap toward it

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| TTS playback of scripted Coco lines (v2.1) | HIGH | LOW | P1 |
| Tap-to-replay | MEDIUM | LOW | P1 |
| Word-level pronunciation feedback (student-facing, banded) | HIGH | MEDIUM | P1 |
| Word-level pronunciation detail (teacher-facing) | MEDIUM | LOW (additive to existing review UI) | P1 |
| Static mascot with idle/speaking/reaction states | HIGH | MEDIUM | P1 |
| Scene premise generation from target pattern | HIGH | MEDIUM | P1 |
| Bounded ~5-turn dynamic conversation with server-enforced cap | HIGH | HIGH | P1 |
| Cloned teacher voice | MEDIUM | MEDIUM | P2 |
| Additional expression states beyond base 3 | LOW-MEDIUM | MEDIUM | P2 |
| Phoneme-level (vs word-level) scoring detail | MEDIUM | MEDIUM-HIGH | P2 |
| Multiple mission backgrounds/scenes | LOW | MEDIUM | P3 |
| Persistent cross-mission "facts about student" memory | LOW-MEDIUM (risk of scope creep) | HIGH | P3 |

**Priority key:**
- P1: Must have for the respective point release to be considered shipped
- P2: Should have, add once P1 is validated in production with real students
- P3: Nice to have, watch for scope creep toward the deferred standalone VN product

## Competitor Feature Analysis

| Feature | Duolingo | ELSA Speak / Speechace / Azure | Coco English's Approach |
|---------|----------|-------------------------------|--------------------------|
| Character voice | Custom-recorded ML voices per character + full viseme lip-sync via Rive engine | N/A (not character-driven) | Off-the-shelf TTS (ElevenLabs) with optional teacher voice clone; simple speaking-state animation, not frame-accurate lip sync — proportionate to team/budget size |
| Pronunciation feedback | Not a core Duolingo feature; general correctness only | Phoneme/word/syllable-level scores via API; color-coded, unlimited-retry UX; no harsh gating | Reuse same class of API (Speechace/Azure/ELSA per PROJECT.md options); band the score into friendly categories for kids, expose raw detail only to teacher |
| Character presentation | Rive-based animated character system, full video-call-like experience (Duolingo Max) | N/A | Static 2D VN-style presentation (waist-up sprite + dialogue box), not animated video — VN "feel" without VN production cost |
| Bounded AI conversation | Video Call with Lily: system-scripted scenario + time cap + turn-limit nudge + GPT-4o backend | N/A (not conversational) | Directly adopt Duolingo's pattern: scene-scoped system prompt + hard turn cap + wrap-up nudge, but keep turn-based (not real-time voice call) and always transcript-capturable for teacher review |
| Guardrails against drift | Explicit system-level instructions per scenario, purpose-driven calls | N/A | Scene premise + target pattern baked into system prompt for each mission (like Univerbal/Talkpal's scenario libraries), scoped tighter (single target grammar pattern, ~5 turns, one teacher-verifiable transcript) |

## Sources

- [Giving our characters voices — Duolingo blog](https://blog.duolingo.com/character-voices/)
- [Lip syncing lessons: the next step in bringing our characters to life — Duolingo blog](https://blog.duolingo.com/world-character-visemes/)
- [Get to know the AI behind every Video Call with Lily — Duolingo blog](https://blog.duolingo.com/ai-and-video-call/)
- [Video Call lets you have real life conversations with Lily — Duolingo blog](https://blog.duolingo.com/video-call/)
- [Duolingo's AI-powered Video Call brings Lily to life with Rive](https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life)
- [Speechace — Pronunciation and fluency assessment](https://www.speechace.com/)
- [Handling phoneme and syllable scores — Speechace API docs](https://api-docs.speechace.com/api-reference/score-text-pronunciation/handling-phoneme-and-syllable-scores)
- [ELSA Speech Analyzer](https://speechanalyzer.elsaspeak.com/)
- [Speech Pronunciation Assessment is Generally Available — Microsoft Community Hub](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/speech-pronunciation-assessment-is-generally-available/3740894)
- [Interactive language learning with pronunciation assessment — Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-learning-with-pronunciation-assessment)
- [How to Master 2D Visual Novel Game Design — Brave Zebra](https://www.bravezebra.com/blog/game-design-visual-novel-2d/)
- [Best AI Speaking Apps 2026 — Lingtuitive](https://lingtuitive.com/blog/best-ai-speaking-apps)
- [When Gamification Spoils Your Learning: A Qualitative Case Study of Gamification Misuse in a Language-Learning App (arXiv)](https://arxiv.org/abs/2203.16175)
- [Gamification in mobile-assisted language learning: systematic review of Duolingo literature — Taylor & Francis](https://www.tandfonline.com/doi/full/10.1080/09588221.2021.1933540)
- [ElevenLabs Text to Speech docs](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)
- [ElevenLabs Stream speech API docs](https://elevenlabs.io/docs/api-reference/text-to-speech/stream)
- [ElevenLabs Pricing](https://elevenlabs.io/pricing)

---
*Feature research for: Coco English v2.0 "Coco Comes Alive"*
*Researched: 2026-07-01*
