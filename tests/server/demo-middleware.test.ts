import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, middleware } from "@/middleware";

const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
);
const createSupabaseServerClient = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server-auth", () => ({ createSupabaseServerClient }));
const { requireTeacherProfile, bootstrapTeacherProfile } = await import("@/server/auth/teacher-profile");
const { signupAction } = await import("@/app/teacher/actions");

afterEach(() => vi.unstubAllEnvs());

function enableDemo() {
  vi.stubEnv("DEMO_MODE", "true");
  vi.stubEnv("DEMO_CLASS_ID", "7a1e4c2b-9d3f-4a8e-b1c2-3d4e5f6a7b8c");
}

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("teacher surfaces on the demo deployment", () => {
  it.each(["/auth/login", "/auth/signup", "/teacher", "/teacher/classes/x", "/api/teacher/queue-snapshot"])(
    "redirects %s to the demo landing",
    (path) => {
      enableDemo();
      expect(matches(path)).toBe(true);
      const res = middleware(new NextRequest(`http://localhost${path}`));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/");
    },
  );

  it.each(["/", "/student/home", "/teachers-lounge", "/demo/start"])("never runs on %s", (path) => {
    expect(matches(path)).toBe(false);
  });

  it("leaves teacher pages alone when the demo gate is off", () => {
    vi.stubEnv("DEMO_MODE", "");
    const res = middleware(new NextRequest("http://localhost/teacher"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

// Server actions are callable by id from any path, so the middleware alone
// cannot close teacher actions; the shared teacher gates must refuse too.
describe("teacher server actions on the demo deployment", () => {
  it.each([
    ["requireTeacherProfile", () => requireTeacherProfile()],
    ["bootstrapTeacherProfile", () => bootstrapTeacherProfile("Mallory")],
    ["signupAction", () => signupAction(undefined as never, new FormData())],
  ])("%s redirects to the landing without touching auth", async (_name, call) => {
    enableDemo();
    await expect(call()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
