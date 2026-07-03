import { DEFAULT_CHARACTER_ID, missionFormSchema } from "@/domain/mission/schemas";
import type {
  HintLadder,
  MissionFormInput,
  MissionLevel,
  MissionTurnInput,
} from "@/domain/mission/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import type { Json } from "@/lib/db/types";

export type TeacherMission = {
  id: string;
  title: string;
  targetPattern: string;
  topic: string;
  level: MissionLevel;
  requiredTurns: number;
  characterId: string;
  turnCount: number;
  assignmentCount: number;
  activeAssignmentCount: number;
};

export type MissionTurn = MissionTurnInput & {
  id: string;
  turnOrder: number;
};

export type MissionWithTurns = TeacherMission & {
  turns: MissionTurn[];
};

type MissionRow = {
  id: string;
  title: string;
  target_pattern: string;
  topic: string;
  level: string;
  required_turns: number;
  character_id: string;
};

type TurnRow = {
  id: string;
  turn_order: number;
  prompt: string;
  target_example: string;
  hint_ladder: Json;
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
    topic: row.topic,
    level: row.level as MissionLevel,
    requiredTurns: row.required_turns,
    characterId: row.character_id,
    turnCount: counts?.turnCount ?? row.required_turns,
    assignmentCount: counts?.assignmentCount ?? 0,
    activeAssignmentCount: counts?.activeAssignmentCount ?? 0,
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

function mapTurn(row: TurnRow): MissionTurn {
  return {
    id: row.id,
    turnOrder: row.turn_order,
    prompt: row.prompt,
    targetExample: row.target_example,
    hintLadder: normalizeHintLadder(row.hint_ladder),
  };
}

function toMissionInsert(input: MissionFormInput, teacherId: string) {
  return {
    teacher_id: teacherId,
    title: input.title,
    target_pattern: input.targetPattern,
    topic: input.topic,
    level: input.level,
    required_turns: input.requiredTurns,
    character_id: DEFAULT_CHARACTER_ID,
  };
}

function toTurnRows(missionId: string, turns: MissionTurnInput[]) {
  return turns.map((turn, index) => ({
    mission_id: missionId,
    turn_order: index + 1,
    prompt: turn.prompt,
    target_example: turn.targetExample,
    hint_ladder: turn.hintLadder as unknown as Json,
  }));
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
      "id, title, target_pattern, topic, level, required_turns, character_id",
    )
    .single();

  if (inserted.error) {
    throw new Error(`Unable to create mission: ${inserted.error.message}`);
  }

  const turns = await supabase
    .from("mission_turn_templates")
    .insert(toTurnRows(inserted.data.id, parsed.turns));

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
    .update(toMissionInsert(parsed, input.teacherId))
    .eq("id", input.missionId)
    .eq("teacher_id", input.teacherId)
    .select(
      "id, title, target_pattern, topic, level, required_turns, character_id",
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

  const turns = await supabase
    .from("mission_turn_templates")
    .insert(toTurnRows(input.missionId, parsed.turns));

  if (turns.error) {
    throw new Error(`Unable to update mission turns: ${turns.error.message}`);
  }

  return mapMission(updated.data, { turnCount: parsed.turns.length });
}

export async function deleteMission(input: {
  teacherId: string;
  missionId: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const assignments = await supabase
    .from("assignments")
    .select("id")
    .eq("mission_id", input.missionId);

  if (assignments.error) {
    throw new Error(`Unable to check mission assignments: ${assignments.error.message}`);
  }

  if ((assignments.data ?? []).length > 0) {
    throw new Error("Assigned missions cannot be deleted.");
  }

  const deleted = await supabase
    .from("missions")
    .delete()
    .eq("id", input.missionId)
    .eq("teacher_id", input.teacherId);

  if (deleted.error) {
    throw new Error(`Unable to delete mission: ${deleted.error.message}`);
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
      "id, title, target_pattern, topic, level, required_turns, character_id",
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
    .select("id, turn_order, prompt, target_example, hint_ladder")
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
      turnCount: turns.data?.length ?? 0,
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
      "id, title, target_pattern, topic, level, required_turns, character_id",
    )
    .eq("teacher_id", input.teacherId)
    .order("created_at", { ascending: false });

  if (missions.error) {
    throw new Error(`Unable to list missions: ${missions.error.message}`);
  }

  const rows = missions.data ?? [];
  if (rows.length === 0) {
    return [];
  }

  const missionIds = rows.map((mission) => mission.id);
  const [turns, assignments] = await Promise.all([
    supabase
      .from("mission_turn_templates")
      .select("mission_id")
      .in("mission_id", missionIds),
    supabase.from("assignments").select("mission_id").in("mission_id", missionIds),
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
      turnCount: turnCounts.get(row.id) ?? row.required_turns,
      assignmentCount: assignmentCounts.get(row.id) ?? 0,
      activeAssignmentCount: assignmentCounts.get(row.id) ?? 0,
    }),
  );
}

export async function countAssignmentsForMission(input: {
  missionId: string;
}): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const assignments = await supabase
    .from("assignments")
    .select("id")
    .eq("mission_id", input.missionId);

  if (assignments.error) {
    throw new Error(`Unable to count assignments: ${assignments.error.message}`);
  }

  return assignments.data?.length ?? 0;
}
