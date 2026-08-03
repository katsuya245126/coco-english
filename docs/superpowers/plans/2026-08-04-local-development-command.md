# Local Development Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one safe `npm run dev:local` command that starts local Supabase and Coco without using the production database.

**Architecture:** A small Bash launcher owns the existing Supabase CLI startup and environment mapping. An integration-style Vitest test replaces `npx` and `npm` with temporary fakes so it can prove both local mapping and hosted-URL refusal without starting Docker or Next.js.

**Tech Stack:** Bash, npm scripts, Vitest, Supabase CLI

## Global Constraints

- Docker Desktop remains a prerequisite.
- The launcher must refuse any Supabase API URL that is not `localhost` or `127.0.0.1`.
- Provider values continue to come from `.env.local`.
- Do not edit `.env.local`, copy production data, add a dependency, or change production.
- Preserve all unrelated and existing worktree changes.

---

### Task 1: Safe local development launcher

**Files:**
- Create: `scripts/dev-local.sh`
- Modify: `package.json`
- Create: `tests/scripts/dev-local.test.ts`
- Modify: `docs/testing/pronunciation-practice.md`

**Interfaces:**
- Consumes: `npx supabase start` and `npx supabase status -o env`
- Produces: `npm run dev:local`

- [ ] **Step 1: Write the failing launcher tests**

Create `tests/scripts/dev-local.test.ts`:

```ts
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function executable(path: string, content: string) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function runLauncher(apiUrl: string) {
  const directory = mkdtempSync(join(tmpdir(), "coco-dev-local-"));
  const output = join(directory, "captured-env");
  executable(
    join(directory, "npx"),
    `#!/usr/bin/env bash
if [[ "$*" == "supabase start" ]]; then exit 0; fi
if [[ "$*" == "supabase status -o env" ]]; then
  cat <<'ENV'
API_URL="${apiUrl}"
PUBLISHABLE_KEY="local-publishable"
SECRET_KEY="local-secret"
ENV
  exit 0
fi
exit 1
`,
  );
  executable(
    join(directory, "npm"),
    `#!/usr/bin/env bash
printf '%s\n' "$NEXT_PUBLIC_SUPABASE_URL" "$NEXT_PUBLIC_SUPABASE_ANON_KEY" "$SUPABASE_SERVICE_ROLE_KEY" "$PIN_HASH_PEPPER" > "$CAPTURE_ENV"
`,
  );

  const result = spawnSync("bash", ["scripts/dev-local.sh"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      CAPTURE_ENV: output,
    },
  });
  return {
    ...result,
    captured: result.status === 0 ? readFileSync(output, "utf8") : "",
  };
}

describe("dev-local launcher", () => {
  it("maps generated local Supabase values into the app environment", () => {
    const result = runLauncher("http://127.0.0.1:54321");

    expect(result.status).toBe(0);
    expect(result.captured).toBe(
      "http://127.0.0.1:54321\nlocal-publishable\nlocal-secret\ncoco-local-pronunciation-manual\n",
    );
  });

  it("refuses a hosted Supabase URL before starting Next.js", () => {
    const result = runLauncher("https://example.supabase.co");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing to start");
    expect(result.captured).toBe("");
  });
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
npx vitest run tests/scripts/dev-local.test.ts
```

Expected: FAIL because `scripts/dev-local.sh` does not exist.

- [ ] **Step 3: Add the launcher**

Create `scripts/dev-local.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

npx supabase start
eval "$(npx supabase status -o env)"

case "${API_URL:-}" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    echo "Refusing to start: Supabase API URL is not local." >&2
    exit 1
    ;;
esac

if [[ -z "${PUBLISHABLE_KEY:-}" || -z "${SECRET_KEY:-}" ]]; then
  echo "Refusing to start: local Supabase keys are missing." >&2
  exit 1
fi

export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$PUBLISHABLE_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SECRET_KEY"
export PIN_HASH_PEPPER="coco-local-pronunciation-manual"

exec npm run dev
```

Make it executable:

```bash
chmod +x scripts/dev-local.sh
```

Add this package script immediately after `dev` in `package.json`:

```json
"dev:local": "bash scripts/dev-local.sh",
```

- [ ] **Step 4: Document the one-command path**

Add this before the manual local environment sequence in
`docs/testing/pronunciation-practice.md`:

````markdown
For normal local development, start Docker Desktop and run:

```bash
npm run dev:local
```

The launcher starts local Supabase, refuses hosted Supabase URLs, and starts
Next.js with the local database values. The longer environment sequence below
remains useful for running the gated Playwright test directly.
````

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npx vitest run tests/scripts/dev-local.test.ts
bash -n scripts/dev-local.sh
node -e 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8"))'
npm run lint
```

Expected: two launcher tests pass, Bash syntax passes, package JSON parses,
and lint has no errors.

- [ ] **Step 6: Verify the real local startup**

With Docker Desktop open, run:

```bash
npm run dev:local
```

Expected: local Supabase is running and Next.js reports
`http://localhost:3000`. Stop it with `Control+C`.

- [ ] **Step 7: Commit only the launcher files**

```bash
git add scripts/dev-local.sh package.json tests/scripts/dev-local.test.ts docs/testing/pronunciation-practice.md
git commit -m "chore: add safe local development command"
```
