import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTeacherProfile: vi.fn(),
  getStudentProfileHeader: vi.fn(),
  getStudentSoundProfile: vi.fn(),
  getPronunciationSamplesForTeacher: vi.fn(),
  loadPronunciationSampleAudioUrlAction: vi.fn(),
}));

vi.mock("@/server/auth/teacher-profile", () => ({
  requireTeacherProfile: mocks.requireTeacherProfile,
}));
vi.mock("@/server/teacher/student-profile", () => ({
  getStudentProfileHeader: mocks.getStudentProfileHeader,
  getStudentSoundProfile: mocks.getStudentSoundProfile,
}));
vi.mock("@/app/teacher/students/[id]/actions", () => ({
  loadPronunciationSampleAudioUrlAction:
    mocks.loadPronunciationSampleAudioUrlAction,
}));
vi.mock("@/server/teacher/pronunciation-samples", () => ({
  getPronunciationSamplesForTeacher: mocks.getPronunciationSamplesForTeacher,
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
  mocks.getPronunciationSamplesForTeacher.mockResolvedValue([]);
  mocks.loadPronunciationSampleAudioUrlAction.mockResolvedValue({
    ok: true,
    signedUrl: "https://signed.example/sample-1.webm",
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
        evidenceSources: ["Mission"],
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
        evidenceSources: ["Mission"],
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

  it("includes owned teacher-sample playback in expanded sound evidence", async () => {
    mocks.getStudentSoundProfile.mockResolvedValue([
      {
        label: "f",
        ipa: "f",
        weakCount: 4,
        totalCount: 5,
        averageAccuracy: 34,
        exampleWord: "fan",
        evidenceSources: ["Teacher-added pronunciation sample"],
        teacherSampleIds: ["sample-1"],
      },
    ]);
    mocks.getPronunciationSamplesForTeacher.mockResolvedValue([
      { id: "sample-1", audioAvailable: true },
    ]);

    const html = renderToStaticMarkup(
      await StudentProfilePage({
        params: Promise.resolve({ id: "student-1" }),
      }),
    );

    expect(html).toContain("Teacher-added pronunciation sample");
    expect(html).toContain("Play sample");
    expect(html).not.toContain('src="https://signed.example/sample-1.webm"');
    expect(mocks.loadPronunciationSampleAudioUrlAction).not.toHaveBeenCalled();
  });
});
