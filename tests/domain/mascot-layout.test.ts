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

  it("overlaps Coco's frame with the main chatbox by 10px", () => {
    const stageHeight = numericStyleValue(mascotStageStyle.height);
    const spriteBottom = numericStyleValue(mascotSpriteWrapStyle.bottom);
    const spriteHeight = numericStyleValue(mascotSpriteWrapStyle.height);
    const dialogueBottom = numericStyleValue(mascotDialogueShellStyle.bottom);
    const dialogueHeight = numericStyleValue(mascotDialogueShellStyle.height);

    const spriteTop = stageHeight - spriteBottom - spriteHeight;
    const spriteEnd = spriteTop + spriteHeight;
    const dialogueStart = stageHeight - dialogueBottom - dialogueHeight;

    expect(spriteEnd - dialogueStart).toBe(10);
  });

  it("fits four dialogue text lines inside the constant-height chatbox", () => {
    const shellHeight = numericStyleValue(mascotDialogueShellStyle.height);
    const padding = numericStyleValue(mascotDialogueBoxStyle.padding);
    const fontSize = numericStyleValue(mascotDialogueTextStyle.fontSize);
    const lineHeight = numericStyleValue(mascotDialogueTextStyle.lineHeight);
    expect(mascotDialogueBoxStyle.border).toBe("2px solid #2563EB");
    const borderWidth = 2;
    const textCapacity = shellHeight - 2 * padding - 2 * borderWidth;
    expect(textCapacity).toBeGreaterThanOrEqual(4 * fontSize * lineHeight);
  });

  it("keeps the pager inside the stage below the chatbox", () => {
    const dialogueBottom = numericStyleValue(mascotDialogueShellStyle.bottom);
    const pagerOverhang = -numericStyleValue(mascotDialoguePagerStyle.bottom);
    expect(dialogueBottom).toBeGreaterThan(pagerOverhang);
  });
});
