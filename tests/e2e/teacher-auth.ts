import { expect, type Page } from "@playwright/test";

export async function logInTeacher(
  page: Page,
  credentials?: { email: string; password: string },
): Promise<void> {
  await page.goto("/auth/login");
  await page
    .getByLabel("Email")
    .fill(credentials?.email ?? process.env.E2E_TEACHER_EMAIL!);
  await page
    .getByLabel("Password")
    .fill(credentials?.password ?? process.env.E2E_TEACHER_PASSWORD!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/teacher$/);
}
