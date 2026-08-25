import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTeacherProfile: vi.fn(),
  getAttemptEvidenceForTeacher: vi.fn(),
  changeAttemptReview: vi.fn(),
}));

vi.mock("@/server/auth/teacher-profile", () => ({
  requireTeacherProfile: mocks.requireTeacherProfile,
}));
vi.mock("@/server/teacher/audio-evidence", () => ({
  getAttemptEvidenceForTeacher: mocks.getAttemptEvidenceForTeacher,
}));
vi.mock("@/server/teacher/assignment-operations", () => ({
  changeAttemptReview: mocks.changeAttemptReview,
}));
vi.mock("@/components/teacher/AudioClipPlayer", () => ({
  AudioClipPlayer: ({ label }: { label: string }) => (
    <div>{label} audio placeholder</div>
  ),
}));
vi.mock("@/components/teacher/SubmissionReviewControls", () => ({
  SubmissionReviewControls: (props: {
    classId: string;
    assignmentId: string;
    reviewReason: string | null;
  }) => (
    <div
      data-class-id={props.classId}
      data-assignment-id={props.assignmentId}
      data-review-reason={props.reviewReason ?? ""}
    >
      submission controls
    </div>
  ),
}));
vi.mock("@/components/teacher/PronunciationDiagnosticPanel", () => ({
  PronunciationDiagnosticPanel: () => null,
}));

import AttemptEvidencePage from "./page";

const presetEvidence = {
  attemptId: "attempt-1",
  assignmentStudentId: "as-1",
  assignmentId: "assignment-1",
  classId: "class-1",
  className: "Test class",
  missionTitle: "Weekend plans",
  studentName: "Mina",
  attemptStatus: "completed",
  assignmentStudentStatus: "teacher_review",
  dismissedAt: null,
  submittedAt: "2026-07-14T00:00:00.000Z",
  completedAt: "2026-07-14T00:00:00.000Z",
  reviewReason: null,
  attemptCount: 1,
  highestHintLevel: 0,
  conversationMode: false,
  turns: [{
    id: "turn-1",
    turnOrder: 1,
    question: "What do you like?",
    originalTranscript: "I like apples.",
    originalDisplayTranscript: "I like apples.",
    improvedSentence: null,
    repeatTranscript: null,
    repeatDisplayTranscript: null,
    targetPattern: "I like ___.",
    meaningResult: "Understood",
    targetPatternResult: "Target pattern used",
    repeatResult: null,
    reviewReason: null,
    replyHintFrame: null,
    hintLevelUsed: 0,
    audioClips: [{
      id: "clip-1",
      clipKind: "original_answer",
      processingStatus: "transcribed",
      pronunciationScore: null,
    }],
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireTeacherProfile.mockResolvedValue({ id: "teacher-1" });
  mocks.changeAttemptReview.mockResolvedValue({ ok: true });
});

async function renderEvidence(evidence: unknown) {
  mocks.getAttemptEvidenceForTeacher.mockResolvedValue(evidence);
  const page = await AttemptEvidencePage({
    params: Promise.resolve({ attemptId: "attempt-1" }),
  });
  return renderToStaticMarkup(page);
}

describe("AttemptEvidencePage", () => {
  it("renders each preset turn's expected pattern beside its evidence", async () => {
    const html = await renderEvidence(presetEvidence);

    expect(html).toContain("Expected target pattern");
    expect(html).toContain("I like ___");
    expect(html).toContain("Target pattern result");
    expect(html).toContain("Yes");
    expect(html).toContain("I like apples.");
    expect(html).toContain("Student answer audio audio placeholder");
  });

  it("does not show a target-pattern requirement for conversation evidence", async () => {
    const html = await renderEvidence({
      ...presetEvidence,
      conversationMode: true,
      turns: [{
        ...presetEvidence.turns[0],
        targetPattern: null,
      }],
    });

    expect(html).not.toContain("Expected target pattern");
    expect(html).not.toContain("Target pattern result");
    expect(html).not.toContain("I like ___");
  });

  it("passes flagged attempt state and assignment destination to the controls", async () => {
    const html = await renderEvidence({
      ...presetEvidence,
      assignmentStudentStatus: "started",
      reviewReason: "failed_schema",
    });

    expect(html).toContain('data-class-id="class-1"');
    expect(html).toContain('data-assignment-id="assignment-1"');
    expect(html).toContain('data-review-reason="failed_schema"');
  });
});
