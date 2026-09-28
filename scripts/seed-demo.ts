// Seed the public demo project: a credential-less demo teacher, one class with
// no join code, and three kid-level assignments. Idempotent; prints DEMO_CLASS_ID.
//
// Runs only against a local Supabase or an otherwise empty project, so it can
// never write into the production database. Needs the demo project's env:
//
//   node --env-file=.env.demo --import ./scripts/lib/ts-alias.mjs scripts/seed-demo.ts
//
// .env.demo (gitignored): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// OPENAI_API_KEY, AZURE_SPEECH_KEY, AZURE_SPEECH_REGION.
import { DEFAULT_COCO_TTS_VOICE } from "@/domain/audio/tts";
import { pronunciationPracticeSnapshotSchema } from "@/domain/pronunciation/practice";
import { PRONUNCIATION_WORD_BANK } from "@/domain/pronunciation/word-bank.generated";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  buildPronunciationWordAudioSpec,
  PRONUNCIATION_WORD_AUDIO,
  warmPronunciationWordAudio,
} from "@/server/audio/pronunciation-word-audio";
import { warmTtsAudioCache } from "@/server/audio/tts-cache";
import {
  buildMissionSnapshot,
  collectAssignmentWarmupLines,
} from "@/server/mission/assign-service";

const TEACHER_NAME = "Coco Demo Teacher";
const CLASS_NAME = "Coco Demo Class";
const DUE_AT = "2099-12-31T00:00:00Z"; // far future: mark-missed never touches it
const PRONUNCIATION = { soundId: "f", difficulty: "easy", title: "F Sound Practice" } as const;
const PRONUNCIATION_WORDS = ["fish", "five", "food", "fork", "fan"];

const missions = [
  {
    title: "My Favorite Things",
    target_pattern: null,
    topic: "Favorite things",
    level: "elementary",
    required_turns: 3,
    scene_premise: null,
    conversation_mode: false,
    require_complete_sentence_answers: true,
    turns: [
      ["What is your favorite food?", "My favorite food is ___.", "My favorite food is pizza.", "Choose a food you love."],
      ["What is your favorite animal?", "My favorite animal is ___.", "My favorite animal is a rabbit.", "Choose an animal you like."],
      ["What is your favorite color?", "My favorite color is ___.", "My favorite color is blue.", "Choose a color."],
    ],
  },
  {
    title: "My Weekend",
    target_pattern: "I like to ___.",
    topic: "Weekend activities",
    level: "elementary",
    required_turns: 5,
    scene_premise: "You tell Coco what you like to do on weekends.",
    conversation_mode: true,
    require_complete_sentence_answers: false,
    turns: [
      ["What do you like to do on weekends?", null, "I like to ride my bike.", "Choose something fun you do."],
    ],
  },
] as const;

function fail(message: string): never {
  throw new Error(message);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fail("NEXT_PUBLIC_SUPABASE_URL is required.");
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url);
const supabase = createSupabaseServiceClient();

// Guard: a real project has teacher logins or other classes. Refuse to touch it.
if (!isLocal) {
  const logins = await supabase
    .from("teacher_profiles")
    .select("id", { count: "exact", head: true })
    .not("auth_user_id", "is", null);
  const otherClasses = await supabase
    .from("classes")
    .select("id", { count: "exact", head: true })
    .neq("name", CLASS_NAME);
  if (logins.error || otherClasses.error) fail("Unable to verify the target project is empty.");
  if (logins.count || otherClasses.count) {
    fail(`Refusing to seed ${url}: it has teacher logins or other classes (not a demo project).`);
  }
}

async function findOrInsert(
  table: "teacher_profiles" | "classes" | "missions",
  match: Record<string, string>,
  row: Record<string, unknown>,
): Promise<string> {
  let query = supabase.from(table).select("id");
  for (const [column, value] of Object.entries(match)) query = query.eq(column, value);
  const found = await query.maybeSingle();
  if (found.error) fail(`Unable to check ${table}: ${found.error.message}`);
  if (found.data) return found.data.id;
  const inserted = await supabase.from(table).insert(row as never).select("id").single();
  if (inserted.error) fail(`Unable to create ${table}: ${inserted.error.message}`);
  return inserted.data.id;
}

async function ensureAssignment(classId: string, title: string, row: Record<string, unknown>) {
  const found = await supabase
    .from("assignments")
    .select("id")
    .eq("class_id", classId)
    .eq("title", title)
    .maybeSingle();
  if (found.error) fail(`Unable to check assignment ${title}: ${found.error.message}`);
  if (found.data) return;
  const inserted = await supabase
    .from("assignments")
    .insert({ class_id: classId, title, data_mode: "real", due_at: DUE_AT, ...row } as never);
  if (inserted.error) fail(`Unable to create assignment ${title}: ${inserted.error.message}`);
}

// No auth user: the demo teacher has no login and no credentials.
const teacherId = await findOrInsert(
  "teacher_profiles",
  { display_name: TEACHER_NAME },
  { display_name: TEACHER_NAME, auth_user_id: null },
);
// No join code: guests enter only through /demo/start, never the PIN flow.
const classId = await findOrInsert(
  "classes",
  { teacher_id: teacherId, name: CLASS_NAME },
  { teacher_id: teacherId, name: CLASS_NAME, join_code: null, data_mode: "real" },
);

const warmLines = new Map<string, string[]>();
for (const { turns, ...mission } of missions) {
  const missionId = await findOrInsert(
    "missions",
    { teacher_id: teacherId, title: mission.title },
    { ...mission, teacher_id: teacherId, character_id: "default-buddy" },
  );
  const turnRows = turns.map(([prompt, targetPattern, targetExample, tier2], index) => ({
    mission_id: missionId,
    turn_order: index + 1,
    prompt,
    target_pattern: targetPattern,
    target_example: targetExample,
    hint_ladder: {
      tier1: `Try using: ${targetPattern ?? mission.target_pattern}`,
      tier2,
      tier3: `Say: ${targetExample}`,
    },
    answer_shape: "open",
  }));
  const turnsSaved = await supabase
    .from("mission_turn_templates")
    .upsert(turnRows, { onConflict: "mission_id,turn_order" });
  if (turnsSaved.error) fail(`Unable to save ${mission.title} turns: ${turnsSaved.error.message}`);

  const snapshot = buildMissionSnapshot({
    mission: { ...mission, id: missionId, character_id: "default-buddy" },
    turns: turnRows,
  });
  await ensureAssignment(classId, mission.title, { mission_id: missionId, mission_snapshot: snapshot });
  warmLines.set(snapshot.characterId, [
    ...(warmLines.get(snapshot.characterId) ?? []),
    ...collectAssignmentWarmupLines(snapshot),
  ]);
}

const bankWords = PRONUNCIATION_WORDS.map(
  (text) =>
    PRONUNCIATION_WORD_BANK.find(
      (entry) =>
        entry.soundId === PRONUNCIATION.soundId &&
        entry.difficulty === PRONUNCIATION.difficulty &&
        entry.text === text,
    ) ?? fail(`${text} is not a verified ${PRONUNCIATION.soundId} word.`),
);
const pronunciationSnapshot = pronunciationPracticeSnapshotSchema.parse({
  kind: "pronunciation",
  version: 1,
  soundId: PRONUNCIATION.soundId,
  difficulty: PRONUNCIATION.difficulty,
  requiredWords: 5,
  soundClipVersion: "v1",
  words: bankWords.map((entry, index) => ({
    order: index + 1,
    text: entry.text,
    highlightStart: entry.highlightStart,
    highlightLength: entry.highlightLength,
    source: "verified",
    pronunciation: {
      phones: entry.phones,
      targetPhoneIndex: entry.targetPhoneIndex,
      cmuVariant: entry.cmuVariant,
    },
    wordAudio: {
      schemaVersion: PRONUNCIATION_WORD_AUDIO.schemaVersion,
      contentHash: buildPronunciationWordAudioSpec({ word: entry.text, phones: entry.phones })
        .contentHash,
      voice: PRONUNCIATION_WORD_AUDIO.voice,
      format: PRONUNCIATION_WORD_AUDIO.format,
    },
  })),
});
await ensureAssignment(classId, PRONUNCIATION.title, {
  mission_id: null,
  assignment_kind: "pronunciation",
  mission_snapshot: pronunciationSnapshot,
});

// Cache-first audio, so guests don't pay per play. Re-run the seed to retry failures.
const wordAudio = await warmPronunciationWordAudio({
  words: bankWords.map((entry) => ({ word: entry.text, phones: entry.phones })),
});
let lineFailures = 0;
for (const [characterId, texts] of warmLines) {
  const lines = await warmTtsAudioCache({ characterId, voice: DEFAULT_COCO_TTS_VOICE, texts });
  lineFailures += lines.failed;
}

console.log(`Demo seed ready at ${url}`);
console.log(`Word audio failures: ${wordAudio.failed}; Coco line failures: ${lineFailures}`);
console.log(`DEMO_CLASS_ID=${classId}`);
if (wordAudio.failed) process.exitCode = 1;
