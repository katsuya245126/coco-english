import { afterEach, describe, expect, it, vi } from "vitest";
import { demoClassId } from "@/server/demo/demo-config";

const CLASS_ID = "7a1e4c2b-9d3f-4a8e-b1c2-3d4e5f6a7b8c";

afterEach(() => vi.unstubAllEnvs());

describe("demoClassId gate", () => {
  it.each([
    ["DEMO_MODE missing", undefined, CLASS_ID],
    ["DEMO_MODE not exactly true", "1", CLASS_ID],
    ["DEMO_CLASS_ID missing", "true", undefined],
    ["DEMO_CLASS_ID not a uuid", "true", "demo-class"],
  ])("is off when %s", (_label, mode, classId) => {
    if (mode !== undefined) vi.stubEnv("DEMO_MODE", mode);
    else vi.stubEnv("DEMO_MODE", "");
    vi.stubEnv("DEMO_CLASS_ID", classId ?? "");
    expect(demoClassId()).toBeNull();
  });

  it("returns the class id only when both variables are valid", () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DEMO_CLASS_ID", CLASS_ID);
    expect(demoClassId()).toBe(CLASS_ID);
  });
});
