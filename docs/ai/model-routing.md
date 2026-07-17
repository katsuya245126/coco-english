# Model and Effort Routing

**Updated:** 2026-07-17

This is on-demand guidance, not a permanent ranking. Recommend the lowest effort likely to succeed, state why, and name the condition for escalation.

## Codex starting policy

| Work | Starting point | Escalate when |
|---|---|---|
| Ordinary implementation | Sol Medium | It skips relevant files, tests, or steps |
| Difficult implementation, debugging, or planning | Sol High | A verified attempt lacks capability |
| High-value work after failure | Sol XHigh | Only after Medium/High evidence |
| Exceptional single-agent depth | Sol Max | Rare; explain the expected value first |
| Bounded mechanical subagent work | Terra High | Verification fails or judgment expands |
| Exact repetitive low-risk work | Luna High with deterministic checks | Any ambiguity appears |

## Claude starting policy

- Use the smaller available model for bounded routine work.
- Use the default effort first.
- Raise effort when Claude skipped files, tools, tests, or steps.
- Raise model capability when it clearly attempted the work but could not solve it.
- Reserve Fable Medium/High for genuinely difficult or ambiguous work when quota justifies it.
- Treat subscription quota as the practical cost; API dollar charts are not direct subscription forecasts.

## Subscription-aware handoffs

The local setup note supplied on 2026-07-17 describes a $20 Claude Pro subscription and a $20 ChatGPT Plus subscription. Treat quota as the practical currency: use Claude Code with Fable 5 for multi-file planning, debugging, or long-context work, and Claude Code with Sonnet 5 (`/model claude-sonnet-5`) for routine edits, tests, docs, and copy. Use Codex with Sol High for a well-specified, self-contained implementation chunk or a second opinion; use Sol Medium for routine work when preserving stronger-model quota matters. When available in the environment, `codex:rescue` is an optional handoff path, not a required skill.

Keep Codex handoffs self-contained and scoped: the local setup note estimates roughly 258K context on Plus, so do not send repository-wide refactors as one handoff. Avoid XHigh/Max effort by default on either platform because the marginal gain may consume roughly twice the quota; justify those tiers with a high-value, verified need. If an older setup note conflicts with this dated evidence or with currently available model names, use this note as the source of truth, recheck live availability before paid pilots, and record verified project observations below.

## Evidence and limitations

DeepSWE v1.1 currently supports Sol Medium as a strong default and Sol High as strong hard-task value. It runs 113 long-horizon tasks through `mini-swe-agent`, not native Codex or Claude Code. Its corpus favors popular open-source TypeScript, Go, and Python repositories, under-represents localization and refactoring, and reports API cost. Coco English results and reprompting burden override this public signal. Benchmark/model names are dated evidence, not a guarantee of current product availability; recheck before relying on them.

Sources:

- https://deepswe.datacurve.ai/
- https://deepswe.datacurve.ai/blog/deepswe
- https://claude.com/blog/claude-model-and-effort-level-in-claude-code
- https://www.reddit.com/r/ClaudeCode/comments/1ux4bbf/did_gpt56_break_claude_codes_moat_where_does/

## Project observations

Record only repeated, verified Coco English outcomes here. Include date, task type, model/effort, result, verification, and reprompt count. Do not update routing from one anecdote.
