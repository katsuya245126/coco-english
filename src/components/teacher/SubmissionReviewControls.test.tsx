// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markSubmissionReviewedAction: vi.fn(),
  changeAssignedHomeworkAction: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));
vi.mock("@/app/teacher/evidence/[attemptId]/actions", () => ({
  markSubmissionReviewedAction: mocks.markSubmissionReviewedAction,
}));
vi.mock("@/app/teacher/assignment-actions", () => ({
  changeAssignedHomeworkAction: mocks.changeAssignedHomeworkAction,
}));

import { SubmissionReviewControls } from "./SubmissionReviewControls";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mocks.markSubmissionReviewedAction.mockReset();
  mocks.changeAssignedHomeworkAction.mockReset();
  mocks.push.mockReset();
  mocks.markSubmissionReviewedAction.mockResolvedValue({ ok: true });
  mocks.changeAssignedHomeworkAction.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderControls(
  reviewReason: string | null,
  assignmentStudentStatus = "started",
) {
  await act(async () => {
    root.render(
      <SubmissionReviewControls
        attemptId="attempt-1"
        assignedHomeworkId="assigned-1"
        assignmentStudentStatus={assignmentStudentStatus}
        classId="class-1"
        assignmentId="assignment-1"
        reviewReason={reviewReason}
        dismissed={false}
      />,
    );
  });
}

async function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  expect(button).toBeDefined();
  await act(async () => {
    button?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("SubmissionReviewControls action routing", () => {
  it("accepts a flagged started attempt through review completion", async () => {
    await renderControls("failed_schema");
    await clickButton("Mark as done");

    expect(mocks.markSubmissionReviewedAction).toHaveBeenCalledWith("attempt-1");
    expect(mocks.changeAssignedHomeworkAction).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith(
      "/teacher/classes/class-1/review/assignment-1",
    );
  });

  it("explains missing answers and retry when flagged completion is rejected", async () => {
    mocks.markSubmissionReviewedAction.mockResolvedValueOnce({
      ok: false,
      error: "not_allowed",
    });
    await renderControls("failed_schema");
    await clickButton("Mark as done");

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "required answers may be missing",
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Request retry is available",
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("accepts an unflagged started attempt through review completion", async () => {
    await renderControls(null);
    await clickButton("Mark as done");

    expect(mocks.markSubmissionReviewedAction).toHaveBeenCalledWith("attempt-1");
    expect(mocks.changeAssignedHomeworkAction).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith(
      "/teacher/classes/class-1/review/assignment-1",
    );
  });

  it("explains missing answers and retry when unflagged completion is rejected", async () => {
    mocks.markSubmissionReviewedAction.mockResolvedValueOnce({
      ok: false,
      error: "not_allowed",
    });
    await renderControls(null);
    await clickButton("Mark as done");

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "required answers may be missing",
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Request retry is available",
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each(["assigned", "missed"] as const)("dismisses a %s attempt", async (status) => {
    await renderControls(null, status);
    await clickButton("Mark as done");

    expect(mocks.markSubmissionReviewedAction).not.toHaveBeenCalled();
    expect(mocks.changeAssignedHomeworkAction).toHaveBeenCalledWith({
      assignedHomeworkId: "assigned-1",
      action: "dismiss",
    });
    expect(mocks.push).toHaveBeenCalledWith(
      "/teacher/classes/class-1/review/assignment-1",
    );
  });
});
