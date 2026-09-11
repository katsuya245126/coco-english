// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MascotStage } from "./MascotStage";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img alt="" {...props} />,
}));

vi.mock("@/components/student/CocoDialogueBox", () => ({
  CocoDialogueBox: (props: { compactSpriteSrc?: string | null }) => (
    <div data-compact-sprite={props.compactSpriteSrc ?? ""} />
  ),
}));

let container: HTMLDivElement;
let root: Root;
let imageCompleteDescriptor: PropertyDescriptor | undefined;
let imageNaturalWidthDescriptor: PropertyDescriptor | undefined;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const baseProps = {
  assignmentStudentId: "as-1",
  displayName: "Coco",
  dialogueText: "What is under the chair?",
  playing: false,
  amplitudeRef: { current: 0 },
  step: "question" as const,
};

beforeEach(() => {
  imageCompleteDescriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "complete",
  );
  imageNaturalWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "naturalWidth",
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  if (imageCompleteDescriptor) {
    Object.defineProperty(
      HTMLImageElement.prototype,
      "complete",
      imageCompleteDescriptor,
    );
  }
  if (imageNaturalWidthDescriptor) {
    Object.defineProperty(
      HTMLImageElement.prototype,
      "naturalWidth",
      imageNaturalWidthDescriptor,
    );
  }
  vi.restoreAllMocks();
});

describe("MascotStage picture turn", () => {
  it("renders a contained picture and compact Coco in the dialogue", async () => {
    await act(async () => {
      root.render(
        <MascotStage
          {...baseProps}
          picture={{
            src: "/student/missions/as-1/picture/1",
            alt: "An orange ball under a blue chair.",
          }}
        />,
      );
    });

    const picture = container.querySelector<HTMLImageElement>(
      'img[data-picture-image="true"]',
    );
    expect(picture).not.toBeNull();
    expect(picture?.alt).toBe("An orange ball under a blue chair.");
    expect(picture?.getAttribute("src")).toBe(
      "/student/missions/as-1/picture/1?retry=0",
    );
    expect(picture?.style.objectFit).toBe("contain");
    expect(container.querySelector('[data-compact-sprite="/images/coco-encouraging-alpha.png"]')).not.toBeNull();
  });

  it("preserves an explicitly supplied thinking expression on a picture question", async () => {
    await act(async () => {
      root.render(
        <MascotStage
          {...baseProps}
          expression="thinking"
          picture={{
            src: "/student/missions/as-1/picture/1",
            alt: "An orange ball under a blue chair.",
          }}
        />,
      );
    });

    expect(
      container.querySelector('[data-compact-sprite="/images/coco-thinking-alpha.png"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-compact-sprite="/images/coco-encouraging-alpha.png"]'),
    ).toBeNull();
  });

  it("reports a cached picture as ready when it is complete with natural width", async () => {
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => 640,
    });
    const onPictureReady = vi.fn();

    await act(async () => {
      root.render(
        <MascotStage
          {...baseProps}
          picture={{ src: "/student/missions/as-1/picture/1", alt: "A picture." }}
          onPictureReady={onPictureReady}
        />,
      );
    });

    expect(onPictureReady).toHaveBeenLastCalledWith(true);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows the picture error state when a cached picture is complete without pixels", async () => {
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => 0,
    });
    const onPictureReady = vi.fn();

    await act(async () => {
      root.render(
        <MascotStage
          {...baseProps}
          picture={{ src: "/student/missions/as-1/picture/1", alt: "A picture." }}
          onPictureReady={onPictureReady}
          onBackToHomework={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain("The picture couldn't load.");
    expect(onPictureReady).toHaveBeenLastCalledWith(false);
  });

  it("shows Retry and Back to homework and reports recording blocked after load failure", async () => {
    const onPictureReady = vi.fn();
    await act(async () => {
      root.render(
        <MascotStage
          {...baseProps}
          picture={{ src: "/student/missions/as-1/picture/1", alt: "A picture." }}
          onPictureReady={onPictureReady}
          onBackToHomework={vi.fn()}
        />,
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLImageElement>('img[data-picture-image="true"]')
        ?.dispatchEvent(new Event("error"));
    });

    expect(container.textContent).toContain("Retry");
    expect(container.textContent).toContain("Back to homework");
    expect(container.textContent).not.toContain("Skip");
    expect(onPictureReady).toHaveBeenLastCalledWith(false);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Retry picture"]')
        ?.click();
    });
    expect(
      container
        .querySelector<HTMLImageElement>('img[data-picture-image="true"]')
        ?.getAttribute("src"),
    ).toBe("/student/missions/as-1/picture/1?retry=1");
  });
});
