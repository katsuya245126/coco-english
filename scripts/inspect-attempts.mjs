import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import {
  formatAssignmentPolicy,
  formatAttemptTurn,
  formatInspectionFilters,
  formatInspectionSampling,
  fetchAllPages,
  isTestClass,
  parseConfiguredTestClassIds,
  resolveAttemptPrompt,
} from "./lib/attempt-report.mjs";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: node scripts/inspect-attempts.mjs [--include-test] [--show-unattempted]

Interactive: prompts for scope (all / class / student / assignment) and how
many recent attempts to inspect, then prints each attempt's turns with the
mission prompt, what the student said (original + repeat transcript), and how
it was graded (evaluation outcome, correction, severity, confidence) plus any
pronunciation score.

Excludes built-in fixture classes and class IDs configured in
INSPECT_TEST_CLASS_IDS (comma-separated) unless --include-test is passed.
Configured ID values are never printed. --include-test explicitly includes
that test traffic in the report.

Assignment/student pairs with zero attempts are skipped by default (the
student was assigned the mission but never recorded anything); pass
--show-unattempted to list them.

Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY (falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY, which
will only see rows RLS permits).

Saves the report to scripts/output/inspect-attempts-<timestamp>.txt and
reveals it in Finder (macOS only).
`);
  process.exit(0);
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}

loadEnvLocal();

const includeTest = process.argv.includes("--include-test");
const showUnattempted = process.argv.includes("--show-unattempted");
const INSPECTION_PAGE_SIZE = 1000;
const ATTEMPT_TIME_ID_CHUNK_SIZE = 100;
const configuredTestClassIds = parseConfiguredTestClassIds(
  process.env.INSPECT_TEST_CLASS_IDS,
);
const classFilterOptions = { includeTest, configuredTestClassIds };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or a Supabase key in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  realtime: { transport: ws },
  auth: { persistSession: false },
});

const rl = createInterface({ input: process.stdin, output: process.stdout });
async function ask(question) {
  const answer = await rl.question(question);
  return answer.trim();
}

const reportLines = [];
function report(line = "") {
  console.log(line);
  reportLines.push(line);
}

function saveReportAndReveal() {
  const outDir = path.resolve(process.cwd(), "scripts/output");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `inspect-attempts-${stamp}.txt`);
  writeFileSync(outPath, reportLines.join("\n") + "\n", "utf8");
  console.log(`\nSaved report to ${outPath}`);
  if (process.platform === "darwin") {
    execFile("open", ["-R", outPath], (err) => {
      if (err) console.error(`Could not open Finder: ${err.message}`);
    });
  }
}

async function chooseScope() {
  console.log(`
What data do you want to pull?
  1) All classes
  2) A specific class
  3) A specific student
  4) A specific assignment
`);
  const choice = await ask("Enter 1-4: ");

  if (choice === "2") {
    const { data: classes, error } = await supabase
      .from("classes")
      .select("id, name")
      .order("name");
    if (error) throw error;
    const visible = classes.filter(
      (c) => !isTestClass({ id: c.id, name: c.name }, classFilterOptions),
    );
    visible.forEach((c, i) => console.log(`  ${i + 1}) ${c.name}`));
    const idx = Number(await ask("Pick a class number: ")) - 1;
    const picked = visible[idx];
    if (!picked) throw new Error("Invalid class selection");
    return { kind: "class", classId: picked.id, label: picked.name };
  }

  if (choice === "3") {
    const namePart = await ask("Student name (partial match ok): ");
    const { data: students, error } = await supabase
      .from("students")
      .select("id, display_name, class_id, classes(id, name)")
      .ilike("display_name", `%${namePart}%`);
    if (error) throw error;
    const visible = students.filter(
      (s) =>
        !isTestClass(
          { id: s.classes?.id, name: s.classes?.name },
          classFilterOptions,
        ),
    );
    if (visible.length === 0) throw new Error("No matching students found");
    visible.forEach((s, i) =>
      console.log(`  ${i + 1}) ${s.display_name} (${s.classes?.name ?? "?"})`),
    );
    const idx =
      visible.length === 1
        ? 0
        : Number(await ask("Pick a student number: ")) - 1;
    const picked = visible[idx];
    if (!picked) throw new Error("Invalid student selection");
    return { kind: "student", studentId: picked.id, label: picked.display_name };
  }

  if (choice === "4") {
    const titlePart = await ask("Assignment title (partial match ok): ");
    const { data: assignments, error } = await supabase
      .from("assignments")
      .select("id, title, assigned_at, classes(id, name)")
      .ilike("title", `%${titlePart}%`)
      .order("assigned_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    const visible = assignments.filter(
      (a) =>
        !isTestClass(
          { id: a.classes?.id, name: a.classes?.name },
          classFilterOptions,
        ),
    );
    if (visible.length === 0) throw new Error("No matching assignments found");
    visible.forEach((a, i) =>
      console.log(
        `  ${i + 1}) ${a.title} — ${a.classes?.name ?? "?"} (${a.assigned_at})`,
      ),
    );
    const idx =
      visible.length === 1
        ? 0
        : Number(await ask("Pick an assignment number: ")) - 1;
    const picked = visible[idx];
    if (!picked) throw new Error("Invalid assignment selection");
    return { kind: "assignment", assignmentId: picked.id, label: picked.title };
  }

  return { kind: "all", label: "All classes" };
}

async function fetchAssignmentStudentIds(scope) {
  let rows = await fetchAllPages(
    async (from, to) => {
      let query = supabase.from("assignment_students").select(
        `
    id,
    students ( id, display_name ),
    assignments ( id, title, assigned_at, mission_snapshot, classes ( id, name ) )
  `,
      );

      if (scope.kind === "student")
        query = query.eq("student_id", scope.studentId);
      if (scope.kind === "assignment")
        query = query.eq("assignment_id", scope.assignmentId);

      const { data, error } = await query
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data ?? [];
    },
    { pageSize: INSPECTION_PAGE_SIZE },
  );

  if (scope.kind === "class") {
    rows = rows.filter((r) => r.assignments?.classes?.id === scope.classId);
  }

  rows = rows.filter((r) =>
    !isTestClass(
      {
        id: r.assignments?.classes?.id,
        name: r.assignments?.classes?.name,
      },
      classFilterOptions,
    ),
  );

  // Sort by when the student last *practiced*, not when the teacher assigned
  // the mission. A fresh recording often hangs off an older assignment, so
  // ordering by assigned_at buries recent activity behind students whose
  // missions merely happened to be handed out later. Rows with no attempts
  // fall back to assigned_at and therefore sort below any real activity.
  const latestAttemptAt = new Map();
  for (let start = 0; start < rows.length; start += ATTEMPT_TIME_ID_CHUNK_SIZE) {
    const assignmentStudentIds = rows
      .slice(start, start + ATTEMPT_TIME_ID_CHUNK_SIZE)
      .map((r) => r.id);
    const attemptTimes = await fetchAllPages(
      async (from, to) => {
        const { data, error } = await supabase
          .from("attempts")
          .select("id, assignment_student_id, started_at")
          .in("assignment_student_id", assignmentStudentIds)
          .order("assignment_student_id", { ascending: true })
          .order("started_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      },
      { pageSize: INSPECTION_PAGE_SIZE },
    );

    for (const a of attemptTimes) {
      const at = new Date(a.started_at ?? 0).getTime();
      const prev = latestAttemptAt.get(a.assignment_student_id) ?? 0;
      if (at > prev) latestAttemptAt.set(a.assignment_student_id, at);
    }
  }

  const sortKey = (r) =>
    latestAttemptAt.get(r.id) ??
    new Date(r.assignments?.assigned_at ?? 0).getTime();

  rows.sort((a, b) => {
    // Any row with real attempts outranks every never-attempted row.
    const aHas = latestAttemptAt.has(a.id);
    const bHas = latestAttemptAt.has(b.id);
    if (aHas !== bHas) return aHas ? -1 : 1;
    return sortKey(b) - sortKey(a);
  });

  return rows;
}

async function printAttemptsFor(assignmentStudentRow) {
  const attempts = await fetchAllPages(
    async (from, to) => {
      const { data, error } = await supabase
        .from("attempts")
        .select(
          "id, status, started_at, completed_at, created_at, updated_at, needs_review_reason",
        )
        .eq("assignment_student_id", assignmentStudentRow.id)
        .order("started_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return data ?? [];
    },
    { pageSize: INSPECTION_PAGE_SIZE },
  );

  // An assignment/student pair with no attempts means the mission was
  // assigned but the student never recorded anything. Printing a bare header
  // for it is noise, and it burns a slot in the --limit budget.
  if ((attempts ?? []).length === 0 && !showUnattempted) return false;

  const snapshot = assignmentStudentRow.assignments?.mission_snapshot;
  const modeLabel =
    snapshot?.conversationMode === true ? "chat/dynamic" : "preset";
  report(
    `\n\n=== ${assignmentStudentRow.students?.display_name ?? "?"} — ${assignmentStudentRow.assignments?.title ?? "?"} (${assignmentStudentRow.assignments?.classes?.name ?? "?"}) [${modeLabel}] ===`,
  );
  for (const line of formatAssignmentPolicy(snapshot)) report(line);
  if ((attempts ?? []).length === 0) {
    report("  (assigned but never attempted)");
    return true;
  }

  // Preset missions (conversationMode !== true) never populate
  // attempt_turns.mission_turn_template_id, so the mission_turn_templates
  // join below comes back empty even though the turn's prompt/target exist
  // — they're embedded per-turn in the assignment's mission_snapshot instead.
  const snapshotTurnsByOrder = new Map(
    (snapshot?.turns ?? []).map((t) => [t.turnOrder, t]),
  );

  for (const attempt of attempts) {
    report(
      `\n--- Attempt ${attempt.id} (${attempt.status}) started ${attempt.started_at} completed ${attempt.completed_at ?? "—"} created ${attempt.created_at ?? "—"} updated ${attempt.updated_at ?? "—"} ---`,
    );
    if (attempt.needs_review_reason)
      report(`  needs_review_reason: ${attempt.needs_review_reason}`);

    const { data: turns, error: turnsError } = await supabase
      .from("attempt_turns")
      .select(
        `
        turn_order, original_transcript, improved_sentence, repeat_transcript,
        evaluation, target_attempted, repeat_accepted, hint_level_used, coco_line,
        reply_hint_frame,
        created_at, updated_at, moderation_event,
        mission_turn_templates ( prompt, target_example, hint_ladder ),
        audio_clips ( clip_kind, processing_status, duration_ms, byte_size, mime_type,
          created_at, updated_at,
          pronunciation_scores ( accuracy_score, fluency_score, completeness_score, pronunciation_score, star_band ) )
      `,
      )
      .eq("attempt_id", attempt.id)
      .order("turn_order");
    if (turnsError) throw turnsError;

    let previousCocoLine = null;
    for (const turn of turns ?? []) {
      const promptContext = resolveAttemptPrompt({
        turn,
        snapshotTurnsByOrder,
        conversationMode: snapshot?.conversationMode === true,
        previousCocoLine,
      });
      const snapshotTurn = promptContext.snapshotTurn;
      const effectiveTurnPolicy = {
        ...(snapshotTurn ?? {}),
        targetExample:
          turn.mission_turn_templates?.target_example ??
          snapshotTurn?.targetExample,
        hintLadder:
          turn.mission_turn_templates?.hint_ladder ??
          snapshotTurn?.hintLadder,
      };
      for (const line of formatAttemptTurn(turn, {
        promptAnswered: promptContext.promptAnswered,
        snapshotTurn: effectiveTurnPolicy,
        conversationMode: snapshot?.conversationMode === true,
        generatedTurn: promptContext.generatedTurn,
        targetPattern: snapshot?.targetPattern ?? null,
      })) {
        report(line);
      }
      if (snapshot?.conversationMode === true) {
        previousCocoLine = turn.coco_line ?? null;
      }
    }
  }

  return true;
}

async function main() {
  const scope = await chooseScope();
  const limitAnswer = await ask(
    "How many recent students/assignment-pairs to inspect? (default 5): ",
  );
  const limit = Number(limitAnswer) > 0 ? Number(limitAnswer) : 5;
  rl.close();

  const rows = await fetchAssignmentStudentIds(scope);

  for (const line of formatInspectionFilters({
    scopeLabel: scope.label,
    includeTest,
    configuredTestClassCount: configuredTestClassIds.size,
    showUnattempted,
    rowCap: limit,
    pageSize: INSPECTION_PAGE_SIZE,
  })) {
    report(line);
  }

  if (rows.length === 0) {
    for (const line of formatInspectionSampling({
      candidateRows: 0,
      scannedRows: 0,
      shownRows: 0,
    })) {
      report(line);
    }
    report("No matching assignment/student rows found.");
    saveReportAndReveal();
    return;
  }

  // `limit` counts rows actually shown, so unattempted pairs don't eat the
  // budget — keep walking the (newest-first) list until we've shown `limit`.
  let shown = 0;
  let scanned = 0;
  for (const row of rows) {
    if (shown >= limit) break;
    scanned += 1;
    if (await printAttemptsFor(row)) shown += 1;
  }

  if (shown === 0) {
    report(
      "\n\nNo attempts found for any matching row (pass --show-unattempted to list assigned-but-never-attempted pairs).",
    );
  }

  for (const line of formatInspectionSampling({
    candidateRows: rows.length,
    scannedRows: scanned,
    shownRows: shown,
  })) {
    report(line);
  }
  saveReportAndReveal();
}

main().catch((error) => {
  console.error("Failed:", error.message);
  process.exit(1);
});
