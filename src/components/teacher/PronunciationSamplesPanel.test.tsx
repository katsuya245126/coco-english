// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PronunciationSample } from "@/server/teacher/pronunciation-samples";

const mocks = vi.hoisted(() => ({
  confirmPronunciationSampleAction: vi.fn(),
  removePronunciationSampleAction: vi.fn(),
  uploadPronunciationSampleAction: vi.fn(),
  loadPronunciationSampleAudioUrlAction: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.routerRefresh }),
}));

vi.mock("@/app/teacher/students/[id]/actions", () => ({
  confirmPronunciationSampleAction: mocks.confirmPronunciationSampleAction,
  removePronunciationSampleAction: mocks.removePronunciationSampleAction,
  uploadPronunciationSampleAction: mocks.uploadPronunciationSampleAction,
  loadPronunciationSampleAudioUrlAction:
    mocks.loadPronunciationSampleAudioUrlAction,
}));

import {
  PronunciationSamplesPanel,
  TeacherSamplePlayback,
} from "./PronunciationSamplesPanel";

const sample: PronunciationSample = {
  id: "sample-1",
  studentId: "student-1",
  status: "pending",
  automaticTranscript: "fan",
  teacherConfirmedText: null,
  confirmedByTeacherId: null,
  confirmedAt: null,
  provisionalResult: {
    accuracyScore: 72,
    fluencyScore: 80,
    completenessScore: 90,
    pronunciationScore: 76,
    starBand: 2,
    referenceText: "fan",
    wordScores: [],
  },
  durationMs: 3_000,
  byteSize: 100,
  mimeType: "audio/webm",
  audioExpiresAt: "2026-09-20T00:00:00.000Z",
  audioAvailable: true,
  createdAt: "2026-08-21T00:00:00.000Z",
};

const confirmedSample: PronunciationSample = {
  ...sample,
  status: "confirmed",
  teacherConfirmedText: "pan",
  provisionalResult: {
    ...sample.provisionalResult!,
    referenceText: "pan",
    wordScores: [
      {
        word: "pan",
        accuracyScore: 20,
        errorType: "Mispronunciation",
        phonemes: [
          {
            phoneme: "f",
            accuracyScore: 20,
            candidates: [{ phoneme: "p", score: 80 }],
          },
        ],
      },
    ],
  },
  confirmedByTeacherId: "teacher-1",
  confirmedAt: "2026-08-31T00:00:00.000Z",
  audioAvailable: false,
};

async function renderPanel(samples: PronunciationSample[] = []) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<PronunciationSamplesPanel studentId="student-1" samples={samples} />);
  });
  return { container, root };
}

function button(container: HTMLElement, name: string) {
  return [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === name,
  ) as HTMLButtonElement | undefined;
}

describe("PronunciationSamplesPanel", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mocks.confirmPronunciationSampleAction.mockResolvedValue({
      ok: true,
      sample: confirmedSample,
    });
    mocks.removePronunciationSampleAction.mockResolvedValue({
      ok: true,
      studentId: "student-1",
    });
    mocks.uploadPronunciationSampleAction.mockResolvedValue({ ok: true, sample });
    mocks.loadPronunciationSampleAudioUrlAction.mockResolvedValue({
      ok: true,
      signedUrl: "https://signed.example/sample.webm",
    });
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("keeps Sounds to work on as the default tab and hides upload controls there", async () => {
    const rendered = await renderPanel();
    container = rendered.container;
    root = rendered.root;

    expect(button(rendered.container, "Sounds to work on")?.getAttribute("aria-selected")).toBe("true");
    expect(rendered.container.textContent).not.toContain("Add pronunciation sample");
  });

  it("shows Add pronunciation sample only after switching to the samples tab", async () => {
    const rendered = await renderPanel();
    container = rendered.container;
    root = rendered.root;

    await act(async () => button(rendered.container, "Pronunciation samples")?.click());

    expect(rendered.container.textContent).toContain("Add pronunciation sample");
    expect(rendered.container.querySelector('input[type="file"]')).not.toBeNull();
  });

  it("shows a spinner and busy state while a sample upload is pending", async () => {
    let resolveUpload!: (value: { ok: true; sample: PronunciationSample }) => void;
    mocks.uploadPronunciationSampleAction.mockImplementation(
      () => new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const rendered = await renderPanel();
    container = rendered.container;
    root = rendered.root;
    await act(async () => button(rendered.container, "Pronunciation samples")?.click());
    const input = rendered.container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(input, "files", {
        value: [new File(["audio"], "sample.webm", { type: "audio/webm" })],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => button(rendered.container, "Add pronunciation sample")?.click());

    const uploadButton = rendered.container.querySelector(
      'button[type="submit"]',
    );
    expect(uploadButton?.getAttribute("aria-busy")).toBe("true");
    expect(uploadButton?.querySelector(".spinner")).not.toBeNull();

    await act(async () => resolveUpload({ ok: true, sample }));

    const successMessage = rendered.container.querySelector(
      '[role="status"]',
    ) as HTMLElement | null;
    expect(successMessage?.textContent).toBe(
      "Sample added. It is ready for review.",
    );
    expect(successMessage?.style.color).toBe("rgb(22, 101, 52)");
    expect(rendered.container.querySelector('[role="alert"]')).toBeNull();
  });

  it("keeps the automatic transcript plain and reveals prefilled teacher wording on edit", async () => {
    const rendered = await renderPanel([sample]);
    container = rendered.container;
    root = rendered.root;
    await act(async () => button(rendered.container, "Pronunciation samples")?.click());

    expect(rendered.container.textContent).toContain("Automatic transcript");
    expect(rendered.container.textContent).toContain("fan");
    expect(
      [...rendered.container.querySelectorAll("p")].some(
        (paragraph) => paragraph.textContent === "fan",
      ),
    ).toBe(true);
    expect(rendered.container.querySelector("textarea")).toBeNull();
    expect(button(rendered.container, "Edit wording")).not.toBeUndefined();

    await act(async () => button(rendered.container, "Edit wording")?.click());

    expect(rendered.container.textContent).toContain("Teacher-confirmed wording");
    expect(rendered.container.querySelector("textarea")?.value).toBe("fan");
    expect(rendered.container.querySelector("textarea")?.rows).toBe(4);
    expect(rendered.container.textContent).toContain("Provisional pronunciation analysis");
    expect(
      rendered.container.querySelector('[aria-label="2 of 3 stars"]')?.textContent,
    ).toBe("★★☆");
    expect(rendered.container.textContent).not.toContain("star band 2");
    expect(rendered.container.textContent).toContain("Audio available until");

    await act(async () => button(rendered.container, "Play sample")?.click());
    expect(rendered.container.querySelector("audio")?.getAttribute("src")).toBe(
      "https://signed.example/sample.webm",
    );
  });

  it("shows the exact server duration message", async () => {
    mocks.uploadPronunciationSampleAction.mockResolvedValue({
      ok: false,
      error: "duration_too_long",
      message:
        "This recording is longer than 30 seconds. Trim it, then upload it again.",
    });
    const rendered = await renderPanel();
    container = rendered.container;
    root = rendered.root;
    await act(async () => button(rendered.container, "Pronunciation samples")?.click());
    const input = rendered.container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(input, "files", {
        value: [new File(["audio"], "sample.webm", { type: "audio/webm" })],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button(rendered.container, "Add pronunciation sample")?.click());

    expect(rendered.container.textContent).toContain(
      "This recording is longer than 30 seconds. Trim it, then upload it again.",
    );
    const errorMessage = rendered.container.querySelector(
      '[role="alert"]',
    ) as HTMLElement | null;
    expect(errorMessage?.style.color).toBe("rgb(180, 35, 24)");
    expect(rendered.container.querySelector('[role="status"]')).toBeNull();
  });

  it("shows confirmed evidence and provenance while hiding expired playback", async () => {
    const rendered = await renderPanel([confirmedSample]);
    container = rendered.container;
    root = rendered.root;
    await act(async () => button(rendered.container, "Pronunciation samples")?.click());

    expect(rendered.container.textContent).toContain("Confirmed");
    expect(rendered.container.textContent).toContain("Confirmed pronunciation analysis");
    expect(rendered.container.textContent).toContain("Weak sounds and example words");
    expect(rendered.container.textContent).toContain("Expected /f/; sounded closer to /p/.");
    expect(rendered.container.textContent).toContain("Example words: “pan”");
    expect(rendered.container.textContent).toContain("Confirmed by teacher");
    expect(rendered.container.textContent).toContain("Teacher-confirmed wording");
    expect(rendered.container.querySelector("textarea")).toBeNull();
    expect(rendered.container.textContent).not.toContain("Confirm sample");
    expect(rendered.container.textContent).not.toContain("Play sample");
    expect(rendered.container.textContent).toContain("Audio expired");
    expect(rendered.container.textContent).toContain("Sep 20, 2026");

    const card = rendered.container.querySelector("article") as HTMLElement;
    const actions = card.querySelector('[aria-label="Sample actions"]');
    expect(actions?.previousElementSibling?.textContent).toContain(
      "Audio expired on Sep 20, 2026",
    );
    expect(
      [...(actions?.querySelectorAll("p") ?? [])].some((paragraph) =>
        paragraph.textContent?.startsWith("Confirmed by teacher"),
      ),
    ).toBe(true);
    expect(button(card, "Remove sample")?.parentElement).toBe(actions);
  });

  it("groups pending sample actions after pronunciation analysis and expiry", async () => {
    const rendered = await renderPanel([sample]);
    container = rendered.container;
    root = rendered.root;
    await act(async () => button(rendered.container, "Pronunciation samples")?.click());

    const card = rendered.container.querySelector("article") as HTMLElement;
    const actions = card.querySelector('[aria-label="Sample actions"]');
    const cardText = card.textContent ?? "";
    expect(actions).not.toBeNull();
    expect(cardText.indexOf("Provisional pronunciation analysis")).toBeLessThan(
      cardText.indexOf("Audio available until"),
    );
    expect(cardText.indexOf("Audio available until")).toBeLessThan(
      cardText.indexOf("Confirm sample"),
    );
    expect(button(card, "Confirm sample")?.parentElement).toBe(actions);
    expect(button(card, "Remove sample")?.parentElement).toBe(actions);
  });

  it("removes a sample and refreshes the student page", async () => {
    const rendered = await renderPanel([sample]);
    container = rendered.container;
    root = rendered.root;
    await act(async () => button(rendered.container, "Pronunciation samples")?.click());

    await act(async () => button(rendered.container, "Remove sample")?.click());

    expect(mocks.removePronunciationSampleAction).toHaveBeenCalledWith("sample-1");
    expect(mocks.routerRefresh).toHaveBeenCalled();
    expect(rendered.container.querySelector('[role="status"]')?.textContent).toBe(
      "Sample removed.",
    );
  });

  it("confirms pending wording through the server action", async () => {
    const rendered = await renderPanel([sample]);
    container = rendered.container;
    root = rendered.root;
    await act(async () => button(rendered.container, "Pronunciation samples")?.click());
    await act(async () => button(rendered.container, "Edit wording")?.click());
    const textarea = rendered.container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(500);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "pan");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button(rendered.container, "Confirm sample")?.click());

    expect(mocks.confirmPronunciationSampleAction).toHaveBeenCalledWith(
      "sample-1",
      "pan",
    );
    expect(rendered.container.querySelector('[role="status"]')?.textContent).toBe(
      "Sample confirmed.",
    );
  });

  it("loads teacher-added evidence playback only after the teacher clicks", async () => {
    const playbackContainer = document.createElement("div");
    document.body.append(playbackContainer);
    const playbackRoot = createRoot(playbackContainer);
    container = playbackContainer;
    root = playbackRoot;
    await act(async () => {
      playbackRoot.render(
        <TeacherSamplePlayback
          sampleId="sample-1"
          sourceLabel="Teacher-added pronunciation sample"
        />,
      );
    });

    expect(playbackContainer.textContent).toContain(
      "Teacher-added pronunciation sample",
    );
    expect(mocks.loadPronunciationSampleAudioUrlAction).not.toHaveBeenCalled();
    expect(playbackContainer.querySelector("audio")).toBeNull();

    await act(async () => button(playbackContainer, "Play sample")?.click());

    expect(mocks.loadPronunciationSampleAudioUrlAction).toHaveBeenCalledWith(
      "sample-1",
    );
    expect(playbackContainer.querySelector("audio")?.getAttribute("src")).toBe(
      "https://signed.example/sample.webm",
    );
  });
});
