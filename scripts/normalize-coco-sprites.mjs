import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const spriteFiles = [
  "coco-neutral-alpha.png",
  "coco-happy-alpha.png",
  "coco-celebrate-alpha.png",
  "coco-encouraging-alpha.png",
  "coco-thinking-alpha.png",
  "coco-sad-alpha.png",
];

const [sourceDirectory, outputDirectory] = process.argv.slice(2);

if (!sourceDirectory || !outputDirectory) {
  throw new Error(
    "Usage: node scripts/normalize-coco-sprites.mjs <source-directory> <output-directory>",
  );
}

await mkdir(outputDirectory, { recursive: true });

for (const file of spriteFiles) {
  const sourcePath = path.join(sourceDirectory, file);
  const outputPath = path.join(outputDirectory, file);
  const temporaryPath = `${outputPath}.normalized.tmp.png`;
  const { data: sourcePixels, info: sourceInfo } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alphaChannel = sourceInfo.channels - 1;

  let left = sourceInfo.width;
  let top = sourceInfo.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < sourceInfo.height; y += 1) {
    for (let x = 0; x < sourceInfo.width; x += 1) {
      const alphaIndex =
        (y * sourceInfo.width + x) * sourceInfo.channels + alphaChannel;
      if (sourcePixels[alphaIndex] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    throw new Error(`${file} has no visible pixels`);
  }

  const width = right - left + 1;
  const height = bottom - top + 1;

  await sharp(sourcePath)
    .extract({ left, top, width, height })
    .png()
    .toFile(temporaryPath);

  const { data: normalizedPixels, info: normalizedInfo } = await sharp(
    temporaryPath,
  )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const expectedPixels = Buffer.alloc(
    width * height * sourceInfo.channels,
  );

  for (let y = 0; y < height; y += 1) {
    const sourceStart =
      ((top + y) * sourceInfo.width + left) * sourceInfo.channels;
    const sourceEnd = sourceStart + width * sourceInfo.channels;
    sourcePixels.copy(
      expectedPixels,
      y * width * sourceInfo.channels,
      sourceStart,
      sourceEnd,
    );
  }

  if (
    normalizedInfo.width !== width ||
    normalizedInfo.height !== height ||
    normalizedInfo.channels !== sourceInfo.channels ||
    !normalizedPixels.equals(expectedPixels)
  ) {
    throw new Error(`${file} changed visible RGBA pixels while normalizing`);
  }

  await rename(temporaryPath, outputPath);
  console.log(
    `${file}: ${sourceInfo.width}x${sourceInfo.height} -> ${width}x${height}`,
  );
}
