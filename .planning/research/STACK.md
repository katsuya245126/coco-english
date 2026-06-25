# Technology Stack

**Project:** English Speaking Practice App
**Research dimension:** Stack for a teacher-linked AI ESL speaking homework MVP
**Researched:** 2026-06-25
**Overall confidence:** HIGH for the core web/data stack, MEDIUM for AI model choice because model pricing and quality move quickly.

## Recommendation

Build the MVP as a single TypeScript web app: **Next.js App Router on Vercel, Supabase for Postgres/Auth/Storage, browser MediaRecorder for short audio clips, and OpenAI Responses + Speech-to-Text APIs for guided mission generation/evaluation/transcription**.

This fits the product because the hard parts are not enterprise LMS scale; they are a clean teacher workflow, low-friction student access, secure roster-scoped data, short audio capture, transcript-first review, and controlled AI behavior. A managed Postgres/Auth/Storage backend keeps the MVP small while preserving real relational constraints for classes, rosters, assignments, attempts, turns, audio clips, and review states.

## Recommended Stack

### Core Application

| Technology | Current version/family | Purpose | Why | Confidence |
|------------|------------------------|---------|-----|------------|
| Next.js App Router | 16.2.9 | Full-stack React app, routing, server components, route handlers, server actions | Official docs position Next.js as a React framework for full-stack apps, with App Router supporting Server Components. One app can handle teacher dashboard, student flow, secure server-side AI calls, and signed storage URLs without a separate API service. | HIGH |
| React | 19.2.7 | UI runtime | Matches current Next.js stack and gives access to the supported React Server Components path rather than starting on deprecated Create React App patterns. | HIGH |
| TypeScript | Current stable via `create-next-app --typescript` | Type safety across mission schemas, status enums, AI outputs, and Supabase types | The product has many state transitions and role-specific data access rules; types will prevent common mistakes in assignment status, attempt turn shape, and AI structured outputs. | HIGH |
| Tailwind CSS | 4.3.1 | Styling system | Tailwind's current Next.js setup is simple and low-overhead. It is enough for dense teacher dashboards and mobile student screens without adopting a heavy component framework. | HIGH |
| shadcn/ui CLI + Radix primitives | `shadcn` 4.11.0 | Accessible UI building blocks copied into the codebase | Use for dashboard tables, dialogs, forms, tabs, drawers, and review panels. It avoids a locked-in design system while keeping accessibility primitives practical. | MEDIUM-HIGH |
| lucide-react | 1.21.0 | Icons | Pairs cleanly with shadcn-style interfaces and keeps controls recognizable without custom SVG work. | HIGH |

### Backend, Auth, Database, Storage

| Technology | Current version/family | Purpose | Why | Confidence |
|------------|------------------------|---------|-----|------------|
| Supabase Postgres | Managed Supabase Postgres | Relational data store | The domain is relational: teachers own classes, classes have rosters, assignments target classes, attempts belong to students, and audio clips belong to turns. Postgres is a better fit than document storage for dashboard filtering and review states. | HIGH |
| Supabase Auth | Supabase Auth | Teacher email/password login | Teacher accounts are normal authenticated users. Supabase Auth gives email/password without building account management from scratch. | HIGH |
| Custom student access in Postgres | App-owned roster PIN flow | Student class-code/QR/name/PIN access | Do **not** create Supabase Auth users for elementary students in the MVP. Store student roster rows with PIN hashes and issue short-lived app sessions from a server route after class code + student + PIN verification. This matches the spec and avoids email/password friction. | HIGH |
| Supabase Row Level Security | Postgres RLS policies | Defense-in-depth authorization | Supabase docs state RLS should be enabled on exposed schemas and can combine with Auth. Use RLS for teacher-owned rows; use server-only service-role access for student PIN session validation and AI/audio mutations that cannot map cleanly to `auth.uid()`. | HIGH |
| Supabase Storage | Supabase Storage private bucket | Short per-turn audio clips | Storage is integrated with Postgres/RLS and supports private access. Store short clips per answer/repeat turn, not full sessions. Use private buckets and signed URLs for teacher playback. | HIGH |
| @supabase/supabase-js | 2.108.2 | Browser/server client for data and storage | Official JS client covers Postgres, auth, realtime, edge functions, and large files. Use generated database types. | HIGH |
| @supabase/ssr | 0.12.0 | Supabase auth in Next.js SSR | Official Supabase SSR package is the intended path for cookie-backed server/client auth in Next.js. | HIGH |
| Supabase CLI | Current stable | Local migrations, type generation, seed data | Use SQL migrations from day one. The app needs durable constraints and RLS policies; dashboard-clicked schema changes will become risky quickly. | HIGH |

### AI and Speech

| Technology | Current version/family | Purpose | Why | Confidence |
|------------|------------------------|---------|-----|------------|
| OpenAI Responses API | Current Responses API | Mission generation, target-form correction, turn evaluation | OpenAI docs recommend Responses API over older Chat Completions for text generation. Use structured outputs for mission JSON and evaluation JSON so the app never relies on prose parsing. | HIGH |
| OpenAI model for text | Start with `gpt-5.4-mini`; reserve `gpt-5.5` for hard cases | Generate missions and evaluate student turns | Official model docs identify GPT-5.5 as the latest flagship and GPT-5.4 mini/nano as lower-cost, lower-latency variants. For elementary ESL turn evaluation, mini is the right default; escalate only for low-confidence evaluations or teacher review cases. | MEDIUM |
| OpenAI Speech-to-Text | `gpt-4o-mini-transcribe` default; `gpt-4o-transcribe` fallback | Transcribe short student audio clips | Official speech docs list both models. The mini transcribe model is the MVP default for cost; use the larger model only when transcript confidence is low or the clip is critical for review. | MEDIUM-HIGH |
| OpenAI Node SDK | 6.45.0 | Server-side API client | Keeps API keys server-only in route handlers/server actions. Never call OpenAI directly from the browser for student homework. | HIGH |
| Zod | 4.4.3 | Runtime validation of AI outputs and forms | Validate AI mission/evaluation payloads before writing them. Bad AI JSON should become `teacher_review`, not corrupt attempt state. | HIGH |

### Audio Capture

| Technology | Current version/family | Purpose | Why | Confidence |
|------------|------------------------|---------|-----|------------|
| Browser `MediaRecorder` + `getUserMedia` | Web Platform API | Record short answer/repeat clips | MDN documents MediaRecorder as part of the MediaStream Recording API. For 2-3 minute guided missions with short per-turn clips, native browser recording is enough and avoids SDK/vendor complexity. | HIGH |
| Preferred audio format | `audio/webm;codecs=opus` when supported, fallback by `MediaRecorder.isTypeSupported()` | Compact audio upload | Opus/WebM is compact for speech in modern browsers. Detect support instead of hard-coding one MIME type, because Safari/device behavior still needs testing. | MEDIUM |
| Direct upload flow | Browser uploads to a signed server-issued destination or server route | Persist clips | For MVP, start with a Next.js route handler that validates student session + assignment/turn, uploads to private Supabase Storage, then writes the clip row. Move to signed upload URLs only when upload size/latency warrants it. | MEDIUM-HIGH |

### Forms, Data Fetching, Validation, Testing

| Technology | Current version/family | Purpose | Why | Confidence |
|------------|------------------------|---------|-----|------------|
| React Hook Form | 7.80.0 | Teacher mission forms, roster forms, PIN entry | Good fit for form-heavy teacher workflows and student PIN/name selection; lighter than a form framework. | HIGH |
| Zod resolver pattern | Zod 4 with React Hook Form | Shared validation | Define mission creation, roster import, and AI output schemas once and use them on server and client. | HIGH |
| TanStack Query | 5.101.1 | Client-side async state where needed | Use sparingly for polling attempt status, signed audio URLs, and dashboard filters. Do not wrap every server-rendered query. | MEDIUM-HIGH |
| Vitest | 4.1.9 | Unit tests | Test mission status transitions, PIN verification, AI output validation, and due-date/missed logic without browser overhead. | HIGH |
| Playwright | 1.61.1 | End-to-end tests | Cover teacher assignment creation and student mission happy path, including microphone-permission mock strategy later. | HIGH |

### Infrastructure

| Technology | Current version/family | Purpose | Why | Confidence |
|------------|------------------------|---------|-----|------------|
| Vercel | Current managed Next.js platform | Hosting, previews, serverless route handlers | Lowest-friction deployment path for Next.js. Good enough for MVP traffic and teacher demos. | HIGH |
| Supabase managed project | Current hosted Supabase | Database, auth, storage | Avoids operating Postgres, auth, object storage, signed URLs, and backups separately during validation. | HIGH |
| Vercel Cron or Supabase scheduled job | Current platform feature | Mark missed assignments, prune expired audio | Use one scheduled job for due-date transitions and 30/60-day audio deletion. Keep it boring and observable. | MEDIUM |
| Sentry | Current stable SaaS / `@sentry/nextjs` | Error monitoring | Add before pilot use. Audio upload and AI failures need traceable diagnostics. | MEDIUM-HIGH |
| PostHog or Vercel Analytics | Current stable | Product analytics | Track assignment created, mission started, mission completed, retry/review rate. Use only product events needed to validate classroom usefulness. | MEDIUM |

## Data Model Direction

Use plain Postgres tables with SQL migrations:

| Table | Purpose |
|-------|---------|
| `teacher_profiles` | One row per authenticated teacher user. |
| `classes` | Teacher-owned class with code/QR token metadata. |
| `students` | Roster entry with display name, PIN hash, class membership, archived flag. |
| `student_sessions` | Optional server-issued session records or signed token audit rows for PIN-based access. |
| `missions` | Teacher-created/generated mission template with target pattern, level, required turns, characterId. |
| `assignments` | Mission assigned to class with due date and status metadata. |
| `assignment_students` | Per-student assignment state: assigned, started, completed, missed, needs_retry, teacher_review. |
| `attempts` | Student attempt summary, submitted time, highest hint level, model versions used. |
| `attempt_turns` | Original transcript, improved target-form sentence, repeat transcript, target-pattern flags, evaluation JSON. |
| `audio_clips` | Storage path, MIME type, duration, byte size, retention expiry, associated turn and clip kind. |

Do not start with Prisma unless the team already strongly prefers it. Supabase's value is Postgres + RLS + generated types + Storage policies. An ORM can obscure RLS behavior and add migration friction for a small schema. SQL migrations plus generated Supabase types are simpler for this MVP.

## Installation Baseline

```bash
# Core app
npx create-next-app@latest english-speaking-practice --typescript --eslint --app

# UI and styling
npm install tailwindcss @tailwindcss/postcss postcss
npx shadcn@latest init
npm install lucide-react

# Supabase
npm install @supabase/supabase-js @supabase/ssr
npm install -D supabase

# AI, validation, forms, async state
npm install openai zod react-hook-form @hookform/resolvers @tanstack/react-query

# Testing
npm install -D vitest @playwright/test
```

## What Not To Use

| Avoid | Why | Use Instead | Confidence |
|-------|-----|-------------|------------|
| Full LMS platforms or LTI-first architecture | The MVP is validating speaking homework usefulness, not replacing Google Classroom/Canvas. LMS integrations will slow product learning. | Simple teacher account, class, roster, assignment dashboard. | HIGH |
| Student email/password accounts | Elementary learners have account friction; the spec explicitly calls for class code/name/PIN access. | Class QR/code + remembered class + roster name + 4-digit PIN. | HIGH |
| Firebase Firestore as primary database | Firestore can work, but relational homework dashboards, class ownership, attempts, turns, status buckets, and teacher review filters are more natural in Postgres. | Supabase Postgres. | HIGH |
| Separate S3/R2 audio storage for MVP | Adds another provider, IAM surface, signed URL implementation, and lifecycle management before volume justifies it. | Supabase Storage private bucket with retention job. | HIGH |
| Live WebRTC voice agent for v1 | The product does not need fully live conversational voice. It needs guided short turns, transcription, correction, repeat, and review. Realtime voice raises latency/cost/behavior complexity. | Record short clips with MediaRecorder, transcribe after each turn, generate the next guided prompt. | HIGH |
| Whisper-only or browser speech recognition only | Browser speech recognition has inconsistent support and privacy behavior; Whisper-only may be older than current OpenAI transcription choices. | `gpt-4o-mini-transcribe` default with fallback to `gpt-4o-transcribe`. | MEDIUM-HIGH |
| A large agent framework for mission logic | Guided ESL homework is a constrained workflow, not open-ended agent autonomy. Agent frameworks add debugging surface and prompt drift. | Deterministic state machine + Responses API structured outputs. | HIGH |
| Numerical grading engine | The spec says completion and review states are enough. Grades invite trust, fairness, and parent/school concerns too early. | Status buckets and teacher review flags. | HIGH |
| Microservices | No scale or team need yet; service boundaries would slow iteration. | One Next.js app with server-side modules and Supabase. | HIGH |

## Implementation Notes for Roadmap

1. Start with the data model, RLS policies, and teacher auth before AI. If teachers cannot trust class/roster isolation, the product is not usable in schools.
2. Build student PIN access as an app session, not Supabase Auth. Keep service-role calls server-only.
3. Treat mission flow as a deterministic state machine: prompt -> record -> upload -> transcribe -> evaluate -> show improved sentence -> repeat -> evaluate -> next turn/complete.
4. Store both transcript and audio metadata per turn. Audio playback should use short-lived signed URLs only in teacher review.
5. Add model/version fields on AI-generated missions, evaluations, and transcriptions so later quality/cost changes are auditable.
6. Use structured output validation. Any invalid or low-confidence AI result should create `teacher_review`, not block the student with a technical error.
7. Implement retention early: `audio_clips.retention_expires_at` plus a scheduled deletion job. Keep transcripts longer than audio.

## Confidence Notes

| Area | Confidence | Notes |
|------|------------|-------|
| Next.js/Vercel frontend/backend | HIGH | Official Next docs show current 16.2.9 and App Router/full-stack direction; npm registry confirms current versions. |
| Supabase data/auth/storage | HIGH | Official Supabase docs align directly with Postgres, Auth, Storage, RLS, and JavaScript client needs. |
| Browser audio recording | HIGH | MediaRecorder is the standard web API for this use case, though MIME support needs device testing. |
| OpenAI API family | HIGH | Official docs recommend Responses API for text generation and list current transcription models. |
| Specific OpenAI model defaults | MEDIUM | Current docs favor GPT-5.4 mini for latency/cost and list GPT-4o mini transcribe, but model pricing/quality changes frequently. Re-check before paid pilot. |
| Student PIN session implementation | MEDIUM-HIGH | Architecturally straightforward, but privacy/security review should happen before classroom pilot. |

## Sources

- Next.js docs, current latest version 16.2.9 and App Router/full-stack positioning: https://nextjs.org/docs
- React blog, React 19.2 and current React release/security context: https://react.dev/blog
- Tailwind CSS Next.js installation, v4.3 docs and setup: https://tailwindcss.com/docs/installation/framework-guides/nextjs
- Supabase documentation overview for Postgres, Auth, Storage, Realtime, JavaScript client: https://supabase.com/docs
- Supabase Row Level Security guide: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase SSR client for Next.js: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase JavaScript client reference: https://supabase.com/docs/reference/javascript/introduction
- Supabase Storage access control/uploads/downloads: https://supabase.com/docs/guides/storage/security/access-control, https://supabase.com/docs/guides/storage/uploads/standard-uploads, https://supabase.com/docs/guides/storage/serving/downloads
- OpenAI text generation guide recommending Responses API: https://developers.openai.com/api/docs/guides/text
- OpenAI speech-to-text guide listing `gpt-4o-transcribe` and `gpt-4o-mini-transcribe`: https://developers.openai.com/api/docs/guides/speech-to-text
- OpenAI model catalog for GPT-5.5, GPT-5.4 mini/nano, and transcription model families: https://developers.openai.com/api/docs/models
- MDN MediaRecorder API: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- npm registry check on 2026-06-25: `next@16.2.9`, `react@19.2.7`, `tailwindcss@4.3.1`, `@supabase/supabase-js@2.108.2`, `@supabase/ssr@0.12.0`, `openai@6.45.0`, `zod@4.4.3`, `react-hook-form@7.80.0`, `@tanstack/react-query@5.101.1`, `shadcn@4.11.0`, `lucide-react@1.21.0`, `vitest@4.1.9`, `@playwright/test@1.61.1`.

## Research Process Note

The requested GSD research seam was attempted with `/Users/john/.codex/gsd-core/bin/gsd-tools.cjs query research-plan`, but the local tool installation failed with `Cannot find module '../../../package.json'` before returning a fetch plan. I proceeded with official documentation and live npm registry checks to satisfy the current-version quality gate.
