import type { TranslatableCocoLine } from "@/domain/ai/translation-hint";
import type { MissionLevel } from "@/domain/mission/schemas";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireOwnedAssignmentStudent } from "@/server/student-access/owned-assignment";

export type ResolveOwnedTranslationSourceResult =
  | {
      ok: true;
      source: {
        sourceText: string;
        studentLevel: MissionLevel;
      };
    }
  | { ok: false; error: "not_found" | "db_error" };

export async function resolveOwnedTranslationSource(input: {
  studentId: string;
  assignmentStudentId: string;
  line: TranslatableCocoLine;
}): Promise<ResolveOwnedTranslationSourceResult> {
  const supabase = createSupabaseServiceClient();
  const owned = await requireOwnedAssignmentStudent({
    studentId: input.studentId,
    assignmentStudentId: input.assignmentStudentId,
  });
  if (!owned.ok) {
    return {
      ok: false,
      error: owned.error === "db_error" ? "db_error" : "not_found",
    };
  }

  const snapshot = owned.owned.snapshot;
  if (!snapshot) return { ok: false, error: "not_found" };

  if (input.line.lineKind === "mission_prompt") {
    const turn = snapshot.turns.find(
      (candidate) => candidate.turnOrder === input.line.turnOrder,
    );
    if (!turn?.prompt.trim()) return { ok: false, error: "not_found" };
    return {
      ok: true,
      source: { sourceText: turn.prompt, studentLevel: snapshot.level },
    };
  }

  const latestAttemptId = owned.owned.latestAttemptId;
  if (!latestAttemptId) return { ok: false, error: "not_found" };

  const { data: turn, error: turnError } = await supabase
    .from("attempt_turns")
    .select("coco_line")
    .eq("attempt_id", latestAttemptId)
    .eq("turn_order", input.line.turnOrder)
    .maybeSingle();

  if (turnError) return { ok: false, error: "db_error" };
  const sourceText = turn?.coco_line;
  if (!sourceText?.trim()) return { ok: false, error: "not_found" };

  return {
    ok: true,
    source: { sourceText, studentLevel: snapshot.level },
  };
}
