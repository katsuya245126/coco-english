// Conversation-mode submissions flip the flow to the "Coco is thinking…"
// step before the upload round-trip, which unmounts the recorder that
// normally displays submit failures. Any error thrown after that point must
// be translated to a child-safe message and surfaced by the flow shell
// itself, or the student is stranded on the thinking screen.

const RETRYABLE_UPLOAD_MESSAGES = new Set([
  "I didn't hear you. Try again.",
  "Try again.",
]);

const GENERIC_FAILURE_MESSAGE =
  "Something went wrong. Try again, or ask your teacher for help.";

export function describeConversationSubmissionFailure(error: unknown): string {
  if (error instanceof Error && RETRYABLE_UPLOAD_MESSAGES.has(error.message)) {
    return error.message;
  }
  return GENERIC_FAILURE_MESSAGE;
}
