import {
  missionSnapshotSchema,
  type MissionSnapshot,
} from "@/domain/mission/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import type { Json } from "@/lib/db/types";
import { DEFAULT_COCO_TTS_VOICE } from "@/domain/audio/tts";
import { getCharacterProfile } from "@/domain/character/profile";
import { warmTtsAudioCache } from "@/server/audio/tts-cache";
import { log } from "@/server/logging/logger";

export type AssignableClass = {
  id: string;
  name: string;
  activeStudentCount: number;
};

export type MissionAssignmentResult = {
  assignmentId: string;
  activeStudentCount: number;
  className: string;
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
};

type TurnRow = {
  id?: string;
  turn_order: number;
  prompt: string;
  target_pattern: string | null;
  target_example: string;
  hint_ladder: Json;
  answer_shape: string;
};

export function buildMissionSnapshot(input: {
  mission: MissionRow;
  turns: TurnRow[];
}): MissionSnapshot {
  const snapshot = {
    missionId: input.mission.id,
    title: input.mission.title,
    ...(input.mission.target_pattern
      ? { targetPattern: input.mission.target_pattern }
      : {}),
    level: input.mission.level,
    requiredTurns: input.mission.required_turns,
    characterId: input.mission.character_id,
    conversationMode: input.mission.conversation_mode,
    requireCompleteSentenceAnswers:
      input.mission.require_complete_sentence_answers,
    turns: input.turns
      .slice()
      .sort((a, b) => a.turn_order - b.turn_order)
      .map((turn) => ({
        turnOrder: turn.turn_order,
        prompt: turn.prompt,
        ...(turn.target_pattern
          ? { targetPattern: turn.target_pattern }
          : {}),
        targetExample: turn.target_example,
        hintLadder: turn.hint_ladder,
        answerShape: turn.answer_shape === "fixed" ? "fixed" : "open",
      })),
  };

  return missionSnapshotSchema.parse(snapshot);
}

function collectAssignmentWarmupLines(snapshot: MissionSnapshot): string[] {
  const profile = getCharacterProfile(snapshot.characterId);

  return [
    ...snapshot.turns.map((turn) => turn.prompt),
    profile.turnTransition,
    profile.improvedSentenceIntro,
    profile.completionHeading,
  ];
}

export async function assignMissionToClass(input: {
  teacherId: string;
  missionId: string;
  classId: string;
  dueAt: string | null;
}): Promise<MissionAssignmentResult> {
  const supabase = await createSupabaseServerClient();

  const mission = await supabase
    .from("missions")
    .select(
      "id, title, target_pattern, level, required_turns, character_id, conversation_mode, require_complete_sentence_answers",
    )
    .eq("teacher_id", input.teacherId)
    .eq("id", input.missionId)
    .maybeSingle();

  if (mission.error) {
    throw new Error(`Unable to load mission for assignment: ${mission.error.message}`);
  }
  if (!mission.data) {
    throw new Error("Unable to assign mission: mission not found.");
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

  const snapshot = buildMissionSnapshot({
    mission: mission.data,
    turns: turns.data ?? [],
  });

  const assigned = await supabase.rpc("assign_mission_to_class", {
    p_class_id: input.classId,
    p_mission_id: input.missionId,
    p_mission_snapshot: snapshot as unknown as Json,
    p_due_at: input.dueAt,
  });

  if (assigned.error) {
    throw new Error(`Unable to assign mission: ${assigned.error.message}`);
  }

  const row = Array.isArray(assigned.data) ? assigned.data[0] : assigned.data;
  try {
    await warmTtsAudioCache({
      characterId: snapshot.characterId,
      voice: DEFAULT_COCO_TTS_VOICE,
      texts: collectAssignmentWarmupLines(snapshot),
    });
  } catch (error) {
    log("warn", "audio.tts_assignment_warmup_failed", {
      missionId: input.missionId,
      classId: input.classId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    assignmentId: row.out_assignment_id,
    activeStudentCount: row.out_active_student_count,
    className: row.out_class_name,
  };
}

export async function listAssignableClassesForTeacher(input: {
  teacherId: string;
}): Promise<AssignableClass[]> {
  const supabase = await createSupabaseServerClient();
  const classes = await supabase
    .from("classes")
    .select("id, name")
    .eq("teacher_id", input.teacherId)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (classes.error) {
    throw new Error(`Unable to list assignable classes: ${classes.error.message}`);
  }

  const classRows = classes.data ?? [];
  if (classRows.length === 0) {
    return [];
  }

  const students = await supabase
    .from("students")
    .select("class_id")
    .in(
      "class_id",
      classRows.map((row) => row.id),
    )
    .is("archived_at", null);

  if (students.error) {
    throw new Error(`Unable to count active students: ${students.error.message}`);
  }

  const counts = new Map<string, number>();
  for (const student of students.data ?? []) {
    counts.set(student.class_id, (counts.get(student.class_id) ?? 0) + 1);
  }

  return classRows
    .map((row) => ({
      id: row.id,
      name: row.name,
      activeStudentCount: counts.get(row.id) ?? 0,
    }))
    .filter((row) => row.activeStudentCount > 0);
}
