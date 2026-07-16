import { describe, expect, it } from "vitest";
import {
  mascotDialogueShellStyle,
  mascotDialogueTabsStyle,
  mascotSpriteWrapStyle,
  mascotStageStyle,
} from "@/components/student/styles";

function numericStyleValue(value: unknown): number {
  expect(typeof value).toBe("number");
  return value as number;
}

describe("mascot stage geometry", () => {
  it("keeps the attached dialogue controls below Coco's face", () => {
    const stageHeight = numericStyleValue(mascotStageStyle.height);
    const spriteBottom = numericStyleValue(mascotSpriteWrapStyle.bottom);
    const spriteHeight = numericStyleValue(mascotSpriteWrapStyle.height);
    const dialogueBottom = numericStyleValue(mascotDialogueShellStyle.bottom);
    const dialogueHeight = numericStyleValue(mascotDialogueShellStyle.height);
    const tabsTop = numericStyleValue(mascotDialogueTabsStyle.top);

    const spriteTop = stageHeight - spriteBottom - spriteHeight;
    const spriteEnd = spriteTop + spriteHeight;
    const tabsStart = stageHeight - dialogueBottom - dialogueHeight + tabsTop;

    expect(spriteTop).toBe(0);
    expect(tabsStart).toBeGreaterThanOrEqual(spriteEnd - 2);
  });
});
