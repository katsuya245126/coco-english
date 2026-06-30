/**
 * RED test — mark-missed cron route auth + idempotency (Wave 0, Plan 07-01).
 *
 * Imports from the not-yet-existing cron route handler.
 * Fails with "Cannot find module" until Wave 1 implements the route.
 *
 * Security contracts locked here:
 *   T-07-01: Unauthenticated callers must receive 401.
 *   T-CRON-AUTH: Bearer CRON_SECRET is the only valid credential.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock markMissedAssignments before importing the handler
vi.mock("@/server/foundation/markMissedAssignments", () => ({
  markMissedAssignments: vi.fn(),
}));

// Mock logger (not yet implemented)
vi.mock("@/server/logging/logger", () => ({
  log: vi.fn(),
}));

// This import will fail (RED) until Wave 1 creates the route file.
import { GET } from "@/app/api/cron/mark-missed/route";
import { markMissedAssignments } from "@/server/foundation/markMissedAssignments";

const { NextRequest } = await import("next/server");

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/cron/mark-missed", {
    method: "GET",
    headers,
  });
}

describe("GET /api/cron/mark-missed — auth guard (T-07-01, T-CRON-AUTH)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set a known secret for most tests
    process.env.CRON_SECRET = "test-secret-abc123";
  });

  it("returns 401 when no Authorization header is present", async () => {
    const req = makeRequest({});
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(markMissedAssignments).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header has wrong Bearer token", async () => {
    const req = makeRequest({ Authorization: "Bearer wrong-secret" });
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(markMissedAssignments).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is not Bearer scheme", async () => {
    const req = makeRequest({ Authorization: "Basic dGVzdA==" });
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(markMissedAssignments).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET env var is unset (even with a Bearer header)", async () => {
    delete process.env.CRON_SECRET;

    const req = makeRequest({ Authorization: "Bearer anything" });
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(markMissedAssignments).not.toHaveBeenCalled();
  });

  it("returns 200 with { ok: true, markedCount } when correct Bearer secret is provided", async () => {
    vi.mocked(markMissedAssignments).mockResolvedValueOnce({
      markedCount: 3,
      assignmentStudentIds: ["as-1", "as-2", "as-3"],
    });

    const req = makeRequest({ Authorization: "Bearer test-secret-abc123" });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, markedCount: 3 });
    expect(markMissedAssignments).toHaveBeenCalledOnce();
  });

  it("returns 200 with markedCount 0 when no assignments are overdue (idempotency)", async () => {
    vi.mocked(markMissedAssignments).mockResolvedValueOnce({
      markedCount: 0,
      assignmentStudentIds: [],
    });

    const req = makeRequest({ Authorization: "Bearer test-secret-abc123" });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, markedCount: 0 });
  });

  it("returns 500 when markMissedAssignments throws an unexpected error", async () => {
    vi.mocked(markMissedAssignments).mockRejectedValueOnce(
      new Error("DB connection failed"),
    );

    const req = makeRequest({ Authorization: "Bearer test-secret-abc123" });
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false });
  });
});
