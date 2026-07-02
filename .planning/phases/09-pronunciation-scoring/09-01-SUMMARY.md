---
phase: 09-pronunciation-scoring
plan: 01
subsystem: infra
tags: [azure-speech, ferpa, coppa, env-config, vendor-onboarding]

# Dependency graph
requires: []
provides:
  - "docs/azure-speech-data-use.md — FERPA/COPPA data-use note for Azure AI Speech Pronunciation Assessment (PRON-02 hard gate)"
  - "AZURE_SPEECH_KEY, AZURE_SPEECH_REGION documented server-only in .env.example"
  - "Human-confirmed: Azure Speech resource provisioned, key + region set in local .env"
affects: [09-04-transcode-and-scorer-adapter, 09-05-teacher-diagnostic-panel, 09-06-star-band-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vendor data-use notes live in docs/ (not .planning/) as durable repo artifacts, following the existing convention for FERPA/COPPA vendor onboarding records."
    - "New third-party vendor env vars follow the OPENAI_API_KEY grouping/comment style in .env.example: server-only, never NEXT_PUBLIC_-prefixed, empty value placeholders."

key-files:
  created: [docs/azure-speech-data-use.md]
  modified: [.env.example]

key-decisions:
  - "Azure Speech is confirmed as the pronunciation-scoring vendor (PRON-02); no PII beyond the audio clip and target-sentence text is transmitted, and Azure's real-time API does not store audio at rest."
  - "Human operator confirmed the data-use note is accurate for their jurisdiction and provisioned a free-tier (F0) Azure AI Speech resource, setting AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in local .env (not committed; .env is gitignored by design)."

patterns-established:
  - "Pattern: vendor pre-send gates (PRON-02-style) require a docs/ data-use note + human checkpoint confirming both note accuracy and live credential provisioning before any downstream plan is allowed to call the vendor API."

requirements-completed: [PRON-02]

# Metrics
duration: 3min
completed: 2026-07-02
status: complete
---

# Phase 09 Plan 01: Azure Speech Data-Use Note & Env Var Documentation Summary

**FERPA/COPPA data-use note for Azure AI Speech Pronunciation Assessment plus server-only AZURE_SPEECH_KEY/AZURE_SPEECH_REGION documentation, with human-confirmed live Azure resource provisioning satisfying the PRON-02 pre-send gate.**

## Performance

- **Duration:** 3 min (automated tasks) + human checkpoint turnaround
- **Started:** 2026-07-02T21:14:39+09:00
- **Completed:** 2026-07-02 (checkpoint approved: "1. Confirmed.")
- **Tasks:** 3 (2 automated + 1 human checkpoint)
- **Files modified:** 2

## Accomplishments
- Created `docs/azure-speech-data-use.md`, the FERPA/COPPA data-use record documenting exactly what is sent to Azure (a short per-turn student audio clip already stored in the private student-audio bucket, plus target/improved sentence text as reference text — nothing else), confirming no PII beyond the clip/sentence text is transmitted, and citing Azure's real-time no-retention posture ("processed only in Azure's server memory," "no data is stored at rest," "Microsoft does not retain or store the data provided by customers") with the three Microsoft Learn source URLs from RESEARCH.md.
- Documented `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in `.env.example`, following the existing `OPENAI_API_KEY` vendor-key convention: server-only (no `NEXT_PUBLIC_` prefix), empty placeholder values, with a comment on the region var warning that it must exactly match the provisioned resource's location (RESEARCH.md Pitfall 4 — region mismatch looks like a bad key).
- Human checkpoint resolved: the operator read and confirmed the data-use note is accurate for their jurisdiction, provisioned a free-tier (F0) Azure AI Speech resource, and set `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` in their local `.env` file. Response: "1. Confirmed."

## Task Commits

Each automated task was committed atomically:

1. **Task 1: Write the Azure Speech data-use note** - `7d6a4f85` (docs)
2. **Task 2: Document Azure Speech env vars in .env.example** - `9487cf6b` (docs)
3. **Task 3: Human checkpoint (data-use note review + Azure resource provisioning)** - resolved via user confirmation, no code commit (verification/setup task only)

**Plan metadata:** (this commit) `docs(09-01): complete Azure Speech data-use note and env-var plan`

## Files Created/Modified
- `docs/azure-speech-data-use.md` - FERPA/COPPA data-use note for Azure AI Speech Pronunciation Assessment (78 lines): send-scope, no-PII confirmation, Azure real-time retention policy, Microsoft Learn source citations, jurisdiction-compliance disclaimer.
- `.env.example` - Added `AZURE_SPEECH_KEY=` and `AZURE_SPEECH_REGION=` server-only vendor entries following the existing OpenAI vendor-key grouping style, with a region-matching warning comment.

## Decisions Made
- Confirmed Azure AI Speech Pronunciation Assessment as the scoring vendor for PRON-02, with the data-use note serving as the durable repo record required before any student audio crosses the vendor boundary.
- Operator provisioned the Azure resource on the free (F0) tier, expected to cover current classroom volume (~6 students / 1 class-week) at approximately $0/mo.
- Live credentials (`AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`) live only in the operator's local, gitignored `.env` — never committed, never echoed. This plan does not read or validate the actual key value; correctness of the credential will surface naturally when downstream plans 09-04/09-05 make real Azure calls.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The checkpoint's three-part confirmation (data-use note accuracy, resource provisioning, env var placement) was addressed in a single user response ("1. Confirmed.") and is treated as complete per the executor's checkpoint-resolution instructions — this plan makes no live Azure API calls, so there is nothing further to verify locally before marking the gate satisfied.

## User Setup Required

Already completed by the operator as part of this checkpoint: Azure AI Speech resource provisioned (F0 tier), `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` set in local `.env`. No further setup required for this plan. Downstream plans (09-04, 09-05) will be the first to actually exercise these credentials against the live Azure API.

## Next Phase Readiness
- PRON-02 pre-send gate is satisfied: the data-use note exists, env vars are documented, and a real Azure Speech key + region are provisioned and available locally.
- Plans 09-04 (transcode + scorer adapter live wiring) and 09-05 (teacher diagnostic panel) can now proceed to call the real Azure API when they reach that point, using the operator's provisioned credentials.
- Note: 09-02 (pronunciation_scores table/RLS/grants) also has commits on main but no SUMMARY.md yet — that finalization gap is out of scope for this plan and tracked separately.

---
*Phase: 09-pronunciation-scoring*
*Completed: 2026-07-02*
