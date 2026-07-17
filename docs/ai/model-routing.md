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

## Evidence and limitations

DeepSWE v1.1 currently supports Sol Medium as a strong default and Sol High as strong hard-task value. It runs 113 long-horizon tasks through `mini-swe-agent`, not native Codex or Claude Code. Its corpus favors popular open-source TypeScript, Go, and Python repositories, under-represents localization and refactoring, and reports API cost. Coco English results and reprompting burden override this public signal.

Sources:

- https://deepswe.datacurve.ai/
- https://deepswe.datacurve.ai/blog/deepswe
- https://claude.com/blog/claude-model-and-effort-level-in-claude-code
- https://www.reddit.com/r/ClaudeCode/comments/1ux4bbf/did_gpt56_break_claude_codes_moat_where_does/

## Project observations

Record only repeated, verified Coco English outcomes here. Include date, task type, model/effort, result, verification, and reprompt count. Do not update routing from one anecdote.
