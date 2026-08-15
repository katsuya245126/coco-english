import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTeacherProfile: vi.fn(),
  getAssignmentStudentEvidenceForTeacher: vi.fn(),
}));

vi.mock("@/server/auth/teacher-profile", () => ({
  requireTeacherProfile: mocks.requireTeacherProfile,
}));
vi.mock("@/server/teacher/assignment-student-evidence", () => ({
  getAssignmentStudentEvidenceForTeacher:
    mocks.getAssignmentStudentEvidenceForTeacher,
}));
vi.mock("@/components/teacher/AssignmentStudentDismissControls", () => ({
  AssignmentStudentDismissControls: () => <div>dismiss controls</div>,
}));

import AssignmentStudentPage from "./page";

const presetEvidence = {
  assignmentStudentId: "as-1",
  studentName: "Mina",
  missionTitle: "Weekend plans",
  status: "assigned",
  statusLabel: "Not started",
  submittedLabel: "Not yet submitted",
  attemptCount: 0,
  highestHintLabel: "No hints used",
  classId: "class-1",
  className: "Test class",
  assignmentId: "assignment-1",
  dismissedAt: null,
  turns: [
    {
      turnOrder: 1,
      prompt: "What do you like?",
      targetPattern: "I like ___.",
      targetExample: "I like apples.",
    },
    {
      turnOrder: 2,
      prompt: "What will you do?",
      targetPattern: "I will ___.",
      targetExample: "I will play soccer.",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireTeacherProfile.mockResolvedValue({ id: "teacher-1" });
});

async function renderEvidence(evidence: unknown) {
  mocks.getAssignmentStudentEvidenceForTeacher.mockResolvedValue(evidence);
  const page = await AssignmentStudentPage({
    params: Promise.resolve({ assignmentStudentId: "as-1" }),
  });
  return renderToStaticMarkup(page);
}

describe("AssignmentStudentPage", () => {
  it("renders each assigned preset pattern inside its turn", async () => {
    const html = await renderEvidence(presetEvidence);

    expect(html).toContain("Expected target pattern: I like ___.");
    expect(html).toContain("Expected target pattern: I will ___.");
    expect(html).not.toContain(">Target pattern</p>");
  });

  it("does not show conversation context as a turn requirement", async () => {
    const html = await renderEvidence({
      ...presetEvidence,
      turns: [{
        ...presetEvidence.turns[0],
        targetPattern: null,
      }],
    });

    expect(html).not.toContain("Expected target pattern:");
  });
});
