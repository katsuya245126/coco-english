# Remove Context Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove context-usage output and `/context` or `/status` reminders from the shared `task-workflow` and `progress` report contracts.

**Architecture:** Edit the two canonical global `SKILL.md` files under `~/.agents/skills/`. Claude's global skill paths are symlinks to those canonical directories, so no wrapper duplication is required.

**Tech Stack:** Markdown skill contracts, filesystem symlinks, Ruby YAML structural validation, Git diff checks

## Global Constraints

- Preserve all unrelated workflow behavior and repository changes.
- Do not add conditional context reporting or a replacement status field.
- Do not change project application code.
- Do not replace or recreate the Claude symlinks.

---

### Task 1: Remove Context from Both Report Contracts

**Files:**
- Modify: `/Users/john/.agents/skills/task-workflow/SKILL.md:46`
- Modify: `/Users/john/.agents/skills/progress/SKILL.md:24-35`
- Verify: `/Users/john/.claude/skills/task-workflow/SKILL.md`
- Verify: `/Users/john/.claude/skills/progress/SKILL.md`

**Interfaces:**
- Consumes: Existing `Report` contracts and Claude symlinks to the canonical skills.
- Produces: Reports whose required fields omit Context while preserving result, next action, recommendation, and escalation guidance.

- [x] **Step 1: Confirm the obsolete contract text is present**

Run:

```bash
rg -n "context action|/context|/status|\*\*Context\*\*" \
  /Users/john/.agents/skills/task-workflow/SKILL.md \
  /Users/john/.agents/skills/progress/SKILL.md
```

Expected: one `task-workflow` hit and one `progress` hit.

- [x] **Step 2: Make the minimal contract edits**

Replace the final `task-workflow` report paragraph with:

```markdown
End each segment with: result, next action, recommended model/effort, and escalation condition. Near 70%, finish the milestone and compact or hand off; start a fresh session for unrelated work.
```

Remove the `progress` Context item and leave the ordered tail as:

```markdown
7. **Verification**: include only recorded or observed evidence.
8. **Next action**: exactly one concrete action.
9. **Recommendation**: platform, model, effort, one reason, and escalation condition from `docs/ai/model-routing.md`.
```

- [x] **Step 3: Verify forbidden report-contract text is absent**

Run:

```bash
! rg -n "context action|/context|/status|\*\*Context\*\*|exposed usage" \
  /Users/john/.agents/skills/task-workflow/SKILL.md \
  /Users/john/.agents/skills/progress/SKILL.md \
  /Users/john/.claude/skills/task-workflow/SKILL.md \
  /Users/john/.claude/skills/progress/SKILL.md
```

Expected: exit 0 with no matches.

- [x] **Step 4: Validate structure and symlink discovery**

Run the offline Ruby validation equivalent to `quick_validate.py` against all four skill paths:

```bash
ruby -ryaml -e 'allowed=%w[name description license allowed-tools metadata]; ARGV.each do |dir|; path=File.join(dir,"SKILL.md"); abort("missing #{path}") unless File.file?(path); text=File.read(path); match=text.match(/\A---\n(.*?)\n---/m); abort("invalid frontmatter format: #{path}") unless match; data=YAML.safe_load(match[1]); abort("frontmatter not mapping: #{path}") unless data.is_a?(Hash); extra=data.keys.map(&:to_s)-allowed; abort("unexpected keys #{extra.join(",")}: #{path}") unless extra.empty?; name=data["name"]; desc=data["description"]; abort("missing name/description: #{path}") unless name.is_a?(String) && desc.is_a?(String); abort("invalid name: #{path}") unless name.match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/) && name.length<=64; abort("invalid description: #{path}") if desc.length>1024 || desc.include?("<") || desc.include?(">"); puts "Skill is valid: #{path}"; end' \
  /Users/john/.agents/skills/task-workflow \
  /Users/john/.agents/skills/progress \
  /Users/john/.claude/skills/task-workflow \
  /Users/john/.claude/skills/progress
```

Then run:

```bash
test -L /Users/john/.claude/skills/task-workflow
test -L /Users/john/.claude/skills/progress
git diff --check
```

Expected: four valid skills, both symlink checks pass, and `git diff --check` exits 0.

- [x] **Step 5: Record completion**

Update `TASK.md` with the command evidence, mark all five done checks complete, set status and stage to `Complete`, and archive it under `docs/tasks/archive/2026-07-18-remove-context-reporting.md`.
