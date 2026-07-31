import { NextResponse } from "next/server";
import { readStudentUnlock } from "@/app/join/actions";
import { translationHintRequestSchema } from "@/domain/ai/translation-hint";
import {
  DEFAULT_TRANSLATION_LOCALE,
  getOrCreateTranslationHint,
} from "@/server/ai/translation-hint-cache";
import { resolveOwnedTranslationSource } from "@/server/student-access/translation-source";
import { consumeRequestBudget } from "@/server/security/request-budget";

type RouteContext = {
  params: Promise<{ assignmentStudentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const unlock = await readStudentUnlock();
  if (!unlock) {
    return NextResponse.json(
      { ok: false, error: "session_expired" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const parsed = translationHintRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const { assignmentStudentId } = await context.params;
  const source = await resolveOwnedTranslationSource({
    studentId: unlock.studentId,
    assignmentStudentId,
    line: parsed.data,
  });

  if (!source.ok) {
    if (source.error === "not_found") {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "translation_unavailable_retryable" },
      { status: 502 },
    );
  }

  // The source line is proven owned above, so an unresolvable or foreign
  // request cannot spend the student's allowance. Consuming here keeps the
  // cache lookup and translation provider call behind admission.
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

  const result = await getOrCreateTranslationHint({
    sourceText: source.source.sourceText,
    studentLevel: source.source.studentLevel,
    targetLocale: DEFAULT_TRANSLATION_LOCALE,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "translation_unavailable_retryable" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    phrases: result.hint.phrases,
    targetLocale: DEFAULT_TRANSLATION_LOCALE,
  });
}
