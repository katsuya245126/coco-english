import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readStudentUnlock: vi.fn(),
  requireOwnedAssignmentStudent: vi.fn(),
  requireTeacherProfile: vi.fn(),
  getMissionForTeacher: vi.fn(),
  interpretMissionSnapshot: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
  createMissionImageSignedUrl: vi.fn(),
}));

vi.mock("@/app/join/actions", () => ({
  readStudentUnlock: mocks.readStudentUnlock,
}));
vi.mock("@/server/student-access/owned-assignment", () => ({
  requireOwnedAssignmentStudent: mocks.requireOwnedAssignmentStudent,
}));
vi.mock("@/server/auth/teacher-profile", () => ({
  requireTeacherProfile: mocks.requireTeacherProfile,
}));
vi.mock("@/server/mission/mission-service", () => ({
  getMissionForTeacher: mocks.getMissionForTeacher,
}));
vi.mock("@/domain/mission/mission-snapshot", () => ({
  interpretMissionSnapshot: mocks.interpretMissionSnapshot,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: mocks.createSupabaseServiceClient,
}));
vi.mock("@/server/mission/picture-storage", () => ({
  createMissionImageSignedUrl: mocks.createMissionImageSignedUrl,
}));

import { GET as getStudentPicture } from "@/app/student/missions/[assignmentStudentId]/picture/[turnOrder]/route";
import { GET as getTeacherPicture } from "@/app/teacher/missions/[id]/picture/[turnOrder]/route";
import { GET as getTeacherAssignmentPicture } from "@/app/teacher/assignments/[assignmentId]/picture/[turnOrder]/route";

const picture = {
  objectKey: "teachers/teacher-1/11111111-1111-4111-8111-111111111111.jpg",
  description: "An orange ball under a blue chair.",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createMissionImageSignedUrl.mockResolvedValue(
    "https://storage.example/signed-picture",
  );
  mocks.requireTeacherProfile.mockResolvedValue({ id: "teacher-1" });
});

describe("student mission picture route", () => {
  it("does not sign a foreign student's assignment", async () => {
    mocks.readStudentUnlock.mockResolvedValue({ studentId: "student-1" });
    mocks.requireOwnedAssignmentStudent.mockResolvedValue({
      ok: false,
      error: "not_found",
    });

    const response = await getStudentPicture(new Request("http://localhost"), {
      params: Promise.resolve({ assignmentStudentId: "foreign", turnOrder: "1" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.requireOwnedAssignmentStudent).toHaveBeenCalledWith({
      studentId: "student-1",
      assignmentStudentId: "foreign",
    });
    expect(mocks.createMissionImageSignedUrl).not.toHaveBeenCalled();
  });

  it("signs only the picture resolved from the owned immutable snapshot", async () => {
    mocks.readStudentUnlock.mockResolvedValue({ studentId: "student-1" });
    mocks.requireOwnedAssignmentStudent.mockResolvedValue({
      ok: true,
      owned: {
        snapshot: {
          turns: [{ turnOrder: 1, picture }],
        },
      },
    });

    const response = await getStudentPicture(new Request("http://localhost"), {
      params: Promise.resolve({ assignmentStudentId: "as-1", turnOrder: "1" }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://storage.example/signed-picture",
    );
    expect(mocks.createMissionImageSignedUrl).toHaveBeenCalledWith({
      objectKey: picture.objectKey,
    });
  });

  it("does not sign an unowned or non-picture turn", async () => {
    mocks.readStudentUnlock.mockResolvedValue({ studentId: "student-1" });
    mocks.requireOwnedAssignmentStudent.mockResolvedValue({
      ok: true,
      owned: { snapshot: { turns: [{ turnOrder: 2 }] } },
    });

    const response = await getStudentPicture(new Request("http://localhost"), {
      params: Promise.resolve({ assignmentStudentId: "as-1", turnOrder: "1" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.createMissionImageSignedUrl).not.toHaveBeenCalled();
  });
});

describe("teacher mission picture route", () => {
  it("requires the teacher-owned mission before signing its current picture", async () => {
    mocks.getMissionForTeacher.mockResolvedValue({
      id: "mission-1",
      turns: [{ turnOrder: 1, picture }],
    });

    const response = await getTeacherPicture(new Request("http://localhost"), {
      params: Promise.resolve({ id: "mission-1", turnOrder: "1" }),
    });

    expect(response.status).toBe(307);
    expect(mocks.getMissionForTeacher).toHaveBeenCalledWith({
      teacherId: "teacher-1",
      missionId: "mission-1",
    });
    expect(mocks.createMissionImageSignedUrl).toHaveBeenCalledWith({
      objectKey: picture.objectKey,
    });
  });

  it("does not sign a mission the teacher cannot load", async () => {
    mocks.getMissionForTeacher.mockResolvedValue(null);

    const response = await getTeacherPicture(new Request("http://localhost"), {
      params: Promise.resolve({ id: "foreign-mission", turnOrder: "1" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.createMissionImageSignedUrl).not.toHaveBeenCalled();
  });
});

describe("teacher historical assignment picture route", () => {
  it("signs a picture from an assignment snapshot owned by the teacher", async () => {
    mocks.interpretMissionSnapshot.mockReturnValue({
      kind: "complete",
      snapshot: {
        conversationMode: false,
        turns: [{ turnOrder: 1, picture }],
      },
    });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { mission_snapshot: { turns: [{ turnOrder: 1, picture }] } },
      error: null,
    });
    mocks.createSupabaseServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle })),
          })),
        })),
      })),
    });

    const response = await getTeacherAssignmentPicture(new Request("http://localhost"), {
      params: Promise.resolve({ assignmentId: "assignment-1", turnOrder: "1" }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://storage.example/signed-picture",
    );
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.createMissionImageSignedUrl).toHaveBeenCalledWith({
      objectKey: picture.objectKey,
    });
  });

  it("does not sign a historical picture when the assignment is not teacher-owned", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    mocks.createSupabaseServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle })),
          })),
        })),
      })),
    });

    const response = await getTeacherAssignmentPicture(new Request("http://localhost"), {
      params: Promise.resolve({ assignmentId: "foreign-assignment", turnOrder: "1" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.createMissionImageSignedUrl).not.toHaveBeenCalled();
    expect(mocks.interpretMissionSnapshot).not.toHaveBeenCalled();
  });
});
