// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markSubmissionReviewedAction: vi.fn(),
  changeAssignedHomeworkAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
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
  mocks.refresh.mockReset();
  mocks.markSubmissionReviewedAction.mockResolvedValue({ ok: true });
  mocks.changeAssignedHomeworkAction.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderControls(assignmentStudentStatus = "started", dismissed = false) {
  await act(async () => {
    root.render(
      <SubmissionReviewControls
        attemptId="attempt-1"
        assignedHomeworkId="assigned-1"
        assignmentStudentStatus={assignmentStudentStatus}
        classId="class-1"
        assignmentId="assignment-1"
        dismissed={dismissed}
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
  it.each(["started", "teacher_review", "completed"] as const)(
    "accepts a %s attempt through review completion",
    async (status) => {
      await renderControls(status);
      await clickButton("Mark as done");

      expect(mocks.markSubmissionReviewedAction).toHaveBeenCalledWith("attempt-1");
      expect(mocks.changeAssignedHomeworkAction).not.toHaveBeenCalled();
      expect(mocks.push).toHaveBeenCalledWith(
        "/teacher/classes/class-1/review/assignment-1",
      );
    },
  );

  it.each([
    ["incomplete", "Some answers are missing. Request retry is available."],
    ["not_allowed", "This homework changed. Refresh the page and try again."],
    ["not_found", "This homework changed. Refresh the page and try again."],
    ["failed", "Could not update this homework. Try again."],
    ["unexpected", "Could not update this homework. Try again."],
  ] as const)("shows the right message for a %s result", async (error, message) => {
    mocks.markSubmissionReviewedAction.mockResolvedValueOnce({ ok: false, error });
    await renderControls("started");
    await clickButton("Mark as done");

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("keeps the retry action visible after completion reports missing evidence", async () => {
    mocks.markSubmissionReviewedAction.mockResolvedValueOnce({ ok: false, error: "incomplete" });
    await renderControls("teacher_review");
    await clickButton("Mark as done");

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Some answers are missing. Request retry is available.",
    );
    const retryButtons = Array.from(container.querySelectorAll("button")).filter(
      (button) => button.textContent?.trim() === "Request retry",
    );
    expect(retryButtons).toHaveLength(2);
    await act(async () => {
      retryButtons[retryButtons.length - 1]?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.changeAssignedHomeworkAction).toHaveBeenCalledWith({
      assignedHomeworkId: "assigned-1",
      action: "request_retry",
      reasonNote: undefined,
    });
  });

  it("requests retry and returns to the teacher dashboard", async () => {
    await renderControls("started");
    const retryButtons = Array.from(container.querySelectorAll("button")).filter(
      (button) => button.textContent?.trim() === "Request retry",
    );
    const submitButton = retryButtons[retryButtons.length - 1];
    await act(async () => {
      submitButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.changeAssignedHomeworkAction).toHaveBeenCalledWith({
      assignedHomeworkId: "assigned-1",
      action: "request_retry",
      reasonNote: undefined,
    });
    expect(mocks.push).toHaveBeenCalledWith("/teacher");
  });

  it("shows the system message when a mutation throws", async () => {
    mocks.markSubmissionReviewedAction.mockRejectedValueOnce(new Error("boom"));
    await renderControls("started");
    await clickButton("Mark as done");

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Could not update this homework. Try again.",
    );
  });

  it.each(["assigned", "missed"] as const)("dismisses a %s attempt", async (status) => {
    await renderControls(status);
    await clickButton("Mark as done");

    expect(mocks.markSubmissionReviewedAction).not.toHaveBeenCalled();
    expect(mocks.changeAssignedHomeworkAction).toHaveBeenCalledWith({
      assignedHomeworkId: "assigned-1",
      action: "dismiss",
    });
    expect(mocks.push).toHaveBeenCalledWith(
      "/teacher/classes/class-1/review/assignment-1",
    );
    expect(Array.from(container.querySelectorAll("button")).map((button) => button.textContent?.trim())).toEqual([
      "Mark as done",
    ]);
  });

  it.each(["needs_retry", "unknown"] as const)("shows no controls for %s", async (status) => {
    await renderControls(status);

    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it.each(["assigned", "started", "missed"] as const)("refreshes after undoing a dismissed %s attempt", async (status) => {
    await renderControls(status, true);
    await clickButton("Undo");

    expect(mocks.changeAssignedHomeworkAction).toHaveBeenCalledWith({
      assignedHomeworkId: "assigned-1",
      action: "undo_dismiss",
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it.each(["completed", "needs_retry", "teacher_review", "unknown"] as const)(
    "shows no controls for dismissed %s work",
    async (status) => {
      await renderControls(status, true);

      expect(container.querySelectorAll("button")).toHaveLength(0);
    },
  );
});
