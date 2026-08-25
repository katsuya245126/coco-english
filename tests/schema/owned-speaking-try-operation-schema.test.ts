import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202608250001_owned_speaking_try_operation.sql",
  "utf8",
)
  .toLowerCase()
  .replace(/\s+/g, " ");

const functionSignature =
  "public.owned_speaking_try_operation(uuid, uuid, uuid, text, jsonb)";

describe("owned speaking-try operation migration", () => {
  it("exposes the security-definer boundary only to service_role", () => {
    expect(migration).toContain(
      `revoke execute on function ${functionSignature} from public, anon, authenticated;`,
    );
    expect(migration).toContain(
      `grant execute on function ${functionSignature} to service_role;`,
    );
  });

  it("locks the ownership chain and returns the RPC-derived storage key", () => {
    expect(migration).toContain("for update of asg, a, att;");
    expect(migration).toContain(
      "v_value := jsonb_build_object('object_key', v_expected_object_key);",
    );
    expect(migration).toContain(
      "where ac.id = v_audio_clip_id and ac.attempt_turn_id = v_attempt_turn_id and t.attempt_id = v_attempt_id",
    );
  });
});
