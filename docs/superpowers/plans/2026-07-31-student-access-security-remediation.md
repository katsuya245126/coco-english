# Student Access Security Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the public smoke-data writer, authenticate student session cookies, and atomically throttle four-digit PIN verification.

**Architecture:** Delete the obsolete foundation route instead of guarding it. Authenticate the existing student cookie payload with an expiry-bound HMAC token. Consume PIN attempts through one service-role-only PostgreSQL RPC immediately before PIN verification, using HMAC digests so limiter state contains no student or network identifiers.

**Tech Stack:** Next.js 15 server actions, TypeScript, Node `crypto`, Supabase/PostgreSQL, Vitest, Playwright

## Global Constraints

- Preserve the existing class-code, typed-name, and PIN login UX and the single `generic_mismatch` failure.
- Preserve server-owned student ownership checks, mission snapshots, RLS, and signed audio URLs.
- Store or log no PIN, student name, class code, or raw network address in limiter state.
- Add no dependency.
- Keep the existing cookie fields; do not add profile queries merely to remove signed display fields.
- Do not apply the migration, deploy, push, or mutate any remote environment.
- Preserve unrelated working-tree changes.

---

### Task 1: Delete the public foundation writer

**Files:**
- Delete: `src/app/api/foundation/route.ts`
- Delete: `src/server/foundation/createFoundationSmokeRecord.ts`
- Delete: `src/components/foundation/FoundationSmokePanel.tsx`
- Delete: `src/domain/foundation/schemas.ts`
- Delete: `tests/server/foundation-smoke.test.ts`
- Modify: `src/server/classroom/class-service.ts`
- Modify: `package.json`
- Modify: `README.md`
- Keep: `tests/e2e/foundation-smoke.spec.ts` (it tests the production landing page and does not call the removed endpoint)

**Interfaces:**
- Consumes: existing landing page at `/`
- Produces: no `POST /api/foundation` route and no callable foundation smoke writer

- [ ] **Step 1: Record the current attack-surface evidence**

Run:

```bash
rg -n "createFoundationSmokeRecord|/api/foundation|FoundationSmokePanel|FoundationSmokeResponse|test:db:smoke" src tests package.json README.md
```

Expected: matches include the public route, writer, unused panel/schema, server test, package script, and stale README instructions.

- [ ] **Step 2: Delete the obsolete executable path and its orphaned artifacts**

Delete the five files listed above. In `src/server/classroom/class-service.ts`, replace the stale implementation-reference comment with:

```ts
// Keep per-query `.error` checks so partial Supabase failures never look successful.
```

Remove this script from `package.json`:

```json
"test:db:smoke": "vitest run tests/server/foundation-smoke.test.ts",
```

Replace README's foundation-smoke description and run instructions with the current teacher/student entrypoints and remove every `test:db:smoke` command. Do not rewrite unrelated documentation.

- [ ] **Step 3: Verify deletion**

Run:

```bash
test ! -e src/app/api/foundation/route.ts
test ! -e src/server/foundation/createFoundationSmokeRecord.ts
test ! -e src/components/foundation/FoundationSmokePanel.tsx
test ! -e src/domain/foundation/schemas.ts
test ! -e tests/server/foundation-smoke.test.ts
rg -n "createFoundationSmokeRecord|/api/foundation|FoundationSmokePanel|FoundationSmokeResponse|test:db:smoke" src tests package.json README.md
```

Expected: every `test` command exits 0 and `rg` returns no matches.

- [ ] **Step 4: Verify the retained landing-page behavior**

Run:

```bash
npx playwright test tests/e2e/foundation-smoke.spec.ts
```

Expected: PASS; `/` still presents teacher and student entry links.

- [ ] **Step 5: Commit**

```bash
git add README.md src/server/classroom/class-service.ts src/app/api/foundation/route.ts src/server/foundation/createFoundationSmokeRecord.ts src/components/foundation/FoundationSmokePanel.tsx src/domain/foundation/schemas.ts tests/server/foundation-smoke.test.ts
git add -p package.json
git --no-optional-locks diff --cached --stat
git commit -m "fix: remove public foundation writer"
```

Stage only the `test:db:smoke` removal from `package.json`; its pre-existing dependency changes belong to the user.

---

### Task 2: Authenticate and expire the student cookie

**Files:**
- Create: `src/server/student-access/student-session.ts`
- Create: `tests/server/student-session.test.ts`
- Modify: `src/app/join/actions.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `StudentUnlockCookie` with `classId`, `studentId`, `className`, and `displayName`
- Produces:
  - `sealStudentSession(payload, secret, now?): string`
  - `openStudentSession(token, secret, now?): StudentUnlockCookie | null`
  - eight-hour authenticated session-token lifetime

- [ ] **Step 1: Write failing token tests**

Create `tests/server/student-session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  openStudentSession,
  sealStudentSession,
  STUDENT_SESSION_TTL_MS,
} from "@/server/student-access/student-session";

const SECRET = "a".repeat(32);
const payload = {
  classId: "class-1",
  studentId: "student-1",
  className: "English A",
  displayName: "Jamie",
};

describe("student session token", () => {
  it("round-trips an authenticated payload", () => {
    const token = sealStudentSession(payload, SECRET, 1_000);
    expect(openStudentSession(token, SECRET, 1_001)).toEqual(payload);
  });

  it("rejects tampering and a different secret", () => {
    const token = sealStudentSession(payload, SECRET, 1_000);
    const [body, signature] = token.split(".");
    expect(openStudentSession(`${body}x.${signature}`, SECRET, 1_001)).toBeNull();
    expect(openStudentSession(token, "b".repeat(32), 1_001)).toBeNull();
  });

  it("rejects malformed and expired tokens", () => {
    const token = sealStudentSession(payload, SECRET, 1_000);
    expect(openStudentSession("not-a-token", SECRET, 1_001)).toBeNull();
    expect(
      openStudentSession(token, SECRET, 1_000 + STUDENT_SESSION_TTL_MS),
    ).toBeNull();
  });

  it("refuses a short or missing secret", () => {
    expect(() => sealStudentSession(payload, "short", 1_000)).toThrow();
    expect(openStudentSession("anything", "", 1_000)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the token test and verify RED**

Run:

```bash
npm test -- --run tests/server/student-session.test.ts
```

Expected: FAIL because `student-session.ts` does not exist.

- [ ] **Step 3: Implement the minimal HMAC token**

Create `src/server/student-access/student-session.ts` using only `node:crypto`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export const STUDENT_SESSION_TTL_MS = 8 * 60 * 60 * 1_000;

export type StudentUnlockCookie = {
  classId: string;
  studentId: string;
  className: string;
  displayName: string;
};

type SessionPayload = StudentUnlockCookie & {
  version: 1;
  expiresAt: number;
};

function signature(body: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(`student-session:v1:${body}`)
    .digest();
}

function validSecret(secret: string): boolean {
  return Buffer.byteLength(secret) >= 32;
}

export function sealStudentSession(
  payload: StudentUnlockCookie,
  secret: string,
  now = Date.now(),
): string {
  if (!validSecret(secret)) throw new Error("STUDENT_ACCESS_SECRET is invalid");
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      version: 1,
      expiresAt: now + STUDENT_SESSION_TTL_MS,
    } satisfies SessionPayload),
  ).toString("base64url");
  return `${body}.${signature(body, secret).toString("base64url")}`;
}

export function openStudentSession(
  token: string,
  secret: string,
  now = Date.now(),
): StudentUnlockCookie | null {
  if (!validSecret(secret)) return null;
  const [body, encodedSignature, extra] = token.split(".");
  if (!body || !encodedSignature || extra) return null;

  try {
    const actual = Buffer.from(encodedSignature, "base64url");
    const expected = signature(body, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    if (
      parsed.version !== 1 ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= now ||
      typeof parsed.classId !== "string" ||
      typeof parsed.studentId !== "string" ||
      typeof parsed.className !== "string" ||
      typeof parsed.displayName !== "string"
    ) {
      return null;
    }
    return {
      classId: parsed.classId,
      studentId: parsed.studentId,
      className: parsed.className,
      displayName: parsed.displayName,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Route cookie writes and reads through the token**

In `src/app/join/actions.ts`, remove the local `StudentUnlockCookie` declaration, import `openStudentSession`, `sealStudentSession`, and the type from the new module, then re-export the type for compatibility:

```ts
export type { StudentUnlockCookie } from "@/server/student-access/student-session";
```

On successful PIN verification, seal the existing payload before setting the cookie:

```ts
const secret = process.env.STUDENT_ACCESS_SECRET ?? "";
let token: string;
try {
  token = sealStudentSession(payload, secret);
} catch {
  return GENERIC_MISMATCH;
}

const cookieStore = await cookies();
cookieStore.set(UNLOCK_COOKIE, token, {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
});
```

Replace JSON parsing in `readStudentUnlock()` with:

```ts
const raw = cookieStore.get(UNLOCK_COOKIE)?.value;
if (!raw) return null;
return openStudentSession(raw, process.env.STUDENT_ACCESS_SECRET ?? "");
```

Keep the browser-session cookie behavior: do not add `maxAge` or `expires`.

- [ ] **Step 5: Document the required secret**

Add to `.env.example` immediately after `PIN_HASH_PEPPER`:

```dotenv
# Server-only HMAC root for student session integrity and privacy-preserving
# rate-limit keys. Generate independently with `openssl rand -hex 32`.
STUDENT_ACCESS_SECRET=replace-with-an-independent-long-random-secret
```

- [ ] **Step 6: Run focused verification**

Run:

```bash
npm test -- --run tests/server/student-session.test.ts tests/server/student-access.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .env.example src/app/join/actions.ts src/server/student-access/student-session.ts tests/server/student-session.test.ts
git commit -m "fix: authenticate student session cookie"
```

---

### Task 3: Add the atomic PIN-attempt budget

**Files:**
- Create: `supabase/migrations/202607310001_student_unlock_rate_limit.sql`
- Create: `tests/schema/student-unlock-rate-limit.test.ts`
- Modify: `src/lib/db/types.ts`
- Modify: `src/app/join/actions.ts`
- Modify: `src/server/student-access/unlock.ts`
- Modify: `tests/server/student-access.test.ts`

**Interfaces:**
- Consumes:
  - `STUDENT_ACCESS_SECRET`
  - server-resolved student ID
  - network signal supplied separately by `unlockStudentAction`
- Produces:
  - `consume_student_unlock_attempt(p_target_digest text, p_network_digest text): boolean`
  - five attempts per target/network pair per ten minutes
  - `unlockStudent(input, networkSignal): Promise<StudentUnlockResult>`

- [ ] **Step 1: Write the failing migration-structure test**

Create `tests/schema/student-unlock-rate-limit.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202607310001_student_unlock_rate_limit.sql",
  "utf8",
).toLowerCase();

describe("student unlock rate limiter migration", () => {
  it("stores only digests and atomic window counters", () => {
    expect(sql).toContain("create table public.student_unlock_attempts");
    expect(sql).toContain("primary key (target_digest, network_digest)");
    expect(sql).toContain("attempt_count integer");
    expect(sql).not.toMatch(/\bpin\b|\bdisplay_name\b|\bjoin_code\b|\bip_address\b/);
  });

  it("enables RLS and grants only service_role access", () => {
    expect(sql).toContain(
      "alter table public.student_unlock_attempts enable row level security",
    );
    expect(sql).toContain(
      "grant select, insert, update, delete on table public.student_unlock_attempts to service_role",
    );
    expect(sql).toContain("revoke all on function public.consume_student_unlock_attempt");
    expect(sql).toContain("grant execute on function public.consume_student_unlock_attempt");
  });

  it("atomically resets after ten minutes and permits only five attempts", () => {
    expect(sql).toContain("on conflict (target_digest, network_digest) do update");
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain("return v_attempt_count <= 5");
  });
});
```

- [ ] **Step 2: Run the schema test and verify RED**

Run:

```bash
npm test -- --run tests/schema/student-unlock-rate-limit.test.ts
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the limiter migration**

Create `supabase/migrations/202607310001_student_unlock_rate_limit.sql`:

```sql
create table public.student_unlock_attempts (
  target_digest text not null,
  network_digest text not null,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count > 0),
  updated_at timestamptz not null default now(),
  primary key (target_digest, network_digest)
);

alter table public.student_unlock_attempts enable row level security;

revoke all on table public.student_unlock_attempts from public, anon, authenticated;
grant select, insert, update, delete
  on table public.student_unlock_attempts to service_role;

create or replace function public.consume_student_unlock_attempt(
  p_target_digest text,
  p_network_digest text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempt_count integer;
begin
  insert into public.student_unlock_attempts (
    target_digest,
    network_digest,
    window_started_at,
    attempt_count,
    updated_at
  )
  values (p_target_digest, p_network_digest, now(), 1, now())
  on conflict (target_digest, network_digest) do update
  set
    attempt_count = case
      when public.student_unlock_attempts.window_started_at
        <= now() - interval '10 minutes' then 1
      else public.student_unlock_attempts.attempt_count + 1
    end,
    window_started_at = case
      when public.student_unlock_attempts.window_started_at
        <= now() - interval '10 minutes' then now()
      else public.student_unlock_attempts.window_started_at
    end,
    updated_at = now()
  returning attempt_count into v_attempt_count;

  return v_attempt_count <= 5;
end;
$$;

revoke all on function public.consume_student_unlock_attempt(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_student_unlock_attempt(text, text)
  to service_role;

-- ponytail: rows grow per observed student/network pair; add scheduled pruning
-- only if measured table growth becomes material.
```

- [ ] **Step 4: Add the generated-type equivalents**

In `src/lib/db/types.ts`, add a `student_unlock_attempts` table entry with the five migration columns and add:

```ts
consume_student_unlock_attempt: {
  Args: {
    p_target_digest: string;
    p_network_digest: string;
  };
  Returns: boolean;
};
```

Do not hand-edit unrelated generated types.

- [ ] **Step 5: Add the network signal at the browser boundary**

In `src/app/join/actions.ts`, import `headers` beside `cookies`, add:

```ts
async function studentNetworkSignal(): Promise<string> {
  const headerStore = await headers();
  return (
    headerStore.get("x-vercel-forwarded-for")?.trim() ||
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip") ||
    "unknown"
  );
}
```

Call the service with the signal kept separate from browser input:

```ts
const result = await unlockStudent(
  parsed.data,
  await studentNetworkSignal(),
);
```

- [ ] **Step 6: Consume attempts before lookup and clear after success**

In `src/server/student-access/unlock.ts`, change the signature to:

```ts
export async function unlockStudent(
  input: { joinCode: string; typedName: string; pin: string },
  networkSignal: string,
): Promise<StudentUnlockResult>
```

After shape/empty-input validation, require the secret and define the domain-separated digest:

```ts
const secret = process.env.STUDENT_ACCESS_SECRET ?? "";
if (Buffer.byteLength(secret) < 32) return GENERIC_MISMATCH;
const digest = (purpose: string, value: string) =>
  createHmac("sha256", secret)
    .update(`${purpose}:v1:${value}`)
    .digest("base64url");
```

After the class and student queries find an active student, derive the privacy-preserving keys and consume one attempt immediately before `verifyPin`:

```ts
const targetDigest = digest("student-unlock-target", student.data.id);
const networkDigest = digest("student-unlock-network", networkSignal || "unknown");
const permitted = await supabase.rpc("consume_student_unlock_attempt", {
  p_target_digest: targetDigest,
  p_network_digest: networkDigest,
});
if (permitted.error || permitted.data !== true) return GENERIC_MISMATCH;
```

After successful `verifyPin`, clear the exact counter before returning identity:

```ts
const cleared = await supabase
  .from("student_unlock_attempts")
  .delete()
  .eq("target_digest", targetDigest)
  .eq("network_digest", networkDigest);
if (cleared.error) return GENERIC_MISMATCH;
```

Import `createHmac` from `node:crypto`. Do not log inputs, digests, or PINs.

- [ ] **Step 7: Update and extend the student-access tests**

Pass a stable network signal such as `"test-network"` to every existing direct `unlockStudent` call. In the env-aware test, use a unique signal derived from the test timestamp, clear any limiter row in `finally`, and add assertions that:

```ts
for (let attempt = 0; attempt < 5; attempt += 1) {
  expect(
    await unlockStudent(
      { joinCode, typedName: realName, pin: "0000" },
      rateLimitNetwork,
    ),
  ).toEqual({ ok: false, error: "generic_mismatch" });
}

expect(
  await unlockStudent(
    { joinCode, typedName: realName, pin: realPin },
    rateLimitNetwork,
  ),
).toEqual({ ok: false, error: "generic_mismatch" });
```

Delete the test row through the service client, then assert the correct PIN succeeds and that the successful flow removed its counter. Keep all public failure assertions identical.

- [ ] **Step 8: Run focused verification**

Run:

```bash
npm test -- --run tests/schema/student-unlock-rate-limit.test.ts tests/server/student-session.test.ts tests/server/student-access.test.ts
npm run typecheck
```

Expected: PASS. The env-aware database assertions may skip only when Supabase variables are absent; the schema and session tests must run.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/202607310001_student_unlock_rate_limit.sql tests/schema/student-unlock-rate-limit.test.ts src/lib/db/types.ts src/app/join/actions.ts src/server/student-access/unlock.ts tests/server/student-access.test.ts
git commit -m "fix: throttle student PIN verification"
```

---

### Task 4: Full regression and security verification

**Files:**
- Modify only files needed to fix failures caused by Tasks 1-3
- Update: `TASK.md` with observed commands and results

**Interfaces:**
- Consumes: completed Tasks 1-3
- Produces: evidence that the three findings are closed without weakening student ownership or existing flows

- [ ] **Step 1: Run all deterministic checks**

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

Expected: all commands PASS. Record exact results; never convert an unrun or skipped integration test into a pass claim.

- [ ] **Step 2: Run the env-aware integration checks when local Supabase is available**

```bash
npx supabase status
npm test -- --run tests/server/student-access.test.ts
npx playwright test tests/e2e/student-join.spec.ts
```

Expected: the limiter and login assertions execute rather than skip. If Supabase is unavailable, record the missing evidence as a blocker instead of applying a remote migration.

- [ ] **Step 3: Recheck the findings statically**

```bash
rg -n "createFoundationSmokeRecord|/api/foundation" src tests package.json README.md
rg -n "JSON\\.parse\\(raw\\)|JSON\\.stringify\\(payload\\)" src/app/join/actions.ts
rg -n "consume_student_unlock_attempt|STUDENT_ACCESS_SECRET|openStudentSession" src supabase tests .env.example
```

Expected: the first two searches return no matches; the third traces the new controls through migration, service, action, tests, and environment documentation.

- [ ] **Step 4: Review the final diff**

```bash
git --no-optional-locks diff --check
git --no-optional-locks status --short --branch
git --no-optional-locks diff 2b6c596e...HEAD --stat
```

Expected: no whitespace errors; only task-owned changes are included in task commits; unrelated user changes remain preserved.

- [ ] **Step 5: Commit any verification-only correction**

Skip this commit when Step 1 required no code changes. Otherwise stage only the explicitly identified task-owned correction files and their tests, then run:

```bash
git commit -m "test: verify student access security controls"
```

Do not push, deploy, apply the migration, or rerun a paid security scan without explicit approval for that exact external action.
