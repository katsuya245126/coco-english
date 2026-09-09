import { describe, expect, it } from "vitest";

// @ts-expect-error The runnable seed script is JavaScript and has no declaration file.
import { assertLocalSupabaseUrl, parseSupabaseStatusEnv } from "../../scripts/seed-local-teacher.mjs";

describe("seed-local-teacher bootstrap guards", () => {
  it("parses quoted and unquoted Supabase status values", () => {
    expect(
      parseSupabaseStatusEnv(
        'API_URL="http://127.0.0.1:54321"\nSECRET_KEY="quoted-key"\n',
      ),
    ).toEqual({ url: "http://127.0.0.1:54321", serviceRoleKey: "quoted-key" });

    expect(
      parseSupabaseStatusEnv(
        "API_URL=http://localhost:54321\nSECRET_KEY=unquoted-key\n",
      ),
    ).toEqual({ url: "http://localhost:54321", serviceRoleKey: "unquoted-key" });
  });

  it("rejects hosted and non-loopback URLs at the pre-mutation guard", () => {
    for (const url of ["https://project.supabase.co", "http://192.0.2.1:54321"]) {
      expect(() => assertLocalSupabaseUrl(url)).toThrow(
        "Refusing to seed a non-local Supabase URL.",
      );
    }

    expect(() => assertLocalSupabaseUrl("http://localhost:54321")).not.toThrow();
    expect(() => assertLocalSupabaseUrl("https://127.0.0.1:54321")).not.toThrow();
  });
});
