import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CLASS_ID = "7a1e4c2b-9d3f-4a8e-b1c2-3d4e5f6a7b8c";

const mocks = vi.hoisted(() => ({
  consumeRequestBudget: vi.fn(),
  isRequestBudgetExhausted: vi.fn(),
  createDemoStudent: vi.fn(),
  resetDemoClass: vi.fn(),
  networkSignal: vi.fn(async () => "203.0.113.7"),
}));

vi.mock("@/server/security/request-budget", () => ({
  consumeRequestBudget: mocks.consumeRequestBudget,
  isRequestBudgetExhausted: mocks.isRequestBudgetExhausted,
}));
vi.mock("@/server/demo/demo-student", () => ({
  createDemoStudent: mocks.createDemoStudent,
}));
vi.mock("@/server/demo/demo-reset", () => ({
  resetDemoClass: mocks.resetDemoClass,
}));
vi.mock("@/server/student-access/network-signal", () => ({
  studentNetworkSignal: mocks.networkSignal,
}));
vi.mock("@/server/logging/logger", () => ({ log: vi.fn() }));

const { NextRequest } = await import("next/server");
const { POST: startDemo } = await import("@/app/demo/start/route");
const { GET: resetDemo } = await import("@/app/api/cron/demo-reset/route");
const { openStudentSession, STUDENT_UNLOCK_COOKIE } = await import(
  "@/server/student-access/student-session"
);

const SECRET = "s".repeat(32);

function resetRequest() {
  return new NextRequest("http://localhost/api/cron/demo-reset", {
    headers: { authorization: "Bearer cron-secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STUDENT_ACCESS_SECRET", SECRET);
  vi.stubEnv("CRON_SECRET", "cron-secret");
  mocks.consumeRequestBudget.mockResolvedValue({ allowed: true });
  mocks.isRequestBudgetExhausted.mockResolvedValue(false);
  mocks.createDemoStudent.mockResolvedValue({
    studentId: "11111111-1111-4111-8111-111111111111",
    className: "Coco Demo Class",
    displayName: "Guest 1A2B3C",
  });
  mocks.resetDemoClass.mockResolvedValue({ removedObjects: 0, deletedStudents: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe.each([
  ["DEMO_MODE missing", "", CLASS_ID],
  ["DEMO_CLASS_ID missing", "true", ""],
])("demo routes with %s", (_label, mode, classId) => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", mode);
    vi.stubEnv("DEMO_CLASS_ID", classId);
  });

  it("POST /demo/start returns 404 and creates nothing", async () => {
    const res = await startDemo();
    expect(res.status).toBe(404);
    expect(mocks.createDemoStudent).not.toHaveBeenCalled();
    expect(mocks.consumeRequestBudget).not.toHaveBeenCalled();
  });

  it("GET /api/cron/demo-reset returns 404 and deletes nothing, even with a valid cron secret", async () => {
    const res = await resetDemo(resetRequest());
    expect(res.status).toBe(404);
    expect(mocks.resetDemoClass).not.toHaveBeenCalled();
  });
});

describe("demo routes with the gate on", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DEMO_CLASS_ID", CLASS_ID);
  });

  it("creates a demo student in the configured class and signs them in", async () => {
    const res = await startDemo();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/student/home");
    expect(mocks.consumeRequestBudget).toHaveBeenCalledWith({
      actorId: "demo-start:203.0.113.7",
      operation: "demo_start",
    });
    expect(mocks.createDemoStudent).toHaveBeenCalledWith(CLASS_ID);
    const token = res.cookies.get(STUDENT_UNLOCK_COOKIE)?.value ?? "";
    expect(openStudentSession(token, SECRET)).toEqual({
      classId: CLASS_ID,
      studentId: "11111111-1111-4111-8111-111111111111",
      className: "Coco Demo Class",
      displayName: "Guest 1A2B3C",
    });
  });

  it("refuses a network over its hourly start limit", async () => {
    mocks.consumeRequestBudget.mockResolvedValue({ allowed: false, retryAfterSeconds: 900 });
    const res = await startDemo();
    expect(res.headers.get("location")).toBe("/?demo=busy");
    expect(mocks.createDemoStudent).not.toHaveBeenCalled();
    expect(res.cookies.get(STUDENT_UNLOCK_COOKIE)).toBeUndefined();
  });

  it("creates no student once the daily cap is spent", async () => {
    mocks.isRequestBudgetExhausted.mockResolvedValue(true);
    const res = await startDemo();
    expect(res.headers.get("location")).toBe("/?demo=resting");
    expect(mocks.createDemoStudent).not.toHaveBeenCalled();
  });

  it("reset requires the cron secret", async () => {
    const res = await resetDemo(new NextRequest("http://localhost/api/cron/demo-reset"));
    expect(res.status).toBe(401);
    expect(mocks.resetDemoClass).not.toHaveBeenCalled();
  });

  it("reset wipes only the configured class", async () => {
    const res = await resetDemo(resetRequest());
    expect(res.status).toBe(200);
    expect(mocks.resetDemoClass).toHaveBeenCalledWith(CLASS_ID);
  });
});
