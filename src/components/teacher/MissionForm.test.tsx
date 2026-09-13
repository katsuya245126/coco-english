// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMissionAction: vi.fn(),
  updateMissionAction: vi.fn(),
  generateOpenerAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/app/teacher/missions/actions", () => ({
  createMissionAction: mocks.createMissionAction,
  updateMissionAction: mocks.updateMissionAction,
  generateOpenerAction: mocks.generateOpenerAction,
  uploadMissionPictureAction: vi.fn(),
}));

import { uploadMissionPictureAction } from "@/app/teacher/missions/actions";
import { MissionForm } from "./MissionForm";

let container: HTMLDivElement;
let root: Root;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:picture-preview"),
    revokeObjectURL: vi.fn(),
  });
  mocks.createMissionAction.mockResolvedValue({ ok: false, error: "stop" });
  mocks.updateMissionAction.mockResolvedValue({ ok: false, error: "stop" });
  mocks.generateOpenerAction.mockResolvedValue({ ok: true, opener: "Hello" });
  vi.mocked(uploadMissionPictureAction).mockResolvedValue({
    ok: true,
    picture: {
      objectKey: "teachers/teacher-1/11111111-1111-4111-8111-111111111111.jpg",
      description: "A child choosing an apple.",
      mimeType: "image/jpeg",
    },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function renderForm() {
  await act(async () => {
    root.render(<MissionForm mode="create" />);
  });
}

describe("MissionForm turn editor", () => {
  it("keeps one Add turn button below the final turn and appends a blank turn", async () => {
    await renderForm();

    const addTurnButtons = Array.from(container.querySelectorAll("button")).filter(
      (button) => button.textContent?.trim() === "Add turn",
    );
    const finalTurnField = container.querySelector("#turn-0-picture-file");

    expect(addTurnButtons).toHaveLength(1);
    expect(finalTurnField).not.toBeNull();
    const addTurnButton = addTurnButtons[0];
    if (!finalTurnField || !addTurnButton) {
      throw new Error("Expected the turn editor Add turn control and final field");
    }
    expect(
      finalTurnField.compareDocumentPosition(addTurnButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await act(async () => {
      addTurnButton.click();
      await flushForm();
    });

    expect(container.querySelector<HTMLInputElement>("#turn-1-prompt")?.value).toBe("");
  });
});

describe("MissionForm picture turns", () => {
  it("offers a native picture control with privacy guidance and preview actions", async () => {
    await renderForm();

    expect(container.textContent).toContain("Add picture");
    expect(container.textContent).toContain(
      "Don't upload identifiable students or sensitive information.",
    );
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(fileInput?.accept).toBe("image/jpeg,image/png,image/webp");

    const file = new File(["image"], "apple.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("Replace");
    expect(container.textContent).toContain("Remove");
    expect(container.querySelector('img[src="blob:picture-preview"]')).not.toBeNull();
    expect(container.querySelector("#turn-0-picture-description")).not.toBeNull();
  });

  it("uploads pending files before saving and serializes only returned immutable metadata", async () => {
    await renderForm();
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    const file = new File(["image"], "apple.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const description = container.querySelector<HTMLInputElement>(
      "#turn-0-picture-description",
    );
    await act(async () => {
      if (description) setInputValue(description, "A child choosing an apple.");
    });

    await act(async () => {
      container
        .querySelector<HTMLFormElement>("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadMissionPictureAction).toHaveBeenCalledTimes(1);
    const uploadForm = vi.mocked(uploadMissionPictureAction).mock.calls[0]?.[0];
    expect(uploadForm?.get("file")).toBe(file);
    expect(uploadForm?.get("description")).toBe("A child choosing an apple.");
    expect(mocks.createMissionAction).toHaveBeenCalledTimes(1);
    const missionForm = mocks.createMissionAction.mock.calls[0]?.[0] as FormData;
    const turns = JSON.parse(String(missionForm.get("turns"))) as Array<{
      picture?: { objectKey: string; description: string };
    }>;
    expect(turns[0]?.picture).toEqual({
      objectKey: "teachers/teacher-1/11111111-1111-4111-8111-111111111111.jpg",
      description: "A child choosing an apple.",
    });
    expect(
      vi.mocked(uploadMissionPictureAction).mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.createMissionAction.mock.invocationCallOrder[0] ?? Infinity);
  });

  it("does not upload a hidden pending preset picture in conversation mode", async () => {
    await renderForm();
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    const file = new File(["image"], "apple.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      container.querySelector<HTMLInputElement>("#conversation-mode")?.click();
      await flushForm();
    });
    await act(async () => {
      container
        .querySelector<HTMLFormElement>("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await flushForm();
    });

    expect(uploadMissionPictureAction).not.toHaveBeenCalled();
    expect(mocks.createMissionAction).toHaveBeenCalledTimes(1);
  });

  it("commits a successful upload before a mission validation failure so retry does not re-upload", async () => {
    await renderForm();
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    const file = new File(["image"], "apple.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const description = container.querySelector<HTMLInputElement>(
      "#turn-0-picture-description",
    );
    await act(async () => {
      if (description) setInputValue(description, "A child choosing an apple.");
    });

    await submitForm();
    await submitForm();

    expect(uploadMissionPictureAction).toHaveBeenCalledTimes(1);
    expect(mocks.createMissionAction).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("stop");
  });

  it("keeps only failed pending uploads after a partial upload succeeds", async () => {
    await renderForm();
    const addTurn = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Add turn",
    );
    await act(async () => {
      addTurn?.click();
      await flushForm();
    });

    const fileInputs = container.querySelectorAll<HTMLInputElement>(
      'input[type="file"]',
    );
    const firstFile = new File(["first"], "first.jpg", { type: "image/jpeg" });
    const secondFile = new File(["second"], "second.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInputs[0], "files", {
      configurable: true,
      value: [firstFile],
    });
    Object.defineProperty(fileInputs[1], "files", {
      configurable: true,
      value: [secondFile],
    });
    await act(async () => {
      fileInputs[0]?.dispatchEvent(new Event("change", { bubbles: true }));
      fileInputs[1]?.dispatchEvent(new Event("change", { bubbles: true }));
      await flushForm();
    });

    const upload = vi.mocked(uploadMissionPictureAction);
    upload.mockReset();
    upload
      .mockResolvedValueOnce({
        ok: true,
        picture: {
          objectKey:
            "teachers/teacher-1/11111111-1111-4111-8111-111111111111.jpg",
          description: "First picture.",
          mimeType: "image/jpeg",
        },
      })
      .mockResolvedValueOnce({ ok: false, error: "second upload failed" });

    await submitForm();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(mocks.createMissionAction).not.toHaveBeenCalled();

    upload.mockResolvedValueOnce({
      ok: true,
      picture: {
        objectKey:
          "teachers/teacher-1/22222222-2222-4222-8222-222222222222.jpg",
        description: "Second picture.",
        mimeType: "image/jpeg",
      },
    });
    await submitForm();

    expect(upload).toHaveBeenCalledTimes(3);
    expect(upload.mock.calls[2]?.[0].get("file")).toBe(secondFile);
  });

  it("revokes a pending picture preview before shifting turns", async () => {
    await renderForm();
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    const file = new File(["image"], "apple.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
      await flushForm();
    });

    const addTurn = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Add turn",
    );
    await act(async () => {
      addTurn?.click();
      await flushForm();
    });
    const removeTurn = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Remove turn",
    );
    await act(async () => {
      removeTurn?.click();
      await flushForm();
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picture-preview");
  });
});

async function flushForm() {
  await Promise.resolve();
  await Promise.resolve();
}

async function submitForm() {
  await act(async () => {
    container
      .querySelector<HTMLFormElement>("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushForm();
  });
}
