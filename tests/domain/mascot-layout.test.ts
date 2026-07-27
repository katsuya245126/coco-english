import { describe, expect, it } from "vitest";
import {
  mascotDialogueShellStyle,
  mascotSpriteWrapStyle,
  mascotStageStyle,
  mascotDialogueBoxStyle,
  mascotDialoguePagerStyle,
  mascotDialogueTextStyle,
} from "@/components/student/styles";

function numericStyleValue(value: unknown): number {
  expect(typeof value).toBe("number");
  return value as number;
}

// The dialogue height is responsive — clamp(144px, 44vw, 168px) — so every
// geometric invariant below is checked at BOTH endpoints rather than at a
// single fixed height. The 144px floor is the tight end: it leaves only 2.4px
// of slack on the four-line fit, so a future clamp edit that lowers it must
// fail loudly here.
//
// The endpoints are parsed from the style rather than hardcoded. Asserting the
// clamp here instead would throw during it.each argument collection, which
// vitest reports as "no tests" — hiding the real geometry failure. The clamp's
// exact value stays pinned by the source-contract test in tts-ui-source.

function clampEndpoints(value: unknown): number[] {
  const bounds = String(value).match(
    /^clamp\((\d+)px,\s*[^,]+,\s*(\d+)px\)$/u,
  );
  if (!bounds) {
    throw new Error(`unexpected dialogue height clamp: ${String(value)}`);
  }
  return [Number(bounds[1]), Number(bounds[2])];
}

/**
 * Resolves the two style expressions that depend on --coco-dialogue-height:
 * "var(--coco-dialogue-height)" and "calc(var(--coco-dialogue-height) - 10px)".
 * Anything else is rejected, so a value that stops tracking the variable fails
 * rather than silently resolving to a stale number.
 */
function resolveDialogueExpression(value: unknown, dialogueHeight: number) {
  expect(typeof value).toBe("string");
  const expression = value as string;

  if (expression === "var(--coco-dialogue-height)") return dialogueHeight;

  const offset = expression.match(
    /^calc\(var\(--coco-dialogue-height\)\s*-\s*(\d+)px\)$/u,
  );
  expect(offset, `unexpected dialogue expression: ${expression}`).not.toBeNull();
  return dialogueHeight - Number(offset![1]);
}

describe("mascot stage geometry", () => {
  it("caps Coco's centered frame at 226px with narrow-screen safety insets", () => {
    expect(mascotSpriteWrapStyle.left).toBe(
      "max(24px, calc((100% - 226px) / 2))",
    );
    expect(mascotSpriteWrapStyle.right).toBeUndefined();
    expect(mascotSpriteWrapStyle.width).toBe(
      "min(226px, calc(100% - 48px))",
    );
  });

  it.each(clampEndpoints(mascotStageStyle["--coco-dialogue-height"]))(
    "overlaps Coco's frame with the main chatbox by 10px at a %ipx dialogue height",
    (dialogueHeight) => {
      const stageHeight = numericStyleValue(mascotStageStyle.height);
      const spriteHeight = numericStyleValue(mascotSpriteWrapStyle.height);
      const dialogueBottom = numericStyleValue(mascotDialogueShellStyle.bottom);
      const spriteBottom = resolveDialogueExpression(
        mascotSpriteWrapStyle.bottom,
        dialogueHeight,
      );
      const shellHeight = resolveDialogueExpression(
        mascotDialogueShellStyle.height,
        dialogueHeight,
      );

      const spriteTop = stageHeight - spriteBottom - spriteHeight;
      const spriteEnd = spriteTop + spriteHeight;
      const dialogueStart = stageHeight - dialogueBottom - shellHeight;

      // Expressing the sprite's bottom in terms of the dialogue height makes
      // this invariant hold by construction; the old fixed 166px held it at
      // exactly one dialogue height.
      expect(spriteEnd - dialogueStart).toBe(10);
    },
  );

  it.each(clampEndpoints(mascotStageStyle["--coco-dialogue-height"]))(
    "fits four dialogue text lines at a %ipx dialogue height",
    (dialogueHeight) => {
      const shellHeight = resolveDialogueExpression(
        mascotDialogueShellStyle.height,
        dialogueHeight,
      );
      const padding = numericStyleValue(mascotDialogueBoxStyle.padding);
      const fontSize = numericStyleValue(mascotDialogueTextStyle.fontSize);
      const lineHeight = numericStyleValue(mascotDialogueTextStyle.lineHeight);
      expect(mascotDialogueBoxStyle.border).toBe("2px solid #2563EB");
      const borderWidth = 2;
      const textCapacity = shellHeight - 2 * padding - 2 * borderWidth;
      expect(textCapacity).toBeGreaterThanOrEqual(4 * fontSize * lineHeight);
    },
  );

  // The pager deliberately hangs BELOW the chatbox and outside the stage box
  // (6d54e7b6 moved the dialogue shell to bottom: 0). Containment is no longer
  // the invariant — accommodation is: the stage must not clip the overhang,
  // and its bottom margin must reserve at least as much room as the overhang.
  it("accommodates the pager overhang below the stage", () => {
    const pagerOverhang = -numericStyleValue(mascotDialoguePagerStyle.bottom);
    expect(pagerOverhang).toBeGreaterThan(0);
    expect(mascotStageStyle.overflow).toBe("visible");
    expect(numericStyleValue(mascotStageStyle.marginBottom)).toBeGreaterThanOrEqual(
      pagerOverhang,
    );
  });
});
