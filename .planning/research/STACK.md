# Stack Research

**Domain:** Immersive character/voice/pronunciation features for an existing Next.js + Supabase + OpenAI ESL speaking-homework app (v2.0 "Coco Comes Alive")
**Researched:** 2026-07-01
**Confidence:** MEDIUM (web-verified vendor docs/pricing pages; no HIGH-tier curated source available for this niche vendor-comparison question)

> Note: this file supersedes the v1.0-era STACK.md for the purposes of the v2.0 milestone. It covers ONLY the NEW additions needed for v2.1–v2.5. The existing Next.js (App Router, TypeScript), Supabase (Postgres/auth/storage), OpenAI (Whisper + GPT), and Playwright stack from v1.0 is validated, unchanged, and out of scope here — see the prior STACK.md content (now folded into this file's context) for that baseline.

## Recommended Stack

### Core Technologies (new, by feature)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| OpenAI `gpt-4o-mini-tts` (via existing `openai` npm SDK) | SDK: `openai@6.45.0` (already installed); model: `gpt-4o-mini-tts` | v2.1 Coco Voice — text-to-speech for mission/AI lines | Zero new vendor account, zero new SDK, zero new billing relationship — it's the same OpenAI API key/client already in the codebase for Whisper/GPT. ~$0.015/min of audio is trivially cheap at 6-student scale. Streaming supported (first chunk ~300-600ms), 13 voices, steerable tone via an `instructions` string (useful for "warm, encouraging classmate" delivery). This should be the **default TTS path**; add ElevenLabs only for the voice-cloning feature specifically. |
| ElevenLabs (`@elevenlabs/elevenlabs-js`) | `2.55.0` (npm, current) | v2.1 Coco Voice — teacher-voice cloning specifically, optional higher-quality Coco voice | ElevenLabs is the only realistic option here for **voice cloning** — OpenAI TTS has no cloning capability. Use ElevenLabs *only* for the cloned-teacher-voice variant; keep the default Coco voice on OpenAI TTS to avoid double vendor cost. Flash v2.5 model (~75ms model latency) is fine for real-time; Multilingual v2 for higher quality on non-real-time lines. |
| Azure AI Speech — Pronunciation Assessment (REST endpoint, or `microsoft-cognitiveservices-speech-sdk` if a full SDK is preferred) | `microsoft-cognitiveservices-speech-sdk@^1.x` (latest at install time) | v2.2 Pronunciation scoring | **Recommended over SpeechAce and ELSA at this scale** — see vendor comparison below. Free tier covers 5 audio-hours/month; a 6-student/1-class-week app will likely stay near or just above that, meaning pronunciation scoring costs close to $0/mo, comfortably inside the ~$30/mo budget. |
| Rive (`@rive-app/react-canvas` + `@rive-app/canvas`) | `@rive-app/react-canvas@4.29.3`, `@rive-app/canvas@2.38.3` | v2.3 Mascot rendering | **Recommended over Live2D** for a solo-dev/tiny-budget project — see rendering comparison below. Single `.riv` file authored in Rive's free web editor; `useRive` React hook manages canvas + WASM lifecycle; State Machine `Trigger`/`Boolean`/`Number` inputs map cleanly to "idle / talking / happy / thinking" states driven by TTS playback events. |
| (No new library) — existing `openai` SDK, Chat Completions/Responses API | `openai@6.45.0` (already installed) | v2.4 Dynamic turns + scene framing | This is a prompting/orchestration change (bounded ~5-turn conversation state machine + a scene-premise generation call), not a new dependency. Reuse the existing OpenAI client and existing turn-evaluation patterns from v1's mission flow. |
| Tailwind CSS + shadcn/ui (already in the v1 stack) | Tailwind `^4.x`, shadcn/ui latest CLI-generated components | v2.5 UI overhaul | No new dependency — v1 already uses Tailwind + shadcn/ui. The v2.5 pass is a design/composition effort (VN dialogue box + background scene layout), not a new library adoption. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `howler` | `2.2.4` | Simple, cross-browser audio playback abstraction (handles autoplay-policy edge cases, sprite/queueing) | Use if v2.1 TTS playback logic (queueing Coco's lines, avoiding overlapping audio, mobile Safari autoplay quirks) gets non-trivial. For a single line played after a user gesture, the plain HTML `<audio>` element is enough — don't add Howler until you actually need queueing/sprites. |
| Native `MediaSource` + `<audio>` (no library) | Browser built-in | Lowest-latency incremental playback of streamed TTS chunks | Only needed if you adopt ElevenLabs/OpenAI **streaming** endpoints instead of request-then-play. At this app's scale (short mission lines, ~0.3-1s full-response latency), plain non-streaming `fetch` → blob → `<audio src>` is simpler and sufficient; reach for `MediaSource` only if line length grows (v2.4 multi-turn chat) or perceived latency becomes a UX complaint. |
| Rive web editor (SaaS, browser-based) | N/A (authoring tool, not a runtime dependency) | Author the Coco `.riv` character file (idle/talk/expression states) | One-time/ongoing asset-authoring tool for whoever builds the mascot art+rig; free tier is sufficient for one character with a handful of states. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Existing Playwright e2e suite (v1) | Extend to smoke-test that TTS requests succeed and the mascot state machine reaches "talking" | No new tool; CI/headless browsers won't actually play audio — assert on network response + DOM/canvas state, not audible sound. |

## Installation

```bash
# v2.1 Coco Voice — OpenAI TTS uses the already-installed openai package, no new install.
# Add ElevenLabs only for the teacher-voice-cloning variant:
npm install @elevenlabs/elevenlabs-js

# v2.2 Pronunciation scoring — Azure Speech
npm install microsoft-cognitiveservices-speech-sdk
# (or skip the SDK and call the REST pronunciation-assessment endpoint directly with fetch,
#  which avoids pulling in the SDK's larger dependency footprint — see "Alternatives Considered")

# v2.3 Mascot rendering — Rive
npm install @rive-app/react-canvas

# v2.4 Dynamic turns — no new install (existing openai SDK)

# v2.5 UI overhaul — no new install (Tailwind + shadcn/ui already in v1 stack)

# Optional audio-playback convenience (only if queueing/sprite needs emerge)
npm install howler
npm install -D @types/howler
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| OpenAI `gpt-4o-mini-tts` as default Coco voice | ElevenLabs for *all* TTS (not just cloning) | If voice quality/expressiveness becomes a real complaint from the teacher/students and budget allows moving fully to ElevenLabs's Starter ($5/mo) or Creator ($22/mo) tier — still cheap at this scale, but adds a second vendor to maintain for no reason if OpenAI TTS quality is "good enough" for elementary ESL. |
| ElevenLabs for voice cloning specifically | Azure/OpenAI voice cloning | Neither Azure Speech nor OpenAI currently offer accessible instant voice-cloning comparable to ElevenLabs; if the teacher-voice-clone feature is dropped, skip ElevenLabs entirely and use OpenAI TTS only. |
| Azure Speech Pronunciation Assessment | SpeechAce | SpeechAce has better-documented focus on **child/K-12 ESL** speech specifically (phonics, sight words, oral reading fluency) and richer scripted-activity tooling out of the box — worth it if child-speech accuracy problems appear with Azure in practice. But SpeechAce's cheapest plan is $40/mo flat, which alone blows the ~$30/mo total budget; only reconsider if Azure's free-tier scoring quality proves inadequate for 6 kids' voices. |
| Azure Speech Pronunciation Assessment | ELSA API | ELSA's B2B/partner-oriented API has less transparent self-serve low-volume pricing (requires sales contact) and is harder to integrate solo without a clear entry tier — deprioritize unless Azure/SpeechAce both prove insufficient. |
| Rive for mascot rendering | Live2D Cubism SDK for Web | Live2D produces the classic "VN/vtuber" 2D rigged look with more fluid natural motion and is free to use at this small scale (individual/small-enterprise exemption from the publication license). Choose Live2D if the teacher/dev is willing to invest in Cubism Editor model authoring (a heavier, more specialized skill/pipeline than Rive's simpler state-machine + timeline editor) and wants a more "anime VN" aesthetic than Rive's flatter vector-animation look supports. |
| Rive for mascot rendering | Static sprite-swap (plain PNG/WebP images per expression, no animation library) | If even Rive's authoring overhead is too much for a 6-student pilot, a handful of static expression images (idle/talking-mouth-open/happy/thinking) swapped via CSS/React state on a timer synced to TTS playback delivers 80% of the VN feel for near-zero engineering cost. Reasonable **first cut** for v2.3 if the team wants to ship VN-atmosphere fast and only invest in Rive/Live2D if static swaps feel too static in practice. |
| Plain non-streaming TTS request-then-play | WebSocket/`MediaSource` streaming playback | Only adopt streaming if mission lines get long enough (multi-sentence Coco Chat turns in v2.4) that the ~0.3-1s non-streaming latency becomes noticeable; premature streaming adds meaningful client complexity (chunk buffering, autoplay-gesture timing) for a benefit users won't perceive on short lines. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| SpeechAce as the default/only pronunciation vendor | Its cheapest tier is a flat $40/mo subscription — that alone exceeds this project's entire ~$30/mo AI budget, before accounting for existing Whisper/GPT/TTS spend. Not viable at 6-student scale regardless of accuracy quality. | Azure AI Speech Pronunciation Assessment (pay-per-second, effectively free within the 5-hr/mo free tier at this scale). |
| ELSA API as a first choice | Self-serve pricing/onboarding for low-volume solo integration is opaque (sales-contact-gated); adds integration friction disproportionate to a 6-student pilot. | Azure AI Speech Pronunciation Assessment; revisit ELSA only if partnership terms improve or Azure proves inadequate. |
| Live2D Cubism as the *first* mascot implementation | Requires a separate, specialized rigging pipeline (Cubism Editor, PSD-layer prep, parameter binding) before any web rendering can happen — a large time investment relative to a single recurring buddy character at pilot scale. | Rive (lighter authoring, browser-based editor, smaller runtime) or static sprite-swaps as a v0. |
| Building a custom Whisper-based DIY pronunciation scorer (e.g. forced-alignment/confidence-score hacks) | Whisper's per-word confidence is an inference-time approximation, not a phoneme-level pronunciation model — it estimates transcription confidence, not correctness of pronunciation against a native-speaker reference. Not fit for purpose against SpeechAce/Azure/ELSA's purpose-built phoneme-level scoring. | A dedicated pronunciation-assessment API (Azure recommended; SpeechAce as fallback if budget allows later). |
| Full streaming (WebSocket) TTS pipeline for the v2.1 launch | Adds real engineering complexity (bidirectional socket lifecycle, chunk-buffering, MediaSource wiring) that isn't justified by this app's short, single-sentence mission/AI lines where sub-second non-streaming latency is already imperceptible to a 6-student pilot. | Simple request → blob → `<audio>` playback; revisit streaming only if v2.4's longer Coco Chat turns make latency noticeable. |
| Introducing a second general TTS vendor (e.g. paying for ElevenLabs Creator+ tier for *all* voice, not just cloning) before validating need | Doubles vendor surface and cost for a feature (expressive default voice) OpenAI's TTS already covers adequately for elementary ESL content; wasteful against a $30/mo budget. | OpenAI `gpt-4o-mini-tts` as default; ElevenLabs scoped narrowly to the optional cloned-teacher-voice variant. |

## Stack Patterns by Variant

**If the teacher-voice-cloning feature in v2.1 is deprioritized or cut:**
- Use OpenAI `gpt-4o-mini-tts` exclusively for all TTS.
- Because it removes an entire vendor (ElevenLabs) and its billing/API-key management for a feature that's explicitly optional ("and/or a cloned teacher voice") in the milestone context — simplest possible v2.1.

**If Azure's pronunciation-assessment accuracy on child ESL speech proves weak in practice (post-launch finding, not pre-emptive):**
- Add SpeechAce for a second opinion or full replacement, accepting the $40/mo floor as a deliberate budget increase.
- Because SpeechAce's stated specialization (K-12, phonics, ESL, wide accent/demographic training data) directly targets the accuracy gap Azure's general-purpose STT-based assessment might show for young non-native speakers.

**If v2.3 needs to ship fast for a demo before full mascot art is ready:**
- Use static sprite-swap images (no Rive/Live2D) as the v0 mascot, swapped on TTS start/stop and mission emotional beats.
- Because it requires zero new runtime dependency and no specialized rigging pipeline, letting v2.1/v2.2/v2.4 validate first while mascot art is produced in parallel; upgrade to Rive once art assets exist.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `openai@6.45.0` | Next.js App Router (server actions / route handlers) | Already used in v1 for Whisper transcription and GPT mission/turn evaluation; `gpt-4o-mini-tts` calls go through the same client — no new SDK version constraint. |
| `@elevenlabs/elevenlabs-js@2.55.0` | Node 18+ (standard for current Next.js) | No known Next.js-specific incompatibilities; call from server-side route handlers/server actions to keep the API key off the client, same pattern as the existing OpenAI integration. |
| `@rive-app/react-canvas@4.29.3` | `@rive-app/canvas@2.38.3` (peer/underlying WASM runtime) | Install both — `react-canvas` wraps `canvas`'s WASM runtime; keep them in sync when upgrading (check the react-canvas changelog for the canvas runtime version it expects). Client-component only in App Router (`"use client"`) since it needs `window`/canvas/WASM. |
| `microsoft-cognitiveservices-speech-sdk` | Works fine as a plain REST call too | Given this project's minimal-dependency preference, consider skipping the SDK and calling the Pronunciation Assessment REST endpoint directly via `fetch` from a server route — avoids pulling in the SDK's larger footprint (it bundles support for many unused STT/TTS/translation features) for a single narrow use case. |

## Sources

- [ElevenLabs Node SDK — GitHub elevenlabs/elevenlabs-js](https://github.com/elevenlabs/elevenlabs-js) — confirmed npm package name/install; version cross-checked via `npm view` (2.55.0)
- [ElevenLabs streaming/latency docs](https://elevenlabs.io/docs/eleven-api/guides/how-to/best-practices/latency-optimization) — Flash v2.5 ~75ms latency, latency-optimization levels
- [ElevenLabs pricing](https://elevenlabs.io/pricing) and [ElevenLabs pricing breakdown (Flexprice)](https://flexprice.io/blog/elevenlabs-pricing-breakdown) — Starter $5/mo unlocks instant voice cloning
- [OpenAI gpt-4o-mini-tts model page](https://platform.openai.com/docs/models/gpt-4o-mini-tts) and [TokenMix cost analysis](https://tokenmix.ai/blog/gpt-4o-mini-tts-cheapest-tts-api-2026) — pricing ($0.60/1M text in, $12/1M audio out, ~$0.015/min), streaming latency, voice count
- [SpeechAce API plans](https://www.speechace.com/api-plans/) — fetched directly; Basic $40/mo / Pro $80/mo / Premium $125/mo tiers, per-request pricing
- [SpeechAce for Voice AI for kids](https://www.speechace.com/using-the-speechace-api-as-voice-ai-for-kids/) — K-12/child ESL suitability claim
- [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/) and [Microsoft Q&A on pronunciation-assessment pricing](https://learn.microsoft.com/en-us/answers/questions/5608069/pricing-and-usage-of-pronunciation-assessment-feat) — $1.32/hr standard, free F0 tier (5 hrs/mo)
- [ELSA API overview](https://api-external-doc.elsanow.co/intro) and [ELSA for Business](https://business.elsaspeak.com/elsa-api-01) — scripted/unscripted modes, metered API, partner-oriented positioning
- [Live2D Cubism SDK license](https://www.live2d.com/en/sdk/license/) — free for individuals/small-scale enterprises (Publication License exemption)
- [Rive React runtime docs](https://help.rive.app/runtimes/overview/react) and [Rive state machines guide](https://help.rive.app/runtimes/state-machines) — `useRive` hook, Trigger/Number/Boolean inputs; versions cross-checked via `npm view` (`@rive-app/react-canvas@4.29.3`, `@rive-app/canvas@2.38.3`)
- [MDN Web Audio API best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) — autoplay-gesture requirement, MediaSource streaming pattern
- `npm view` (executed directly, 2026-07-01) — confirmed current npm registry versions for `openai`, `@elevenlabs/elevenlabs-js`, `@rive-app/react-canvas`, `@rive-app/canvas`, `howler`
- Confidence note: all vendor/pricing findings are MEDIUM confidence (official vendor docs/pricing pages found via web search and cross-checked against a second source where possible, per `gsd-tools query classify-confidence --provider brave --verified`); no HIGH-tier curated/Context7 source exists for this specific vendor-comparison question.

---
*Stack research for: v2.0 "Coco Comes Alive" — TTS, pronunciation scoring, VN-style mascot rendering, dynamic conversation*
*Researched: 2026-07-01*
