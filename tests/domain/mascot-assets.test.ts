import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";

const spriteFiles = [
  "coco-neutral-alpha.png",
  "coco-happy-alpha.png",
  "coco-celebrate-alpha.png",
  "coco-encouraging-alpha.png",
  "coco-thinking-alpha.png",
  "coco-sad-alpha.png",
] as const;

describe("normalized Coco sprites", () => {
  it.each(spriteFiles)("places visible pixels at every canvas edge: %s", async (file) => {
    const spritePath = path.join(process.cwd(), "public", "images", file);
    const { data, info } = await sharp(spritePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alphaChannel = info.channels - 1;
    const hasVisiblePixel = (x: number, y: number) =>
      data[(y * info.width + x) * info.channels + alphaChannel] > 0;

    const topTouchesArt = Array.from({ length: info.width }, (_, x) => x).some(
      (x) => hasVisiblePixel(x, 0),
    );
    const bottomTouchesArt = Array.from(
      { length: info.width },
      (_, x) => x,
    ).some((x) => hasVisiblePixel(x, info.height - 1));
    const leftTouchesArt = Array.from(
      { length: info.height },
      (_, y) => y,
    ).some((y) => hasVisiblePixel(0, y));
    const rightTouchesArt = Array.from(
      { length: info.height },
      (_, y) => y,
    ).some((y) => hasVisiblePixel(info.width - 1, y));

    expect({
      topTouchesArt,
      rightTouchesArt,
      bottomTouchesArt,
      leftTouchesArt,
    }).toEqual({
      topTouchesArt: true,
      rightTouchesArt: true,
      bottomTouchesArt: true,
      leftTouchesArt: true,
    });
  });
});
