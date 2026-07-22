import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    __dirname,
    "../../supabase/migrations/202607230001_conversation_answer_policy.sql",
  ),
  "utf8",
).toLowerCase();

describe("conversation answer policy schema", () => {
  it("adds a default-on mission-owned complete-sentence policy", () => {
    expect(sql).toContain("alter table public.missions");
    expect(sql).toContain(
      "require_complete_sentence_answers boolean not null default true",
    );
  });
});
