# Walking Skeleton — English Speaking Practice App

**Phase:** 1
**Generated:** 2026-06-25

## Capability Proven End-to-End

A developer can open an internal foundation smoke screen, click one button, create a demo teacher/class/student/mission/assignment skeleton through a server-owned Supabase path, and read the persisted assignment status back into the UI.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js App Router with React and TypeScript | One full-stack app can serve teacher and student routes, route handlers, server modules, and typed UI without introducing service boundaries before the homework loop is proven. |
| Data layer | Supabase Postgres with SQL migrations and generated TypeScript database types | The source of truth is relational workflow state: teacher, class, student, mission, assignment snapshot, per-student state, attempt, turn, audio metadata, and audit events. Direct SQL keeps RLS, constraints, enums, and retention fields visible. |
| Auth posture | Supabase Auth for teachers in later phases; custom class-code/name/PIN student access in later phases; Phase 1 uses server-only service-role access for the foundation smoke path | Teachers are normal authenticated adult users, but elementary students should not receive email/password accounts. Phase 1 prepares ownership columns and RLS posture without building login UI. |
| Storage posture | Supabase Storage private bucket in later audio phase; Phase 1 creates `audio_clips` metadata only | The product stores short per-turn clips, not full-session recordings. Retention/deletion fields must exist before audio upload work starts. |
| Status ownership | Server-owned TypeScript transition module plus append-only Postgres audit table | Client UI and future AI providers can provide requests or evidence, but application/server logic owns final assignment statuses. |
| Demo vs real boundary | `classes.data_mode` is the source of truth, copied to `assignments.data_mode` when homework is assigned | Students are class-scoped, and teachers may need demo and real classes side by side. Copying the mode to assignments simplifies later audit and retention queries while preserving class-level ownership. |
| Deployment target | Vercel for hosted Next.js; local full-stack run uses `supabase start`, `supabase db reset`, and `npm run dev` | Vercel matches the researched stack and keeps deployment simple. Local Supabase proves migrations, server env loading, and real database read/write before hosted deployment is required. |
| Directory layout | `src/app` for routes, `src/components` for UI, `src/domain/foundation` for pure rules, `src/server/foundation` for server-owned workflows, `src/lib` for env/Supabase clients, `supabase/migrations` for SQL, `tests` split by domain/server/schema/e2e | This keeps UI, domain rules, server workflows, and database schema separate enough for later phases without inventing a large architecture. |

## Stack Touched in Phase 1

- [ ] Project scaffold (framework, build, lint, test runner)
- [ ] Routing — at least one real route
- [ ] Database — at least one real read AND one real write
- [ ] UI — at least one interactive element wired to the API
- [ ] Deployment — running on dev environment OR documented local full-stack run command

## Local Full-Stack Run Contract

The Phase 1 implementation must document and support this path:

1. `npm install`
2. `supabase start`
3. `supabase db reset`
4. Copy `.env.example` to `.env.local` and fill `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`.
5. `npm run dev`
6. Open `http://localhost:3000/`, click `Create foundation smoke record`, and confirm a demo class, assignment title, `assigned` status, and `data-mode: demo` render from the database.

If local Supabase is unavailable, the implementation must still support static schema verification with `npm run test:schema` and a live smoke rerun with `npm run test:db:smoke` once Supabase env vars are available.

## Out of Scope (Deferred to Later Slices)

- Teacher dashboard, class management screens, roster editing, student class-code/PIN login UI, mission creation UI, assignment publishing UI, and teacher review screens.
- Audio recording, audio upload, private playback URLs, transcription, AI mission generation, AI turn evaluation, model selection, and cost tracking.
- Public demo workspace polish; Phase 1 only proves an internal demo data boundary.
- School SSO, LMS sync, parent accounts, consent/export/admin workflows, scoring, leaderboards, analytics dashboards, large character casts, visual-novel systems, and long-form free chat.
- Production scheduler wiring; Phase 1 creates a job-ready missed-status function and retention fields.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without changing these architectural decisions:

- Phase 2: Teachers can create accounts/classes/rosters, and students can access homework through class code, roster name, and PIN.
- Phase 3: Teachers can manually create a mission, assign it to a class, and create immutable per-student homework records.
- Phase 4: Students can complete the guided mission flow with the supportive buddy, target-form recast, repeat requirement, hints, and deterministic completion rules.
- Phase 5: Students can record short original/repeat clips, store private audio evidence metadata and objects, and teachers can play clips on demand.
- Phase 6: AI can generate validated mission drafts and evaluate turns as structured evidence while server code owns final status transitions.
- Phase 7: Teachers can review status buckets, inspect transcript-first attempt details, override outcomes with audit trails, and run a cautious classroom pilot.
