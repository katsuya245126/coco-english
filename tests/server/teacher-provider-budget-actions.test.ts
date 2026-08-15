import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireTeacherProfile,
  mockConsume,
  mockOpener,
  mockCreateMission,
  mockUpdateMission,
  mockAssignMissionToClass,
  mockGetMissionForTeacher,
  mockListAssignableClassesForTeacher,
} = vi.hoisted(() => ({
  mockRequireTeacherProfile: vi.fn(),
  mockConsume: vi.fn(),
  mockOpener: vi.fn(),
  mockCreateMission: vi.fn(),
  mockUpdateMission: vi.fn(),
  mockAssignMissionToClass: vi.fn(),
  mockGetMissionForTeacher: vi.fn(),
  mockListAssignableClassesForTeacher: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/auth/teacher-profile", () => ({
  requireTeacherProfile: mockRequireTeacherProfile,
}));

vi.mock("@/server/security/request-budget", () => ({
  consumeRequestBudget: mockConsume,
}));

vi.mock("@/server/ai/opener-generator", () => ({
  generateOpener: mockOpener,
}));

vi.mock("@/server/mission/mission-service", () => ({
  createMission: mockCreateMission,
  updateMission: mockUpdateMission,
  getMissionForTeacher: mockGetMissionForTeacher,
  archiveMission: vi.fn(),
  restoreMission: vi.fn(),
  cancelMissionAssignment: vi.fn(),
  listMissionAssignmentsForTeacher: vi.fn(),
}));

vi.mock("@/server/mission/assign-service", () => ({
  assignMissionToClass: mockAssignMissionToClass,
  listAssignableClassesForTeacher: mockListAssignableClassesForTeacher,
}));

const RATE_LIMIT_COPY =
  "You’ve made several AI requests. Wait a few minutes and try again.";

const MISSION_ID = "11111111-1111-4111-8111-111111111111";
const CLASS_ID = "22222222-2222-4222-8222-222222222222";

const ownedMission = { id: MISSION_ID, title: "Ordering food", turns: [] };
const ownedClass = { id: CLASS_ID, name: "Class A" };

const validOpenerInput = {
  targetPattern: "I would like _____",
};

function validMissionFormData(missionId = MISSION_ID) {
  const formData = new FormData();
  formData.set("missionId", missionId);
  formData.set("title", "Ordering food");
  formData.set("level", "elementary");
  formData.set("targetPattern", "I would like _____");
  formData.set("conversationMode", "on");
  formData.set("requireCompleteSentenceAnswers", "on");
  // Conversation-mode missions must declare between 3 and 8 required turns.
  formData.set("requiredTurns", "3");
  formData.set(
    "turns",
    JSON.stringify([
      {
        turnOrder: 1,
        prompt: "What would you like to eat?",
        targetExample: "I would like pizza.",
        answerShape: "open",
        hintLadder: {
          tier1: "I would like _____",
          tier2: "pizza",
          tier3: "I would like pizza.",
        },
      },
    ]),
  );
  return formData;
}

function validAssignmentFormData() {
  const formData = new FormData();
  formData.set("missionId", MISSION_ID);
  formData.set("classId", CLASS_ID);
  formData.set("dueAt", "");
  return formData;
}

async function actions() {
  return await import("@/app/teacher/missions/actions");
}

describe("teacher provider budget actions", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireTeacherProfile.mockReset();
    mockConsume.mockReset();
    mockOpener.mockReset();
    mockCreateMission.mockReset();
    mockUpdateMission.mockReset();
    mockAssignMissionToClass.mockReset();
    mockGetMissionForTeacher.mockReset();
    mockListAssignableClassesForTeacher.mockReset();

    mockRequireTeacherProfile.mockResolvedValue({ id: "teacher-1" });
    mockConsume.mockResolvedValue({ allowed: true });
    mockOpener.mockResolvedValue({ ok: true, opener: "Hi! What's good here?" });
    mockCreateMission.mockResolvedValue({ id: MISSION_ID });
    mockUpdateMission.mockResolvedValue({ id: MISSION_ID });
    mockAssignMissionToClass.mockResolvedValue({
      className: "Class A",
      activeStudentCount: 3,
    });
    mockGetMissionForTeacher.mockResolvedValue(ownedMission);
    mockListAssignableClassesForTeacher.mockResolvedValue([ownedClass]);
  });

  it("denies opener generation before provider work", async () => {
    mockConsume.mockResolvedValue({ allowed: false, retryAfterSeconds: 300 });

    await expect(
      (await actions()).generateOpenerAction(validOpenerInput),
    ).resolves.toEqual({
      ok: false,
      error: RATE_LIMIT_COPY,
    });
    expect(mockOpener).not.toHaveBeenCalled();
  });

  it("admits opener generation exactly once", async () => {
    await expect(
      (await actions()).generateOpenerAction(validOpenerInput),
    ).resolves.toMatchObject({ ok: true });
    expect(mockConsume).toHaveBeenCalledWith({
      actorId: "teacher-1",
      operation: "teacher_provider",
    });
    expect(mockOpener).toHaveBeenCalledTimes(1);
  });

  it("creates a mission without consuming the provider budget", async () => {
    mockConsume.mockResolvedValue({ allowed: false, retryAfterSeconds: 300 });

    const { createMissionAction } = await actions();
    await expect(createMissionAction(validMissionFormData())).resolves.toMatchObject({
      ok: true,
    });
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockCreateMission).toHaveBeenCalledTimes(1);
  });

  it("admits mission create and mutates once", async () => {
    const { createMissionAction } = await actions();
    await expect(
      createMissionAction(validMissionFormData()),
    ).resolves.toMatchObject({ ok: true });
    expect(mockCreateMission).toHaveBeenCalledTimes(1);
  });

  it("accepts a preset payload without a mission-level pattern", async () => {
    const formData = validMissionFormData();
    formData.set("conversationMode", "false");
    formData.set("requiredTurns", "1");
    formData.delete("targetPattern");
    formData.set(
      "turns",
      JSON.stringify([
        {
          prompt: "What would you like to eat?",
          targetPattern: "I would like ___.",
          targetExample: "I would like pizza.",
          answerShape: "open",
          hintLadder: {
            tier1: "Try I would like...",
            tier2: "pizza",
            tier3: "I would like pizza.",
          },
        },
      ]),
    );

    await expect((await actions()).createMissionAction(formData)).resolves.toMatchObject({
      ok: true,
    });
    expect(mockCreateMission).toHaveBeenCalledWith(
      expect.objectContaining({ conversationMode: false }),
    );
    expect(mockCreateMission.mock.calls[0]?.[0]).not.toHaveProperty(
      "targetPattern",
    );
  });

  it("rejects a preset payload with a mission-level pattern", async () => {
    const formData = validMissionFormData();
    formData.set("conversationMode", "false");
    formData.set("requiredTurns", "1");
    formData.set(
      "turns",
      JSON.stringify([
        {
          prompt: "What would you like to eat?",
          targetPattern: "I would like ___.",
          targetExample: "I would like pizza.",
          answerShape: "open",
          hintLadder: {
            tier1: "Try I would like...",
            tier2: "pizza",
            tier3: "I would like pizza.",
          },
        },
      ]),
    );

    await expect((await actions()).createMissionAction(formData)).resolves.toEqual({
      ok: false,
      error: "Preset missions do not use a mission-level target pattern.",
    });
    expect(mockCreateMission).not.toHaveBeenCalled();
  });

  it("checks mission ownership before consuming update budget", async () => {
    mockGetMissionForTeacher.mockResolvedValue(null);

    const { updateMissionAction } = await actions();
    await updateMissionAction(validMissionFormData("foreign-mission-id"));

    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockUpdateMission).not.toHaveBeenCalled();
  });

  it("updates an owned mission without consuming the provider budget", async () => {
    mockConsume.mockResolvedValue({ allowed: false, retryAfterSeconds: 300 });

    const { updateMissionAction } = await actions();
    await expect(
      updateMissionAction(validMissionFormData()),
    ).resolves.toMatchObject({ ok: true });
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockUpdateMission).toHaveBeenCalledTimes(1);
  });

  it("checks mission and class ownership before consuming assignment budget", async () => {
    mockGetMissionForTeacher.mockResolvedValue(ownedMission);
    mockListAssignableClassesForTeacher.mockResolvedValue([]);

    const { assignMissionAction } = await actions();
    await assignMissionAction(validAssignmentFormData());

    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockAssignMissionToClass).not.toHaveBeenCalled();
  });

  it("denies an owned assignment before RPC mutation or TTS warm-up", async () => {
    mockConsume.mockResolvedValue({ allowed: false, retryAfterSeconds: 300 });

    const { assignMissionAction } = await actions();
    await expect(
      assignMissionAction(validAssignmentFormData()),
    ).resolves.toEqual({ ok: false, error: RATE_LIMIT_COPY });
    expect(mockAssignMissionToClass).not.toHaveBeenCalled();
  });

  it("returns a typed failure when the update ownership read rejects", async () => {
    mockGetMissionForTeacher.mockRejectedValue(new Error("db down"));

    const { updateMissionAction } = await actions();
    await expect(
      updateMissionAction(validMissionFormData()),
    ).resolves.toEqual({
      ok: false,
      error:
        "We could not save the mission. Check the highlighted fields and try again.",
    });
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockUpdateMission).not.toHaveBeenCalled();
  });

  it.each([
    ["mission", () => mockGetMissionForTeacher],
    ["class", () => mockListAssignableClassesForTeacher],
  ])(
    "returns a typed failure when the assignment %s ownership read rejects",
    async (_name, reader) => {
      reader().mockRejectedValue(new Error("db down"));

      const { assignMissionAction } = await actions();
      await expect(
        assignMissionAction(validAssignmentFormData()),
      ).resolves.toEqual({
        ok: false,
        error: "We could not assign this mission. Please try again.",
      });
      expect(mockConsume).not.toHaveBeenCalled();
      expect(mockAssignMissionToClass).not.toHaveBeenCalled();
    },
  );

  it("fails opener generation closed when the budget check rejects", async () => {
    mockConsume.mockRejectedValue(new Error("budget rpc down"));

    await expect(
      (await actions()).generateOpenerAction(validOpenerInput),
    ).resolves.toEqual({
      ok: false,
      error: RATE_LIMIT_COPY,
    });
    expect(mockOpener).not.toHaveBeenCalled();
  });

  it("admits an owned assignment and assigns once", async () => {
    const { assignMissionAction } = await actions();
    await expect(
      assignMissionAction(validAssignmentFormData()),
    ).resolves.toMatchObject({ ok: true });
    expect(mockAssignMissionToClass).toHaveBeenCalledTimes(1);
  });
});
