import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describeConversationSubmissionFailure } from "@/domain/mission/conversation-submission-recovery";

const PROJECT_ROOT = resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return readFileSync(join(PROJECT_ROOT, relativePath), "utf8");
}

describe("conversation submission failure recovery (UAT: stuck Coco-is-thinking)", () => {
  it("passes through the retryable child-facing upload messages", () => {
    expect(
      describeConversationSubmissionFailure(
        new Error("I didn't hear you. Try again."),
      ),
    ).toBe("I didn't hear you. Try again.");
    expect(describeConversationSubmissionFailure(new Error("Try again."))).toBe(
      "Try again.",
    );
  });

  it("maps internal error codes and unknown values to the generic child-safe message", () => {
    const generic = "Something went wrong. Try again, or ask your teacher for help.";
    expect(
      describeConversationSubmissionFailure(new Error("mission_complete_failed")),
    ).toBe(generic);
    expect(
      describeConversationSubmissionFailure(new Error("attempt_start_failed")),
    ).toBe(generic);
    expect(describeConversationSubmissionFailure(new TypeError("fetch failed"))).toBe(
      generic,
    );
    expect(describeConversationSubmissionFailure("boom")).toBe(generic);
    expect(describeConversationSubmissionFailure(undefined)).toBe(generic);
  });
});

describe("MissionFlowShell recovers from cocoThinking on submit failure (source contract)", () => {
  it("catches conversation submit errors instead of leaving the thinking step stuck", () => {
    const source = readSource("src/components/student/MissionFlowShell.tsx");

    // The original-answer submit path must catch failures (the recorder that
    // used to display them unmounts once the step flips to cocoThinking) …
    expect(source).toContain("describeConversationSubmissionFailure");
    // … and must return the flow to the answerable question step.
    expect(source).toMatch(
      /describeConversationSubmissionFailure\(error\)[\s\S]{0,300}step: "question"/,
    );
  });
});
