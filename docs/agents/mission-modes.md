# Mission modes

Read this before changing mission evaluation, progression, hints, TTS, or Coco generation. Terms are defined in `GLOSSARY.md` (preset mission, conversation mission, conversation context pattern); snapshot interpretation is in `docs/adr/0002-interpret-mission-snapshots-by-use.md`.

Preserve the preset/conversation split: the two modes evaluate differently.

## Conversation mode

- Accept relevant valid English as a correct answer.
- Apply meaning-preserving corrections.
- Skip preset success and transition narration.
- Ground follow-up questions in the owned attempt history.
- Never fall back to the original target-pattern hint.

## Preset mode

Keep preset behavior unchanged unless the user explicitly requests a preset change.
