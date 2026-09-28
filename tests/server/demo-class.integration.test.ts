import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/types";
import { getStudentAudioBucketId } from "@/server/student-access/audio-storage";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const canRunLocally =
  /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/.test(url) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createAdminClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: class { close() {} } as unknown as never },
  });
}
type Admin = Awaited<ReturnType<typeof createAdminClient>>;

function must<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error || result.data === null) throw result.error ?? new Error("no data");
  return result.data as NonNullable<T>;
}

const snapshot = {
  kind: "pronunciation",
  version: 1,
  soundId: "f",
  difficulty: "easy",
  requiredWords: 1,
  soundClipVersion: "v1",
  words: [
    {
      order: 1,
      text: "fan",
      highlightStart: 0,
      highlightLength: 1,
      source: "verified",
      pronunciation: { phones: ["F", "AE1", "N"], targetPhoneIndex: 0, cmuVariant: 1 },
      wordAudio: {
        schemaVersion: 1,
        contentHash: "demo-integration-fan",
        voice: "en-US-AvaNeural",
        format: "audio-24khz-48kbitrate-mono-mp3",
      },
    },
  ],
};

// Two classes with one assignment each: the demo class and a stand-in for a
// real class that must never be touched by demo code.
async function createClass(admin: Admin, label: string) {
  const suffix = randomBytes(8).toString("hex");
  const teacherId = must(
    await admin.from("teacher_profiles").insert({ display_name: `${label} ${suffix}` }).select("id").single(),
  ).id;
  const classId = must(
    await admin
      .from("classes")
      .insert({ teacher_id: teacherId, name: `${label} class`, join_code: `D${suffix}`.slice(0, 12), data_mode: "real" })
      .select("id")
      .single(),
  ).id;
  const assignmentId = must(
    await admin
      .from("assignments")
      .insert({
        class_id: classId,
        mission_id: null,
        assignment_kind: "pronunciation",
        title: `${label} practice`,
        mission_snapshot: snapshot,
        data_mode: "real",
      })
      .select("id")
      .single(),
  ).id;
  return { teacherId, classId, assignmentId };
}

async function upload(admin: Admin, key: string) {
  const { error } = await admin.storage
    .from(getStudentAudioBucketId())
    .upload(key, new Blob(["x"], { type: "audio/webm" }), { contentType: "audio/webm" });
  if (error) throw error;
}

async function listPrefix(admin: Admin, prefix: string) {
  const { data, error } = await admin.storage.from(getStudentAudioBucketId()).list(prefix);
  if (error) throw error;
  return data ?? [];
}

describe("demo class integration", () => {
  it(
    "creates demo students only in the demo class and resets only the demo class, audio included",
    async (context) => {
      if (!canRunLocally) {
        context.skip();
        return;
      }
      const admin = await createAdminClient();
      const demo = await createClass(admin, "Demo");
      const real = await createClass(admin, "Real");
      try {
        const { createDemoStudent } = await import("@/server/demo/demo-student");
        const { resetDemoClass } = await import("@/server/demo/demo-reset");

        const guest = await createDemoStudent(demo.classId);
        expect(guest.displayName).toMatch(/^Guest [0-9A-F]{6}$/);

        const guestRows = must(
          await admin.from("assignment_students").select("id, assignment_id").eq("student_id", guest.studentId),
        );
        expect(guestRows.map((row) => row.assignment_id)).toEqual([demo.assignmentId]);
        const guestStudent = must(
          await admin.from("students").select("class_id, pin_hash").eq("id", guest.studentId).single(),
        );
        expect(guestStudent).toEqual({ class_id: demo.classId, pin_hash: null });

        const realStudentId = must(
          await admin.from("students").insert({ class_id: real.classId, display_name: "Real kid" }).select("id").single(),
        ).id;
        const realAssignmentStudentId = must(
          await admin
            .from("assignment_students")
            .insert({ assignment_id: real.assignmentId, student_id: realStudentId, status: "assigned" })
            .select("id")
            .single(),
        ).id;

        const demoPrefix = `${guestRows[0]!.id}/attempt/1`;
        const realPrefix = `${realAssignmentStudentId}/attempt/1`;
        await upload(admin, `${demoPrefix}/original-a.webm`);
        await upload(admin, `${realPrefix}/original-b.webm`);

        const result = await resetDemoClass(demo.classId);
        expect(result).toEqual({ removedObjects: 1, deletedStudents: 1 });

        expect(await listPrefix(admin, demoPrefix)).toHaveLength(0);
        expect(await listPrefix(admin, realPrefix)).toHaveLength(1);
        expect(must(await admin.from("students").select("id").eq("class_id", demo.classId))).toHaveLength(0);
        expect(must(await admin.from("students").select("id").eq("class_id", real.classId))).toHaveLength(1);
        expect(must(await admin.from("assignments").select("id").eq("class_id", demo.classId))).toHaveLength(1);
      } finally {
        const realRows = await admin.from("assignment_students").select("id").eq("assignment_id", real.assignmentId);
        const keys = (realRows.data ?? []).map((row) => `${row.id}/attempt/1/original-b.webm`);
        if (keys.length) await admin.storage.from(getStudentAudioBucketId()).remove(keys);
        await admin.from("teacher_profiles").delete().in("id", [demo.teacherId, real.teacherId]);
      }
    },
    30_000,
  );
});
