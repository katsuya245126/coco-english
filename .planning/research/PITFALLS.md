# Domain Pitfalls

**Domain:** Adding real-time TTS, pronunciation scoring, a 2D VN mascot, bounded conversational AI, and a UI overhaul to a shipped teacher-linked ESL speaking-homework app for elementary children ("Coco Comes Alive" v2.0)
**Researched:** 2026-07-01
**Overall confidence:** MEDIUM (web-sourced, cross-checked across multiple independent results per topic; no vendor-account-specific benchmarking against this app's actual student population yet — that remains a gap to close during each release)

## Research Basis

This is a **milestone-specific** pitfalls pass for v2.0, not a repeat of the general child-ESL-app pitfalls already captured for v1.0 (that earlier research, dated 2026-06-25, is superseded by this file — see git history if the v1.0 content is needed). Findings are organized by the five target point releases in `PROJECT.md` (v2.1 Coco Voice → v2.5 UI overhaul), plus the cross-cutting concerns (child-safety/privacy, scene framing, UI regression) that apply across releases. Confidence is MEDIUM throughout: findings are corroborated across 3-10 independent web sources per question, but none are validated yet against this app's real students (6 elementary Korean/general ESL learners) — several pitfalls below explicitly call out "verify against your actual users" as part of prevention.

## Critical Pitfalls

### Pitfall 1: TTS Cost Blowup From Uncached Regeneration

**What goes wrong:** Every time a mission loads, the app re-synthesizes Coco's spoken lines from ElevenLabs (or another TTS vendor) even though the underlying text — mission intros, feedback templates, common encouragement phrases — repeats constantly across students and sessions. At $0.10/1,000 characters (Multilingual) this looks trivial per-call, but it compounds: every student replay, every teacher preview, every re-generated hint pushes real spend against a genuinely small $30/mo budget.

**Why it happens:** TTS is added as "call the API, play the audio" without a caching layer, because early manual testing has low volume and the cost feels invisible. Nobody notices until usage patterns (6 students × repeated missions × replays) turn "invisible" into a monthly bill surprise.

**How to avoid:** Cache synthesized audio keyed by a hash of `(text, voiceId, model, params)` in Supabase Storage (this app already stores audio clips — reuse that infrastructure). Check cache before any TTS call; only call the vendor on a genuine miss. Pre-synthesize and permanently cache all static/templated Coco lines (intros, encouragements, instructions) at mission-authoring time rather than at playback time — only dynamic/AI-generated lines need a runtime cache check.

**Warning signs:** No `audioHash` or content-addressed key in the TTS data model; TTS calls happen inside a component that re-renders/re-mounts (e.g., on every playback tap); no dashboard or log line showing TTS spend per day; ElevenLabs usage dashboard shows character counts far exceeding the count of *unique* mission lines actually authored.

**Phase to address:** v2.1 (Coco Voice) — must ship with a cache-first design from day one; retrofitting a caching layer after a cost incident is far more expensive than building it in v2.1's first pass.

---

### Pitfall 2: Voice-Cloning the Teacher Without Documented, Specific Consent

**What goes wrong:** The v2.1 spec mentions "a cloned teacher voice" as an option. If the teacher's voice is cloned informally (a quick recording, verbal "sure, go ahead") without written, specific, informed consent covering exactly how the clone will be used (which app, which students, retention, re-use, whether the clone or its outputs could ever be used elsewhere), this creates real legal exposure — voice cloning without documented consent has generated actual lawsuits (right-of-publicity, privacy, and cases where clones were used beyond the scope originally understood).

**Why it happens:** The teacher is a trusted, willing collaborator (a friend/product owner), so the team treats verbal agreement as sufficient. The line between "quick personal favor" and "voice biometric asset stored in a production system serving multiple students" gets crossed without anyone drafting explicit terms.

**How to avoid:** Even for a friendly single-teacher pilot, get **written, specific, informed consent**: what the clone will be used for (this app only), retention (can it be deleted?), whether ElevenLabs (or any TTS vendor) may retain/reuse the underlying voice sample for its own model training (check the vendor's ToS for voice-clone data use — this needs to be opted out explicitly, not assumed), and an easy revocation path. Treat it exactly like PII: written consent record stored, not just a hallway conversation.

**Warning signs:** No consent document exists anywhere in the repo/docs; nobody has checked ElevenLabs' voice-cloning ToS for whether cloned voice data is used to improve their models; the teacher hasn't been told they can revoke the clone later.

**Phase to address:** v2.1 (Coco Voice) — before the cloned-voice option ships, not after. If consent process isn't ready in time, ship v2.1 with only a stock/licensed voice and defer teacher-voice cloning to a later point release.

---

### Pitfall 3: Pronunciation Scoring Penalizes Normal Child/Non-Native Speech as "Wrong"

**What goes wrong:** Off-the-shelf pronunciation-scoring vendors are trained primarily on adult, often native-accented speech. Applied naively to elementary Korean ESL students, a score-first UI can flag entirely normal developmental speech patterns (disfluencies, non-native phoneme substitutions that don't harm intelligibility) as failures — discouraging a 7-10 year old who is actually doing fine for their level and stage of language acquisition.

**Why it happens:** Teams default to showing the raw vendor score/threshold because "the API gave us a number," without validating that number's meaning for *this specific population* (young, non-native, still-developing speech). Vendor marketing claims ("works great for kids and non-native speakers") get taken at face value instead of spot-checked against real recordings from the actual students.

**How to avoid:** Choose a vendor explicitly engineered to avoid penalizing accent alone when it doesn't harm intelligibility (SpeechAce publicly positions itself this way; Azure similarly claims broad age/accent training — verify both against a handful of real recordings from this app's actual 6 students before launch). Do not surface a bare numeric score to a child; translate into qualitative, encouraging tiers (e.g., "Great job!" / "Try again — listen closely to this sound") calibrated with a wide-enough "pass" band that normal non-native/child variation isn't flagged as failure. Keep raw scores available to the teacher (who has context) but hide precision from the student.

**Warning signs:** Vendor score shown to students as a raw percentage/number; pass threshold set from vendor documentation defaults rather than tuned against sample recordings of this app's own students; no manual listening pass by the teacher before launch to check whether flagged "errors" are actually developmentally normal.

**Phase to address:** v2.2 (Pronunciation scoring) — the threshold/UX design decision must happen before this ships, using recordings already captured in v1 (the app already stores per-turn audio) as a validation set.

---

### Pitfall 4: Discouraging Feedback UX Turns Practice Into a Test

**What goes wrong:** A scoring feature that shows red X's, low percentages, or blunt "incorrect" language undermines the entire v1 product thesis — "accepts understandable meaning first, then shows the better target-form sentence" — by reintroducing exactly the harsh, test-like correction style the MVP was designed to avoid. Kids disengage from homework that feels like it's grading them harshly.

**Why it happens:** Pronunciation-scoring UI patterns are often borrowed wholesale from adult-oriented apps (Duolingo-style streak/score pressure, or enterprise assessment tools) without re-designing for elementary, low-stakes homework framing.

**How to avoid:** Reuse this app's own existing correction philosophy: understandable-meaning-first, celebratory framing, retry-without-penalty. Immediate visual+audio positive feedback for effort regardless of score; frequent small rewards; short interaction bursts; no visible "grade" or leaderboard-style comparison. Any negative-sounding language should be reframed as coaching ("Let's try that sound again with Coco") not evaluation ("Wrong").

**Warning signs:** UI mockups include percentage scores, red color-coding, or "incorrect" language visible to the student; no product review pass by someone thinking specifically about a discouraged 8-year-old's reaction to the screen.

**Phase to address:** v2.2 (Pronunciation scoring) — UX design pass before backend scoring integration is wired into the student-facing flow.

---

### Pitfall 5: Mascot Asset Pipeline Scope Creep

**What goes wrong:** "2D Coco on-screen" quietly grows into multiple expression states, blink animations, alternate outfits/seasons, multiple backgrounds per scene premise, and eventually a second character — each addition roughly doubling asset and animation-state work. What was meant to be a lightweight VN-*feel* layer becomes a full asset production pipeline that stalls the release.

**Why it happens:** Once character art exists, it's tempting to keep adding "just one more" expression or scene variant because each individual addition feels small; the same failure mode causes indie VN projects to blow scope (documented pattern: over 70% of surveyed indie devs cite "scope too large" as a cause of missed deadlines).

**How to avoid:** Ship v2.3 with **one sprite, a small fixed set of expression/mouth states** (e.g., idle, talking, happy — 3-4 states max) and **no per-scene background variation** in the first cut. Treat any additional expression, background, or second character as a separate, explicitly-scoped future decision, not an implicit extension of v2.3.

**Warning signs:** Asset backlog growing during v2.3 execution instead of being fixed before starting; conversations about "what if Coco also had a happy/surprised/thinking face for X" mid-build; scene backgrounds requested per mission topic rather than reused generically.

**Phase to address:** v2.3 (Mascot) — scope the sprite/expression set explicitly in the phase plan before any art is commissioned or generated.

---

### Pitfall 6: Uncanny or Off-Brand Mascot Undermines Trust With Kids (and Teachers)

**What goes wrong:** A semi-realistic or inconsistently-styled character reads as unsettling to children rather than warm and inviting — the opposite of the "supportive classmate buddy" brand this app has built since Phase 4. Mixing photorealistic elements with cartoon proportions (a common AI-image-generation failure mode) is the most likely trigger, since inconsistent realism — not the realism level itself — is what causes the uncanny valley effect.

**Why it happens:** If mascot art is generated or sourced from stock/AI-image tools without a consistent style guide, different assets (idle pose vs. talking pose vs. expressions) can end up rendered at different fidelity levels, creating visual inconsistency even within a single character.

**How to avoid:** Commit to one fully-stylized, cartoon-consistent art direction (childlike proportions — round head, simple features) applied uniformly across every asset; avoid photorealistic textures or proportions anywhere in the sprite set. If using AI image generation, lock a single reference sheet/style prompt and validate every new asset against it before use. Pilot the finished mascot with a couple of the actual elementary students (or the teacher, as their proxy) before wide rollout — comprehension and comfort with the character matters more than internal team taste.

**Warning signs:** Character proportions or rendering style shift noticeably between assets; internal reviewers describe the mascot as "kind of creepy" or "off" even once, which is a strong signal worth acting on immediately rather than dismissing.

**Phase to address:** v2.3 (Mascot) — style-guide lock before asset production; informal validation with the teacher/students before shipping to production.

---

### Pitfall 7: Mascot Performance Failure on Low-End School/Home Devices

**What goes wrong:** Animated sprite/expression-state transitions, especially with per-frame image swapping or heavy Lottie files, cause jank, battery drain, or outright failure on the older tablets/Chromebooks/budget phones elementary students and their families are likely to use — this app's actual usage context, unlike a general consumer web app.

**Why it happens:** Development and testing happen on the developer's own modern laptop/phone; animation cost is invisible until tested on the actual lowest-common-denominator device the target students use.

**How to avoid:** Use sprite sheets/texture atlases instead of many separate image files to minimize draw calls; keep Lottie/animation complexity low (prefer dotLottie compression if using Lottie at all) and cap simultaneous animated elements; test explicitly on a low-end Android tablet/older iPad, not just the dev machine. Consider a simple capability check (e.g., reduced-motion preference, rough device-memory heuristic) that falls back to a static image + audio-only experience if performance is poor, so the feature degrades gracefully rather than freezing the app.

**Warning signs:** Animation only ever tested on the developer's primary device; no fallback/reduced-motion path exists; first real classroom test reveals stutter or frozen frames.

**Phase to address:** v2.3 (Mascot) — build the low-end-device fallback path as part of the initial phase, not as a post-launch patch.

---

### Pitfall 8: Animation/Audio Desync Between Coco's Mouth and TTS Playback

**What goes wrong:** Coco's talking-state animation drifts out of sync with the actual audio — mouth stops moving before speech ends, or lip movement doesn't track speech pacing — because the two are driven by separately-estimated timers rather than the same underlying clock.

**Why it happens:** It's simplest to start/stop a looping "talking" animation on a fixed timer approximated from expected audio duration, rather than binding animation state directly to the actual `<audio>` element's playback events. Any latency in TTS generation, network jitter, or variable speech length breaks a fixed-timer approach immediately.

**How to avoid:** Drive mascot mouth/talking state directly off the audio element's own playback events (`play`, `pause`, `ended`, and periodic `timeupdate`) rather than a separate JS timer — treat the audio playback clock as the single source of truth. For this project's scope (simple talking/idle toggle, not full phoneme-level lip sync), this is enough; full viseme-level lip sync is unnecessary complexity given the "waist-up, dialogue box" VN framing in the PROJECT.md description.

**Warning signs:** Animation timing implemented via `setTimeout`/`setInterval` estimated from text length rather than actual audio duration; mouth state doesn't stop exactly when audio ends in manual testing; behavior differs between fast and slow network conditions (a strong tell that a fixed timer, not the real audio clock, is driving state).

**Phase to address:** v2.3 (Mascot) — this is the phase where TTS (v2.1) and mascot (v2.3) integrate; get the audio-driven state binding right here rather than treating it as a separate later fix.

---

### Pitfall 9: Coco Chat Drifts Off the Target Grammar Pattern

**What goes wrong:** The bounded conversational feature ("Coco Chat," ~5 turns) starts on-pattern but the LLM's replies drift toward generic small talk or unrelated tangents by turn 3-4 — a well-documented multi-turn LLM failure mode where models can silently abandon an assigned role/task the longer a conversation runs, even when they handle single turns correctly. For this app, drift directly undermines the core value proposition: practice tied to the teacher's specific target English, not open-ended chat (explicitly listed as Out of Scope in PROJECT.md).

**Why it happens:** Teams rely on a system prompt alone ("stay focused on the target pattern") without any structural enforcement, assuming the model will self-regulate for the whole conversation. System-prompt-only control degrades measurably as turn count increases.

**How to avoid:** Enforce staying on-pattern architecturally, not just via prompt: (1) re-inject the target pattern and mission context into every turn's prompt (not just the first), rather than relying on conversation history retention; (2) hard-cap turns (the ~5-turn bound already scoped) with a structural stop, not a soft LLM-decided ending; (3) validate each Coco reply against the target pattern/topic before sending it to the student (a lightweight classifier or rule check — flag/regenerate replies that drift too far); (4) design the scene premise (v2.4) to naturally constrain the conversation space rather than opening it up.

**Warning signs:** Manual testing of turn 4-5 conversations produces replies unrelated to the original mission topic or target grammar; no per-turn re-grounding of the system/target-pattern prompt; transcripts (which the teacher reviews) show Coco going off on tangents unrelated to what was assigned.

**Phase to address:** v2.4 (Dynamic turns + scene framing) — this is the core risk of this release; needs explicit per-turn grounding and a hard turn cap built into the conversation architecture from the start, plus teacher-review testing on real transcripts before wide rollout.

---

### Pitfall 10: Coco Chat Breaks Teacher-Verifiability

**What goes wrong:** As conversations get more dynamic and natural, transcripts become harder for a time-constrained teacher to scan quickly — the core design constraint that has held since v1 ("Teacher review must be transcript-first because teachers do not have time to listen to every audio clip"). A more free-flowing chat can look, to a scanning teacher, like the student and Coco just chatted vaguely rather than practiced a specific target structure.

**Why it happens:** Conversational naturalness and scannable structure pull in opposite directions — the more "alive" and personality-driven Coco's replies are, the less the transcript visibly maps back to the assigned grammar target, unless that mapping is made explicit in the data model and UI.

**How to avoid:** Tag/highlight in the teacher review UI exactly where in the transcript the target pattern was used (by student and/or by Coco's modeling of it), rather than relying on the teacher to infer this from a free-flowing conversation. Keep the "Coco shares first" personality turns short and clearly distinguishable in the transcript UI from the turns where the student practices the target form. This preserves the transcript-first review workflow that Phase 5/7 already validated instead of quietly regressing it.

**Warning signs:** Teacher review UI for Coco Chat transcripts looks identical to a raw chat log with no target-pattern markup; UAT feedback from the teacher says review takes noticeably longer for Coco Chat missions than for v1 guided missions.

**Phase to address:** v2.4 (Dynamic turns + scene framing) — verification criteria should explicitly include "teacher can identify target-pattern usage in under N seconds of scanning," tested against the same fast-review bar Phase 7 already established.

---

### Pitfall 11: Unsafe or Off-Topic Content Reaching a Child

**What goes wrong:** An LLM-driven conversational character, even a "bounded" one, can occasionally produce content inappropriate for an elementary classroom context — this is a known risk category serious enough that OpenAI and regulators have specifically targeted AI-minors interactions with new real-time moderation requirements and legislative proposals in 2025-2026. For a 6-student pilot with a trusted teacher, the risk is lower-probability but not zero, and a single incident would be severe given the audience (elementary children) and stakeholder (teacher's own paying/using product).

**Why it happens:** Teams assume a "kid-safe" system prompt is sufficient, without adding a real-time content-safety check on model output before it's ever shown/spoken to a student, and without an incident/rollback plan if something inappropriate does surface.

**How to avoid:** Run every Coco Chat reply through a moderation/safety check (OpenAI's moderation endpoint or equivalent) before playback/display, in addition to prompt-level constraints. Keep the system prompt explicit about audience (elementary children, classroom-safe, no romance/dating — already an Out of Scope decision in PROJECT.md, which is good and should carry into the chat feature's prompt design). Since the teacher already reviews transcripts, make sure any moderation-flagged turn is also flagged distinctly in the teacher review UI so incidents surface quickly rather than being buried in a normal-looking scan.

**Warning signs:** No moderation/safety-check call exists between LLM output and playback; system prompt is the only safety control; no plan for what happens if a review turns up something the teacher considers inappropriate.

**Phase to address:** v2.4 (Dynamic turns + scene framing) — this must be built into the conversational architecture, not treated as a nice-to-have; small user base doesn't reduce this to zero-priority since it's a trust-and-safety issue, not a scale issue.

---

### Pitfall 12: Unbounded Conversation Turns Cause Cost/Runaway Risk

**What goes wrong:** Even with a "~5 turns" design intent, without a hard-enforced cap, edge cases (retry logic, a student re-opening a mission repeatedly, a bug in turn-counting) can let a conversation run far longer than intended, and per-conversation LLM + TTS + pronunciation-scoring costs stack multiplicatively per extra turn. At this app's scale (6 students, $30/mo budget) a single runaway loop is a much larger proportional hit than it would be for a larger product, and could exhaust the monthly AI budget in one session.

**Why it happens:** The "~5 turns" bound is described as a design intent in PROJECT.md but needs to become an enforced server-side limit, not just a client-side UI convention that a retry or bug can bypass.

**How to avoid:** Enforce the turn cap server-side (the same server-owned status/audit pattern this app already uses for assignment status transitions — reuse that architectural pattern here). Add a simple cost/budget guard: track spend per conversation and per day, with a circuit breaker that stops new AI calls if a sane per-conversation or per-day ceiling is exceeded, alerting rather than silently failing.

**Warning signs:** Turn limit only enforced in client-side React state; no server-side check rejects a 6th, 7th, or 20th turn request; no logging of tokens/cost per conversation to spot anomalies.

**Phase to address:** v2.4 (Dynamic turns + scene framing) — build the server-owned turn cap and basic cost tracking as part of the initial architecture, following the same "server owns final state" principle already established for assignment status.

---

### Pitfall 13: Generated Scene Premise Confuses the Grammar Objective

**What goes wrong:** A per-mission scene premise generated from the target pattern ("Coco is at the park and wants ice cream" for a request-form pattern, say) can, if generated carelessly, either not actually connect to the target grammar, or be engaging as a story but distract the student from noticing/practicing the specific target form — literature on generative AI in instructional design warns that narrative/engagement layers risk diluting the measurable learning objective if they aren't kept subordinate to it.

**Why it happens:** Scene generation is naturally optimized for "sounds like a fun premise" rather than "clearly cues the target grammar pattern," especially if the premise-generation prompt doesn't explicitly require the premise to make the target pattern the natural, expected thing to say.

**How to avoid:** Constrain scene-premise generation so the premise is validated (automatically or via a lightweight rule) to actually require/invite the target pattern as the natural response, not just thematically related. Treat the scene premise as in service of the grammar objective, always generated *from* the target pattern (as PROJECT.md already specifies) rather than the reverse. Include the target pattern explicitly and visibly in the mission UI regardless of how flavorful the scene premise is, so the objective is never buried under the story framing.

**Warning signs:** Manual test premises are fun/creative but a teacher reading them can't immediately tell what grammar point they're meant to elicit; scene premises vary wildly in whether they actually cue the target form.

**Phase to address:** v2.4 (Dynamic turns + scene framing) — validate scene-premise generation against a checklist ("does this premise make the target pattern the obvious thing to say?") before shipping, and have the teacher review a batch of generated premises during UAT.

---

### Pitfall 14: Child Voice/Biometric Data Sent to New Third-Party AI Vendors Without Updated Consent/DPA Coverage

**What goes wrong:** v2.0 introduces new vendors (TTS provider, pronunciation-scoring vendor) that will process children's voice audio — a 2025 COPPA rule update explicitly classifies voiceprints and audio/video recordings as covered personal information for children under 13, and separately requires parental consent before that data is shared with third parties, especially for AI/ML training use. The v1.0 privacy design (short per-turn clips, limited retention) was scoped for storage/playback, not for routing student audio through new external AI vendors for scoring.

**Why it happens:** The existing privacy/retention design (already validated in Phase 5) covers *storage*, but adding new vendors is treated as "just another API call" rather than a fresh data-sharing decision requiring its own consent/contract review.

**How to avoid:** Before wiring student audio into any new vendor (pronunciation scoring in v2.2, TTS if it ever processes student audio rather than just generating Coco's speech), confirm: (1) the teacher/school's existing consent covers this specific new use, updating parent/teacher-facing consent language if not; (2) the vendor contract/DPA (or ToS, at minimum, for a small pilot) prohibits using submitted audio for the vendor's own model training/improvement — this needs to be explicitly opted out, not assumed; (3) retention at the vendor matches or is stricter than this app's own retention policy (e.g., don't let a vendor retain audio for 12 months if the app itself deletes it after 30-60 days).

**Warning signs:** No documented check of the TTS/scoring vendor's data-use terms for children's audio; existing v1 privacy policy text doesn't mention the new vendors by name or purpose; nobody has asked "does this vendor train on submitted audio by default?"

**Phase to address:** v2.1 (Coco Voice, if any voice/audio round-trips through a vendor) and v2.2 (Pronunciation scoring, which by definition sends student audio to a scoring vendor) — resolve before either ships, not retroactively.

---

### Pitfall 15: FERPA/Education-Record Gaps as New AI Vendors Are Added

**What goes wrong:** Each new AI vendor added in v2.0 (TTS, pronunciation scoring) becomes a sub-vendor handling what may qualify as education records once tied to a specific student's assignment/attempt. Without a Data Processing Agreement (or at minimum documented terms) constraining each new vendor's use/retention/redisclosure, the app is in the same compliance gap that reportedly affects roughly 42% of districts using AI tools without proper agreements.

**Why it happens:** For a single-teacher pilot this can feel like overkill ("it's just my own class"), but the teacher is still the one accountable if this scales to other classrooms/schools later, and retrofitting compliance after multiple vendors are already wired in is much harder than establishing the pattern with the first new vendor.

**How to avoid:** For each new AI vendor added in v2.0, document (even briefly, even for a single-teacher pilot) what data is sent, for what purpose, and what the vendor's retention/reuse terms are — treat this as a lightweight internal checklist rather than a full legal DPA process at this stage, but make it exist in writing so it can be formalized if/when the product scales to more teachers/schools.

**Warning signs:** No written record anywhere of what each new AI vendor does with submitted data; "Future Options" section of PROJECT.md already flags school/LMS integrations as a later possibility, meaning this gap will only get more expensive to close the longer it's deferred.

**Phase to address:** v2.1 and v2.2 (each new vendor introduction) — lightweight documentation now, formalize later if the product scales beyond the single pilot teacher.

---

### Pitfall 16: UI Overhaul Regresses the Working Homework Loop

**What goes wrong:** The v2.5 "one cohesive visual pass" touches every screen in an app whose core value — teacher-verifiable completion of speaking homework — depends on specific, already-validated workflows (assign → complete → review → status buckets). A visual-only refactor can silently break a working interaction (a button that submitted an attempt now does something slightly different, a status badge that was legible now isn't, a review flow that was fast now requires extra clicks) without anyone noticing until the teacher — the only real user testing this in production — hits it live.

**Why it happens:** UI overhauls are usually scoped and reviewed as visual/aesthetic work, so functional regression testing (does every existing user workflow still work exactly as before) isn't treated as part of the deliverable the same way a backend change would be.

**How to avoid:** Before starting v2.5, write down (or reuse from existing UAT scripts in `.planning/phases/`) the exact set of critical workflows validated in Phases 2-7 (teacher login, class/roster management, mission assignment, student mission completion via class code/PIN, teacher review of transcript + audio, status bucket transitions, late/retry badges). Re-run that same UAT checklist against the redesigned UI before shipping v2.5, not just a visual review. Do the visual pass last (already the plan — v2.5 is ordered last precisely to avoid re-doing layout after mascot/voice/chat land) and treat it as a constraint-preserving reskin, not a functional redesign.

**Warning signs:** v2.5 phase plan doesn't reference re-running prior UAT scripts; visual mockups are reviewed only for aesthetics, not for whether every prior interaction (e.g., "teacher can identify target-pattern usage in under N seconds of scanning" from Pitfall 10) still holds; teacher reports "I can't find X anymore" during UAT.

**Phase to address:** v2.5 (UI overhaul) — explicitly gate release on re-passing the full set of prior-phase UAT scripts, not just a fresh visual review.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|--------------------|-----------------|------------------|
| Skip TTS caching layer, call vendor directly on every playback | Faster to ship v2.1 | Compounding, invisible cost growth against a tight $30/mo budget | Never — build cache-first from the start, it's cheap to add early and expensive to retrofit after a cost incident |
| Show raw vendor pronunciation score to students | Faster UI, no extra design work | Discourages young non-native learners, undermines app's core "encouraging" brand | Never for student-facing UI; acceptable for teacher-only internal view |
| Rely on system prompt alone to keep Coco Chat on-pattern and safe | Faster to prototype v2.4 | Drift and safety risk grows with turn count; undermines teacher-verifiability | Never for production; acceptable only for very early internal prototyping before any real student uses it |
| Client-side-only turn cap for Coco Chat | Simpler initial implementation | A bug or retry path can bypass it, causing cost/safety exposure | Never — always pair with a server-owned enforced cap |
| Ship mascot with many expression states / scene backgrounds in first cut | More "impressive" first demo | Asset pipeline scope creep stalls the release | Never in v2.3's first ship — defer expansion to a later explicit decision |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|------------------|--------------------|
| ElevenLabs (or other TTS vendor) | Regenerating audio for identical text on every request | Cache by content hash; pre-synthesize static lines at authoring time |
| ElevenLabs voice cloning | Treating verbal teacher agreement as sufficient consent | Written, specific, informed consent + check vendor ToS for voice-data reuse in their own model training |
| SpeechAce / Azure Speech Assessment | Trusting vendor accuracy claims for kids/non-native speech without local validation | Spot-check against real recordings from this app's actual students (already have audio stored from v1) before setting thresholds |
| OpenAI (or other LLM) for Coco Chat | Relying on the system prompt alone to bound topic/turns/safety | Add per-turn re-grounding, a server-enforced turn cap, and a moderation check on every output before playback |
| Any new AI vendor introduced in v2.0 | Assuming v1's privacy/retention design already covers new vendors | Document data flow/consent/retention per new vendor explicitly, even informally, before wiring it into student-facing audio |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Per-frame image-swap mascot animation without sprite atlasing | Jank/stutter on older tablets and Chromebooks | Use sprite sheets/atlases; cap simultaneous animated elements; test on the lowest-end device available | Immediately visible on any low-end device, not a "scale" threshold — this app's real usage context (elementary students' home/school devices) is already the low end |
| Fixed-timer-driven mascot mouth animation instead of audio-event-driven | Mouth/audio desync, worse under variable network/TTS latency | Bind animation state to actual `<audio>` element events (`play`/`timeupdate`/`ended`) | Breaks as soon as TTS latency or speech length varies from the assumed fixed duration |
| Unbounded/uncapped Coco Chat turns | Cost and latency both climb per extra turn; conversation quality also degrades with turn count | Server-enforced hard turn cap; per-turn re-grounding of target pattern | Breaks a small $30/mo budget in a single runaway session, not at any meaningful "scale" |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| No moderation/safety check on Coco Chat's LLM output before it reaches a child | Inappropriate content reaching a student, reputational/trust damage with the teacher | Run every reply through a moderation endpoint before display/playback, in addition to prompt constraints |
| Sending student audio to a new AI vendor (pronunciation scoring) without checking the vendor's default data-training policy | Student voice biometric data used for vendor model training without proper consent, a COPPA violation post-2025 rule update | Confirm and explicitly opt out of any default "use submitted data to improve our models" vendor setting |
| No written consent record for teacher voice-cloning | Legal exposure (privacy/right-of-publicity) if scope or use ever expands beyond original understanding | Written, specific, informed, revocable consent, stored alongside other app records |
| Client-side-only enforcement of Coco Chat turn limits | Bypassable cap, unbounded cost/safety exposure | Enforce the cap server-side using the same server-owned status pattern already used for assignment status |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|--------------|--------------------|
| Raw numeric pronunciation score shown to a child | Discouragement, feels like a test rather than supportive practice | Qualitative, celebratory feedback tiers with a wide non-penalizing band for normal child/non-native variation |
| Free-flowing Coco Chat transcript with no target-pattern markup | Teacher review takes longer, breaks the fast-scan workflow validated since Phase 7 | Visually tag where the target pattern appears in the transcript; keep Coco's personality turns visually distinct from practice turns |
| Scene premise that's engaging but doesn't cue the target grammar | Student practices the "wrong" thing relative to what the teacher assigned | Validate every generated premise against a "does this make the target pattern the obvious response?" checklist before shipping |
| Mascot/animation with inconsistent art style across states | Reads as uncanny/off-brand rather than warm, undermining the "supportive classmate" identity | Lock one style-guide reference and validate every asset against it; pilot with the teacher/students before wide rollout |

## "Looks Done But Isn't" Checklist

- [ ] **TTS integration (v2.1):** Often missing a caching layer — verify audio isn't re-synthesized for identical text on repeat plays; check the vendor usage dashboard against the count of genuinely unique lines authored.
- [ ] **Voice cloning (v2.1):** Often missing written consent — verify a documented, specific, revocable consent record exists for the teacher's cloned voice, separate from general app terms.
- [ ] **Pronunciation scoring (v2.2):** Often missing population validation — verify the chosen vendor's scoring has been spot-checked against real recordings from this app's actual students, not just vendor marketing claims.
- [ ] **Coco Chat (v2.4):** Often missing a server-enforced turn cap — verify the ~5-turn limit is rejected server-side on a 6th+ request, not just hidden client-side.
- [ ] **Coco Chat (v2.4):** Often missing output moderation — verify every LLM reply passes a safety/moderation check before playback, not just a system-prompt instruction.
- [ ] **Scene framing (v2.4):** Often missing target-pattern alignment validation — verify generated premises are checked against the target pattern before being shown, not just generated and trusted.
- [ ] **UI overhaul (v2.5):** Often missing regression coverage — verify the full set of prior-phase UAT scripts (login, assignment, completion, review, status transitions) still pass against the redesigned UI, not just a fresh visual review.
- [ ] **New AI vendors (v2.1/v2.2):** Often missing a documented data-use/consent check — verify each new vendor's handling of children's audio has been reviewed for COPPA/FERPA-relevant terms, even informally for this single-teacher pilot.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|--------------------|
| TTS cost blowup discovered post-launch | LOW | Add caching layer retroactively (same design as if built upfront); backfill cache from vendor's own audio if retrievable, otherwise accept one-time re-synthesis cost to populate cache |
| Discouraging pronunciation-score UX discovered via teacher/student feedback | LOW | Swap raw score display for qualitative tiers; keep backend scoring, change only the presentation layer |
| Coco Chat drift discovered in production transcripts | MEDIUM | Add per-turn re-grounding prompt injection and a lightweight drift check on replies; may require re-testing a batch of missions before re-enabling for students |
| Mascot performance failure on a real low-end device | MEDIUM | Add a reduced-motion/static-fallback path; may require re-encoding assets as sprite sheets if not already done |
| UI overhaul regression found via teacher UAT | HIGH | Requires targeted fixes per broken workflow plus a full UAT re-run; costly enough that prevention (running UAT scripts before ship) is far cheaper than recovery |
| Voice-clone consent gap discovered after the fact | HIGH | Requires retroactively obtaining proper written consent, potentially pausing use of the cloned voice in the interim if the teacher isn't comfortable continuing without it documented |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|-------------------|
| TTS cost blowup from uncached regeneration | v2.1 Coco Voice | Vendor usage dashboard character count roughly matches count of unique authored lines, not total playbacks |
| Voice-cloning consent gap | v2.1 Coco Voice | Written consent document exists and is referenced before cloned-voice feature ships |
| TTS mispronunciation of ESL target words | v2.1 Coco Voice | Manual listening pass over every target-vocabulary word used in missions before launch |
| Pronunciation scoring over-penalizes child/non-native speech | v2.2 Pronunciation scoring | Threshold tuned against real recordings from this app's own students, not vendor defaults |
| Discouraging feedback UX | v2.2 Pronunciation scoring | UX review specifically checks for absence of raw scores/red-X/harsh language in student-facing UI |
| Mascot asset scope creep | v2.3 Mascot | Phase plan fixes the expression/state count explicitly before any art work begins |
| Uncanny/off-brand mascot | v2.3 Mascot | Style-guide locked before production; informal pilot check with teacher/students before wide rollout |
| Mascot performance on low-end devices | v2.3 Mascot | Explicit test pass on a low-end tablet/Chromebook, not just the dev machine |
| Animation/audio desync | v2.3 Mascot | Mouth-state driven by real `<audio>` element events, verified under artificially throttled network conditions |
| Coco Chat drift off target pattern | v2.4 Dynamic turns + scene framing | Manual review of turn 4-5 replies across several test conversations for topic/pattern adherence |
| Coco Chat breaks teacher-verifiability | v2.4 Dynamic turns + scene framing | Teacher can identify target-pattern usage in transcript within the same fast-scan time bar established in Phase 7 |
| Unsafe/off-topic content reaching a child | v2.4 Dynamic turns + scene framing | Moderation check present on every LLM output path before playback/display |
| Unbounded conversation turns / runaway cost | v2.4 Dynamic turns + scene framing | Server rejects any request beyond the enforced turn cap; per-conversation cost logged and alertable |
| Scene premise confuses grammar objective | v2.4 Dynamic turns + scene framing | Sample of generated premises reviewed against "does this cue the target pattern?" checklist during UAT |
| Child voice/biometric data to new AI vendors without consent/DPA coverage | v2.1 / v2.2 (each new vendor) | Written note of each new vendor's data-use/retention terms exists before student audio is sent |
| FERPA gaps from new sub-vendors | v2.1 / v2.2 (each new vendor) | Same lightweight documentation as above, ready to formalize if the product scales beyond the pilot teacher |
| UI overhaul regresses the homework loop | v2.5 UI overhaul | Full set of prior-phase UAT scripts re-run and passing against the redesigned UI before ship |

## Sources

- ElevenLabs latency/streaming docs and pricing pages (elevenlabs.io/docs, elevenlabs.io/pricing) — MEDIUM confidence
- TTS caching pattern discussions (pipecat-ai GitHub issue #2629, Milvus AI reference docs) — MEDIUM confidence
- Voice cloning law/ethics coverage (Duquesne Law "Juris" magazine, National Security Law Firm, Skadden Arps insight on NY court case) — MEDIUM confidence
- TTS mispronunciation/hallucination coverage (ReadSpeaker blog series on TTS in education, FutureBeeAI knowledge hub) — MEDIUM confidence
- SpeechAce and Azure Speech Assessment vendor documentation and "kids" positioning (speechace.com, Microsoft Tech Community/Learn) — MEDIUM confidence (vendor-sourced claims, not independently benchmarked against this app's students)
- ASR bias/accuracy research on child and non-native speech (The Learning Agency, arXiv 2306.16710, arXiv 2312.15499) — MEDIUM-HIGH confidence (academic sources)
- Children's app UX design guidance (Medium/Bootcamp UX design series, Aufait UX, Zigpoll) — MEDIUM confidence
- Visual novel scope-creep and sprite design discussion (arimiadev.com, Lemma Soft Forums, Wayline blog) — MEDIUM confidence (practitioner/community sources)
- Uncanny valley design research (ACM Interactions journal article, ResearchGate) — MEDIUM-HIGH confidence (peer-reviewed/ACM-published)
- Web animation performance for low-end devices (LottieFiles, Callstack Lottie vs Rive comparison, animation-addons.com) — MEDIUM confidence
- Lip-sync desync causes (Percify blog, Everypixel Workroom, Resi streaming blog) — MEDIUM confidence (practitioner sources, general AV context extrapolated to this app's simpler talking/idle use case)
- LLM conversational drift research (arXiv 2404.03820 "CantTalkAboutThis", arXiv 2409.04987 EFL-teaching chatbot paper, BotiqueAI multi-turn performance article) — MEDIUM-HIGH confidence (includes directly on-topic academic paper about LLM-based EFL conversation chatbots)
- OpenAI minors safety policy coverage (TechCrunch, Common Sense Media press release, Cyberbullying Research Center) — MEDIUM confidence (current events reporting, policy still evolving as of research date)
- LLM cost control/rate limiting practices (TrueFoundry, Portkey, RelayPlane blog on runaway agent costs) — MEDIUM confidence (practitioner/vendor sources)
- COPPA 2025 rule update coverage (Recording Law, FAS.org, SchoolAI FERPA/COPPA guide, Public Interest Privacy Center) — MEDIUM confidence (legal-adjacent journalism, not primary FTC text directly reviewed in this pass)
- FERPA AI vendor/DPA requirements (SchoolAI blog, DeepInspect, Secure Privacy blog) — MEDIUM confidence (industry compliance-vendor sources)
- UI redesign regression practices (XB Software case study, Bloomberg UX change-management guidelines, testRigor regression testing guide) — MEDIUM confidence
- Generative AI instructional design pitfalls (AACE review, TechTrends/Springer article on GenAI SWOT for instructional design) — MEDIUM-HIGH confidence (includes peer-reviewed source)
- Project context: `.planning/PROJECT.md` (v2.0 milestone scope, constraints, and prior validated decisions)

---
*Pitfalls research for: Coco English v2.0 "Coco Comes Alive" (TTS, pronunciation scoring, 2D mascot, bounded conversational AI, scene framing, UI overhaul)*
*Researched: 2026-07-01*
