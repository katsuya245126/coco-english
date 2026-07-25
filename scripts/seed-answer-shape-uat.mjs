// Seeds LOCAL Supabase with a preset mission for the answer-shape UAT.
//
// Two turns, deliberately one of each shape:
//   turn 1 = "open"  -> the ice-cream opinion question from the 2026-07-24 bug
//   turn 2 = "fixed" -> a repeat-after-me drill that must STILL be corrected
//
// Local only. Refuses to run against a non-local database.
//
//   node scripts/seed-answer-shape-uat.mjs

import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";

// Mirrors hashPin() in src/domain/classroom/pin.ts ("s1:<saltHex>:<keyHex>",
// scrypt over pin+pepper). Reimplemented rather than imported because that
// module is TypeScript and this script runs on plain node. The pepper must
// match the one the dev server uses or the PIN will not verify.
function hashPin(pin, pepper) {
  const saltHex = randomBytes(16).toString("hex");
  const keyHex = scryptSync(`${pin}${pepper}`, saltHex, 32).toString("hex");
  return `s1:${saltHex}:${keyHex}`;
}

function readPepper() {
  if (process.env.PIN_HASH_PEPPER) return process.env.PIN_HASH_PEPPER;
  for (const file of [".env.local", ".env"]) {
    try {
      const match = readFileSync(file, "utf8").match(
        /^\s*PIN_HASH_PEPPER\s*=\s*(.*)$/m,
      );
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    } catch {
      // file absent — try the next one
    }
  }
  throw new Error(
    "PIN_HASH_PEPPER not found in env or .env.local/.env. The seeded PIN " +
      "would not verify against the dev server without it.",
  );
}

const CONTAINER = "supabase_db_english-speaking-practice";

const CLASS_NAME = "Answer Shape UAT";
const JOIN_CODE = "SHAPE1";
const STUDENT_NAME = "Test Student";
const STUDENT_PIN = "1234";
const MISSION_TITLE = "Ice Cream Opinions";
const TARGET_PATTERN = "I think ___ is the best.";

function sql(statement) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-c",
      statement,
    ],
    { encoding: "utf8" },
  ).trim();
}

function lit(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Guard: this script writes fixture rows, so make sure we are on the local DB.
const port = sql("show port;");
if (port !== "5432") {
  throw new Error(`Refusing to run: unexpected port ${port}`);
}

const turns = [
  {
    turnOrder: 1,
    prompt: "Which ice cream is the best: vanilla, strawberry, or chocolate?",
    targetExample: "I think vanilla ice cream is the best.",
    answerShape: "open",
    hintLadder: {
      tier1: "Try using: I think ___ is the best.",
      tier2: "Choose your own words for: I think ___ is the best.",
      tier3: "Use this sentence frame: I think ___ is the best.",
    },
  },
  {
    turnOrder: 2,
    prompt: 'Say this: "Nice to meet you."',
    targetExample: "Nice to meet you.",
    answerShape: "fixed",
    hintLadder: {
      tier1: "Try using: Nice to meet you.",
      tier2: "Say it just like the example.",
      tier3: "Repeat: Nice to meet you.",
    },
  },
];

const teacherId = sql("select id from teacher_profiles limit 1;");
if (!teacherId) {
  throw new Error("No teacher_profiles row found — seed a teacher first.");
}

// Clean any previous run so the script is re-runnable.
sql(`delete from classes where join_code = ${lit(JOIN_CODE)};`);
sql(
  `delete from missions where title = ${lit(MISSION_TITLE)} and teacher_id = ${lit(teacherId)};`,
);

const classId = randomUUID();
const studentId = randomUUID();
const missionId = randomUUID();
const assignmentId = randomUUID();

sql(
  `insert into classes (id, teacher_id, name, join_code, data_mode)
   values (${lit(classId)}, ${lit(teacherId)}, ${lit(CLASS_NAME)}, ${lit(JOIN_CODE)}, 'real');`,
);

sql(
  `insert into students (id, class_id, display_name, pin_hash)
   values (${lit(studentId)}, ${lit(classId)}, ${lit(STUDENT_NAME)}, ${lit(hashPin(STUDENT_PIN, readPepper()))});`,
);

sql(
  `insert into missions
     (id, teacher_id, title, target_pattern, topic, level, required_turns,
      character_id, conversation_mode, require_complete_sentence_answers)
   values
     (${lit(missionId)}, ${lit(teacherId)}, ${lit(MISSION_TITLE)},
      ${lit(TARGET_PATTERN)}, 'Opinions and preferences', 'elementary',
      ${turns.length}, 'default-buddy', false, true);`,
);

for (const turn of turns) {
  sql(
    `insert into mission_turn_templates
       (mission_id, turn_order, prompt, target_example, hint_ladder, answer_shape)
     values
       (${lit(missionId)}, ${turn.turnOrder}, ${lit(turn.prompt)},
        ${lit(turn.targetExample)}, ${lit(JSON.stringify(turn.hintLadder))}::jsonb,
        ${lit(turn.answerShape)});`,
  );
}

// The evaluator reads answerShape from this snapshot at runtime, not from the
// templates table — so the snapshot is what the UAT actually exercises.
const snapshot = {
  missionId,
  title: MISSION_TITLE,
  topic: "Opinions and preferences",
  level: "elementary",
  targetPattern: TARGET_PATTERN,
  requiredTurns: turns.length,
  characterId: "default-buddy",
  conversationMode: false,
  requireCompleteSentenceAnswers: true,
  turns,
};

sql(
  `insert into assignments
     (id, class_id, mission_id, title, mission_snapshot, data_mode, assigned_at)
   values
     (${lit(assignmentId)}, ${lit(classId)}, ${lit(missionId)}, ${lit(MISSION_TITLE)},
      ${lit(JSON.stringify(snapshot))}::jsonb, 'real', now());`,
);

sql(
  `insert into assignment_students (assignment_id, student_id, status)
   values (${lit(assignmentId)}, ${lit(studentId)}, 'assigned');`,
);

const check = sql(
  `select turn_order || '=' || answer_shape from mission_turn_templates
   where mission_id = ${lit(missionId)} order by turn_order;`,
);

console.log(`Seeded "${MISSION_TITLE}"`);
console.log(`  class      ${CLASS_NAME}  join code: ${JOIN_CODE}`);
console.log(`  student    ${STUDENT_NAME}  PIN: ${STUDENT_PIN}`);
console.log(`  turns      ${check.split("\n").join("  ")}`);
console.log(`  assignment ${assignmentId}`);
