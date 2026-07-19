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

export function sortWorktrees(records, repoRoot) {
  return [...records].sort((left, right) => {
    if (left.path === repoRoot) return -1;
    if (right.path === repoRoot) return 1;
    return left.path.localeCompare(right.path);
  });
}

export function formatWorktreeLabel(record, repoRoot) {
  const branch = record.branch ?? "(detached)";
  if (record.path === repoRoot) return `${branch} — repository root`;
  const relativePath = path.relative(repoRoot, record.path);
  const displayPath = relativePath.startsWith("..") ? record.path : relativePath;
  return `${branch} — ${displayPath}`;
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
