import type { TranslatableCocoLine } from "@/domain/ai/translation-hint";
import {
  missionSnapshotSchema,
  type MissionLevel,
} from "@/domain/mission/schemas";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

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
  const { data: assignmentStudent, error: ownershipError } = await supabase
    .from("assignment_students")
    .select(
      "id, student_id, latest_attempt_id, assignments(mission_snapshot, canceled_at)",
    )
    .eq("id", input.assignmentStudentId)
    .eq("student_id", input.studentId)
    .maybeSingle();

  if (ownershipError) return { ok: false, error: "db_error" };
  if (!assignmentStudent) return { ok: false, error: "not_found" };

  const owned = assignmentStudent as typeof assignmentStudent & {
    latest_attempt_id?: string | null;
    assignments?: {
      mission_snapshot?: unknown;
      canceled_at?: string | null;
    } | null;
  };
  if (owned.assignments?.canceled_at) {
    return { ok: false, error: "not_found" };
  }

  const parsedSnapshot = missionSnapshotSchema.safeParse(
    owned.assignments?.mission_snapshot,
  );
  if (!parsedSnapshot.success) return { ok: false, error: "not_found" };

  const snapshot = parsedSnapshot.data;
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

  const latestAttemptId = owned.latest_attempt_id;
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
