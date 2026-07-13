import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const page = fs.readFileSync(path.join(root, "src/app/student/home/page.tsx"), "utf8");
const shell = fs.readFileSync(path.join(root, "src/components/student/StudentHomeShell.tsx"), "utf8");
const item = fs.readFileSync(path.join(root, "src/components/student/AssignmentListItem.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "src/app/student/home/student-home.css"), "utf8");
const recapPage = fs.readFileSync(path.join(root, "src/app/student/history/[assignmentStudentId]/page.tsx"), "utf8");
const recap = fs.readFileSync(path.join(root, "src/components/student/StudentMissionRecap.tsx"), "utf8");

describe("student history UI source contracts", () => {
  it("requests an exact five-item URL-addressable page", () => {
    expect(page).toContain("pageSize: 5"); expect(page).toContain('query.tab === "past"');
    expect(page).toContain("assignmentPage={page}"); expect(page).not.toContain("assignments={assignments}");
    expect(fs.readFileSync(path.join(root, "src/server/student-access/assignment-list.ts"), "utf8")).toContain("attempt_turns(count)");
  });
  it("renders accessible Current/Past missions and page links", () => {
    expect(shell).toContain("Current"); expect(shell).toContain("Past missions");
    expect(shell).toContain('aria-label="Mission pages"'); expect(shell).toContain("Previous"); expect(shell).toContain("Next");
    expect(shell).toContain("Hi, {displayName}!"); expect(shell).not.toContain("student-home-avatar");
    expect(shell).toContain("student-home-tabs"); expect(shell).toContain("student-home-pager");
    expect(styles).toContain("max-width: 430px"); expect(styles).toContain("border-radius: 24px");
    expect(styles).toContain("@media (max-width: 430px)");
  });
  it("launches Late but keeps review nonlaunchable and Past read-only", () => {
    expect(item).toContain('item.displayStatus === "late"'); expect(item).not.toContain('item.displayStatus === "review" ||');
    expect(item).toContain("View what I said"); expect(item).toContain("/student/history/");
    expect(item.indexOf('item.displayStatus === "done"')).toBeLessThan(item.indexOf("const isLaunchable"));
    expect(item).toContain("student-mission-card"); expect(item).toContain("student-mission-progress");
    expect(item).not.toContain("item.targetPattern"); expect(item).toContain("item.completedTurnCount");
  });
  it("renders a conversation-shaped, read-only final recap", () => {
    expect(recapPage).toContain("Read-only recap"); expect(recapPage).toContain("← Past missions");
    expect(recap).toContain("You said"); expect(recap).toContain("Recording expired");
    expect(recap).toContain("cocoPrompt"); expect(recap).toContain("Pronunciation</strong>");
    expect(recap).not.toContain("word.word}: ${word.label");
    expect(recap).toContain('label !== "Clear"');
    expect(recap).toContain("practiceWords.length === 0");
  });
  it("styles the back-to-past-missions control as a clickable pill", () => {
    expect(recapPage).toContain("#2563EB"); expect(recapPage).toContain("inline-block");
  });
  it("contains no mutation or teacher evidence controls", () => {
    const historySource = recapPage + recap;
    for (const forbidden of ["VoiceRecorderControl", "startOrResume", "completeAttempt", "Request retry", "resubmitAction"]) expect(historySource).not.toContain(forbidden);
  });
});
