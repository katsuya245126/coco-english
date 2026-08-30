import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTeacherProfile: vi.fn(),
  getStudentProfileHeader: vi.fn(),
  getStudentSoundProfile: vi.fn(),
}));

vi.mock("@/server/auth/teacher-profile", () => ({
  requireTeacherProfile: mocks.requireTeacherProfile,
}));
vi.mock("@/server/teacher/student-profile", () => ({
  getStudentProfileHeader: mocks.getStudentProfileHeader,
  getStudentSoundProfile: mocks.getStudentSoundProfile,
}));

import StudentProfilePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireTeacherProfile.mockResolvedValue({ id: "teacher-1" });
  mocks.getStudentProfileHeader.mockResolvedValue({
    studentId: "student-1",
    classId: "class-1",
    displayName: "Mina",
    className: "Test class",
  });
});

describe("StudentProfilePage", () => {
  it("keeps sound summaries compact and expands candidate evidence in place", async () => {
    mocks.getStudentSoundProfile.mockResolvedValue([
      {
        label: "f",
        ipa: "f",
        weakCount: 5,
        totalCount: 5,
        averageAccuracy: 20,
        exampleWord: "fan",
        candidate: {
          label: "p",
          ipa: "p",
          count: 4,
          exampleWords: ["fan", "food"],
        },
      },
      {
        label: "r",
        ipa: "r",
        weakCount: 5,
        totalCount: 5,
        averageAccuracy: 24,
        exampleWord: "red",
      },
    ]);

    const html = renderToStaticMarkup(
      await StudentProfilePage({
        params: Promise.resolve({ id: "student-1" }),
      }),
    );

    expect((html.match(/<details/g) ?? []).length).toBe(1);
    expect(html).toContain("<summary");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Sounded closer to /p/");
    expect(html).toContain("Seen in 4 weak attempts");
    expect(html).toContain("Source: Mission");
    expect(html).not.toContain("no consistent alternative");
  });
});
