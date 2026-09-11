import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireTeacherProfile, mockUploadMissionImage } = vi.hoisted(() => ({
  mockRequireTeacherProfile: vi.fn(),
  mockUploadMissionImage: vi.fn(),
}));

vi.mock("@/server/auth/teacher-profile", () => ({
  requireTeacherProfile: mockRequireTeacherProfile,
}));

vi.mock("@/server/mission/picture-storage", () => ({
  uploadMissionImage: mockUploadMissionImage,
}));

describe("teacher mission picture action", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireTeacherProfile.mockReset();
    mockUploadMissionImage.mockReset();
    mockRequireTeacherProfile.mockResolvedValue({ id: "teacher-1" });
    mockUploadMissionImage.mockResolvedValue({
      ok: true,
      picture: {
        objectKey: "teachers/teacher-1/picture-1.jpg",
        description: "A child choosing an apple.",
        mimeType: "image/jpeg",
      },
    });
  });

  it("uploads through the authenticated teacher boundary", async () => {
    const { uploadMissionPictureAction } = await import(
      "@/app/teacher/missions/actions"
    );
    const file = new File(["image"], "apple.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    formData.set("file", file);
    formData.set("description", "  A child choosing an apple.  ");

    await expect(uploadMissionPictureAction(formData)).resolves.toEqual({
      ok: true,
      picture: {
        objectKey: "teachers/teacher-1/picture-1.jpg",
        description: "A child choosing an apple.",
        mimeType: "image/jpeg",
      },
    });
    expect(mockUploadMissionImage).toHaveBeenCalledWith({
      teacherId: "teacher-1",
      file,
      description: "A child choosing an apple.",
    });
  });

  it("does not reach storage when the form has no file", async () => {
    const { uploadMissionPictureAction } = await import(
      "@/app/teacher/missions/actions"
    );
    const formData = new FormData();
    formData.set("description", "An image.");

    await expect(uploadMissionPictureAction(formData)).resolves.toEqual({
      ok: false,
      error: expect.any(String),
    });
    expect(mockUploadMissionImage).not.toHaveBeenCalled();
  });
});
