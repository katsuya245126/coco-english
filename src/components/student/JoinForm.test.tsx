// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JoinForm } from "./JoinForm";
import { rememberClass } from "./remembered-class";

const joinActionMocks = vi.hoisted(() => ({
  resolveClassAction: vi.fn(),
  resolveRememberedClassAction: vi.fn(),
}));

vi.mock("@/app/join/actions", () => ({
  resolveClassAction: joinActionMocks.resolveClassAction,
  resolveRememberedClassAction: joinActionMocks.resolveRememberedClassAction,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  joinActionMocks.resolveClassAction.mockReset();
  joinActionMocks.resolveRememberedClassAction.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.localStorage.clear();
});

describe("JoinForm", () => {
  it("keeps manual class-code entry short and child-friendly", async () => {
    await act(async () => {
      root.render(<JoinForm showRemembered={false} />);
    });

    expect(container.querySelector("h1")?.textContent).toBe("Join class");
    expect(container.textContent).toContain("Choose your class.");
    expect(container.textContent).not.toContain("Enter your class");
    expect(container.textContent).not.toContain("Enter the class code from");
    expect(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.textContent,
    ).toBe("Join");
    expect(container.querySelector("label")?.textContent).toBe("Class code");
  });

  it("shows a remembered class as the primary login shortcut", async () => {
    rememberClass({
      classId: "class_123",
      className: "Test class",
      displayCode: "ABC123",
    });
    joinActionMocks.resolveRememberedClassAction.mockResolvedValue({
      ok: false,
    });

    await act(async () => {
      root.render(<JoinForm showRemembered={true} />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Test class");
    expect(container.textContent).not.toContain("Welcome back");
    expect(container.textContent).not.toContain("You will still enter your PIN");
    expect(container.textContent).not.toContain("Forget this class");
    expect(container.textContent).not.toContain("Change");

    const loginButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Login",
    );
    expect(loginButton).not.toBeUndefined();

    await act(async () => {
      loginButton?.click();
      await Promise.resolve();
    });

    expect(joinActionMocks.resolveRememberedClassAction).toHaveBeenCalledWith(
      "class_123",
    );
  });

  it("uses the existing pressed-color state on join-screen buttons", async () => {
    rememberClass({
      classId: "class_123",
      className: "Test class",
      displayCode: "ABC123",
    });
    joinActionMocks.resolveRememberedClassAction.mockResolvedValue({
      ok: false,
    });

    await act(async () => {
      root.render(<JoinForm showRemembered={true} />);
      await Promise.resolve();
    });

    const joinButton = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    const loginButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Login",
    );

    expect(joinButton?.className).toBe("student-primary-button");
    expect(loginButton?.className).toBe("student-primary-button");
  });
});
