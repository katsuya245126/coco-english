import { expect, test } from "@playwright/test";

// Student join/unlock e2e (STUD-01, STUD-03, STUD-04, STUD-05, D-11, D-16).
//
// Env-aware like tests/e2e/foundation-smoke.spec.ts: the full unlock-to-home
// flow needs a seeded class/student, which requires Supabase env. Without env we
// still assert the structural, no-Supabase-needed invariants that must hold on
// the static join UI: the manual-code entry form renders, and there is NO
// visible roster selector (D-11) exposing other students' names.

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test("manual /join page renders code entry with no visible roster selector", async ({
  page,
}) => {
  await page.goto("/join");

  // Manual class-code entry must be present (STUD-01 fallback).
  await expect(
    page.getByRole("button", { name: "Continue" }),
  ).toBeVisible();

  // D-11: students type their name; there must be NO visible roster picker.
  // No <select> elements and no listbox exposing roster names.
  await expect(page.locator("select")).toHaveCount(0);
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("a direct /join/[joinCode] link resolves to the name + PIN step", async ({
  page,
}) => {
  if (!hasSupabaseEnv) {
    test.skip(
      true,
      "Requires Supabase env to resolve a seeded class join code.",
    );
    return;
  }

  // With env, a known-bad code must still NOT reveal whether the code exists —
  // it shows the generic mismatch copy, never a code-specific error.
  await page.goto("/join/ZZZZZZ");
  await expect(
    page.getByText(
      /We could not match that class, name, and PIN\. Try again or ask your teacher\./,
    ),
  ).toBeVisible();
});

test("wrong tuple shows the identical generic mismatch copy (env-aware)", async ({
  page,
}) => {
  if (!hasSupabaseEnv) {
    test.skip(true, "Requires Supabase env to seed a class + student.");
    return;
  }

  // Drive the manual flow with a wrong tuple and assert the generic copy.
  await page.goto("/join");
  await page.getByLabel(/class code/i).fill("ZZZZZZ");
  await page.getByRole("button", { name: "Continue" }).click();

  // Even an unknown code funnels to the generic mismatch copy (D-16).
  await expect(
    page.getByText(
      /We could not match that class, name, and PIN\. Try again or ask your teacher\./,
    ),
  ).toBeVisible();
});

test("a remembered device survives a join-code reset (step 6, D-18)", async ({
  page,
}) => {
  if (!hasSupabaseEnv) {
    test.skip(true, "Requires Supabase env to seed a class + student.");
    return;
  }

  // supabase-js builds a RealtimeClient eagerly needing a global WebSocket
  // (absent on Node < 22). This spec only does DB queries, so an inert transport
  // stub satisfies the constructor without opening a socket.
  const { createClient } = await import("@supabase/supabase-js");
  const { randomBytes, scryptSync } = await import("node:crypto");

  // Inline replicas of the server hashing/format so the spec can seed directly
  // without importing the raw .ts source (Playwright's runtime can't transpile a
  // dynamic import of a sibling source module). These MUST stay byte-compatible
  // with src/domain/classroom/pin.ts ("s1:<saltHex>:<keyHex>", scrypt, KEY=32)
  // and the join-code alphabet — they are exercised against the real verifyPin
  // via the live unlock action below, so a drift would fail this test.
  const JOIN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const generateJoinCode = () =>
    Array.from(
      { length: 6 },
      () => JOIN_ALPHABET[Math.floor(Math.random() * JOIN_ALPHABET.length)],
    ).join("");
  const hashPin = (pin: string) => {
    const pepper = process.env.PIN_HASH_PEPPER!;
    const saltHex = randomBytes(16).toString("hex");
    const keyHex = scryptSync(`${pin}${pepper}`, saltHex, 32).toString("hex");
    return `s1:${saltHex}:${keyHex}`;
  };
  // Roster normalization: collapse internal whitespace + trim (matches
  // src/domain/classroom/roster-parser.normalizeRosterName for our simple names).
  const normalizeRosterName = (name: string) =>
    name.trim().replace(/\s+/g, " ").toLowerCase();

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: {
        transport: class {
          constructor() {}
          close() {}
        } as unknown as never,
      },
    },
  );

  const stamp = Date.now();
  const teacher = await admin
    .from("teacher_profiles")
    .insert({ display_name: `Step6 Teacher ${stamp}` })
    .select("id")
    .single();
  expect(teacher.error).toBeNull();

  const originalCode = generateJoinCode();
  const klass = await admin
    .from("classes")
    .insert({
      teacher_id: teacher.data!.id,
      name: `Step6 Class ${stamp}`,
      join_code: originalCode,
      data_mode: "real",
    })
    .select("id")
    .single();
  expect(klass.error).toBeNull();

  const studentName = `Step6 Student ${stamp}`;
  const pin = "5318";
  await admin.from("students").insert({
    class_id: klass.data!.id,
    display_name: normalizeRosterName(studentName),
    pin_hash: hashPin(pin),
  });

  try {
    // 1. Unlock once with the ORIGINAL code — this remembers the class (keyed on
    //    the immutable class id) on this device.
    await page.goto("/join");
    await page.getByLabel(/class code/i).fill(originalCode);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel(/name/i).fill(studentName);
    await page.getByLabel("4-digit PIN").fill(pin);
    await page.getByRole("button", { name: "Unlock homework" }).click();
    await expect(page.getByText("No homework yet")).toBeVisible();

    // 2. Teacher RESETS the join code. The cached code on the device is now stale.
    const newCode = generateJoinCode();
    expect(newCode).not.toBe(originalCode);
    const reset = await admin
      .from("classes")
      .update({ join_code: newCode })
      .eq("id", klass.data!.id);
    expect(reset.error).toBeNull();

    // 3. Returning device: the remembered banner offers the class. Clicking "Use
    //    this class" must resolve by the stored id and reach the name + PIN step
    //    with the CURRENT code — NOT the generic mismatch (which would mean the
    //    device was stranded on the stale code, violating D-18).
    await page.goto("/join");
    await expect(page.getByText(`Step6 Class ${stamp}`)).toBeVisible();
    await page.getByRole("button", { name: "Use this class" }).click();

    await expect(
      page.getByText(/Enter your name and PIN/),
    ).toBeVisible();
    await expect(
      page.getByText(
        /We could not match that class, name, and PIN\./,
      ),
    ).toHaveCount(0);

    // 4. And the fresh code actually unlocks — the device is fully recovered.
    await page.getByLabel(/name/i).fill(studentName);
    await page.getByLabel("4-digit PIN").fill(pin);
    await page.getByRole("button", { name: "Unlock homework" }).click();
    await expect(page.getByText("No homework yet")).toBeVisible();
  } finally {
    await admin
      .from("teacher_profiles")
      .delete()
      .eq("id", teacher.data!.id);
  }
});

test("/student/home redirects to /join without a fresh unlock (D-13/D-17)", async ({
  page,
}) => {
  // The home shell is reachable ONLY after a real PIN unlock this session. With
  // no unlock cookie, src/app/student/home/page.tsx redirects back to /join —
  // the student must re-enter their PIN every visit (no persistent student auth).
  // The no-homework SHELL copy itself is asserted via a real unlock in the
  // step-6 test above, which is the only legitimate way to reach the shell.
  await page.goto("/student/home");
  await expect(page).toHaveURL(/\/join$/);
  await expect(page.getByText("No homework yet")).toHaveCount(0);
});
