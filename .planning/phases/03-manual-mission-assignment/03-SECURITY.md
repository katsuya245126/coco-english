---
phase: 03
slug: manual-mission-assignment
status: secured
threats_open: 0
threats_found: 11
threats_closed: 11
asvs_level: 1
block_on: high
created: 2026-06-26
register_authored_at_plan_time: true
---

# Phase 03 -- Manual Mission Assignment: Security Audit

**Audited:** 2026-06-26
**ASVS Level:** L1
**Auditor:** Claude (gsd-security-auditor)
**Disposition:** SECURED -- all 11 threats CLOSED

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence | Notes |
|-----------|----------|-------------|--------|----------|-------|
| T-03-01 | Tampering | mitigate | CLOSED | `src/app/teacher/missions/actions.ts:56` -- `missionFormSchema.safeParse(...)` validates all input with Zod. Line 68: `teacherId: profile.id` uses server-side profile, ignoring any client-supplied teacher id. `src/server/mission/mission-service.ts:99` -- `character_id: DEFAULT_CHARACTER_ID` is always set server-side, never from client input. `src/domain/mission/schemas.ts:35-68` -- `missionFormSchema` validates title, targetPattern, topic, level (enum), requiredTurns, turns array with nested hintLadder. | All three sub-mitigations (Zod validation, ignore client teacher id, server-set character_id) confirmed in code. |
| T-03-02 | Elevation of privilege | mitigate | CLOSED | `src/app/teacher/missions/actions.ts:55` -- `createMissionAction` calls `requireTeacherProfile()`. Line 80: `updateMissionAction` calls `requireTeacherProfile()`. Line 113: `assignMissionAction` calls `requireTeacherProfile()`. `src/server/mission/mission-service.ts:117` -- `createSupabaseServerClient()` (RLS-bound anon key client) used for all mission writes. `src/lib/supabase/server-auth.ts:19` -- client uses `env.anonKey`, not service role. | All three action entry points guarded. All service-layer writes use RLS-bound client. No service-role client found in teacher code paths. |
| T-03-03 | Information disclosure | mitigate | CLOSED | `src/app/teacher/missions/[id]/page.tsx:18-21` -- `getMissionForTeacher({ teacherId: profile.id, missionId: id })` fetches by teacher id (RLS-bound). Lines 23-25: `if (!mission) { notFound(); }` returns not-found for rows outside ownership. `src/server/mission/mission-service.ts:193-194` -- query filters by both `teacher_id` and `id`. | Edit route fetches through RLS-bound service; not-found redirect for missing/non-owned rows confirmed. |
| T-03-04 | Tampering | mitigate | CLOSED | `src/app/teacher/missions/actions.ts:115` -- `assignMissionSchema.safeParse(...)` validates mission id (uuid), class id (uuid), and nullable due date with Zod. `src/domain/mission/schemas.ts:102-113` -- `assignMissionSchema` requires uuid for missionId and classId, transforms empty dueAt to null. `src/server/mission/assign-service.ts:98-101` -- server reads mission+turn rows and builds snapshot via `buildMissionSnapshot`. Line 61: `missionSnapshotSchema.parse(snapshot)` validates before RPC call. | Client never assembles snapshot. Server reads mission/turns, builds snapshot, validates with Zod, then calls RPC. |
| T-03-05 | Elevation of privilege | mitigate | CLOSED | `supabase/migrations/202606260001_fix_assign_rpc_ambiguous_column.sql:41` -- `v_teacher_id := public.current_teacher_id()`. Lines 43-45: null check raises 'Not authorized'. Lines 47-56: class ownership check `c.teacher_id = v_teacher_id` with null-raises-exception. Lines 58-66: mission ownership check `m.teacher_id = v_teacher_id` with null-raises-exception. Line 30: `security definer`. Line 31: `set search_path = public`. Line 127: `grant execute ... to authenticated`. | FIX migration (live/effective) preserves all three security properties: SECURITY DEFINER, search_path pinning, and dual ownership checks (class + mission via current_teacher_id()). |
| T-03-06 | Repudiation | mitigate | CLOSED | `supabase/migrations/202606260001_fix_assign_rpc_ambiguous_column.sql:96-113` -- CTE `inserted_events` inserts into `assignment_status_events` with `actor_type = 'system'`, `reason_code = 'assignment_created'`, `next_status = 'assigned'` for every row from `inserted_students`. `tests/schema/mission-assign-rpc-schema.test.ts:25` -- test asserts SQL contains `insert into public.assignment_status_events`. | Status events created for every assignment_students row with system actor and assignment_created reason. |
| T-03-07 | Denial of service | mitigate | CLOSED | `supabase/migrations/202606260001_fix_assign_rpc_ambiguous_column.sql:18-125` -- entire function is one PL/pgSQL block: assignment insert, student insert (CTE), and status event insert (CTE) execute in a single transaction. `src/server/mission/assign-service.ts:103` -- single `supabase.rpc("assign_mission_to_class", ...)` call, no separate network calls. | One Postgres RPC transaction for all multi-row operations. No separate network calls. |
| T-03-08 | Information disclosure | mitigate | CLOSED | `src/app/teacher/missions/page.tsx:10` -- `requireTeacherProfile()` at page entry. `src/app/teacher/missions/new/page.tsx:8` -- `requireTeacherProfile()` at page entry. `src/app/teacher/missions/[id]/page.tsx:15` -- `requireTeacherProfile()` at page entry. All service calls use `createSupabaseServerClient()` (RLS-bound). No `SERVICE_ROLE`, `serviceRole`, `supabaseAdmin`, or `createClient` references found in teacher UI code. | All mission pages and services use requireTeacherProfile() + RLS-bound queries. No service-role client in teacher UI. |
| T-03-09 | Tampering | mitigate | CLOSED | `tests/server/mission-assign.test.ts:116-154` -- test "preserves stored snapshot after live mission edit (D-05, D-06, D-14)" proves stored snapshot is unchanged after editing the source mission. `src/server/mission/assign-service.ts:61` -- snapshot is created once via `missionSnapshotSchema.parse()` and passed to RPC. RPC has no UPDATE path for snapshots (INSERT only at line 68-84 of fix migration). | Snapshot immutability confirmed: test proves independence; no code path modifies stored snapshot after assignment. |
| T-03-10 | Repudiation | mitigate | CLOSED | `03-03-SUMMARY.md:76-77` -- records exact `npm test` command and 14 tests passed. `03-03-SUMMARY.md:90` -- `npm run typecheck` passed. `03-03-SUMMARY.md:96` -- `npm run build` passed. `03-02-SUMMARY.md:65` -- records migration 202606250005 applied to remote Supabase project confirmed via `supabase migration list`. | Summary records exact automated commands and schema push evidence. |
| T-03-SC | Tampering | accept | CLOSED | `git diff HEAD~6..HEAD -- package.json` returns empty: no package.json changes in Phase 3 commits. No new npm/pip/cargo installs. | Accepted risk with verified precondition: no new packages were added. |

---

## Unregistered Flags

None. The three SUMMARY.md files contain no `## Threat Flags` section. No new attack surface was detected during implementation that lacks a threat mapping.

---

## Accepted Risks Log

| Threat ID | Risk | Justification | Review Date |
|-----------|------|---------------|-------------|
| T-03-SC | Supply chain tampering via package installs | No new packages were added in Phase 3. Verified by empty git diff on package.json across all phase commits. | 2026-06-26 |

---

## Summary

- **Threats found:** 11
- **Threats closed:** 11
- **Threats open:** 0
- **Unregistered flags:** 0
- **Result:** SECURED
