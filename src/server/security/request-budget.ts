import { createHmac } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const BUDGETS = {
  student_audio: { requestLimit: 24, windowSeconds: 600 },
  student_helper: { requestLimit: 60, windowSeconds: 600 },
  teacher_provider: { requestLimit: 50, windowSeconds: 600 },
  evaluator_warmup: { requestLimit: 1, windowSeconds: 90 },
} as const;

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
      (async (name, args) => await createSupabaseServiceClient().rpc(name, args));
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
