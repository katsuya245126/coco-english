import { DEFAULT_CHARACTER_ID, missionFormSchema } from "@/domain/mission/schemas";
import type {
  AnswerShape,
  HintLadder,
  MissionFormInput,
  MissionLevel,
  MissionTurnInput,
} from "@/domain/mission/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { classifyTurnAnswerShapes } from "@/server/ai/answer-shape-classifier";
import type { Json } from "@/lib/db/types";

export type TeacherMission = {
  id: string;
  title: string;
  targetPattern: string | null;
  level: MissionLevel;
  requiredTurns: number;
  characterId: string;
  conversationMode: boolean;
  requireCompleteSentenceAnswers: boolean;
  turnCount: number;
  assignmentCount: number;
  activeAssignmentCount: number;
  archivedAt: string | null;
};

export type MissionTurn = MissionTurnInput & {
  id: string;
  turnOrder: number;
};

export type MissionAssignmentSummary = {
  id: string;
  classId: string;
  className: string;
  assignedAt: string;
  dueAt: string | null;
};

export type MissionWithTurns = TeacherMission & {
  turns: MissionTurn[];
};

type MissionRow = {
  id: string;
  title: string;
  target_pattern: string | null;
  level: string;
  required_turns: number;
  character_id: string;
  conversation_mode: boolean;
  require_complete_sentence_answers: boolean;
  archived_at: string | null;
};

type AssignmentRow = {
  id: string;
  class_id: string;
  assigned_at: string;
  due_at: string | null;
};

type ClassRow = {
  id: string;
  name: string;
};

type TurnRow = {
  id: string;
  turn_order: number;
  prompt: string;
  target_pattern: string | null;
  target_example: string;
  hint_ladder: Json;
  answer_shape: string;
};

function parseMissionInput(input: MissionFormInput): MissionFormInput {
  const parsed = missionFormSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Unable to validate mission.",
    );
  }
  return parsed.data;
}

function mapMission(row: MissionRow, counts?: {
  turnCount?: number;
  assignmentCount?: number;
  activeAssignmentCount?: number;
}): TeacherMission {
  return {
    id: row.id,
    title: row.title,
    targetPattern: row.target_pattern,
    level: row.level as MissionLevel,
    requiredTurns: row.required_turns,
    characterId: row.character_id,
    conversationMode: row.conversation_mode,
    requireCompleteSentenceAnswers: row.require_complete_sentence_answers,
    turnCount: counts?.turnCount ?? row.required_turns,
    assignmentCount: counts?.assignmentCount ?? 0,
    activeAssignmentCount: counts?.activeAssignmentCount ?? 0,
    archivedAt: row.archived_at,
  };
}

// The hint_ladder JSON column is not schema-enforced at the DB level, so older
// or seeded rows may be null or missing tier keys. Normalize to the expected
// {tier1, tier2, tier3} shape so the mission editor never crashes on a
// malformed value.
function normalizeHintLadder(value: Json): HintLadder {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    tier1: typeof raw.tier1 === "string" ? raw.tier1 : "",
    tier2: typeof raw.tier2 === "string" ? raw.tier2 : "",
    tier3: typeof raw.tier3 === "string" ? raw.tier3 : "",
  };
}

export function mapTurn(row: TurnRow): MissionTurn {
  return {
    id: row.id,
    turnOrder: row.turn_order,
    prompt: row.prompt,
    ...(row.target_pattern ? { targetPattern: row.target_pattern } : {}),
    targetExample: row.target_example,
    hintLadder: normalizeHintLadder(row.hint_ladder),
    answerShape: row.answer_shape === "fixed" ? "fixed" : "open",
  };
}

function toMissionWrite(input: MissionFormInput) {
  return {
    title: input.title,
    target_pattern: input.conversationMode ? input.targetPattern ?? null : null,
    level: input.level,
    required_turns: input.requiredTurns,
    character_id: DEFAULT_CHARACTER_ID,
    conversation_mode: input.conversationMode,
    require_complete_sentence_answers: input.requireCompleteSentenceAnswers,
  };
}

function toMissionInsert(input: MissionFormInput, teacherId: string) {
  return {
    ...toMissionWrite(input),
    teacher_id: teacherId,
    topic: "",
  };
}

export function applyAnswerShapes(
  turns: MissionTurnInput[],
  shapes: AnswerShape[],
): MissionTurnInput[] {
  if (shapes.length !== turns.length) return turns;
  return turns.map((turn, i) => ({ ...turn, answerShape: shapes[i] }));
}

export function toTurnRows(
  missionId: string,
  turns: MissionTurnInput[],
) {
  return turns.map((turn, index) => ({
    mission_id: missionId,
    turn_order: index + 1,
    prompt: turn.prompt,
    target_pattern: turn.targetPattern ?? null,
    target_example: turn.targetExample,
    hint_ladder: turn.hintLadder satisfies Json,
    answer_shape: turn.answerShape,
  }));
}

async function withMissionCounts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rows: MissionRow[],
): Promise<TeacherMission[]> {
  if (rows.length === 0) {
    return [];
  }

  const missionIds = rows.map((mission) => mission.id);
  const [turns, assignments] = await Promise.all([
    supabase
      .from("mission_turn_templates")
      .select("mission_id")
      .in("mission_id", missionIds),
    supabase
      .from("assignments")
      .select("mission_id")
      .in("mission_id", missionIds)
      .is("canceled_at", null),
  ]);

  if (turns.error) {
    throw new Error(`Unable to count mission turns: ${turns.error.message}`);
  }
  if (assignments.error) {
    throw new Error(`Unable to count assignments: ${assignments.error.message}`);
  }

  const turnCounts = new Map<string, number>();
  for (const turn of turns.data ?? []) {
    turnCounts.set(turn.mission_id, (turnCounts.get(turn.mission_id) ?? 0) + 1);
  }

  const assignmentCounts = new Map<string, number>();
  for (const assignment of assignments.data ?? []) {
    assignmentCounts.set(
      assignment.mission_id,
      (assignmentCounts.get(assignment.mission_id) ?? 0) + 1,
    );
  }

  return rows.map((row) =>
    mapMission(row, {
      // Conversation-mode missions store only the opener template, so the
      // template count understates the mission length; the configured
      // required_turns is the real turn count.
      turnCount: row.conversation_mode
        ? row.required_turns
        : (turnCounts.get(row.id) ?? row.required_turns),
      assignmentCount: assignmentCounts.get(row.id) ?? 0,
      activeAssignmentCount: assignmentCounts.get(row.id) ?? 0,
    }),
  );
}

export async function createMission(
  input: MissionFormInput & { teacherId: string },
): Promise<TeacherMission> {
  const parsed = parseMissionInput(input);
  const supabase = await createSupabaseServerClient();

  const inserted = await supabase
    .from("missions")
    .insert(toMissionInsert(parsed, input.teacherId))
    .select(
      "id, title, target_pattern, level, required_turns, character_id, conversation_mode, require_complete_sentence_answers, archived_at",
    )
    .single();

  if (inserted.error) {
    throw new Error(`Unable to create mission: ${inserted.error.message}`);
  }

  const shapes = await classifyTurnAnswerShapes({
    turns: parsed.turns.map((t) => ({ prompt: t.prompt, targetExample: t.targetExample })),
  });
  const shapedTurns = applyAnswerShapes(parsed.turns, shapes);

  const turns = await supabase
    .from("mission_turn_templates")
    .insert(toTurnRows(inserted.data.id, shapedTurns));

  if (turns.error) {
    throw new Error(`Unable to create mission turns: ${turns.error.message}`);
  }

  return mapMission(inserted.data, { turnCount: parsed.turns.length });
}

export async function updateMission(
  input: MissionFormInput & { teacherId: string; missionId: string },
): Promise<TeacherMission> {
  const parsed = parseMissionInput(input);
  const supabase = await createSupabaseServerClient();

  const updated = await supabase
    .from("missions")
    .update(toMissionWrite(parsed))
    .eq("id", input.missionId)
    .eq("teacher_id", input.teacherId)
    .select(
      "id, title, target_pattern, level, required_turns, character_id, conversation_mode, require_complete_sentence_answers, archived_at",
    )
    .single();

  if (updated.error) {
    throw new Error(`Unable to update mission: ${updated.error.message}`);
  }

  const removed = await supabase
    .from("mission_turn_templates")
    .delete()
    .eq("mission_id", input.missionId);

  if (removed.error) {
    throw new Error(`Unable to replace mission turns: ${removed.error.message}`);
  }

  const shapes = await classifyTurnAnswerShapes({
    turns: parsed.turns.map((t) => ({ prompt: t.prompt, targetExample: t.targetExample })),
  });
  const shapedTurns = applyAnswerShapes(parsed.turns, shapes);

  const turns = await supabase
    .from("mission_turn_templates")
    .insert(toTurnRows(input.missionId, shapedTurns));

  if (turns.error) {
    throw new Error(`Unable to update mission turns: ${turns.error.message}`);
  }

  return mapMission(updated.data, { turnCount: parsed.turns.length });
}

export async function archiveMission(input: {
  teacherId: string;
  missionId: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const archived = await supabase
    .from("missions")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", input.missionId)
    .eq("teacher_id", input.teacherId);

  if (archived.error) {
    throw new Error(`Unable to archive mission: ${archived.error.message}`);
  }
}

export async function restoreMission(input: {
  teacherId: string;
  missionId: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const restored = await supabase
    .from("missions")
    .update({ archived_at: null })
    .eq("id", input.missionId)
    .eq("teacher_id", input.teacherId);

  if (restored.error) {
    throw new Error(`Unable to restore mission: ${restored.error.message}`);
  }
}

export async function cancelMissionAssignment(input: {
  teacherId: string;
  missionId: string;
  assignmentId: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const canceled = await supabase
    .from("assignments")
    .update({ canceled_at: new Date().toISOString() })
    .eq("id", input.assignmentId)
    .eq("mission_id", input.missionId);

  if (canceled.error) {
    throw new Error(`Unable to cancel assignment: ${canceled.error.message}`);
  }
}

export async function getMissionForTeacher(input: {
  teacherId: string;
  missionId: string;
}): Promise<MissionWithTurns | null> {
  const supabase = await createSupabaseServerClient();

  const mission = await supabase
    .from("missions")
    .select(
      "id, title, target_pattern, level, required_turns, character_id, conversation_mode, require_complete_sentence_answers, archived_at",
    )
    .eq("teacher_id", input.teacherId)
    .eq("id", input.missionId)
    .maybeSingle();

  if (mission.error) {
    throw new Error(`Unable to load mission: ${mission.error.message}`);
  }

  if (!mission.data) {
    return null;
  }

  const turns = await supabase
    .from("mission_turn_templates")
    .select(
      "id, turn_order, prompt, target_pattern, target_example, hint_ladder, answer_shape",
    )
    .eq("mission_id", input.missionId)
    .order("turn_order", { ascending: true });

  if (turns.error) {
    throw new Error(`Unable to load mission turns: ${turns.error.message}`);
  }

  const activeAssignmentCount = await countAssignmentsForMission({
    missionId: input.missionId,
  });

  return {
    ...mapMission(mission.data, {
      turnCount: mission.data.conversation_mode
        ? mission.data.required_turns
        : (turns.data?.length ?? 0),
      assignmentCount: activeAssignmentCount,
      activeAssignmentCount,
    }),
    turns: (turns.data ?? []).map(mapTurn),
  };
}

export async function listMissionsForTeacher(input: {
  teacherId: string;
}): Promise<TeacherMission[]> {
  const supabase = await createSupabaseServerClient();

  const missions = await supabase
    .from("missions")
    .select(
      "id, title, target_pattern, level, required_turns, character_id, conversation_mode, require_complete_sentence_answers, archived_at",
    )
    .eq("teacher_id", input.teacherId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (missions.error) {
    throw new Error(`Unable to list missions: ${missions.error.message}`);
  }

  return withMissionCounts(supabase, missions.data ?? []);
}

export async function listArchivedMissionsForTeacher(input: {
  teacherId: string;
}): Promise<TeacherMission[]> {
  const supabase = await createSupabaseServerClient();

  const missions = await supabase
    .from("missions")
    .select(
      "id, title, target_pattern, level, required_turns, character_id, conversation_mode, require_complete_sentence_answers, archived_at",
    )
    .eq("teacher_id", input.teacherId)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (missions.error) {
    throw new Error(`Unable to list archived missions: ${missions.error.message}`);
  }

  return withMissionCounts(supabase, missions.data ?? []);
}

export async function listMissionAssignmentsForTeacher(input: {
  teacherId: string;
  missionId: string;
}): Promise<MissionAssignmentSummary[]> {
  const supabase = await createSupabaseServerClient();
  const assignments = await supabase
    .from("assignments")
    .select("id, class_id, assigned_at, due_at")
    .eq("mission_id", input.missionId)
    .is("canceled_at", null)
    .order("assigned_at", { ascending: false });

  if (assignments.error) {
    throw new Error(`Unable to list mission assignments: ${assignments.error.message}`);
  }

  const assignmentRows = (assignments.data ?? []) as AssignmentRow[];
  if (assignmentRows.length === 0) {
    return [];
  }

  const classIds = [...new Set(assignmentRows.map((assignment) => assignment.class_id))];
  const classes = await supabase
    .from("classes")
    .select("id, name")
    .eq("teacher_id", input.teacherId)
    .in("id", classIds);

  if (classes.error) {
    throw new Error(`Unable to list assignment classes: ${classes.error.message}`);
  }

  const classNames = new Map(
    ((classes.data ?? []) as ClassRow[]).map((classRow) => [
      classRow.id,
      classRow.name,
    ]),
  );

  return assignmentRows
    .filter((assignment) => classNames.has(assignment.class_id))
    .map((assignment) => ({
      id: assignment.id,
      classId: assignment.class_id,
      className: classNames.get(assignment.class_id) ?? "Class",
      assignedAt: assignment.assigned_at,
      dueAt: assignment.due_at,
    }));
}

export async function countAssignmentsForMission(input: {
  missionId: string;
}): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const assignments = await supabase
    .from("assignments")
    .select("id")
    .eq("mission_id", input.missionId)
    .is("canceled_at", null);

  if (assignments.error) {
    throw new Error(`Unable to count assignments: ${assignments.error.message}`);
  }

  return assignments.data?.length ?? 0;
}
