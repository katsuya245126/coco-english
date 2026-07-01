# Architecture Research — v2.0 "Coco Comes Alive"

**Domain:** Immersive AI speaking-practice features (TTS, pronunciation scoring, VN mascot, dynamic chat) added to a shipped Next.js/Supabase/OpenAI ESL homework app
**Researched:** 2026-07-01
**Confidence:** MEDIUM-HIGH — existing-codebase facts below are HIGH (verified by reading source); external provider integration patterns are MEDIUM (vendor docs / web search, not yet prototyped in this codebase)

> This file supersedes the v1.0-era architecture research (previously at this path, dated 2026-06-25, pre-shipment). That document described the *initial* recommended architecture before Phases 1-7 were built. This document describes the **actual shipped v1.0 system** (verified by reading source) and the **new architecture needed for v2.0**. Treat this as the current source of truth for architecture; the old content is retained in git history only.

## Part 1 — Existing System (v1.0, shipped, do not re-architect)

Verified by reading the actual codebase (`supabase/migrations/202606250001_foundation_schema.sql`, `src/server/**`, `src/app/**`, `package.json`):

```
┌─────────────────────────────────────────────────────────────────────┐
│  Client (React 19, "use client" components)                         │
│  MissionFlowShell (student recorder) · Teacher evidence viewer      │
├─────────────────────────────────────────────────────────────────────┤
│  Next.js 15 App Router — Server                                     │
│  ┌───────────────┐ ┌────────────────────┐ ┌───────────────────────┐ │
│  │ Server pages   │ │ Server actions      │ │ Route handlers        │ │
│  │ (RSC, redirect │ │ (actions.ts per     │ │ (audio/route.ts,      │ │
│  │  gates)        │ │  route segment)     │ │  cron/*)              │ │
│  └───────┬───────┘ └──────────┬─────────┘ └───────────┬───────────┘ │
├──────────┴────────────────────┴─────────────────────────┴───────────┤
│  src/server/*  (server-only service modules, service-role client)   │
│  mission-flow.ts · audio-upload.ts · audio-evidence.ts ·             │
│  ai/turn-evaluator.ts · ai/mission-generator.ts · audio/transcription│
├───────────────────────────────────────────────────────────────────── │
│  src/domain/*  (pure, no I/O: schemas, status machine, completion)   │
├───────────────────────────────────────────────────────────────────── │
│  Supabase Postgres (RLS) + Supabase Storage (private buckets)        │
│  classes/students/missions/mission_turn_templates/assignments/       │
│  assignment_students/attempts/attempt_turns/audio_clips/              │
│  assignment_status_events                                            │
├───────────────────────────────────────────────────────────────────── │
│  OpenAI (server-side only)                                            │
│  gpt-4o-mini-transcribe (Whisper-class STT) · gpt-4.1-mini (Responses │
│  API, structured turn eval + mission draft)                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (existing, v1.0)

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| `src/server/mission/*` | Mission authoring/assign, `mission_snapshot` copy-on-assign | Supabase service-role client, Zod-validated snapshot |
| `src/server/student-access/mission-flow.ts` | Attempt lifecycle: start/resume, record answer/repeat/hint, complete — server-owned, audited status transitions | `assertTransitionRequest` + `assignment_status_events` insert on every transition |
| `src/server/student-access/audio-upload.ts` + `audio/route.ts` | Validates and stores per-turn student audio, triggers transcription + evaluation | Private `student-audio` bucket, service-role upload, signed URLs for playback only |
| `src/server/ai/turn-evaluator.ts` | Structured meaning/target-pattern/repeat evaluation | OpenAI Responses API, `zodTextFormat`, injectable client for tests |
| `src/server/audio/transcription.ts` | Speech-to-text for student answers | OpenAI `gpt-4o-mini-transcribe`, injectable client |
| `src/server/teacher/audio-evidence.ts` | Assembles the transcript-first `AttemptEvidence` view for teacher review, joins turns + audio clips by turn id | Single seam all per-turn evidence flows through |
| `src/domain/character/profile.ts` | Static `characterId` → copy-string profile lookup | Pure module, zero I/O, the seam v2.1-v2.3 extend |

**Key existing invariants every new v2.0 feature must respect:**

1. **Server-owned status transitions.** Every `assignment_students.status` change goes through `assertTransitionRequest` plus an audited `assignment_status_events` insert. New features (chat, scoring) must never mutate status directly without this path.
2. **Service-role client confined to `src/server/*`.** OpenAI/Supabase Storage credentials never reach client components. New AI calls (TTS, pronunciation, chat) must follow the same server-only adapter boundary.
3. **`attempt_turns` is one row per `(attempt_id, turn_order)`, upserted — not append-only.** The "dynamic turns" feature (v2.4) must reconcile with this fixed-slot structure since a variable-length AI-driven exchange doesn't naturally fit a slot count known up front.
4. **`characterId` is already a first-class, replaceable field** on `missions` (`character_id text not null default 'default-buddy'`), resolved via `getCharacterProfile()`. This is the exact seam v2.1-v2.3 hang off of — no new indirection layer needed.
5. **Audio is per-turn, private-bucket, signed-URL-only.** `audio_clips` already models `clip_kind`, `object_key`, `processing_status`, retention (`audio_expires_at`, cron purge). Reuse this bucket/signing *pattern* for new audio, but see Part 2 for why TTS output needs a *separate* bucket with different sensitivity/lifecycle.
6. **Teacher review is transcript-first.** `getAttemptEvidenceForTeacher` builds an evidence view keyed on transcript/evaluation JSON with audio as an optional signed-URL attachment. Every new artifact (pronunciation score, chat transcript) must slot into this same evidence shape, not a separate screen.

## Part 2 — New Feature Architecture (v2.1 → v2.5)

### System Overview (target state after v2.4, before v2.5 UI pass)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Client (React 19)                                                        │
│  ┌────────────────┐  ┌───────────────────┐  ┌────────────────────────┐    │
│  │ MissionFlowShell│  │ MascotStage        │  │ TeacherReviewPanel     │    │
│  │ (existing, now  │  │ (new, v2.3: canvas/│  │ (existing, extended:   │    │
│  │  drives TTS     │  │  sprite + expr.    │  │  pron. scores + chat   │    │
│  │  playback +     │  │  state machine)    │  │  transcript sections)  │    │
│  │  chat turns)    │  │                    │  │                        │    │
│  └───────┬────────┘  └─────────┬──────────┘  └───────────┬────────────┘    │
│          │  <audio> el + Web Audio API analyser (amplitude → viseme)       │
├──────────┴─────────────────────┴──────────────────────────┴───────────────┤
│  Next.js Route Handlers (new, Node runtime — see rationale below)         │
│  /api/tts (v2.1, streams audio) · /api/pronunciation-score (v2.2) ·       │
│  /api/chat-turn (v2.4, POST attempt_id + student utterance)               │
├─────────────────────────────────────────────────────────────────────────── │
│  src/server/*  (new service modules alongside existing ones)             │
│  ai/tts-generator.ts · ai/pronunciation-scorer.ts ·                       │
│  ai/chat-turn-generator.ts · ai/scene-generator.ts ·                      │
│  audio/tts-cache.ts (hash → Storage object_key lookup)                   │
├─────────────────────────────────────────────────────────────────────────── │
│  Supabase Postgres (new tables/columns)                                  │
│  tts_audio_cache · pronunciation_scores · missions.conversation_mode /    │
│  scene_premise · attempt_turns.coco_line                                  │
│  Supabase Storage (new buckets)                                          │
│  tts-audio (public, content-hash keyed, immutable-cacheable) ·            │
│  mascot-assets (public, static sprites/backgrounds)                      │
├─────────────────────────────────────────────────────────────────────────── │
│  External APIs (server-side only, same module-boundary rule as v1)       │
│  OpenAI TTS (gpt-4o-mini-tts) or ElevenLabs · SpeechAce or Azure          │
│  Pronunciation Assessment · OpenAI Responses API (existing, reused for    │
│  chat-turn generation + scene premise generation)                        │
└─────────────────────────────────────────────────────────────────────────── │
```

### Component Responsibilities (new, v2.0)

| Component | Responsibility | Ships in |
|-----------|----------------|----------|
| `/api/tts` route handler | Accepts `{ text, characterId, cacheKey? }`, checks `tts_audio_cache`, calls TTS provider on miss, uploads to Storage, returns URL/streams bytes | v2.1 |
| `src/server/ai/tts-generator.ts` | Server-only adapter around chosen TTS provider (mirrors `transcription.ts` shape: injectable client, ok/error union) | v2.1 |
| `src/server/audio/tts-cache.ts` | Hash `(text, characterId, voiceId, provider, format)` → lookup/insert into `tts_audio_cache`; owns Storage object key naming | v2.1 |
| `MissionFlowShell` (extended) | Requests TTS audio for each Coco line, plays via `<audio>`, exposes `isSpeaking`/amplitude signal to `MascotStage` | v2.1 (audio) → v2.3 (drives mascot) |
| `/api/pronunciation-score` route handler | Given an existing `audio_clip_id` + reference sentence, calls scoring provider, writes `pronunciation_scores` row | v2.2 |
| `src/server/ai/pronunciation-scorer.ts` | Server-only adapter around SpeechAce/Azure; structured word/phoneme scores + overall score | v2.2 |
| `AttemptEvidence` (extended) | Adds optional `pronunciationScore` per turn to the existing transcript-first view | v2.2 |
| `MascotStage` (new client component) | Renders background + character sprite layers; owns expression/speaking state machine; subscribes to playback amplitude | v2.3 |
| `src/domain/character/profile.ts` (extended) | Adds `voiceId`, `spriteSetId`, expression-to-asset mapping alongside existing copy strings — stays pure, no I/O | v2.3 |
| `src/server/ai/chat-turn-generator.ts` | Server-only adapter (Responses API, structured output) generating Coco's next line given bounded conversation history + target pattern; server-enforced max-turn cap | v2.4 |
| `src/server/ai/scene-generator.ts` | Server-only, extends existing `mission-generator.ts`; produces a short scene premise from `target_pattern` + `topic` | v2.4 |
| `attempt_turns.coco_line` persistence | Stores each dynamically-generated Coco line so the exchange is teacher-reviewable exactly like existing guided turns | v2.4 |
| UI overhaul | Visual pass only, no new services/schema; restyle existing components | v2.5 |

## Where TTS Generation Should Live: Server Route, Not Edge

**Recommendation: Node.js runtime route handler (default Next.js runtime), not Edge.**

- The existing OpenAI adapters (`transcription.ts`, `turn-evaluator.ts`) already run as standard Node server modules using the `openai` SDK. TTS should be architecturally identical, not a new runtime paradigm.
- Both OpenAI TTS (`gpt-4o-mini-tts`) and ElevenLabs support HTTP chunked-transfer streaming, so a Node route handler can stream bytes to the browser as they arrive. Edge's main advantage (lower cold-start latency at CDN edge) doesn't matter here: generation latency (hundreds of ms to a few seconds) dominates over runtime cold-start, and at 6 students / 1 class per week the traffic profile gains nothing from edge distribution.
- Node runtime gives full access to the Supabase JS service-role client (used identically to existing `audio-upload.ts`) for the cache-write path; Edge runtime historically has friction with Node-only SDK internals.
- Keep **one runtime story** (Node) across `transcription`, `turn-evaluator`, `tts-generator`, `pronunciation-scorer`, and `chat-turn-generator`. Don't introduce Edge for TTS only — that fragments the "server code that touches OpenAI keys" mental model for no measurable win at this scale.

### Caching Generated Audio in Supabase Storage

**Recommendation: cache by content hash, reuse the Storage/URL pattern, but in a *new*, *public* bucket separate from `student-audio`.**

- **Cache key:** `sha256(text + characterId + voiceId + provider + format)`. Coco's lines are drawn from a small, teacher-scoped set (mission questions, hint ladder text, character template strings, and from v2.4 bounded LLM-generated lines). Many repeat across students and attempts of the same mission, so hash-based dedup meaningfully cuts cost and latency. This is the standard TTS-caching pattern (deterministic hash of prompt+voice+params, checked before calling the provider).
- **New table `tts_audio_cache`** — `content_hash`, `object_key`, `provider`, `voice_id`, `duration_ms`, `created_at`, `last_used_at`. Do not overload `audio_clips`, which models *student-produced* evidence with retention/deletion semantics tied to a student attempt. TTS output is *app-generated* content with a different lifecycle (keep/evict by LRU, not by 30-day attempt-linked retention).
- **New Storage bucket `tts-audio`, public** (unlike `student-audio`, which is private because it contains a child's voice). Synthesized Coco audio contains no student PII, so it's safe to serve publicly — this avoids a signed-URL round trip on every playback and lets the browser cache the object via normal HTTP caching (`Cache-Control: public, max-age=31536000, immutable`, valid because content-hash-keyed objects are immutable). This is a deliberate divergence from the private-bucket pattern, justified by a different data-sensitivity classification, not an oversight.
- **Dynamic chat lines (v2.4)** won't cache-hit often (bounded but still per-attempt LLM-generated) — accept that as a per-attempt generation cost, but still write through the same cache lookup so identical lines (e.g., a common opener) still dedup.
- At the stated scale (~6 students, 1 class/week, ~$30/mo AI budget), caching is as much about latency and product feel (instant Coco voice on repeat missions) as raw cost — flag this to the roadmapper as a UX requirement, not just a cost optimization.

## Pronunciation Scoring: Schema and Teacher-Review Integration

**Recommendation: new `pronunciation_scores` table, one row per scored `audio_clips` row, not new columns bolted onto `attempt_turns`.**

Why a new table instead of widening `attempt_turns`:
- `attempt_turns.evaluation jsonb` is already a structured, Zod-validated column owned by the meaning/target-pattern evaluator. Pronunciation scoring is a **separate concern from a separate provider** (SpeechAce/Azure vs. OpenAI), computed **asynchronously** and **optionally** (v2.2 explicitly reuses v1 stored audio, meaning it can be backfilled or retried independently of the turn's completion). Mixing it into the same JSON blob couples two independently-evolving schemas and independently-failing external calls.
- A dedicated table naturally supports **re-scoring** (if the provider or rubric changes later) without mutating historical evaluation data, and supports "needs teacher check" states specific to scoring — a failed/ambiguous score is not the same as a failed meaning evaluation.

Schema sketch:
```sql
create type pronunciation_score_status as enum ('pending', 'scored', 'failed', 'not_applicable');

create table public.pronunciation_scores (
  id uuid primary key default gen_random_uuid(),
  attempt_turn_id uuid not null references public.attempt_turns(id) on delete cascade,
  audio_clip_id uuid not null references public.audio_clips(id) on delete cascade,
  provider text not null,                 -- 'speechace' | 'azure'
  status public.pronunciation_score_status not null default 'pending',
  overall_score numeric,                  -- 0-100, provider-normalized
  word_scores jsonb not null default '[]'::jsonb,   -- [{word, score, phonemes:[...]}]
  raw_response jsonb,                     -- provider payload for debugging/re-analysis
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audio_clip_id)                  -- one score per clip; re-score = update in place
);
alter table public.pronunciation_scores enable row level security;
```

**Surfacing without breaking transcript-first review:**
- Extend `AttemptTurnEvidence` (in `src/server/teacher/audio-evidence.ts`) with an optional `pronunciationScore: { overall: number; status: ... } | null` field, joined in the same query batch as `audio_clips` (same pattern: fetch by `turn_ids`, map into a `Map<turnId, ...>`).
- UI rule: the score renders as a **collapsed badge/pill next to the transcript line** (e.g., "Pronunciation: 82"), expandable to word-level detail — never a blocking gate, never replacing the transcript, never before the transcript in visual order. This preserves the "scan status and transcripts first, play audio only when needed" review model required by `PROJECT.md`.
- Scoring is **fire-and-forget / best-effort**, triggered after `completeAttempt` (or via a lightweight background job), so a scoring-provider outage never blocks the student's completion flow or the existing server-owned status machine. This mirrors the existing pattern where AI evaluation degrades to `teacher_review` rather than blocking (already validated as `AI-06` in v1).

## Bounded Multi-Turn "Coco Chat": Persistence and Fit Alongside Guided Flow

This is the highest-risk architectural change in the milestone: the existing schema models a **fixed number of pre-templated turns** (`mission_turn_templates`, `required_turns`, `attempt_turns` unique on `(attempt_id, turn_order)`), while v2.4 wants **dynamic, LLM-generated, variable-content turns bounded at ~5**.

**Recommendation: keep `attempt_turns` as the persistence table (don't fork a parallel schema); make the "prompt" side of a turn dynamic instead of template-bound; treat "Coco Chat" as a mission mode, not a separate feature system.**

- Add `missions.conversation_mode` (`enum: 'guided' | 'chat'`, default `'guided'`) so a mission is either the existing fixed-template flow (v1, fully preserved) or the new bounded-chat flow (v2.4). Additive — doesn't touch any validated v1 behavior for `'guided'` missions.
- For `conversation_mode = 'chat'` missions, `mission_turn_templates` is not pre-populated; `missions.required_turns` (reused, no new column) still caps exchange length, and each turn's Coco line is generated **just-in-time** by `chat-turn-generator.ts`.
- **New column** `attempt_turns.coco_line text` (nullable; populated only for chat-mode attempts) — the dynamically generated Coco utterance for that turn, persisted at generation time so the teacher transcript shows both sides of the exchange, not just the student's half. This single schema change makes chat-mode teacher-reviewable in the exact same `AttemptTurnEvidence` shape as guided mode.
- **New column** `missions.scene_premise text` (nullable) — the short scene-setting text generated from `target_pattern`/`topic` at mission-creation time (extends the existing mission-draft flow), stored once per mission and copied into `assignments.mission_snapshot` exactly like every other mission field already is — no new snapshotting mechanism needed.
- **Turn generation flow:** `chat-turn-generator.ts` receives the full prior transcript for the attempt (queried from `attempt_turns` ordered by `turn_order` — Postgres already *is* the state store, no separate conversation-state table needed) plus `target_pattern` and `scene_premise`, and returns Coco's next line + optionally an early-end signal (target pattern achieved). State is derived from the DB on each request, avoiding new in-memory/Redis session infrastructure for a 6-student pilot.
- **Bounding is server-enforced**, not client-trusted: the route handler checks `turn_order >= missions.required_turns` (or an explicit LLM wrap-up signal) before generating another turn, mirroring the existing pattern where `completeAttempt` re-derives completeness from the DB rather than trusting client state.
- **Coexistence with guided flow:** `MissionFlowShell` (or a sibling `ChatMissionFlowShell` reusing the same shell chrome/character panel) branches on `conversation_mode` at the top; the completion, hint, and status-transition machinery (`startOrResumeAttempt`, `completeAttempt`, `assertTransitionRequest`) is **entirely reused unchanged** — chat mode is a different way of populating `attempt_turns` rows, not a different completion/status pipeline. This is the key insight for the roadmapper: v2.4 is additive to the turn-population layer, not a rewrite of the assignment/attempt/status core.

## 2D Mascot: Client-Side Speaking/Expression State from TTS Playback

**Recommendation: amplitude-driven state machine (not full viseme/phoneme lip-sync) for v2.3, upgradeable later.**

- Use the **Web Audio API `AnalyserNode`** attached to the `<audio>` element already playing the TTS clip (the app already has an `<audio>` element pattern for teacher evidence playback in v1 — same primitive, new consumer). Poll `getByteFrequencyData`/`getByteTimeDomainData` on a `requestAnimationFrame` loop, normalize to a 0-1 "mouth openness" value.
- `MascotStage` exposes a small state machine: `idle | talking | happy | encouraging | thinking`, driven by (a) `isPlaying` (from the `<audio>` element's `play`/`pause`/`ended` events) → `talking` vs `idle`, and (b) discrete expression cues attached to each Coco line (e.g., `neutral`, `happy`, `encouraging`), resolved from `src/domain/character/profile.ts` — exactly the module that already owns Coco's copy strings today.
- **Sprite rendering:** a small number of PNG/WebP frames per expression (e.g., `idle.png`, `talking-1.png`/`talking-2.png` for a simple 2-frame mouth-flap swapped on an amplitude threshold, `happy.png`) composited over a background image via CSS/`<canvas>` layers — a scoped, elementary-ESL-appropriate simplification of the "sprite sheet + viseme mapping" pattern used in production 2D lip-sync libraries: **2-frame amplitude-threshold mouth-flap, not full viseme decomposition**, because phoneme-accurate lip-sync is disproportionate engineering effort for a children's homework app at this scale and adds a dependency the roadmap doesn't need yet.
- This client-side logic has **zero new server/schema footprint** — pure rendering keyed off existing playback events and the character profile's static expression tags. Flag to the roadmapper: v2.3 is mostly a new client component + asset pipeline, not a data-model change.

## Asset Storage for Mascot Sprites/Backgrounds

**Recommendation: new public Supabase Storage bucket `mascot-assets`.**

- Sprites and backgrounds are **app-owned static content** (not per-student, not per-attempt), so they belong in a **public** bucket — do not put them in `student-audio` or any RLS-protected bucket; there is no ownership/ACL problem to solve here.
- Given `characterId` is already designed to support additional characters later (explicit `PROJECT.md` constraint), structure keys as `mascot-assets/{characterId}/{expression}.webp` and `mascot-assets/{characterId}/background-{sceneId}.webp` now, even though v2.0 ships one character — costs nothing extra today and avoids a rename/migration when a second character is added.
- Extend `CharacterProfile` with `spriteSetId` (defaults to `characterId`) and an expression → asset-key mapping function, keeping the module pure (no Storage/network calls — a client component or thin server helper resolves keys to public URLs via `supabase.storage.from('mascot-assets').getPublicUrl(...)`, a synchronous, non-network call since the bucket is public).

## Data Model / Schema Changes (Summary)

| Change | Type | Ships in | Notes |
|---|---|---|---|
| `tts_audio_cache` table | New table | v2.1 | Hash-keyed lookup; `unique(content_hash)` |
| Storage bucket `tts-audio` (public) | New bucket | v2.1 | Immutable, long-cache-control objects |
| `pronunciation_scores` table | New table | v2.2 | `unique(audio_clip_id)`; joins into existing evidence view |
| `pronunciation_score_status` enum | New enum | v2.2 | `pending / scored / failed / not_applicable` |
| `missions.conversation_mode` enum column | New column | v2.4 | `'guided'` default; `'chat'` opt-in per mission |
| `attempt_turns.coco_line` text column | New column | v2.4 | Nullable; persists dynamic Coco utterance for teacher review |
| `missions.scene_premise` text column | New column | v2.4 | Nullable; generated at mission-draft time, copied into `mission_snapshot` |
| `CharacterProfile` extension (`voiceId`, `spriteSetId`) | Extend existing static module, no schema change needed unless characters move to DB-backed config | v2.1/v2.3 | Stays a pure TS module unless/until a multi-character admin UI is built (out of scope for v2.0) |
| Storage bucket `mascot-assets` (public) | New bucket | v2.3 | Keyed by `{characterId}/{expression}.webp` |

No changes required to: `assignment_student_status`, `attempt_status`, the status-transition audit machinery, `audio_clips` (student audio schema untouched), or any RLS/ownership pattern for existing tables — a deliberate scope boundary: **new features are additive tables/columns plus new server modules, not a rewrite of the assignment/attempt core.**

## Suggested Build Order (respects v2.1 → v2.5 sequencing)

1. **v2.1 TTS** — new `/api/tts` route (Node runtime), `tts-generator.ts` adapter, `tts_audio_cache` table + `tts-audio` bucket, wire into `MissionFlowShell` to play Coco's existing static/AI lines aloud. **Independently shippable/verifiable**: teacher/student can hear Coco speak with zero visual or scoring changes. Verify cache hit-rate and latency in production before v2.2.
2. **v2.2 Pronunciation scoring** — `pronunciation_scores` table, `/api/pronunciation-score` route, `pronunciation-scorer.ts` adapter (SpeechAce or Azure — see STACK.md for the tradeoff), extend `AttemptTurnEvidence` + teacher UI with a collapsed score badge. Reuses v1 stored audio — **no dependency on v2.1**; sequencing after v2.1 is fine but don't block it on TTS.
3. **v2.3 Mascot** — `MascotStage` component, `mascot-assets` bucket, amplitude analyser wired to the TTS `<audio>` element from v2.1, expression-tagging extension to `character/profile.ts`. **Depends on v2.1** (needs TTS playback to drive speaking state) — must ship after it.
4. **v2.4 Dynamic turns + scene framing** — `conversation_mode` column, `scene-generator.ts` (extends mission draft), `chat-turn-generator.ts`, `coco_line`/`scene_premise` columns, new chat-mode branch in the mission flow shell. **Depends on v2.1 (voice) and v2.3 (mascot presence)** for the full "scene" experience; recommend sequencing last among the functional features since it's the highest schema/product risk and benefits from voice+mascot already being stable.
5. **v2.5 UI overhaul** — visual-only pass across all of the above; no new services or schema. Last, so layout isn't redone mid-flight.

Each release should be verified in production before starting the next, per `PROJECT.md`'s explicit constraint — this build order already respects that and should not be reordered without flagging the new dependency risk (e.g., v2.3 cannot ship before v2.1's audio-playback element exists to drive it).

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing TTS cache/scores inside `attempt_turns.evaluation` jsonb
**What people do:** bolt new AI-feature data onto the existing catch-all `evaluation` JSON column because it's already there and schema-flexible.
**Why it's wrong:** couples independently-evolving, independently-failing external providers into one blob; makes re-scoring/re-generation and partial-failure handling ambiguous; breaks the existing Zod-validated `evaluation` contract that `turn-evaluator.ts` and `audio-evidence.ts` depend on.
**Instead:** dedicated tables (`pronunciation_scores`, `tts_audio_cache`) joined in at the evidence-service layer, exactly as `audio_clips` already is.

### Anti-Pattern 2: A parallel "chat session" schema disconnected from `attempts`/`attempt_turns`
**What people do:** build a new `chat_sessions` + `chat_messages` schema for the dynamic-conversation feature because it "feels different" from the guided flow.
**Why it's wrong:** duplicates the entire status/audit/ownership/review machinery that already works and is validated; creates two parallel review UIs for teachers.
**Instead:** treat chat mode as a `conversation_mode` variant of the same `attempts`/`attempt_turns` tables, so every existing status transition, retry, and review path keeps working unchanged.

### Anti-Pattern 3: Edge runtime for TTS "because streaming"
**What people do:** reach for Next.js Edge runtime for any endpoint that streams, assuming streaming requires Edge.
**Why it's wrong:** Node.js route handlers stream perfectly well (chunked transfer encoding works on both runtimes); Edge adds SDK-compatibility risk with the OpenAI/ElevenLabs Node SDKs and fragments the "server code with API keys" mental model, for a latency win that doesn't matter at 6-student scale.
**Instead:** Node runtime everywhere server code touches an AI provider, matching the existing `transcription.ts`/`turn-evaluator.ts` pattern.

### Anti-Pattern 4: Full phoneme-viseme lip-sync for v2.3
**What people do:** integrate a full viseme-mapping/lip-sync engine (9+ mouth shapes, phoneme timing) because "that's how VN/avatar apps do it."
**Why it's wrong:** disproportionate engineering cost and a new dependency for a children's homework app where the mascot is atmosphere, not the product; the milestone context explicitly scopes this as "VN feel," not a VN production.
**Instead:** 2-frame amplitude-threshold mouth-flap + discrete expression states, upgradeable later if warranted.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| OpenAI TTS (`gpt-4o-mini-tts`) or ElevenLabs | Node server route, streamed HTTP response, cached by content hash before calling provider | OpenAI keeps everything in one vendor (simpler billing/key mgmt, consistent with the existing `openai` SDK already in `package.json`); ElevenLabs has stronger voice quality/cloning (relevant if "cloned teacher voice" per `PROJECT.md` is pursued) — see STACK.md for the tradeoff |
| SpeechAce or Azure Pronunciation Assessment | Node server route, POST existing stored audio (from `audio_clips`) + reference sentence, receive structured word/phoneme scores | SpeechAce: purpose-built for ESL, faster integration, phoneme-level detail out of the box. Azure: usage-based pricing tied to standard Speech-to-Text rate, REST API limited to short audio (<30s, matches this app's short-clip model well) — see STACK.md |
| OpenAI Responses API (existing) | Reused, extended for `chat-turn-generator.ts` and `scene-generator.ts` — same structured-output (`zodTextFormat`) pattern already proven in `turn-evaluator.ts` | Lowest-risk new AI call in the whole milestone — the calling pattern already exists and is tested |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `MissionFlowShell` (client) ↔ `/api/tts` | `fetch()` to route handler, receives audio stream/URL | Mirrors existing `audio/route.ts` upload pattern in reverse (download instead of upload) |
| `MascotStage` (client) ↔ `<audio>` element | Web Audio API `AnalyserNode`, no network call | Pure client-side, zero new server surface |
| Teacher evidence service ↔ `pronunciation_scores` / `attempt_turns.coco_line` | Extend existing `getAttemptEvidenceForTeacher` query batch, same `Map<turnId, ...>` join pattern already used for `audio_clips` | Keep the evidence-assembly function as the single seam all new per-turn data flows through |
| Mission draft flow (existing `mission-generator.ts`) ↔ `scene-generator.ts` | Called from the same server action that already generates mission drafts (Phase 6 AI draft flow), extended to also produce `scene_premise` | Reuse the teacher-edits-before-assigning UX already validated in v1 (MISS-03) — scene premise should be editable the same way |

## Scaling Considerations

At the stated scale (6 elementary students, 1 class/week), none of these features approach a scaling bottleneck. The relevant "scale" axis is AI cost/latency, not user count:

| Concern | Current scale (6 students/week) | If growth to ~10 classes | If growth to 1k+ students |
|---|---|---|---|
| TTS calls | Cache handles nearly all repeat lines; a few $ /mo | Cache hit rate still high (shared mission templates); watch per-teacher voice-cloning costs if added | Move cache eviction from "never" to LRU with size cap; consider CDN in front of `tts-audio` bucket |
| Pronunciation scoring | A few calls per mission per week; trivial cost | Linear cost growth, still trivial | Batch/async scoring queue instead of synchronous post-completion call |
| Chat-turn generation | ~5 LLM calls per chat-mode attempt; trivial cost | Linear, still trivial | Consider a cheaper/faster model tier for turn generation, keep Responses API for scene/mission generation |
| Mascot assets | Static files, served from public bucket / CDN | No change needed | Move to a real CDN in front of Storage if not already using Supabase's edge caching |

## Sources

- Direct codebase inspection (HIGH confidence, verified by reading source): `supabase/migrations/202606250001_foundation_schema.sql`, `supabase/migrations/202606270001_student_audio_storage.sql`, `src/server/student-access/mission-flow.ts`, `src/server/teacher/audio-evidence.ts`, `src/server/audio/transcription.ts`, `src/server/ai/turn-evaluator.ts`, `src/domain/character/profile.ts`, `src/app/student/missions/[assignmentStudentId]/page.tsx`, `package.json`
- [OpenAI: Text to speech guide](https://developers.openai.com/api/docs/guides/text-to-speech) (MEDIUM — vendor docs via web search, not cross-verified)
- [OpenAI: gpt-4o-mini-tts model docs](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts) (MEDIUM)
- [ElevenLabs: Streaming text to speech](https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/streaming) (MEDIUM)
- [ElevenLabs + Supabase Edge Functions streaming/caching example](https://supabase.com/docs/guides/functions/examples/elevenlabs-generate-speech-stream) (MEDIUM)
- [Speechace API docs — pronunciation scoring](https://api-docs.speechace.com/) (MEDIUM)
- [Speechace: word/phoneme/syllable scoring](https://api-docs.speechace.com/features/scripted-activities/pronunciation-scoring) (MEDIUM)
- [Azure: Pronunciation assessment how-to](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment) (MEDIUM)
- [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/) (MEDIUM)
- [lipsync-engine (browser-native viseme detection via AudioWorklet)](https://github.com/Amoner/lipsync-engine) (LOW — community project, illustrative of the pattern only)
- [Wawa Sensei: Real-Time Lipsync for Web](https://wawasensei.dev/tuto/real-time-lipsync-web) (LOW — tutorial, illustrative)
- TTS content-hash caching pattern (cross-referenced across independent sources, e.g. [pipecat TTS caching issue](https://github.com/pipecat-ai/pipecat/issues/2629), [Jovo TTS S3 cache](https://www.jovo.tech/marketplace/ttscache-s3)) (MEDIUM — consistent pattern across sources, not project-specific)

---
*Architecture research for: Coco English v2.0 "Coco Comes Alive" — TTS, pronunciation scoring, VN mascot, dynamic chat, UI overhaul integration into existing Next.js/Supabase/OpenAI app*
*Researched: 2026-07-01*
