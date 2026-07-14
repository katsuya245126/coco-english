# OpenAI Moderation Endpoint (`omni-moderation-latest`): Data-Use Note

**Status:** This note exists and was reviewed **before** any student transcript or
generated Coco line is routed through OpenAI's moderation endpoint. It records the
FERPA/COPPA data-use posture checkpoint decision for Phase 11 (Coco Chat) — Task 1
of `11-02-PLAN.md`, resolving RESEARCH.md Assumption A1 with the rigor Phase 9 applied
to the Azure AI Speech vendor relationship (`docs/azure-speech-data-use.md`), rather
than treating A1 as a rubber-stamped assumption.

**Checkpoint decision recorded:** Option A — the existing OpenAI data-use posture
already covering `turn-evaluator.ts` (student transcripts sent to OpenAI for
evaluation since Phase 6) extends to the moderation endpoint. This is the same
vendor, under the same account and API key, with no new contract or data-processing
relationship introduced. The rationale below is written to the same structural
standard as the Azure note, not as a rubber stamp of that decision.

## What is sent to OpenAI's moderation endpoint

For each moderated call, `content-moderation.ts` sends exactly one payload to
`client.moderations.create({ input, model: "omni-moderation-latest" })`:

1. **Text only** — either the student's speech-to-text transcript for that turn, or
   a Coco-generated reply line, depending on which direction is being checked
   (student input pre-generation, or Coco's output pre-display/pre-TTS).

Nothing else is sent. No audio, no student name, no class ID, no student ID, no PIN,
no teacher identifier, no assignment metadata, and no other identifier accompanies
the moderation call. This mirrors the same minimal-payload convention already used by
`turn-evaluator.ts` (`buildOriginalPrompt`/`buildRepeatPrompt`), which sends only the
transcript text and mission metadata — never student PII — to OpenAI's evaluation
endpoint, and `conversation-generator.ts`, which sends the same transcript text (as
JSON data, not string-concatenated instructions) to the reply-generation endpoint.

## No new PII surface beyond what OpenAI already receives from this app

This is a direct confirmation, not an inference: the moderation call transmits no
personally identifiable information beyond the transcript/line text itself, which is
the same category of content (student speech transcribed to text) already sent to
OpenAI via `turn-evaluator.ts` since Phase 6 and via Whisper transcription since
Phase 5. The moderation wrapper (`isContentSafe`) has no access to — and does not
pass along — the student's name, class, PIN, or any database identifier; its only
input parameter is the text string being checked. The `OPENAI_API_KEY` used to
authenticate the call is the same existing vendor credential already used for
transcription and evaluation, not student data.

## Endpoint characteristics relevant to data-use posture

- **Model:** `omni-moderation-latest`, OpenAI's current recommended moderation model
  (RESEARCH.md Assumption A3).
- **Free of charge and does not count against usage limits.** Per OpenAI's own Help
  Center documentation, the moderation endpoint is free to use — this is a distinct
  fact from OpenAI's general API data-retention terms, but it confirms there is no
  separate billing/usage-metering relationship that would imply a different data
  handling path than the rest of the OpenAI API surface this app already uses.
- **Text-only, synchronous, single-turn.** The moderation call is not a chat/completion
  call — it classifies a single string against safety categories (harassment, hate,
  self-harm, sexual, violence, illicit) and returns a boolean-per-category result. It
  does not retain conversational state, and this app does not chain moderation calls
  via `previous_response_id` or any stateful mechanism.

## Retention and training-use posture

Per OpenAI's standard API data-usage policy, which already governs every existing
OpenAI call this app makes (Whisper transcription since Phase 5, `turn-evaluator.ts`
evaluation since Phase 6, TTS since Phase 8):

- **API inputs and outputs are not used to train OpenAI's models** by default for
  API customers (as distinct from ChatGPT consumer product usage, which this app does
  not use).
- **Standard API data retention** applies unless the account is configured for
  zero-data-retention (ZDR). This app has not configured ZDR; retention follows
  OpenAI's standard API policy (typically limited-duration retention for abuse
  monitoring, not indefinite storage or training use).
- The moderation endpoint is documented by OpenAI as being **subject to the same
  API data-usage policy as the rest of the platform** — there is no separate,
  more permissive data-use carve-out specific to moderation calls that would create
  a divergent posture from the transcription/evaluation calls this app already makes
  under the existing OpenAI vendor relationship.

This is the core fact supporting the "no new FERPA/COPPA note required beyond
confirming the existing posture extends" decision: the moderation endpoint is not a
new vendor, not a new API key, not a new contract, and not a documented exception to
the data-use terms already governing every other OpenAI call this app makes. It adds
one more call type (classification) under an already-reviewed vendor relationship,
sending text content of the same category (transcribed student speech / generated
reply text) already flowing to that vendor.

## Jurisdiction and compliance disclaimer

OpenAI's standard position, restated here for clarity: **the customer (this app's
operator) is responsible for confirming compliance with applicable regulations in
their own jurisdiction** (including FERPA and COPPA in the US, or equivalent
student-data protections elsewhere). This note summarizes OpenAI's documented
technical data-use and retention behavior for the moderation endpoint as an extension
of the app's existing OpenAI relationship; it is not a substitute for the operator's
own legal review. The operator confirmed this note (via the Task-1 checkpoint,
option-a) as accurate for their situation before any student transcript or generated
Coco line is routed through `isContentSafe` in production.

## Scope note

This note covers specifically the `omni-moderation-latest` moderation endpoint
introduced in Phase 11 (`content-moderation.ts`). It does not restate or change this
app's existing data-use posture for OpenAI Whisper transcription (Phase 5),
`turn-evaluator.ts` turn evaluation (Phase 6), or TTS generation (Phase 8), which
remain governed by the same overarching OpenAI API data-usage policy and are
unaffected by this note. It also does not restate the Azure AI Speech data-use note
(`docs/azure-speech-data-use.md`, Phase 9), which covers a distinct vendor
(Microsoft Azure) for a distinct purpose (pronunciation scoring of stored audio) and
remains fully separate from this OpenAI moderation relationship.

## Sources

- OpenAI Help Center — Is the Moderation endpoint free to use?:
  https://help.openai.com/en/articles/4936833-is-the-moderation-endpoint-free-to-use
- OpenAI Platform — omni-moderation model reference:
  https://platform.openai.com/docs/models/omni-moderation-latest
- OpenAI API data usage policies (governs all API calls this app makes, including
  moderation): https://openai.com/enterprise-privacy/
- `.planning/phases/11-coco-chat-dynamic-turns-scene-framing/11-RESEARCH.md`
  (Assumption A1, Standard Stack — Alternatives Considered, Security Domain)
- `docs/azure-speech-data-use.md` (Phase 9 precedent — structure mirrored here)

## Pre-send confirmation

**This note was written and the checkpoint decision (option-a) confirmed before
Task 2 of `11-02-PLAN.md` implements `content-moderation.ts`, and before any student
transcript or generated Coco line is sent through the moderation endpoint in
production.** No moderation call may go live until this note is present, per the
same pre-send gate `09-01-PLAN.md` applied to the Azure AI Speech vendor
relationship.
