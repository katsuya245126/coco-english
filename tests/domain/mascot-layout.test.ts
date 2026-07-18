import { describe, expect, it } from "vitest";
import {
  mascotDialogueShellStyle,
  mascotSpriteWrapStyle,
  mascotStageStyle,
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
});
