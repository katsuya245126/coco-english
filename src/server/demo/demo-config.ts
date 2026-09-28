// Public-demo gate. Every demo-only path calls this and treats `null` as
// "not a demo deployment" (404 / no-op). Both variables are required so a
// single stray env var in production can never open anonymous student
// creation. Edge-safe: middleware imports it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function demoClassId(): string | null {
  const classId = process.env.DEMO_CLASS_ID?.trim() ?? "";
  return process.env.DEMO_MODE === "true" && UUID.test(classId) ? classId : null;
}

// Paid student calls (student_audio + student_helper) the whole demo class may
// make per rolling 24h. Calibrated in the spec: ~$1/day, >= 10 full runs.
export const DEMO_DAILY_CALL_LIMIT = 600;
