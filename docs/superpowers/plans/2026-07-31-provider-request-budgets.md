# Provider Request Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound authenticated student and teacher provider work, audio growth, and evaluator warm-up requests with an atomic, privacy-preserving fixed-window budget.

**Architecture:** Add one service-role-only Postgres counter and a server-only HMAC admission module. Place admission after authentication, input validation, and ownership resolution but before provider, cache, blob, storage, or state mutation; expose the existing typed HTTP/action boundaries with rate-limit-specific results.

**Tech Stack:** PostgreSQL/Supabase migrations and RPCs, Next.js App Router, TypeScript, Node `crypto`, React 19, Vitest, local Supabase integration tests.

## Global Constraints

- Preserve the existing HMAC-signed, eight-hour student cookie. Do not add individual revocation or student Supabase Auth.
- Preserve every student and teacher ownership check, RLS policy, mission snapshot, and signed-audio boundary.
- Add no dependency, external limiter, WAF rule, or dashboard configuration.
- Do not store or log raw student IDs, teacher IDs, network addresses, transcripts, or provider input in limiter state.
- Do not apply migrations, deploy, push, or mutate a remote environment.
- Keep evaluator warm-up; it protects first-recording latency.
- Use literal budgets: `student_audio` 24/600 seconds, `student_helper` 60/600 seconds, `teacher_provider` 10/600 seconds, and `evaluator_warmup` 1/90 seconds.
- Tests use fake provider functions only; no paid OpenAI or Azure request is authorized by this plan.
- Implementation is consequential. Do not begin Task 1 until the user explicitly approves this plan.

## File Structure

- Create `supabase/migrations/202607310002_provider_request_budgets.sql`: digest-only counter table, operation allow-list, RLS/grants, and atomic fixed-window RPC.
- Create `tests/schema/provider-request-budgets-schema.test.ts`: static schema/security contract.
- Create `tests/server/provider-request-budgets.integration.test.ts`: local-only concurrency, reset, and role-denial proof.
- Create `src/server/security/request-budget.ts`: operation enum, literal quotas, HMAC actor digest, RPC call, and fail-closed decision.
- Create `tests/server/request-budget.test.ts`: purpose separation, exact RPC arguments, and failure behavior.
- Modify `src/lib/db/types.ts`: generated-shape equivalents for the new table and RPC.
- Modify `src/server/student-access/audio-upload.ts` and `tests/server/audio-upload.test.ts`: audio admission after owned assignment/attempt validation and before blob, row, storage, or provider work.
- Modify `src/app/student/missions/[assignmentStudentId]/audio/route.ts` and `src/components/student/MissionFlowShell.tsx`: public `429`/`Retry-After` and distinct wait copy.
- Create `tests/server/student-audio-budget-route.test.ts`: audio route response mapping with a denied service fake.
- Modify `src/app/student/missions/[assignmentStudentId]/tts/route.ts`, `src/app/student/missions/[assignmentStudentId]/translation-hint/route.ts`, `src/components/student/CocoSpeechAudio.tsx`, `src/components/student/CocoDialogueBox.tsx`, and their tests: shared student-helper admission after owned source resolution and before cache/provider work.
- Create `tests/server/student-helper-budget-routes.test.ts`: route ordering and public response proof with fakes.
- Modify `src/app/teacher/missions/actions.ts`: teacher authoring/assignment admission before provider or mission/assignment mutation, reusing existing ownership readers.
- Create `tests/server/teacher-provider-budget-actions.test.ts`: typed rate-limit behavior for premise, opener, create, update, and assignment actions.
- Modify `src/app/teacher/evidence/[attemptId]/actions.ts`, `src/components/teacher/PronunciationDiagnosticPanel.tsx`, and add `src/components/teacher/PronunciationDiagnosticPanel.test.tsx`: pronunciation reprocessing admission after clip ownership.
- Create `tests/server/pronunciation-reprocess-action.test.ts`: action ordering and typed denial proof.
- Modify `src/server/ai/evaluator-warmup.ts`, `src/app/student/missions/[assignmentStudentId]/page.tsx`, and create `tests/server/evaluator-warmup.test.ts`: one global warm-up admission per 90 seconds.

---

### Task 1: Add the atomic database budget

**Files:**
- Create: `supabase/migrations/202607310002_provider_request_budgets.sql`
- Create: `tests/schema/provider-request-budgets-schema.test.ts`
- Create: `tests/server/provider-request-budgets.integration.test.ts`
- Modify: `src/lib/db/types.ts`

**Interfaces:**
- Consumes: service-role Supabase access already provided by `createSupabaseServiceClient`.
- Produces: `consume_request_budget(p_actor_digest text, p_operation text, p_request_limit integer, p_window_seconds integer)` returning one `{ permitted: boolean; retry_after_seconds: number }` row.

- [ ] **Step 1: Write the failing static schema test**

Create `tests/schema/provider-request-budgets-schema.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202607310002_provider_request_budgets.sql",
  "utf8",
).toLowerCase();

describe("provider request budgets migration", () => {
  it("stores only actor digests, operations, and fixed-window counters", () => {
    expect(sql).toContain("create table public.request_budgets");
    expect(sql).toContain("primary key (actor_digest, operation)");
    expect(sql).toContain("request_count integer");
    expect(sql).toContain(
      "operation in ('student_audio', 'student_helper', 'teacher_provider', 'evaluator_warmup')",
    );
    expect(sql).not.toMatch(
      /\bstudent_id\b|\bteacher_id\b|\bip_address\b|\btranscript\b|\bprovider_input\b/,
    );
  });

  it("enables RLS and exposes the table and RPC only to service_role", () => {
    expect(sql).toContain(
      "alter table public.request_budgets enable row level security",
    );
    expect(sql).toContain(
      "revoke all on table public.request_budgets from public, anon, authenticated",
    );
    expect(sql).toContain(
      "grant select, insert, update, delete on table public.request_budgets to service_role",
    );
    expect(sql).toContain("security invoker");
    expect(sql).toContain(
      "revoke all on function public.consume_request_budget(text, text, integer, integer)",
    );
    expect(sql).toContain(
      "grant execute on function public.consume_request_budget(text, text, integer, integer) to service_role",
    );
  });

  it("uses one atomic upsert and returns the remaining fixed-window delay", () => {
    expect(sql).toContain(
      "on conflict (actor_digest, operation) do update",
    );
    expect(sql).toContain("make_interval(secs => p_window_seconds)");
    expect(sql).toContain("return query");
    expect(sql).toContain("retry_after_seconds");
  });
});
```

- [ ] **Step 2: Run the static test and verify red**

Run:

```bash
npm test -- --run tests/schema/provider-request-budgets-schema.test.ts
```

Expected: FAIL because `202607310002_provider_request_budgets.sql` does not exist.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/202607310002_provider_request_budgets.sql`:

```sql
create table public.request_budgets (
  actor_digest text not null,
  operation text not null check (
    operation in (
      'student_audio',
      'student_helper',
      'teacher_provider',
      'evaluator_warmup'
    )
  ),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (actor_digest, operation)
);

alter table public.request_budgets enable row level security;

revoke all on table public.request_budgets from public, anon, authenticated;
grant select, insert, update, delete on table public.request_budgets
  to service_role;

create or replace function public.consume_request_budget(
  p_actor_digest text,
  p_operation text,
  p_request_limit integer,
  p_window_seconds integer
)
returns table (
  permitted boolean,
  retry_after_seconds integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if
    p_actor_digest = ''
    or p_operation not in (
      'student_audio',
      'student_helper',
      'teacher_provider',
      'evaluator_warmup'
    )
    or p_request_limit <= 0
    or p_window_seconds <= 0
  then
    raise exception 'invalid request budget input';
  end if;

  insert into public.request_budgets (
    actor_digest,
    operation,
    window_started_at,
    request_count,
    updated_at
  )
  values (p_actor_digest, p_operation, v_now, 1, v_now)
  on conflict (actor_digest, operation) do update
  set
    request_count = case
      when public.request_budgets.window_started_at
        <= v_now - make_interval(secs => p_window_seconds) then 1
      else public.request_budgets.request_count + 1
    end,
    window_started_at = case
      when public.request_budgets.window_started_at
        <= v_now - make_interval(secs => p_window_seconds) then v_now
      else public.request_budgets.window_started_at
    end,
    updated_at = v_now
  returning
    request_budgets.window_started_at,
    request_budgets.request_count
  into v_window_started_at, v_request_count;

  return query
  select
    v_request_count <= p_request_limit,
    case
      when v_request_count <= p_request_limit then 0
      else greatest(
        1,
        ceil(
          extract(
            epoch from (
              v_window_started_at
              + make_interval(secs => p_window_seconds)
              - v_now
            )
          )
        )::integer
      )
    end;
end;
$$;

revoke all on function public.consume_request_budget(
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.consume_request_budget(
  text,
  text,
  integer,
  integer
) to service_role;

-- ponytail: one row remains per actor/operation digest; add age-based pruning
-- only if measured table growth becomes material.
```

- [ ] **Step 4: Add the TypeScript database shapes**

In `src/lib/db/types.ts`, add:

```ts
request_budgets: {
  Row: {
    actor_digest: string;
    operation:
      | "student_audio"
      | "student_helper"
      | "teacher_provider"
      | "evaluator_warmup";
    window_started_at: string;
    request_count: number;
    updated_at: string;
  };
  Insert: {
    actor_digest: string;
    operation:
      | "student_audio"
      | "student_helper"
      | "teacher_provider"
      | "evaluator_warmup";
    window_started_at?: string;
    request_count?: number;
    updated_at?: string;
  };
  Update: Partial<
    Database["public"]["Tables"]["request_budgets"]["Insert"]
  >;
  Relationships: [];
};
```

Add this RPC shape under `Functions`:

```ts
consume_request_budget: {
  Args: {
    p_actor_digest: string;
    p_operation: string;
    p_request_limit: number;
    p_window_seconds: number;
  };
  Returns: {
    permitted: boolean;
    retry_after_seconds: number;
  }[];
};
```

- [ ] **Step 5: Write the local-Supabase integration test**

Create `tests/server/provider-request-budgets.integration.test.ts` by reusing the local-only client setup and cleanup pattern from `tests/server/student-unlock-rate-limit.integration.test.ts`. Cover these exact cases:

```ts
it("atomically permits exactly 24 of 25 concurrent audio requests", async (context) => {
  if (!canRunLocally) return context.skip();
  const actorDigest = `test-audio-${randomBytes(16).toString("hex")}`;
  const results = await Promise.all(
    Array.from({ length: 25 }, () =>
      admin.rpc("consume_request_budget", {
        p_actor_digest: actorDigest,
        p_operation: "student_audio",
        p_request_limit: 24,
        p_window_seconds: 600,
      }),
    ),
  );
  expect(results.every(({ error }) => error === null)).toBe(true);
  expect(results.filter(({ data }) => data?.[0]?.permitted === true)).toHaveLength(24);
  expect(results.filter(({ data }) => data?.[0]?.permitted === false)).toHaveLength(1);
});

it("resets an expired window and admits one global warm-up", async (context) => {
  if (!canRunLocally) return context.skip();
  const actorDigest = `test-warmup-${randomBytes(16).toString("hex")}`;
  const args = {
    p_actor_digest: actorDigest,
    p_operation: "evaluator_warmup",
    p_request_limit: 1,
    p_window_seconds: 90,
  };
  expect((await admin.rpc("consume_request_budget", args)).data?.[0]?.permitted).toBe(true);
  expect((await admin.rpc("consume_request_budget", args)).data?.[0]?.permitted).toBe(false);
  await admin
    .from("request_budgets")
    .update({ window_started_at: new Date(Date.now() - 91_000).toISOString() })
    .eq("actor_digest", actorDigest)
    .eq("operation", "evaluator_warmup");
  expect((await admin.rpc("consume_request_budget", args)).data?.[0]?.permitted).toBe(true);
});
```

Also duplicate the anon/authenticated setup from the unlock limiter integration test and assert both `.from("request_budgets").select("*")` and `.rpc("consume_request_budget", args)` return errors. Delete only the test digests in `finally`.

- [ ] **Step 6: Run Task 1 checks**

Run:

```bash
npm test -- --run tests/schema/provider-request-budgets-schema.test.ts tests/server/provider-request-budgets.integration.test.ts
npm run typecheck
```

Expected: schema tests PASS; integration tests PASS against local Supabase or skip only when local Supabase variables are absent; typecheck PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add supabase/migrations/202607310002_provider_request_budgets.sql tests/schema/provider-request-budgets-schema.test.ts tests/server/provider-request-budgets.integration.test.ts src/lib/db/types.ts
git commit -m "feat: add atomic provider request budgets"
```

---

### Task 2: Add the server-only admission module

**Files:**
- Create: `src/server/security/request-budget.ts`
- Create: `tests/server/request-budget.test.ts`

**Interfaces:**
- Consumes: `STUDENT_ACCESS_SECRET`, `createSupabaseServiceClient`, and Task 1's RPC.
- Produces: `consumeRequestBudget({ actorId, operation }, deps?) -> Promise<RequestBudgetDecision>`.

- [ ] **Step 1: Write the failing module tests**

Create `tests/server/request-budget.test.ts`:

```ts
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("consumeRequestBudget", () => {
  it("uses the request-budget purpose and exact literal audio quota", async () => {
    vi.stubEnv("STUDENT_ACCESS_SECRET", "a".repeat(32));
    const rpc = vi.fn(async () => ({
      data: [{ permitted: true, retry_after_seconds: 0 }],
      error: null,
    }));
    const { consumeRequestBudget } = await import(
      "@/server/security/request-budget"
    );
    await expect(
      consumeRequestBudget(
        { actorId: "student-1", operation: "student_audio" },
        { rpc },
      ),
    ).resolves.toEqual({ allowed: true });
    expect(rpc).toHaveBeenCalledWith("consume_request_budget", {
      p_actor_digest: createHmac("sha256", "a".repeat(32))
        .update("request-budget:v1:student-1")
        .digest("base64url"),
      p_operation: "student_audio",
      p_request_limit: 24,
      p_window_seconds: 600,
    });
  });

  it("returns the database retry delay for a denied request", async () => {
    vi.stubEnv("STUDENT_ACCESS_SECRET", "b".repeat(32));
    const { consumeRequestBudget } = await import(
      "@/server/security/request-budget"
    );
    await expect(
      consumeRequestBudget(
        { actorId: "teacher-1", operation: "teacher_provider" },
        {
          rpc: vi.fn(async () => ({
            data: [{ permitted: false, retry_after_seconds: 321 }],
            error: null,
          })),
        },
      ),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 321 });
  });

  it.each(["", "short", "replace-with-a-random-secret-at-least-32-bytes"])(
    "fails closed without an RPC for invalid secret %j",
    async (secret) => {
      vi.stubEnv("STUDENT_ACCESS_SECRET", secret);
      const rpc = vi.fn();
      const { consumeRequestBudget } = await import(
        "@/server/security/request-budget"
      );
      await expect(
        consumeRequestBudget(
          { actorId: "student-1", operation: "student_helper" },
          { rpc },
        ),
      ).resolves.toEqual({ allowed: false, retryAfterSeconds: 600 });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("fails closed on RPC errors and malformed rows", async () => {
    vi.stubEnv("STUDENT_ACCESS_SECRET", "c".repeat(32));
    const { consumeRequestBudget } = await import(
      "@/server/security/request-budget"
    );
    for (const result of [
      { data: null, error: new Error("db down") },
      { data: [], error: null },
      { data: [{ permitted: "yes", retry_after_seconds: -1 }], error: null },
    ]) {
      await expect(
        consumeRequestBudget(
          { actorId: "student-1", operation: "student_helper" },
          { rpc: vi.fn(async () => result) },
        ),
      ).resolves.toEqual({ allowed: false, retryAfterSeconds: 600 });
    }
  });
});
```

- [ ] **Step 2: Run the tests and verify red**

Run:

```bash
npm test -- --run tests/server/request-budget.test.ts
```

Expected: FAIL because `request-budget.ts` does not exist.

- [ ] **Step 3: Implement the minimum admission module**

Create `src/server/security/request-budget.ts`:

```ts
import { createHmac } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const BUDGETS = {
  student_audio: { requestLimit: 24, windowSeconds: 600 },
  student_helper: { requestLimit: 60, windowSeconds: 600 },
  teacher_provider: { requestLimit: 10, windowSeconds: 600 },
  evaluator_warmup: { requestLimit: 1, windowSeconds: 90 },
} as const;

export type RequestBudgetOperation = keyof typeof BUDGETS;
export type RequestBudgetDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type BudgetRpcResult = {
  data:
    | Array<{ permitted: boolean; retry_after_seconds: number }>
    | null;
  error: unknown;
};

type BudgetRpc = (
  name: "consume_request_budget",
  args: {
    p_actor_digest: string;
    p_operation: RequestBudgetOperation;
    p_request_limit: number;
    p_window_seconds: number;
  },
) => Promise<BudgetRpcResult>;

function validSecret(secret: string): boolean {
  return Buffer.byteLength(secret) >= 32 && !secret.startsWith("replace-with-");
}

export async function consumeRequestBudget(
  input: { actorId: string; operation: RequestBudgetOperation },
  deps: { rpc?: BudgetRpc } = {},
): Promise<RequestBudgetDecision> {
  const budget = BUDGETS[input.operation];
  const secret = process.env.STUDENT_ACCESS_SECRET ?? "";
  if (!validSecret(secret) || input.actorId.length === 0) {
    return { allowed: false, retryAfterSeconds: budget.windowSeconds };
  }

  const actorDigest = createHmac("sha256", secret)
    .update(`request-budget:v1:${input.actorId}`)
    .digest("base64url");

  try {
    const rpc: BudgetRpc =
      deps.rpc ??
      ((name, args) => createSupabaseServiceClient().rpc(name, args));
    const { data, error } = await rpc("consume_request_budget", {
      p_actor_digest: actorDigest,
      p_operation: input.operation,
      p_request_limit: budget.requestLimit,
      p_window_seconds: budget.windowSeconds,
    });
    const row = data?.[0];
    if (
      error ||
      !row ||
      typeof row.permitted !== "boolean" ||
      !Number.isInteger(row.retry_after_seconds) ||
      row.retry_after_seconds < 0
    ) {
      return { allowed: false, retryAfterSeconds: budget.windowSeconds };
    }
    return row.permitted
      ? { allowed: true }
      : {
          allowed: false,
          retryAfterSeconds: Math.max(1, row.retry_after_seconds),
        };
  } catch {
    return { allowed: false, retryAfterSeconds: budget.windowSeconds };
  }
}
```

Keep service-client construction inside the `try`, so missing Supabase
configuration also fails closed.

- [ ] **Step 4: Run Task 2 checks**

Run:

```bash
npm test -- --run tests/server/request-budget.test.ts
npm run typecheck
```

Expected: all request-budget unit tests PASS and typecheck PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/server/security/request-budget.ts tests/server/request-budget.test.ts
git commit -m "feat: add provider budget admission"
```

---

### Task 3: Gate student audio before growth or provider work

**Files:**
- Modify: `src/server/student-access/audio-upload.ts`
- Modify: `tests/server/audio-upload.test.ts`
- Modify: `src/app/student/missions/[assignmentStudentId]/audio/route.ts`
- Create: `tests/server/student-audio-budget-route.test.ts`
- Modify: `src/components/student/MissionFlowShell.tsx`
- Modify: `src/server/student-access/audio-upload.test.ts`

**Interfaces:**
- Consumes: `consumeRequestBudget({ actorId: studentId, operation: "student_audio" })`.
- Produces: upload failure `{ ok: false; error: "rate_limited"; retryable: true; retryAfterSeconds: number }`.

- [ ] **Step 1: Add a failing service-ordering test**

In `tests/server/audio-upload.test.ts`, add:

```ts
it("denies after ownership checks and before blob, row, storage, or provider work", async () => {
  const consumeRequestBudget = vi.fn(async () => ({
    allowed: false as const,
    retryAfterSeconds: 287,
  }));
  const transcribeAudioFile = vi.fn();
  const file = new Blob(["voice"], { type: "audio/webm" });
  const arrayBuffer = vi.spyOn(file, "arrayBuffer");
  const { uploadAttemptAudioClip } = await import(
    "@/server/student-access/audio-upload"
  );

  const result = await uploadAttemptAudioClip(
    audioInput({ file, body: "voice" }),
    { consumeRequestBudget, transcribeAudioFile },
  );

  expect(result).toEqual({
    ok: false,
    error: "rate_limited",
    retryable: true,
    retryAfterSeconds: 287,
  });
  expect(consumeRequestBudget).toHaveBeenCalledWith({
    actorId: "student-1",
    operation: "student_audio",
  });
  expect(mockSupabase.operations.some(({ action }) => action === "select")).toBe(true);
  expect(mockSupabase.operations.some(({ action }) => action === "insert")).toBe(false);
  expect(mockSupabase.storage.from).not.toHaveBeenCalled();
  expect(arrayBuffer).not.toHaveBeenCalled();
  expect(transcribeAudioFile).not.toHaveBeenCalled();
});
```

Add a sibling test with `consumeRequestBudget` returning `{ allowed: true }` and assert the existing successful upload path still inserts, uploads, and transcribes.

- [ ] **Step 2: Run the focused service tests and verify red**

Run:

```bash
npm test -- --run tests/server/audio-upload.test.ts
```

Expected: FAIL because the dependency and result variant do not exist.

- [ ] **Step 3: Add audio admission at the owned service boundary**

In `src/server/student-access/audio-upload.ts`:

```ts
import { consumeRequestBudget } from "@/server/security/request-budget";
```

Extend the failure union:

```ts
| {
    ok: false;
    error:
      | "not_found"
      | "invalid_audio"
      | "upload_failed_retryable"
      | "transcription_failed_retryable"
      | "db_error"
      | "rate_limited";
    retryable: boolean;
    retryAfterSeconds?: number;
  };
```

Extend dependencies:

```ts
consumeRequestBudget?: typeof consumeRequestBudget;
```

After assignment, attempt, status, cancellation, snapshot, and requested-turn checks succeed—and before conversation-history reads, `file.arrayBuffer()`, `audio_clips.insert`, Storage, or any provider—add:

```ts
const budget = await (deps.consumeRequestBudget ?? consumeRequestBudget)({
  actorId: input.studentId,
  operation: "student_audio",
});
if (!budget.allowed) {
  return {
    ok: false,
    error: "rate_limited",
    retryable: true,
    retryAfterSeconds: budget.retryAfterSeconds,
  };
}
```

- [ ] **Step 4: Return the public rate-limit response**

In `src/app/student/missions/[assignmentStudentId]/audio/route.ts`, before the generic `502` branch:

```ts
if (result.error === "rate_limited") {
  return NextResponse.json(
    { ok: false, error: "rate_limited" },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds ?? 600),
      },
    },
  );
}
```

- [ ] **Step 5: Present distinct student copy**

In `src/components/student/MissionFlowShell.tsx`, before the transcription failure branch:

```ts
if (payload?.error === "rate_limited") {
  throw new Error(
    "You’ve practiced a lot in a short time. Wait a few minutes, then try again.",
  );
}
```

Create `tests/server/student-audio-budget-route.test.ts`, mock
`readStudentUnlock` and `uploadAttemptAudioClip`, dynamically import `POST`, and
use a valid multipart request:

```ts
it("maps audio budget denial to 429 without exposing budget details", async () => {
  mockUpload.mockResolvedValue({
    ok: false,
    error: "rate_limited",
    retryable: true,
    retryAfterSeconds: 287,
  });
  const formData = new FormData();
  formData.set("file", new Blob(["voice"], { type: "audio/webm" }));
  formData.set("attemptId", "11111111-1111-4111-8111-111111111111");
  formData.set("turnOrder", "1");
  formData.set("clipKind", "original_answer");
  formData.set("durationMs", "1200");
  formData.set("mimeType", "audio/webm");
  const { POST } = await import(
    "@/app/student/missions/[assignmentStudentId]/audio/route"
  );
  const response = await POST(
    new Request("http://localhost/audio", { method: "POST", body: formData }),
    {
      params: Promise.resolve({
        assignmentStudentId: "22222222-2222-4222-8222-222222222222",
      }),
    },
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("287");
  await expect(response.json()).resolves.toEqual({
    ok: false,
    error: "rate_limited",
  });
});
```

In `src/server/student-access/audio-upload.test.ts`, add only the UI source
contract:

```ts
expect(missionFlowSource).toContain('payload?.error === "rate_limited"');
expect(missionFlowSource).toContain(
  "You’ve practiced a lot in a short time. Wait a few minutes, then try again.",
);
```

- [ ] **Step 6: Run Task 3 checks**

Run:

```bash
npm test -- --run tests/server/audio-upload.test.ts tests/server/student-audio-budget-route.test.ts src/server/student-access/audio-upload.test.ts
npm run typecheck
```

Expected: both files PASS and typecheck PASS; no provider client is invoked.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/server/student-access/audio-upload.ts tests/server/audio-upload.test.ts src/app/student/missions/[assignmentStudentId]/audio/route.ts tests/server/student-audio-budget-route.test.ts src/components/student/MissionFlowShell.tsx src/server/student-access/audio-upload.test.ts
git commit -m "feat: budget student audio uploads"
```

---

### Task 4: Gate student TTS and translation before cache work

**Files:**
- Modify: `src/app/student/missions/[assignmentStudentId]/tts/route.ts`
- Modify: `src/app/student/missions/[assignmentStudentId]/translation-hint/route.ts`
- Create: `tests/server/student-helper-budget-routes.test.ts`
- Modify: `src/components/student/CocoSpeechAudio.tsx`
- Modify: `src/components/student/CocoSpeechAudio.test.tsx`
- Modify: `src/components/student/CocoDialogueBox.tsx`
- Modify: `src/components/student/CocoDialogueBox.test.tsx`

**Interfaces:**
- Consumes: `student_helper` with the authenticated student ID after the requested line/source is owned and resolved.
- Produces: both routes return `429`, `{ ok: false, error: "rate_limited" }`, and `Retry-After`.

- [ ] **Step 1: Write failing route-order tests**

Create `tests/server/student-helper-budget-routes.test.ts`. Mock `readStudentUnlock`, the existing ownership resolvers, `consumeRequestBudget`, and cache functions before dynamically importing each route. Add these exact assertions:

```ts
it("TTS resolves an owned line, then denies before cache lookup", async () => {
  mockConsume.mockResolvedValue({
    allowed: false,
    retryAfterSeconds: 412,
  });
  const { POST } = await import(
    "@/app/student/missions/[assignmentStudentId]/tts/route"
  );
  const response = await POST(validTtsRequest, routeContext);
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("412");
  await expect(response.json()).resolves.toEqual({
    ok: false,
    error: "rate_limited",
  });
  expect(mockConsume).toHaveBeenCalledWith({
    actorId: "student-1",
    operation: "student_helper",
  });
  expect(mockGetOrCreateTtsAudio).not.toHaveBeenCalled();
});

it("translation resolves its owned source, then denies before cache lookup", async () => {
  mockConsume.mockResolvedValue({
    allowed: false,
    retryAfterSeconds: 233,
  });
  const { POST } = await import(
    "@/app/student/missions/[assignmentStudentId]/translation-hint/route"
  );
  const response = await POST(validTranslationRequest, routeContext);
  expect(mockResolveOwnedTranslationSource).toHaveBeenCalled();
  expect(mockConsume).toHaveBeenCalledWith({
    actorId: "student-1",
    operation: "student_helper",
  });
  expect(mockGetOrCreateTranslationHint).not.toHaveBeenCalled();
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("233");
});
```

Add invalid-input and foreign-resource siblings that assert `mockConsume` is not called. Add admitted siblings that assert each existing cache function is called once.

- [ ] **Step 2: Run route tests and verify red**

Run:

```bash
npm test -- --run tests/server/student-helper-budget-routes.test.ts
```

Expected: FAIL because neither route consumes a budget.

- [ ] **Step 3: Add TTS admission**

In `tts/route.ts`, import `consumeRequestBudget`. After `text` resolves and passes the non-empty check, but before `getOrCreateTtsAudio`, add:

```ts
const budget = await consumeRequestBudget({
  actorId: unlock.studentId,
  operation: "student_helper",
});
if (!budget.allowed) {
  return NextResponse.json(
    { ok: false, error: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(budget.retryAfterSeconds) },
    },
  );
}
```

- [ ] **Step 4: Add translation admission**

In `translation-hint/route.ts`, add the same block after `source.ok` is proven and before `getOrCreateTranslationHint`.

- [ ] **Step 5: Add distinct TTS wait state**

In `CocoSpeechAudio.tsx`, change:

```ts
type PlaybackState =
  | "loading"
  | "ready"
  | "playing"
  | "error"
  | "rate_limited";
```

When a response is non-OK:

```ts
if (response.status === 429 && payload?.error === "rate_limited") {
  setState("rate_limited");
  return;
}
```

Render this status beside the existing error branch:

```tsx
{state === "rate_limited" ? (
  <span role="status">Please wait a few minutes, then try Coco’s voice again.</span>
) : null}
```

In `CocoSpeechAudio.test.tsx`, return a `429` rate-limited response and assert that exact status text appears instead of `Voice unavailable`.

- [ ] **Step 6: Add distinct translation wait state**

Change `TranslationUiState` in `CocoDialogueBox.tsx` to include:

```ts
| { kind: "rate_limited" }
```

Map the `429` response before generic error parsing:

```ts
if (response.status === 429) {
  setTranslationState({ kind: "rate_limited" });
  setTranslationVisible(false);
  return;
}
```

Use this label:

```ts
const hintVisibleLabel =
  translationState.kind === "rate_limited"
    ? "Wait, then retry hint"
    : translationState.kind === "error"
      ? "Retry hint"
      : "Hint";
```

Render:

```tsx
{translationState.kind === "rate_limited" ? (
  <span role="status">Please wait a few minutes, then retry the hint.</span>
) : null}
```

In `CocoDialogueBox.test.tsx`, add a `429` response test asserting the wait copy and that the next button click makes a fresh request.

- [ ] **Step 7: Run Task 4 checks**

Run:

```bash
npm test -- --run tests/server/student-helper-budget-routes.test.ts src/components/student/CocoSpeechAudio.test.tsx src/components/student/CocoDialogueBox.test.tsx
npm run typecheck
```

Expected: all focused tests PASS and typecheck PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/app/student/missions/[assignmentStudentId]/tts/route.ts src/app/student/missions/[assignmentStudentId]/translation-hint/route.ts tests/server/student-helper-budget-routes.test.ts src/components/student/CocoSpeechAudio.tsx src/components/student/CocoSpeechAudio.test.tsx src/components/student/CocoDialogueBox.tsx src/components/student/CocoDialogueBox.test.tsx
git commit -m "feat: budget student helper requests"
```

---

### Task 5: Gate teacher mission authoring and assignment work

**Files:**
- Modify: `src/app/teacher/missions/actions.ts`
- Create: `tests/server/teacher-provider-budget-actions.test.ts`

**Interfaces:**
- Consumes: `teacher_provider` with `profile.id`; existing `getMissionForTeacher` and `listAssignableClassesForTeacher` prove ownership before update/assignment admission.
- Produces: existing action result unions with generic rate-limit copy; no new client state is needed because `MissionForm` and `AssignDialog` already render action errors.

- [ ] **Step 1: Write failing teacher-action tests**

Create `tests/server/teacher-provider-budget-actions.test.ts`. Mock authentication, admission, provider generators, mission services, and Next cache. Use:

```ts
const RATE_LIMIT_COPY =
  "You’ve made several AI requests. Wait a few minutes and try again.";
```

Cover these exact cases:

```ts
it.each([
  ["premise", () => generatePremiseAction(validPremiseInput), mockPremise],
  ["opener", () => generateOpenerAction(validOpenerInput), mockOpener],
])("denies %s generation before provider work", async (_name, invoke, provider) => {
  mockConsume.mockResolvedValue({
    allowed: false,
    retryAfterSeconds: 300,
  });
  await expect(invoke()).resolves.toEqual({
    ok: false,
    error: RATE_LIMIT_COPY,
  });
  expect(provider).not.toHaveBeenCalled();
});

it("denies mission create before classification or database mutation", async () => {
  mockConsume.mockResolvedValue({
    allowed: false,
    retryAfterSeconds: 300,
  });
  await expect(createMissionAction(validMissionFormData())).resolves.toEqual({
    ok: false,
    error: RATE_LIMIT_COPY,
  });
  expect(mockCreateMission).not.toHaveBeenCalled();
});

it("checks mission ownership before consuming update budget", async () => {
  mockGetMissionForTeacher.mockResolvedValue(null);
  await updateMissionAction(validMissionFormData("foreign-mission-id"));
  expect(mockConsume).not.toHaveBeenCalled();
  expect(mockUpdateMission).not.toHaveBeenCalled();
});

it("checks mission and class ownership before consuming assignment budget", async () => {
  mockGetMissionForTeacher.mockResolvedValue(ownedMission);
  mockListAssignableClassesForTeacher.mockResolvedValue([]);
  await assignMissionAction(validAssignmentFormData());
  expect(mockConsume).not.toHaveBeenCalled();
  expect(mockAssignMissionToClass).not.toHaveBeenCalled();
});

it("denies an owned assignment before RPC mutation or TTS warm-up", async () => {
  mockGetMissionForTeacher.mockResolvedValue(ownedMission);
  mockListAssignableClassesForTeacher.mockResolvedValue([ownedClass]);
  mockConsume.mockResolvedValue({
    allowed: false,
    retryAfterSeconds: 300,
  });
  await expect(assignMissionAction(validAssignmentFormData())).resolves.toEqual({
    ok: false,
    error: RATE_LIMIT_COPY,
  });
  expect(mockAssignMissionToClass).not.toHaveBeenCalled();
});
```

Add admitted siblings for each action and assert the existing provider/service is called once.

- [ ] **Step 2: Run the teacher-action tests and verify red**

Run:

```bash
npm test -- --run tests/server/teacher-provider-budget-actions.test.ts
```

Expected: FAIL because teacher actions do not consume budgets.

- [ ] **Step 3: Add the shared teacher action admission**

In `src/app/teacher/missions/actions.ts`, import:

```ts
import { consumeRequestBudget } from "@/server/security/request-budget";
import { getMissionForTeacher } from "@/server/mission/mission-service";
import { listAssignableClassesForTeacher } from "@/server/mission/assign-service";
```

Add:

```ts
const PROVIDER_RATE_LIMIT_FAILURE =
  "You’ve made several AI requests. Wait a few minutes and try again.";

async function teacherProviderAllowed(teacherId: string): Promise<boolean> {
  return (
    await consumeRequestBudget({
      actorId: teacherId,
      operation: "teacher_provider",
    })
  ).allowed;
}
```

Use `profile.id` rather than discarding the profile in premise/opener actions. After each action's schema validation, return `{ ok: false, error: PROVIDER_RATE_LIMIT_FAILURE }` when admission is denied.

- [ ] **Step 4: Preserve ownership-before-budget ordering**

For `updateMissionAction`, after schemas pass and before admission:

```ts
const ownedMission = await getMissionForTeacher({
  teacherId: profile.id,
  missionId: missionId.data.missionId,
});
if (!ownedMission) {
  return { ok: false, error: GENERIC_FAILURE };
}
```

For `assignMissionAction`, after schema validation and before admission:

```ts
const [ownedMission, ownedClasses] = await Promise.all([
  getMissionForTeacher({
    teacherId: profile.id,
    missionId: parsed.data.missionId,
  }),
  listAssignableClassesForTeacher({ teacherId: profile.id }),
]);
if (
  !ownedMission ||
  !ownedClasses.some(({ id }) => id === parsed.data.classId)
) {
  return { ok: false, error: ASSIGN_FAILURE };
}
```

Create has no referenced resource, so consume immediately after input validation. Premise/opener likewise have no stored resource. The service call remains after admission, which keeps mission insert/update, answer-shape classification, assignment RPC, and assignment TTS warm-up untouched on denial.

- [ ] **Step 5: Run Task 5 checks**

Run:

```bash
npm test -- --run tests/server/teacher-provider-budget-actions.test.ts tests/server/mission-service.test.ts tests/server/mission-assign.test.ts
npm run typecheck
```

Expected: all focused tests PASS and typecheck PASS; only fakes represent providers.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/app/teacher/missions/actions.ts tests/server/teacher-provider-budget-actions.test.ts
git commit -m "feat: budget teacher mission provider work"
```

---

### Task 6: Gate pronunciation reprocessing after clip ownership

**Files:**
- Modify: `src/app/teacher/evidence/[attemptId]/actions.ts`
- Modify: `src/components/teacher/PronunciationDiagnosticPanel.tsx`
- Create: `src/components/teacher/PronunciationDiagnosticPanel.test.tsx`
- Create: `tests/server/pronunciation-reprocess-action.test.ts`

**Interfaces:**
- Consumes: `teacher_provider` after `teacherOwnsAudioClip` returns true.
- Produces: `ReprocessPronunciationActionResult` adds `rate_limited`.

- [ ] **Step 1: Write failing action and UI tests**

Create `tests/server/pronunciation-reprocess-action.test.ts`, mock
`requireTeacherProfile`, `teacherOwnsAudioClip`, `consumeRequestBudget`,
`reprocessClipPronunciation`, and `revalidatePath`, then add:

```ts
it("checks clip ownership, then denies before pronunciation provider work", async () => {
  mockTeacherOwnsAudioClip.mockResolvedValue(true);
  mockConsume.mockResolvedValue({
    allowed: false,
    retryAfterSeconds: 300,
  });
  const result = await reprocessPronunciationAction({
    audioClipId: "clip-1",
    attemptId: "attempt-1",
  });
  expect(mockTeacherOwnsAudioClip).toHaveBeenCalled();
  expect(mockConsume).toHaveBeenCalledWith({
    actorId: "teacher-1",
    operation: "teacher_provider",
  });
  expect(mockReprocessClipPronunciation).not.toHaveBeenCalled();
  expect(result).toEqual({ ok: false, error: "rate_limited" });
});
```

Create `src/components/teacher/PronunciationDiagnosticPanel.test.tsx` using the repo's jsdom `createRoot` pattern. Mock the action to return `rate_limited`, click `Re-score pronunciation`, and assert:

```ts
expect(container.querySelector('[role="alert"]')?.textContent).toBe(
  "You’ve made several AI requests. Wait a few minutes and try again.",
);
```

- [ ] **Step 2: Run focused tests and verify red**

Run:

```bash
npm test -- --run tests/server/pronunciation-reprocess-action.test.ts src/components/teacher/PronunciationDiagnosticPanel.test.tsx
```

Expected: FAIL because `rate_limited` is not in the action result.

- [ ] **Step 3: Add the owned action gate**

In `src/app/teacher/evidence/[attemptId]/actions.ts`, import `consumeRequestBudget`, add `"rate_limited"` to the error union, and insert after `owns` succeeds:

```ts
const budget = await consumeRequestBudget({
  actorId: profile.id,
  operation: "teacher_provider",
});
if (!budget.allowed) {
  return { ok: false, error: "rate_limited" };
}
```

- [ ] **Step 4: Add distinct teacher copy**

In `PronunciationDiagnosticPanel.tsx`, map:

```ts
if (!result.ok && result.error === "rate_limited") {
  setRescoreError(
    "You’ve made several AI requests. Wait a few minutes and try again.",
  );
  return;
}
```

Give the existing error paragraph `role="alert"` so the message is announced.

- [ ] **Step 5: Run Task 6 checks**

Run:

```bash
npm test -- --run tests/server/pronunciation-reprocess-action.test.ts src/components/teacher/PronunciationDiagnosticPanel.test.tsx
npm run typecheck
```

Expected: focused tests and typecheck PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/app/teacher/evidence/[attemptId]/actions.ts src/components/teacher/PronunciationDiagnosticPanel.tsx src/components/teacher/PronunciationDiagnosticPanel.test.tsx tests/server/pronunciation-reprocess-action.test.ts
git commit -m "feat: budget pronunciation reprocessing"
```

---

### Task 7: Admit only one evaluator warm-up globally

**Files:**
- Modify: `src/server/ai/evaluator-warmup.ts`
- Modify: `src/app/student/missions/[assignmentStudentId]/page.tsx`
- Create: `tests/server/evaluator-warmup.test.ts`

**Interfaces:**
- Consumes: `evaluator_warmup` with fixed actor `"global-evaluator-warmup"`.
- Produces: `warmEvaluators(level) -> Promise<void>`; denial is a silent no-op.

- [ ] **Step 1: Write failing warm-up tests**

Create `tests/server/evaluator-warmup.test.ts` with hoisted mocks:

```ts
it("skips both evaluators when the global warm-up budget is denied", async () => {
  mockConsume.mockResolvedValue({
    allowed: false,
    retryAfterSeconds: 45,
  });
  const { warmEvaluators } = await import("@/server/ai/evaluator-warmup");
  await warmEvaluators("elementary");
  expect(mockConsume).toHaveBeenCalledWith({
    actorId: "global-evaluator-warmup",
    operation: "evaluator_warmup",
  });
  expect(mockEvaluateOriginalTurn).not.toHaveBeenCalled();
  expect(mockEvaluateRepeatTurn).not.toHaveBeenCalled();
});

it("dispatches both existing warm-ups after admission", async () => {
  mockConsume.mockResolvedValue({ allowed: true });
  mockEvaluateOriginalTurn.mockResolvedValue({ ok: false });
  mockEvaluateRepeatTurn.mockResolvedValue({ ok: false });
  const { warmEvaluators } = await import("@/server/ai/evaluator-warmup");
  await warmEvaluators("elementary");
  expect(mockEvaluateOriginalTurn).toHaveBeenCalledTimes(1);
  expect(mockEvaluateRepeatTurn).toHaveBeenCalledTimes(1);
});
```

Add a source assertion that the mission page still contains:

```ts
after(() => warmEvaluators(snapshot.level));
```

- [ ] **Step 2: Run the warm-up test and verify red**

Run:

```bash
npm test -- --run tests/server/evaluator-warmup.test.ts
```

Expected: FAIL because warm-up does not consume a budget and currently returns `void`.

- [ ] **Step 3: Gate the existing warm-up**

In `src/server/ai/evaluator-warmup.ts`:

```ts
import { consumeRequestBudget } from "@/server/security/request-budget";

export async function warmEvaluators(level: MissionLevel): Promise<void> {
  const budget = await consumeRequestBudget({
    actorId: "global-evaluator-warmup",
    operation: "evaluator_warmup",
  });
  if (!budget.allowed) return;

  await Promise.allSettled([
    evaluateOriginalTurn({
      evaluationMode: "preset",
      targetPattern: "warmup",
      targetExample: "This is a warm-up.",
      level,
      transcript: "This is a warm-up.",
    }),
    evaluateRepeatTurn({
      improvedSentence: "This is a warm-up.",
      level,
      repeatTranscript: "This is a warm-up.",
    }),
  ]);
}
```

Preserve metadata-only warning logs by wrapping each evaluator promise with its current `.catch` before passing it to `Promise.allSettled`. Do not log the fixed actor digest or any student context.

The mission page already uses `after(() => warmEvaluators(snapshot.level))`; keep that line. `after` accepts the returned promise, so no page error is introduced.

- [ ] **Step 4: Run Task 7 checks**

Run:

```bash
npm test -- --run tests/server/evaluator-warmup.test.ts tests/server/request-budget.test.ts
npm run typecheck
```

Expected: focused tests and typecheck PASS; denial invokes no evaluator.

- [ ] **Step 5: Commit Task 7**

```bash
git add src/server/ai/evaluator-warmup.ts src/app/student/missions/[assignmentStudentId]/page.tsx tests/server/evaluator-warmup.test.ts
git commit -m "feat: budget evaluator warmups"
```

---

### Task 8: Run full verification and record evidence

**Files:**
- Modify: `TASK.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: reproducible local verification evidence and an archived completed task brief; no deployment, push, remote migration, or paid-provider UAT.

- [ ] **Step 1: Run all focused budget tests**

Run:

```bash
npm test -- --run tests/schema/provider-request-budgets-schema.test.ts tests/server/provider-request-budgets.integration.test.ts tests/server/request-budget.test.ts tests/server/audio-upload.test.ts tests/server/student-audio-budget-route.test.ts src/server/student-access/audio-upload.test.ts tests/server/student-helper-budget-routes.test.ts src/components/student/CocoSpeechAudio.test.tsx src/components/student/CocoDialogueBox.test.tsx tests/server/teacher-provider-budget-actions.test.ts tests/server/mission-service.test.ts tests/server/mission-assign.test.ts tests/server/pronunciation-reprocess-action.test.ts src/components/teacher/PronunciationDiagnosticPanel.test.tsx tests/server/evaluator-warmup.test.ts
```

Expected: all configured tests PASS; only local-Supabase integration cases may skip when local variables are absent.

- [ ] **Step 2: Run the complete repository checks**

Run:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: Vitest, typecheck, lint, build/postbuild, and diff check PASS. Record any pre-existing lint warning exactly; do not claim it was fixed.

- [ ] **Step 3: Verify privacy and boundary invariants statically**

Run:

```bash
rg -n "student_id|teacher_id|ip_address|transcript|provider_input" supabase/migrations/202607310002_provider_request_budgets.sql src/server/security/request-budget.ts
rg -n "request_budgets|consume_request_budget" src supabase tests
git status --short
```

Expected: the first command has no raw-identifier/content storage or logging hit; the second lists only the intended migration, database types, admission module, and tests; status contains only this task's files.

- [ ] **Step 4: Update and archive the task brief**

Update `TASK.md` to `Status: Complete` and record:

```markdown
## Verification

- Focused provider-budget tests: PASS, with local-Supabase skips stated explicitly when unconfigured.
- Full Vitest: PASS.
- Typecheck: PASS.
- Lint: PASS.
- Build and ffmpeg postbuild: PASS.
- `git diff --check`: PASS.
- No remote migration, paid-provider request, deployment, push, or production mutation was performed.
```

Move it to `docs/tasks/archive/2026-07-31-provider-request-budgets.md`, replacing the older paused brief only after preserving the final result and commit list. Do not leave a root `TASK.md` after completion.

- [ ] **Step 5: Commit verification records**

```bash
git add docs/tasks/archive/2026-07-31-provider-request-budgets.md
git commit -m "docs: complete provider request budgets"
```

Stop after the local commits. Pushing, applying the migration, deploying, or running paid-provider UAT requires a new approval naming the exact action and environment.

## Deviations and final state

The shipped implementation differs from the task snippets above in three
places. The snippets are superseded; the code is authoritative.

1. **Rate-limited TTS is visible and recoverable in every presentation.**
   The plan showed the rate-limited state as a bare `<span role="status">`,
   which `CocoSpeechAudio` suppressed under `presentation="dialogue-tab"` —
   the presentation `MissionFlowShell` uses. That left the main student path
   with a disabled speaker button, no explanation, and no retry. The status
   text now renders in every presentation (never labelled "Voice
   unavailable") alongside a "Try again" control that re-requests the line
   through a reload counter in the fetch effect.

2. **Teacher budget admission fails closed on rejection.**
   `teacherProviderAllowed` in `src/app/teacher/missions/actions.ts` wraps
   `consumeRequestBudget` in try/catch and treats a rejection as a denial.
   `generatePremiseAction` and `generateOpenerAction` have no surrounding
   try/catch, so without this an unreachable budget RPC would reject out of a
   server action instead of returning its typed failure. Ownership reads for
   budget ordering sit inside each action's existing try for the same reason.

3. **Denied counters saturate at `limit + 1`.**
   `consume_request_budget` clamps with
   `least(public.request_budgets.request_count, p_request_limit) + 1` in the
   non-reset branch. Counting denials without bound would eventually overflow
   `integer`; the RPC then raises and admission fails closed, but the actor
   stays locked out until the row is deleted manually. The clamp is applied
   before the increment so the overflowing value is never evaluated, and it
   changes nothing below the limit — the denial test only needs
   `> p_request_limit`.

Reviewed and accepted without change: the `teacher_provider` 10/600s quota is
an accepted product limit, and the pre-admission ownership read in
`updateMissionAction` is left unoptimised.
