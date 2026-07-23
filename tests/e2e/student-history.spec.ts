import { expect, test } from "@playwright/test";

const assignmentStudentId = process.env.STUDENT_HISTORY_ASSIGNMENT_STUDENT_ID;

test.describe("student completed mission history", () => {
  test.skip(!assignmentStudentId, "Set STUDENT_HISTORY_ASSIGNMENT_STUDENT_ID with an unlocked test session to run live history checks.");
  test("shows final read-only conversation without mutation controls", async ({ page }) => {
    await page.goto(`/student/history/${assignmentStudentId}`);
    const dynamicHeading = page.getByRole("heading", {
      name: "Homework Review",
    });
    if (await dynamicHeading.isVisible()) {
      await expect(
        page.getByRole("link", { name: "Back to homework" }),
      ).toBeVisible();
      await expect(page.getByText("Coco", { exact: true }).first()).toBeVisible();
    } else {
      await expect(page.getByText("Read-only recap", { exact: false })).toBeVisible();
      await expect(page.getByText("You said", { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /record|retry|resume|resubmit/i })).toHaveCount(0);
  });
});
