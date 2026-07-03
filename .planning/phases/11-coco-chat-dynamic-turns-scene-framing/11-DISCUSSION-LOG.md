# Phase 11: Coco Chat (dynamic turns + scene framing) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 11-coco-chat-dynamic-turns-scene-framing
**Areas discussed:** Dynamic-turn loop shape, Teacher controls & scene premise, Moderation & failure handling, Teacher transcript view

---

## Dynamic-turn loop shape

### Q1: Correction loop in conversation mode

| Option | Description | Selected |
|--------|-------------|----------|
| Full loop every turn | Each reply evaluated; improved sentence + required repeat before Coco's next reply; reuses v1 completion rules unchanged | ✓ |
| Correct only when wrong | Coco implicitly recasts small errors; explicit correction only on meaning failure / clear pattern miss | |
| End-of-chat recap | Uninterrupted conversation, then 1-2 fix-and-repeat sentences after the cap | |

**User's choice:** Full loop every turn (recommended option)

### Q2: Cap vs required_turns

| Option | Description | Selected |
|--------|-------------|----------|
| Teacher sets turns, capped at 5 | required_turns clamped to max 5 for chat missions | |
| Fixed 5 for all chat missions | required_turns ignored for chat missions | |
| Cap independent of required_turns | required_turns stays completion target; cap is a safety ceiling allowing natural extension | ✓ |

**User's choice:** Cap independent of required_turns

### Q3: Extension decision-maker

| Option | Description | Selected |
|--------|-------------|----------|
| Coco winds down naturally | Server injects wind-down steering after required_turns; hard stop at cap | |
| Student chooses to continue | "Keep chatting?" prompt after required_turns | |
| End exactly at required_turns | No extension window | |

**User's choice:** Other — "Why does it have to be 5?" Discussion clarified CHAT-03's substance is "server-enforced small hard ceiling," not the digit 5. User followed up: "I feel like 5 is a little too low? Maybe teacher can choose?"

### Q3b: Teacher-choosable range

| Option | Description | Selected |
|--------|-------------|----------|
| 3–8 turns, default 5 | Ceiling 8; keeps homework in the 2–3 minute zone | ✓ |
| 3–10 turns, default 6 | Roomier upper bound; ceiling 10 | |
| 5–8 turns, default 6 | No very-short chats; ceiling 8 | |

**User's choice:** 3–8 turns, default 5 (recommended option)

### Q4: One number or two

| Option | Description | Selected |
|--------|-------------|----------|
| One number | Teacher's chat length IS required_turns; completion and hard stop coincide | |
| Two numbers | required_turns (completion target) + max chat length with natural extension | |

**User's choice:** Other (free text) — "required turns teacher-settable, hard cap for server, and student can keep chatting but Coco winds down as it reaches the hard [cap]." Confirmed as: teacher-set required_turns 3–8 (default 5) = completion target; fixed server-owned hard cap of 8; organic student-driven extension with server-injected wind-down near 8.

---

## Teacher controls & scene premise

### Q1: How a mission becomes a chat mission

| Option | Description | Selected |
|--------|-------------|----------|
| Teacher toggle, default off | Deliberate opt-in on mission create/edit form | ✓ |
| Teacher toggle, default on for new missions | Chat as flagship default | |
| Per-assignment choice | Mode picked at assign time | |

**User's choice:** Teacher toggle, default off (recommended option)

### Q2: Premise creation and editability

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-generated, editable | Generated with AI mission draft; teacher-editable field; manual missions get a generate action | ✓ |
| Auto-generated, locked | Not exposed for editing | |
| Teacher writes it, AI suggests | Teacher-authored with optional AI suggestion | |

**User's choice:** Auto-generated, editable (recommended option)

### Q3: Premise scope and backfill

| Option | Description | Selected |
|--------|-------------|----------|
| All new missions, no backfill | Chat AND preset missions get premises; existing missions skip when null | ✓ |
| Chat missions only | Narrower SCENE-01 reading | |
| All missions + backfill | One-off backfill pass for existing library | |

**User's choice:** All new missions, no backfill (recommended option)

### Q4: Student-facing premise UX

| Option | Description | Selected |
|--------|-------------|----------|
| Coco speaks it as an intro | Voiced scene-setting step before turn 1 | |
| Text banner on the mission card | Unvoiced scene-setting text at mission start | ✓ |
| Both intro step and persistent header | Voiced intro + persistent scene header | |

**User's choice:** Text banner on the mission card (declined the recommended voiced intro)

---

## Moderation & failure handling

### Q1: Coco line fails moderation

| Option | Description | Selected |
|--------|-------------|----------|
| Retry once, then canned line | Regenerate with stronger safety steering, then safe preset line; flag for teacher | ✓ |
| Straight to canned line | No retry | |
| End the chat gracefully | Flagged line ends conversation | |

**User's choice:** Retry once, then canned line (recommended option)

### Q2: Student input safety check

| Option | Description | Selected |
|--------|-------------|----------|
| No pre-check; Coco steers | Prompt-level redirection only; output moderation still guards | |
| Moderate student input too | Flagged input gets canned redirect without LLM call | ✓ |
| Input check only flags for teacher | Check records a flag, never blocks | |

**User's choice:** Moderate student input too (declined the recommended no-pre-check option)

### Q3: Latency UX

| Option | Description | Selected |
|--------|-------------|----------|
| Coco thinking indicator | Character-flavored "Coco is thinking…" waiting state | ✓ |
| Plain loading state | Reuse generic spinner | |
| Thinking indicator + timeout fallback | Adds hard latency budget with canned fallback | |

**User's choice:** Coco thinking indicator (recommended option)

### Q4: Generation failure (non-moderation)

| Option | Description | Selected |
|--------|-------------|----------|
| Same canned-line path | Shared degrade path with moderation failures | ✓ |
| Retry button for the student | Child-triggered retry | |
| Fall back to preset turns | Shadow preset script for chat missions | |

**User's choice:** Same canned-line path (recommended option)

---

## Teacher transcript view

### Q1: Target-pattern visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Pattern chip + per-turn badge | Header chip + "pattern used" badge per turn; transcript text stays clean | ✓ |
| Inline highlighting | Highlight matched words in transcript lines | |
| Header chip only | Pattern shown at top only | |

**User's choice:** Pattern chip + per-turn badge (recommended option)

### Q2: Coco line rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Coco line atop each turn block | Labeled row added to existing per-turn blocks; purely additive | ✓ |
| Chat-style conversation view | Speaker-labeled bubbles; new layout | |
| Both: blocks + a conversation toggle | Two renderings | |

**User's choice:** Coco line atop each turn block (recommended option)

### Q3: Moderation-event visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Small flag on the turn | Subtle expandable marker per affected turn | ✓ |
| Log-only | Server logs only | |
| Prominent alert on the attempt | Banner + teacher-review routing | |

**User's choice:** Small flag on the turn (recommended option)

### Q4: Scene premise in review

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, in the header | Premise line next to target-pattern chip | ✓ |
| No | Keep evidence header as-is | |

**User's choice:** Yes, in the header (recommended option)

---

## Claude's Discretion

- Per-turn re-grounding / system-prompt architecture (CHAT-04) — roadmap research flag
- Moderation provider/endpoint choice and integration pattern
- Latency budget/timeout handling behind the thinking indicator
- Canned fallback/redirect line copy (classroom-safe, no-harsh-failure tone)
- Wind-down steering mechanics (nudge timing, prompt shape)
- TTS-cache interaction for unique dynamic lines; TTS invocation timing
- Schema/migration details beyond locked column names; flagged-turn metadata storage
- Server turn-count enforcement implementation

## Deferred Ideas

- Chat-style conversation view (speaker bubbles) for the evidence page — Phase 12 visual pass
- Voiced Coco scene intro step — revisit in Phase 12 if scene framing feels flat
