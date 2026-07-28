/**
 * Post-build guard: assert the ffmpeg binary is traced into the audio route.
 *
 * `ffmpeg-static` builds its binary path from `__dirname` at runtime and does
 * not publish the file, so @vercel/nft cannot see it by static analysis. The
 * `outputFileTracingIncludes` entry in next.config.ts is what puts it in the
 * function; nothing else fails if that entry is dropped, renamed, or stops
 * matching the route. The symptom in production is silent — pronunciation
 * scoring degrades without failing the student's request — so this runs on
 * postbuild to turn a silent regression into a red build.
 *
 * Deliberately does NOT assert the file mode: the local checkout is already
 * 755, so asserting it here would pass for reasons unrelated to the Linux
 * function filesystem this is meant to protect.
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const ROUTE_TRACE = join(
  process.cwd(),
  ".next",
  "server",
  "app",
  "student",
  "missions",
  "[assignmentStudentId]",
  "audio",
  "route.js.nft.json",
);

const EXPECTED_SUFFIX = join("node_modules", "ffmpeg-static", "ffmpeg");

function fail(message, detail) {
  console.error(`\n✗ ffmpeg trace assertion failed: ${message}`);
  if (detail) console.error(`  ${detail}`);
  console.error(
    "\n  The audio route must ship the ffmpeg binary. Check that\n" +
      "  outputFileTracingIncludes in next.config.ts still matches this route.\n",
  );
  process.exit(1);
}

let raw;
try {
  raw = readFileSync(ROUTE_TRACE, "utf8");
} catch (error) {
  // A missing trace file means the route moved or the build shape changed.
  // Treating that as "nothing to check" is exactly the silent pass this
  // guard exists to prevent.
  fail(
    "could not read the audio route trace",
    `${ROUTE_TRACE} (${error.code ?? error.message})`,
  );
}

let files;
try {
  files = JSON.parse(raw).files;
} catch (error) {
  fail("trace file is not valid JSON", error.message);
}

if (!Array.isArray(files)) {
  fail("trace file has no files[] array");
}

const traceDir = dirname(ROUTE_TRACE);
const match = files
  .map((entry) => resolve(traceDir, entry))
  .find((path) => path.endsWith(sep + EXPECTED_SUFFIX));

if (!match) {
  fail(
    "the ffmpeg executable is not in the audio route trace",
    `looked for a files[] entry resolving to …${sep}${EXPECTED_SUFFIX}`,
  );
}

let size;
try {
  const stat = statSync(match);
  if (!stat.isFile()) fail("traced ffmpeg path is not a file", match);
  size = stat.size;
} catch (error) {
  fail("traced ffmpeg path does not exist on disk", `${match} (${error.code})`);
}

if (size === 0) {
  fail("traced ffmpeg binary is empty", match);
}

console.log(
  `✓ ffmpeg traced into the audio route (${(size / 1024 / 1024).toFixed(1)} MB)`,
);
