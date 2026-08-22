/**
 * Mission-derived vocabulary hint for transcription (issue #64).
 *
 * gpt-4o-mini-transcribe accepts a `prompt` biasing decode toward expected
 * words. Production attempt logs (2026-08-21 export) showed lesson phrases
 * misheard consistently — "I'd rather" → "I letter / I'm letter" — sending
 * correct answers to teacher review. Feeding the teacher-authored mission
 * text gives the transcriber the lesson's vocabulary up front.
 *
 * Pure and deterministic; the hint carries only teacher-authored snapshot
 * fields, never student content.
 */

const MAX_HINT_CHARS = 400;

function cleanSegment(segment: string): string {
  return segment
    .replace(/_+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.!?]+$/u, "");
}

export function buildTranscriptionVocabularyHint(input: {
  title?: string | null;
  targetPattern?: string | null;
  activePrompt?: string | null;
  targetExample?: string | null;
}): string {
  const segments: string[] = [];
  const topic = cleanSegment(input.title ?? "");
  if (topic) segments.push(`Lesson topic: ${topic}`);
  const pattern = cleanSegment(input.targetPattern ?? "");
  if (pattern) segments.push(`Target sentence: ${pattern}`);
  const example = cleanSegment(input.targetExample ?? "");
  if (example && example.toLocaleLowerCase("en-US") !== pattern.toLocaleLowerCase("en-US")) {
    segments.push(`Example answer: ${example}`);
  }
  const prompt = cleanSegment(input.activePrompt ?? "");
  if (prompt) segments.push(`Question: ${prompt}`);

  const joined = segments.join(". ");
  return joined.length > MAX_HINT_CHARS ? joined.slice(0, MAX_HINT_CHARS).trim() : joined;
}
