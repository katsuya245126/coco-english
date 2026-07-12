import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "src/server/student-access/student-history.ts"), "utf8");

describe("student completed mission recap security contracts", () => {
  it("anchors lookup to assignment-student ownership, completion, and latest attempt", () => {
    expect(source).toContain('.eq("id", assignmentStudentId)');
    expect(source).toContain('.eq("student_id", studentId)');
    expect(source).toContain('.eq("status", "completed")');
    expect(source).toContain('row.latest_attempt_id');
    expect(source).toContain('.eq("assignment_student_id", row.id)');
    const attemptLookup = source.slice(source.indexOf('from("attempts")'), source.indexOf('from("attempt_turns")'));
    expect(attemptLookup).not.toContain(".order(");
  });

  it("does not expose signed URLs in the initial recap and degrades retained audio safely", () => {
    const recapType = source.slice(source.indexOf("export type StudentMissionRecap"), source.indexOf("type Snapshot"));
    expect(recapType).not.toContain("signedUrl");
    expect(source).toContain('"expired"');
    expect(source).toContain('"unavailable"');
    expect(source).toContain("deleted_at");
    expect(source).toContain("audio_expires_at");
  });

  it("authorizes clips through the owned latest completed attempt and signs for 300 seconds", () => {
    expect(source).toContain("attempt.id !== assignmentStudent.latest_attempt_id");
    expect(source).toContain("AUDIO_TTL_SECONDS = 300");
    expect(source).toContain("createSignedUrl(row.object_key!, AUDIO_TTL_SECONDS)");
  });
});
