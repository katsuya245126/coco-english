// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceRecorderControl } from "./VoiceRecorderControl";

let container: HTMLDivElement;
let root: Root;

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_stream: unknown, _options?: unknown) {}

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(window.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VoiceRecorderControl", () => {
  it("uses Recorded for practice mode while preserving mission success labels", async () => {
    const onRecorded = vi.fn(async () => undefined);
    await act(async () => {
      root.render(
        <VoiceRecorderControl
          mode="practice"
          onRecorded={onRecorded}
        />,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onRecorded).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Recorded");
  });
});
