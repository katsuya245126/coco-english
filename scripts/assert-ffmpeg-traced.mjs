/**
 * Post-build guard: assert the ffmpeg binary is traced into pronunciation
 * audio routes and the teacher pronunciation page.
 *
 * `ffmpeg-static` builds its binary path from `__dirname` at runtime and does
 * not publish the file, so @vercel/nft cannot see it by static analysis. The
 * `outputFileTracingIncludes` entries in next.config.ts are what put it in
 * each function; nothing else fails if an entry is dropped, renamed, or stops
 * matching a route. The symptom in production is silent — pronunciation
 * scoring degrades without failing the student's request — so this runs on
 * postbuild to turn a silent regression into a red build.
 *
 * Deliberately does NOT assert the file mode: the local checkout is already
 * 755, so asserting it here would pass for reasons unrelated to the Linux
 * function filesystem this is meant to protect.
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const ROUTE_TRACES = [
  {
    name: "student mission audio route",
    path: join(
      process.cwd(),
      ".next",
      "server",
      "app",
      "student",
      "missions",
      "[assignmentStudentId]",
      "audio",
      "route.js.nft.json",
    ),
  },
  {
    name: "student pronunciation audio route",
    path: join(
      process.cwd(),
      ".next",
      "server",
      "app",
      "student",
      "pronunciation",
      "[assignmentStudentId]",
      "audio",
      "route.js.nft.json",
    ),
  },
  {
    name: "teacher student page route",
    path: join(
      process.cwd(),
      ".next",
      "server",
      "app",
      "teacher",
      "students",
      "[id]",
      "page.js.nft.json",
    ),
  },
];

const EXPECTED_SUFFIX = join("node_modules", "ffmpeg-static", "ffmpeg");

function fail(message, detail) {
  console.error(`\n✗ ffmpeg trace assertion failed: ${message}`);
  if (detail) console.error(`  ${detail}`);
  console.error(
    "\n  Each checked function must ship the ffmpeg binary. Check that\n" +
      "  outputFileTracingIncludes in next.config.ts still matches the route.\n",
  );
  process.exit(1);
}

for (const route of ROUTE_TRACES) {
  let raw;
  try {
    raw = readFileSync(route.path, "utf8");
  } catch (error) {
    // A missing trace file means the route moved or the build shape changed.
    // Treating that as "nothing to check" is exactly the silent pass this
    // guard exists to prevent.
    fail(
      `could not read the ${route.name} trace`,
      `${route.path} (${error.code ?? error.message})`,
    );
  }

  let files;
  try {
    files = JSON.parse(raw).files;
  } catch (error) {
    fail(`${route.name} trace is not valid JSON`, error.message);
  }

  if (!Array.isArray(files)) {
    fail(`${route.name} trace has no files[] array`);
  }

  const traceDir = dirname(route.path);
  const match = files
    .map((entry) => resolve(traceDir, entry))
    .find((path) => path.endsWith(sep + EXPECTED_SUFFIX));

  if (!match) {
    fail(
      `the ffmpeg executable is not in the ${route.name} trace`,
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
    `✓ ffmpeg traced into the ${route.name} (${(size / 1024 / 1024).toFixed(1)} MB)`,
  );
}
