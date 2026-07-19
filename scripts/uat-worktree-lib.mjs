import path from "node:path";

export const UAT_PORT = 3200;

export function parseWorktreePorcelain(source) {
  return source
    .trim()
    .split(/\n\s*\n/u)
    .filter(Boolean)
    .map((block) => {
      const record = {
        path: "",
        head: "",
        branch: null,
        detached: false,
        locked: null,
      };

      for (const line of block.split("\n")) {
        if (line.startsWith("worktree ")) record.path = line.slice(9);
        else if (line.startsWith("HEAD ")) record.head = line.slice(5);
        else if (line.startsWith("branch refs/heads/")) record.branch = line.slice(18);
        else if (line === "detached") record.detached = true;
        else if (line === "locked") record.locked = "locked";
        else if (line.startsWith("locked ")) record.locked = line.slice(7);
      }

      if (!record.path || !record.head) {
        throw new Error("Git returned an incomplete worktree record.");
      }
      return record;
    });
}

export function compareWorktrees(left, right, repoRoot, hasMain) {
  const rank = (record) => {
    if (record.branch === "main") return 0;
    if (!hasMain && record.path === repoRoot) return 0;
    return 1;
  };
  const rankDifference = rank(left) - rank(right);
  if (rankDifference !== 0) return rankDifference;
  return left.path.localeCompare(right.path);
}

export function sortWorktrees(records, repoRoot) {
  const hasMain = records.some((record) => record.branch === "main");
  return [...records].sort((left, right) =>
    compareWorktrees(left, right, repoRoot, hasMain),
  );
}

export function extractTaskTitle(source) {
  const match = source.match(/^#\s+(.+?)\s*$/mu);
  return match?.[1]?.trim() || null;
}

export function cleanWorktreeName(value) {
  const cleaned = value
    .replace(/^claude\//u, "")
    .replace(/^codex\//u, "")
    .replace(/^worktree-/u, "")
    .replace(/-[0-9a-f]{6,}$/iu, "")
    .replace(/[-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!cleaned) return null;
  const capitalized = `${cleaned[0].toUpperCase()}${cleaned.slice(1)}`;
  return capitalized.replace(/\buat\b/giu, "UAT");
}

export function isGeneratedWorktree(record) {
  if (record.detached || record.branch === null) return true;
  return (
    /^worktree-agent-[0-9a-f]{6,}$/iu.test(record.branch) ||
    /^claude\/[^/]+-[0-9a-f]{6,}$/iu.test(record.branch)
  );
}

export function cleanCommitSubject(value) {
  const cleaned = value
    .replace(
      /^(?:build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(?:\([^)]*\))?!?:\s*/iu,
      "",
    )
    .trim();
  if (!cleaned) return null;
  return `${cleaned[0].toUpperCase()}${cleaned.slice(1)}`;
}

export function formatWorktreeLabel(record, metadata = {}) {
  if (record.branch === "main") return "Main";
  if (!isGeneratedWorktree(record)) {
    return cleanWorktreeName(record.branch) ?? "Detached checkout";
  }
  const taskTitle = metadata.taskTitle?.trim();
  if (taskTitle) return taskTitle;
  const commitSubject = metadata.commitSubject?.trim();
  if (commitSubject) {
    const cleanedSubject = cleanCommitSubject(commitSubject);
    if (cleanedSubject) return cleanedSubject;
  }
  return cleanWorktreeName(record.branch ?? path.basename(record.path)) ?? "Detached checkout";
}

export function disambiguateWorktreeLabels(entries) {
  const counts = new Map();
  for (const { label } of entries) {
    const key = label.toLocaleLowerCase("en-US");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return entries.map(({ record, label }) => {
    const key = label.toLocaleLowerCase("en-US");
    if (counts.get(key) === 1 || record.branch === "main") return { record, label };
    return { record, label: `${label} [${path.basename(record.path)}]` };
  });
}

export function parseSelection(input, count) {
  const value = input.trim();
  if (!/^\d+$/u.test(value)) return null;
  const oneBased = Number(value);
  if (oneBased < 1 || oneBased > count) return null;
  return oneBased - 1;
}

export function buildDevInvocation(checkoutPath) {
  return {
    command: "npm",
    args: ["run", "dev", "--", "-p", String(UAT_PORT)],
    cwd: checkoutPath,
  };
}
