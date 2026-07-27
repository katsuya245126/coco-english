import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const filesWithPrimaryActions = [
  "src/components/student/JoinForm.tsx",
  "src/components/student/RememberedClassBanner.tsx",
  "src/components/student/PinForm.tsx",
  "src/components/student/StepAiEvaluationFeedback.tsx",
  "src/components/student/StepTurnTransition.tsx",
  "src/components/student/StepConversationClosing.tsx",
  "src/components/student/StepMissionComplete.tsx",
  "src/components/student/MissionFlowShell.tsx",
  "src/components/landing/LandingPanel.tsx",
  "src/app/student/history/[assignmentStudentId]/page.tsx",
];

describe("student button interaction states", () => {
  it("defines shared hover and pressed states for student buttons", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toContain(".student-primary-button:hover");
    expect(css).toContain(".student-primary-button:active");
    expect(css).toContain(".student-secondary-button:hover");
    expect(css).toContain(".student-secondary-button:active");
  });

  it("applies the shared primary state class to normal student action buttons", () => {
    for (const file of filesWithPrimaryActions) {
      const source = readFileSync(file, "utf8");

      expect(source, file).toContain("student-primary-button");
    }
  });

  it("keeps the recorder control out of shared button pressed states", () => {
    const source = readFileSync(
      "src/components/student/VoiceRecorderControl.tsx",
      "utf8",
    );

    expect(source).not.toContain("student-primary-button");
    expect(source).not.toContain("student-secondary-button");
  });

  it("keeps stylesheet-only student controls responsive when pressed", () => {
    const homeCss = readFileSync("src/app/student/home/student-home.css", "utf8");
    const reviewCss = readFileSync(
      "src/components/student/HomeworkReview.module.css",
      "utf8",
    );

    expect(homeCss).toContain(".student-switch-class:active");
    expect(homeCss).toContain(".student-home-pager a:active");
    expect(reviewCss).toContain(".backButton:active");
  });
});
