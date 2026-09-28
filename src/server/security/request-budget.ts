import { createHmac } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { DEMO_DAILY_CALL_LIMIT, demoClassId } from "@/server/demo/demo-config";

const BUDGETS = {
  student_audio: { requestLimit: 24, windowSeconds: 600 },
  student_helper: { requestLimit: 60, windowSeconds: 600 },
  teacher_provider: { requestLimit: 50, windowSeconds: 600 },
  evaluator_warmup: { requestLimit: 1, windowSeconds: 90 },
  demo_start: { requestLimit: 5, windowSeconds: 3_600 },
  demo_daily: { requestLimit: DEMO_DAILY_CALL_LIMIT, windowSeconds: 86_400 },
} as const;

// Paid student operations that also count against the demo class's daily cap.
const DEMO_METERED: ReadonlySet<RequestBudgetOperation> = new Set([
  "student_audio",
  "student_helper",
]);

export type RequestBudgetOperation = keyof typeof BUDGETS;
export type RequestBudgetDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type BudgetRpcResult = {
  data: Array<{ permitted: boolean; retry_after_seconds: number }> | null;
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

function actorDigest(actorId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`request-budget:v1:${actorId}`)
    .digest("base64url");
}

// On the demo deployment, a paid student call must fit both the student's own
// budget and the class-wide daily cap. The daily cap is only consumed once the
// student budget allows, so one student's burst cannot drain it.
export async function consumeRequestBudget(
  input: { actorId: string; operation: RequestBudgetOperation },
  deps: { rpc?: BudgetRpc } = {},
): Promise<RequestBudgetDecision> {
  const decision = await consumeOneBudget(input, deps);
  const classId = demoClassId();
  if (!decision.allowed || !classId || !DEMO_METERED.has(input.operation)) {
    return decision;
  }
  return consumeOneBudget(
    { actorId: `demo-class:${classId}`, operation: "demo_daily" },
    deps,
  );
}

async function consumeOneBudget(
  input: { actorId: string; operation: RequestBudgetOperation },
  deps: { rpc?: BudgetRpc } = {},
): Promise<RequestBudgetDecision> {
  const budget = BUDGETS[input.operation];
  const secret = process.env.STUDENT_ACCESS_SECRET ?? "";
  if (!validSecret(secret) || input.actorId.length === 0) {
    return { allowed: false, retryAfterSeconds: budget.windowSeconds };
  }


  try {
    const rpc: BudgetRpc =
      deps.rpc ??
      (async (name, args) => await createSupabaseServiceClient().rpc(name, args));
    const { data, error } = await rpc("consume_request_budget", {
      p_actor_digest: actorDigest(input.actorId, secret),
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

// Read-only check used to show the demo "resting" state without spending a
// request. Fails closed (reports exhausted) when the budget cannot be read.
export async function isRequestBudgetExhausted(input: {
  actorId: string;
  operation: RequestBudgetOperation;
}): Promise<boolean> {
  const budget = BUDGETS[input.operation];
  const secret = process.env.STUDENT_ACCESS_SECRET ?? "";
  if (!validSecret(secret) || input.actorId.length === 0) return true;
  try {
    const { data, error } = await createSupabaseServiceClient()
      .from("request_budgets")
      .select("request_count, window_started_at")
      .eq("actor_digest", actorDigest(input.actorId, secret))
      .eq("operation", input.operation)
      .maybeSingle();
    if (error) return true;
    if (!data) return false;
    const windowEndsAt =
      Date.parse(data.window_started_at) + budget.windowSeconds * 1_000;
    // At the limit the next consume is denied, so the budget is already spent.
    return data.request_count >= budget.requestLimit && windowEndsAt > Date.now();
  } catch {
    return true;
  }
}
