import { execFileSync } from "node:child_process";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

export function parseSupabaseStatusEnv(output) {
  const unquote = (value) => {
    const trimmed = value.trim();
    return trimmed.startsWith('"') ? JSON.parse(trimmed) : trimmed;
  };
  const values = Object.fromEntries(
    output
      .split(/\r?\n/u)
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/u))
      .filter((match) => match)
      .map((match) => [match[1], unquote(match[2])]),
  );
  return { url: values.API_URL ?? "", serviceRoleKey: values.SECRET_KEY ?? "" };
}

export function assertLocalSupabaseUrl(url) {
  if (!url || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/u.test(url)) {
    throw new Error("Refusing to seed a non-local Supabase URL.");
  }
}

function localSupabaseStatus() {
  let output;
  try {
    output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("Start local Supabase before seeding the teacher account.");
  }

  return parseSupabaseStatusEnv(output);
}

async function seedLocalTeacher() {
  loadEnvFile(new URL("../.env.local", import.meta.url));

  const { url: supabaseUrl, serviceRoleKey } = localSupabaseStatus();
  const email = process.env.LOCAL_TEACHER_EMAIL?.trim() ?? "";
  const password = process.env.LOCAL_TEACHER_PASSWORD ?? "";
  const displayName = process.env.LOCAL_TEACHER_DISPLAY_NAME?.trim() ?? "";

  assertLocalSupabaseUrl(supabaseUrl);
  if (!serviceRoleKey || !email || !password || !displayName) {
    throw new Error(
      "Set LOCAL_TEACHER_EMAIL, LOCAL_TEACHER_PASSWORD, and LOCAL_TEACHER_DISPLAY_NAME in .env.local, and start local Supabase.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;

  const matches = users.data.users.filter(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  );
  if (matches.length > 1) {
    throw new Error(`More than one local auth user matches ${email}.`);
  }

  const existing = matches[0];
  const user = existing
    ? await supabase.auth.admin.updateUserById(existing.id, {
        email,
        password,
        email_confirm: true,
        user_metadata: { ...existing.user_metadata, display_name: displayName },
      })
    : await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });
  if (user.error || !user.data.user) throw user.error ?? new Error("User was not returned.");

  const profile = await supabase
    .from("teacher_profiles")
    .upsert(
      { auth_user_id: user.data.user.id, display_name: displayName },
      { onConflict: "auth_user_id" },
    )
    .select("id")
    .single();
  if (profile.error) throw profile.error;

  console.log(`Local teacher ready: ${email} (profile ${profile.data.id})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await seedLocalTeacher();
}
