# Azure AI Speech Pronunciation Assessment: Data-Use Note

**Status:** This note must exist and be reviewed before any student audio is sent to
Azure AI Speech. It is the PRON-02 / D-07 hard gate for Phase 9 (pronunciation scoring)
and satisfies our internal FERPA/COPPA data-use record for this new vendor. No scoring
call may go live until this note is confirmed accurate for the operator's jurisdiction
(see the phase checkpoint in `09-01-PLAN.md`).

## What is sent to Azure

For each scored student turn, exactly two pieces of data are transmitted to Azure AI
Speech's Pronunciation Assessment API:

1. **The audio clip.** This is the same short per-turn student audio clip already
   captured and stored in this app's private `student-audio` Storage bucket (Phase 5).
   No new recording or capture happens for pronunciation scoring — it reuses the
   existing stored clip, transcoded server-side to WAV before the Azure call.
2. **The target/improved sentence text**, sent as Azure's `referenceText` parameter so
   the API can score the student's speech against that exact sentence.

Nothing else is sent. No student name, no class ID, no student ID, no PIN, no teacher
identifier, no assignment metadata, and no other identifiers accompany the API call.
The audio clip and the sentence text are the only two payloads Azure receives.

## No PII beyond the audio clip and sentence text

This is a direct confirmation, not an inference: no personally identifiable information
beyond the audio clip itself and the target-sentence text is transmitted to Azure. The
Azure Speech SDK call is made from a server-only module using only the audio buffer and
reference-text string as inputs — it has no access to (and does not pass along) the
student's name, class, PIN, or any database identifier. The `AZURE_SPEECH_KEY` used to
authenticate the call is a vendor credential, not student data.

## Azure's data retention and training-use policy (real-time Pronunciation Assessment)

Per Microsoft's own data-privacy documentation for real-time Speech services (which
covers real-time pronunciation assessment, the mode this app uses — a single short
clip scored via `recognizeOnceAsync`, not batch/offline processing):

- For real-time speech-to-text, **audio input is processed only in Azure's server
  memory, and no data is stored at rest.**
- **Microsoft does not retain or store the data provided by customers** when doing
  real-time speech-to-text, fast transcription, pronunciation assessment, or speech
  translation.

In other words, the audio clip and reference sentence text are used transiently to
compute the pronunciation score and are not persisted by Azure afterward, and are not
used to train Microsoft's models. This is the strongest single fact supporting this
app's FERPA/COPPA posture for this vendor: the clip already lives in our own private,
access-controlled Storage bucket, and Azure's real-time processing model does not add a
second, longer-lived copy of student audio outside our own infrastructure.

## Jurisdiction and compliance disclaimer

Microsoft's standard position, restated here for clarity: **the customer (this app's
operator) is responsible for confirming compliance with applicable regulations in their
own jurisdiction** (including FERPA and COPPA in the US, or equivalent student-data
protections elsewhere). This note summarizes Azure's documented technical retention
behavior for real-time Pronunciation Assessment; it is not a substitute for the
operator's own legal review. The operator must read and confirm this note is accurate
for their situation as part of the Phase 9 checkpoint before enabling live scoring.

## Sources

- Microsoft Learn — How to use Pronunciation Assessment:
  https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment
- Microsoft Learn — Transparency note for Pronunciation Assessment:
  https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/pronunciation-assessment/transparency-note-pronunciation-assessment
- Microsoft Learn — Data, privacy, and security for Azure AI Speech (speech-to-text):
  https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security

## Scope note

This note covers only the new Azure AI Speech Pronunciation Assessment vendor
relationship introduced in Phase 9. It does not change or restate this app's existing
data-handling posture for OpenAI Whisper transcription or OpenAI turn evaluation
(Phase 5/6), which are documented separately in their own implementation and remain
unaffected by this phase.
