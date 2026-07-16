import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { generatePin, hashPin } from "@/domain/classroom/pin";
import {
  normalizeRosterName,
  parseRosterPaste,
} from "@/domain/classroom/roster-parser";

// Roster service (CLASS-02, CLASS-03, AUTH-04 roster side).
//
// Every read/write here goes through the RLS-bound SSR *user* client
// (createSupabaseServerClient), never the service-role client. RLS plus an
// explicit class-ownership check both apply, so a teacher can only touch the
// roster of a class they own (D-15). Plaintext PINs are never persisted — only
// the salted+peppered hash from hashPin — and a freshly generated PIN is
// returned to the caller exactly once for one-time display.

// Public roster row: deliberately excludes pin_hash. There is no plaintext PIN
// column to select, so a roster read can never leak PIN material.
export type RosterStudent = {
  id: string;
  displayName: string;
};

export type GeneratedPin = {
  studentId: string;
  displayName: string;
  // Cleartext PIN — returned ONCE at generation/reset time for one-time display.
  // Never re-read from a later listRoster call.
  pin: string;
};

export type AddStudentsResult = {
  added: RosterStudent[];
  // One-time cleartext PINs for the students just created.
  pins: GeneratedPin[];
  // Surfaced (never silently dropped) input issues from the paste.
  blankCount: number;
  duplicates: string[];
  skippedExisting: string[];
};

// Confirm the class exists AND is visible to the current teacher under RLS.
// A class owned by another teacher resolves to no row (RLS), which we treat as
// a hard ownership failure rather than leaking existence.
async function assertOwnedClass(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  classId: string,
): Promise<void> {
  const result = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .maybeSingle();

  if (result.error) {
    throw new Error(`Unable to load class: ${result.error.message}`);
  }
  if (!result.data) {
    throw new Error("Class not found or not owned by the current teacher.");
  }
}

// List the active (non-archived) roster for an owned class. Selects only
// PIN-free public columns.
export async function listRoster(classId: string): Promise<RosterStudent[]> {
  const supabase = await createSupabaseServerClient();
  await assertOwnedClass(supabase, classId);

  const result = await supabase
    .from("students")
    .select("id, display_name")
    .eq("class_id", classId)
    .is("archived_at", null)
    .order("display_name", { ascending: true });

  if (result.error) {
    throw new Error(`Unable to load roster: ${result.error.message}`);
  }

  return result.data.map((row) => ({
    id: row.id,
    displayName: row.display_name,
  }));
}

// Bulk-add students from pasted names. Blank and duplicate names within the
// paste are surfaced (not silently discarded). Names already present on the
// active roster are reported as skippedExisting rather than inserted twice
// (matching the partial unique index from plan 02-01). Each inserted student
// gets an auto-generated PIN; only the hash is stored and the cleartext PIN is
// returned once.
export async function addStudents(
  classId: string,
  paste: string,
): Promise<AddStudentsResult> {
  const supabase = await createSupabaseServerClient();
  await assertOwnedClass(supabase, classId);

  const { names, blankCount, duplicates } = parseRosterPaste(paste);

  // Existing active normalized names so we don't collide with the DB unique
  // index (which would otherwise throw mid-batch).
  const existing = await supabase
    .from("students")
    .select("display_name")
    .eq("class_id", classId)
    .is("archived_at", null);

  if (existing.error) {
    throw new Error(`Unable to load roster: ${existing.error.message}`);
  }

  const existingKeys = new Set(
    existing.data.map((row) => normalizeRosterName(row.display_name)),
  );

  const added: RosterStudent[] = [];
  const pins: GeneratedPin[] = [];
  const skippedExisting: string[] = [];

  for (const rawName of names) {
    const normalized = normalizeRosterName(rawName);
    if (existingKeys.has(normalized)) {
      skippedExisting.push(rawName);
      continue;
    }
    existingKeys.add(normalized);

    const pin = generatePin();
    // Persist the normalized name as display_name so lower(display_name) (the
    // DB active-name unique index) matches the app-level dedup key exactly.
    const inserted = await supabase
      .from("students")
      .insert({
        class_id: classId,
        display_name: normalized,
        pin_hash: hashPin(pin),
      })
      .select("id, display_name")
      .single();

    if (inserted.error) {
      throw new Error(`Unable to add student: ${inserted.error.message}`);
    }

    added.push({ id: inserted.data.id, displayName: inserted.data.display_name });
    pins.push({
      studentId: inserted.data.id,
      displayName: inserted.data.display_name,
      pin,
    });
  }

  return { added, pins, blankCount, duplicates, skippedExisting };
}

// Archive a student (soft remove): set archived_at so they drop out of the
// active roster while their history is preserved (D-08, never a hard delete).
export async function archiveStudent(
  classId: string,
  studentId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await assertOwnedClass(supabase, classId);

  const result = await supabase
    .from("students")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", studentId)
    .eq("class_id", classId)
    .select("id")
    .single();

  if (result.error) {
    throw new Error(`Unable to archive student: ${result.error.message}`);
  }
}

// Generate (or reset) a student's PIN. Stores only the hash and returns the
// cleartext PIN once for one-time display. resetStudentPin is the same
// operation under the name the UI uses for an existing student.
export async function generateStudentPin(
  classId: string,
  studentId: string,
): Promise<GeneratedPin> {
  const supabase = await createSupabaseServerClient();
  await assertOwnedClass(supabase, classId);

  const pin = generatePin();

  const result = await supabase
    .from("students")
    .update({ pin_hash: hashPin(pin) })
    .eq("id", studentId)
    .eq("class_id", classId)
    .select("id, display_name")
    .single();

  if (result.error) {
    throw new Error(`Unable to set student PIN: ${result.error.message}`);
  }

  return { studentId: result.data.id, displayName: result.data.display_name, pin };
}

export async function resetStudentPin(
  classId: string,
  studentId: string,
): Promise<GeneratedPin> {
  return generateStudentPin(classId, studentId);
}

// Set a teacher-chosen PIN (Change PIN). Validates the 4-digit shape, stores
// only the hash, and returns the cleartext once for the same one-time treatment.
export async function setStudentPin(
  classId: string,
  studentId: string,
  pin: string,
): Promise<GeneratedPin> {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("PIN must be exactly 4 digits.");
  }

  const supabase = await createSupabaseServerClient();
  await assertOwnedClass(supabase, classId);

  const result = await supabase
    .from("students")
    .update({ pin_hash: hashPin(pin) })
    .eq("id", studentId)
    .eq("class_id", classId)
    .select("id, display_name")
    .single();

  if (result.error) {
    throw new Error(`Unable to set student PIN: ${result.error.message}`);
  }

  return { studentId: result.data.id, displayName: result.data.display_name, pin };
}
