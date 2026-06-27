# Phase 05: Voice Capture and Evidence Storage - Pattern Map

**Mapped:** 2026-06-27
**Scope:** Planning-time analogs for expected Phase 5 files.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/domain/audio/recorder.ts` | domain module | transform | `src/domain/flow/completion.ts` | exact |
| `src/components/student/VoiceRecorderControl.tsx` | client component | event-driven | `src/components/student/StepBuddyQuestion.tsx` | role-match |
| `src/components/student/StepBuddyQuestion.tsx` | client component modify | event-driven | self | exact |
| `src/components/student/StepImprovedRepeat.tsx` | client component modify | event-driven | self | exact |
| `src/components/student/MissionFlowShell.tsx` | client component modify | event-driven | self | exact |
| `src/app/student/missions/[assignmentStudentId]/audio/route.ts` | route handler | request-response | `src/app/api/foundation/route.ts` + `src/app/student/missions/[assignmentStudentId]/actions.ts` | role-match |
| `src/server/student-access/audio-upload.ts` | service | CRUD | `src/server/student-access/mission-flow.ts` | exact |
| `src/server/audio/transcription.ts` | server adapter | request-response | `src/server/foundation/createFoundationSmokeRecord.ts` | role-match |
| `src/server/teacher/audio-evidence.ts` | teacher service | request-response | `src/server/mission/mission-service.ts` | role-match |
| `src/app/teacher/evidence/[attemptId]/page.tsx` | SSR route | request-response | `src/app/teacher/missions/[id]/page.tsx` | role-match |
| `src/app/teacher/evidence/[attemptId]/actions.ts` | server action | request-response | `src/app/teacher/missions/actions.ts` | exact |
| `src/components/teacher/AudioClipPlayer.tsx` | client component | event-driven | `src/components/teacher/AssignDialog.tsx` | role-match |
| `src/lib/db/types.ts` | type config | transform | self | exact |
| `supabase/migrations/202606270001_student_audio_storage.sql` | migration | schema/storage | `supabase/migrations/202606250002_teacher_auth_rls.sql` | role-match |
| `.env.example` | config | N/A | self | exact |

## Pattern Notes

### Student Server Actions And Routes

Follow the Phase 4 pattern:

- Read the unlock cookie with `readStudentUnlock()`.
- Validate input with Zod or explicit FormData checks.
- Delegate business logic to `src/server/student-access/*`.
- The service verifies `assignment_students.student_id = unlock.studentId` before any service-role DB or Storage access.

### Client Step Components

Follow `StepBuddyQuestion.tsx` and `StepImprovedRepeat.tsx`:

- `"use client"` at top.
- Local `useState` for UI state.
- Real labels, `aria-describedby` for errors, `role="alert"` for failures.
- Inline styles via `src/components/student/styles.ts`.
- No raw HTML injection and no AI imports.

### Teacher Actions

Follow teacher action conventions:

- Require teacher profile with `requireTeacherProfile()`.
- Return typed result unions.
- Hide storage internals behind generic failure copy.
- Verify ownership through teacher-owned classes/assignments/attempts before signed URL generation.

### Migrations

Follow Supabase migration conventions:

- Use explicit SQL.
- Add grants when new tables are introduced.
- For Storage, create private bucket state idempotently.
- Plans must include a blocking `supabase db push` task after migration changes.

## Drift Watch

- Do not create a second transcript table unless a requirement appears; `attempt_turns` is the current transcript record.
- Do not bypass Phase 4 completion logic; populate the fields it already reads.
- Do not make Storage public to simplify playback.
- Do not add OpenAI calls to client components or route public keys to the browser.
