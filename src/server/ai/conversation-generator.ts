/**
 * Server-only dynamic Coco reply generation adapter (Coco Chat, Phase 11).
 *
 * Mirrors the deps/client/resolveApiKey/createClient/three-tier-error-union
 * shape established by turn-evaluator.ts. The key architectural guardrail
 * (CHAT-04) is that grounding is rebuilt fresh on every call via
 * buildConversationPrompt() — no provider-side response chaining, no stateful
 * Conversation object, no chat-history blob. Each call's exact input is
 * fully reconstructable and loggable from this app's own DB rows.
 *
 * Tests inject a fake Responses client so automated verification never
 * calls the paid OpenAI API.
 */

import { zodTextFormat } from "openai/helpers/zod";
import {
  hasApiKey,
  structuredOutputCall,
  type StructuredOutputClient,
  type StructuredOutputDeps,
} from "@/server/ai/structured-output";
import { log } from "@/server/logging/logger";
import {
  conversationReplyMode,
  conversationTurnInputSchema,
  generatedCocoReplyPartsSchema,
  parseGeneratedCocoReply,
  buildConversationPrompt,
  mostRecentUnderstoodExchange,
  validateGeneratedCocoReplyParts,
  withClosingSignOff,
  type ConversationSafetyMode,
  type GenerateCocoReplyInput,
  type GeneratedCocoReply,
  type GeneratedCocoReplyParts,
  type GeneratedCocoReplyLineViolation,
} from "@/domain/ai/conversation-generation";

const DEFAULT_CONVERSATION_MODEL = "gpt-4.1-mini";

export type GenerateCocoReplyError =
  | "invalid_input"
  | "missing_api_key"
  | "provider_failed"
  | "schema_failed"
  | "reply_policy_failed";

export type GenerateCocoReplyResult =
  | { ok: true; reply: GeneratedCocoReply }
  | {
      ok: false;
      error: Exclude<GenerateCocoReplyError, "reply_policy_failed">;
    }
  | {
      ok: false;
      error: "reply_policy_failed";
      violations: GeneratedCocoReplyLineViolation[];
      rejectedCandidate: GeneratedCocoReplyParts;
      rejectedAttempt: "first" | "corrected";
    };

/** Shared wire shape since the structured-output seam (issue #69). */
export type ConversationResponsesClient = StructuredOutputClient;

export type GenerateCocoReplyDeps = StructuredOutputDeps;

function resolveModel(deps?: GenerateCocoReplyDeps) {
  return (
    deps?.model?.trim() ||
    process.env.OPENAI_CONVERSATION_MODEL?.trim() ||
    DEFAULT_CONVERSATION_MODEL
  );
}

const CONVERSATION_SYSTEM_MESSAGE = [
  "Generate Coco's next line in a bounded ESL practice conversation.",
  "You are talking with a young ESL learner: use short, simple sentences and easy everyday words.",
  "Return reaction, focus, and question separately.",
  "Prefer one or two short, simple sentences.",
  "Follow replyMode from the user payload exactly.",
  "When replyMode is follow_up, acknowledge the latest studentResponse and ask exactly one relevant question.",
  "When replyMode is closing, acknowledge the latest studentResponse specifically and ask no question. Do not write a goodbye: the sign-off 'See you next time!' is appended automatically after your line.",
  "A closing uses reaction only; set focus and question to null.",
  "Write complete, correctly punctuated sentences. Put sentence-ending punctuation between a reaction and the follow-up question; never join them as a run-on.",
  "Treat every detail in conversationHistory as already known.",
  "Acknowledge or react specifically to the latest studentResponse before asking a follow-up.",
  "A follow-up may react briefly or mention one learner-owned detail, but must not summarize a list.",
  "Choose at most one focus from the latest studentResponse and make the question explore it.",
  "Before the closing turn, ask exactly one short question for genuinely new information whose answer is not present or directly implied anywhere in conversationHistory.",
  "Before the closing turn, after a meaningful answer, ask an open question that connects directly to the answer and invites a short phrase or sentence.",
  "Before the closing turn, treat a short answer as meaningful when it adds a real detail; after 'Inside.', ask an expandable question such as 'What games do you play inside?'.",
  "After a meaningful answer, ask an open WH question (who, what, when, where, why, how). Do not ask an either-or or yes/no question; save those for when the learner is vague, stuck, or was not understood.",
  "Ask the simplest question that gets one new detail. Prefer 'Where do you play Valorant?' over 'Do you and your friend play Valorant at each other's homes or online?'.",
  "Keep the question concrete. Do not ask abstract, hypothetical, or feelings-about-feelings questions such as 'What do you like about that?' or 'What do you do to feel better when you feel like a blob?'.",
  "Do not put a detail in the question that the reaction already stated, and do not re-ask for a detail the student already gave.",
  "Do not write 'your' in front of a thing the student owns when they would have to answer with 'my'. Say 'Where do you play Valorant?', not 'Where do you play Valorant with your friend?'.",
  "React to the student's answer; never restate it back to them. 'You like to play Valorant with your friend.' is a recap, not a reaction — say 'That sounds fun!' instead.",
  "Do not use recovery framing such as 'I didn't understand that' after an answer you did understand, and never ask the same question twice.",
  "Treat vague replies such as 'anything', 'something', or 'stuff' as minimally informative; do not echo the vague word as if it were a meaningful detail.",
  "Before the closing turn, acknowledge lightly, then ask one short scene-relevant narrowing question. Use two concrete child-friendly choices only when the latest response is vague, unclear, or shows the learner is stuck.",
  "Do not shame the learner or demand a more specific answer.",
  "Example: after 'What do you and Minju talk about?' -> 'Anything.', do not say 'Talking about anything is fun.'; say 'Lots of things! Do you talk about games or school?'.",
  "Do not mechanically rotate through who, what, where, when, why, or how when that repeats a known person, place, activity, preference, or fact.",
  "Example: after 'Who do you talk with at school?' -> 'I talk with Minju.' -> 'Where do you talk with Minju?' -> 'In the classroom.', 'Who do you talk with in class?' is invalid because Minju is already known; ask a new detail such as 'What do you and Minju talk about?'.",
  "Keep the current subject while a natural unanswered detail remains; otherwise transition gently to a nearby part of the scene.",
  "Keep the active activity from Coco's latest question as the topic; a person or place in the student's answer is a detail about that activity, not permission to switch activities.",
  "Example: after 'Who do you swim with?' -> 'With my friend.', ask 'What do you like about swimming together?'; 'What games do you play together?' is invalid because it drops the active activity, swimming.",
  "Treat targetPattern as soft lesson context only, never as a next-line template — do not steer the student back into the targetPattern format.",
  "Reject a follow-up that merely swaps in a new noun or activity to repeat targetPattern; the follow-up must connect to the student's actual answer.",
  "Begin winding down and gently steering toward a close when turnsRemaining <= 2 (windDown is true).",
  "If the student's answer contains a Korean word you cannot confidently translate, never spell it out in Latin letters. Refer to it by what the conversation shows it is ('that game', 'it', 'that place') instead of naming it.",
  "Elementary ESL classroom-safe. No student names, PINs, audio keys, or private data.",
  "Return only data matching the schema.",
].join(" ");

const SAFETY_RETRY_SYSTEM_MESSAGE =
  "The previous candidate was rejected by output moderation. Generate a different neutral, child-safe classroom line. Do not repeat, quote, or refer to the rejected candidate.";

const RECOVERY_SYSTEM_MESSAGE =
  "Recovery overrides the normal follow-up acknowledgement: ask exactly one question with reaction and focus set to null. Do not acknowledge or react before the question.";

function systemMessageFor(
  safetyMode: ConversationSafetyMode,
  recovery: boolean,
): string {
  const baseMessage = recovery
    ? `${CONVERSATION_SYSTEM_MESSAGE} ${RECOVERY_SYSTEM_MESSAGE}`
    : CONVERSATION_SYSTEM_MESSAGE;
  return safetyMode === "retry"
    ? `${baseMessage} ${SAFETY_RETRY_SYSTEM_MESSAGE}`
    : baseMessage;
}

const VIOLATION_CORRECTION_HINTS: Record<
  GeneratedCocoReplyLineViolation,
  string
> = {
  question_format:
    'The previous candidate had the wrong punctuation: a line that expects a question must end in exactly one "?", and a closing line must have no "?" and end in "." or "!".',
  run_on_question:
    'The previous candidate ran a reaction straight into the question without sentence-ending punctuation between them. Put ".", "!", or "?" between the reaction and the question.',
  either_or_question:
    'The previous candidate closed a meaningful answer with an either/or or yes/no question, which a child can answer with one word. Ask the simplest open WH question that gets one new detail instead — for example "Where do you play Valorant?" rather than "Do you and your friend play Valorant at each other\'s homes or online?".',
  restatement_reaction:
    'The reaction restated the student\'s own answer back to them in the second person ("You like to play Valorant with your friend."), which adds nothing. React to it instead — "That sounds fun!" — then ask the question.',
  topic_drift:
    "The previous candidate drifted away from the active topic (the student's latest answer and Coco's last question). Ask about a detail directly connected to what the student just said.",
  vague_echo:
    'The previous candidate echoed the student\'s vague word (such as "anything" or "something") back as if it were a real detail. Acknowledge without repeating that word — say something like "Lots of things!" — then ask one short question offering two concrete child-friendly choices.',
  multi_detail_echo:
    "The reaction repeated two or more details from the student's latest answer. React briefly without replaying the list, then explore only the declared focus.",
  response_summary:
    "The reaction summarized most of the student's response. Replace it with one short social reaction and keep only one focus.",
  stacked_generic_reaction:
    "The reaction stacked generic adjectives in a 'sounds ... and ...' phrase. Use one short reaction without an adjective pair.",
  focus_mismatch:
    "The question did not explore the declared focus. Keep one learner-owned focus from the latest response and ask about that detail, or make a gentle nearby transition.",
  unresolved_korean_noun:
    'The previous candidate spoke aloud a letter-by-letter transliteration of a Korean word the student said, which is not a real English word. Do not name that word at all. Refer to it instead using what the conversation already shows it is — "that game", "it", "that place" — as in "That sounds fun! What do you do in that game?".',
  closing_ungrounded:
    "The closing ignored the student's latest answer. Mention one specific learner-owned detail from that answer before the short goodbye.",
};

function replyPolicyCorrection(
  expectsQuestion: boolean,
  violations: GeneratedCocoReplyLineViolation[],
  recovery: boolean,
) {
  const questionCorrection = recovery
    ? "Regenerate the full recovery line once with exactly one short, concrete question; set reaction and focus to null. A simple yes/no or two-choice scaffold is allowed."
    : "Regenerate the full line once with complete, correctly punctuated sentences and one open question that stays on the active activity.";
  const groundingCorrection = recovery
    ? "The previous candidate was rejected. Use the supplied fallbackQuestion and earlier understood context only; ignore every withheld response and do not invent a detail."
    : "The previous candidate was rejected. Do not repeat its question direction. Use the most recent understood student response and ask one short, concrete WH-question about a different unanswered detail. Never invent a detail.";
  const questionPolicyCorrection = recovery
    ? "For recovery, set reaction and focus to null and include exactly one question. A simple yes/no or two-choice scaffold is allowed."
    : "For a closing, set focus and question to null; otherwise include exactly one question.";
  const questionStyleCorrection = recovery
    ? "Keep the recovery question short, concrete, and grounded in fallbackQuestion or earlier understood context."
    : "Prefer one or two short, simple sentences. After a meaningful answer the question must be an open WH question, not an either-or or yes/no question.";

  return [
    ...violations.map(
      (violation) => `${violation}: ${VIOLATION_CORRECTION_HINTS[violation]}`,
    ),
    expectsQuestion
      ? questionCorrection
      : "Regenerate the full line once as one complete, correctly punctuated closing line with no question.",
    expectsQuestion
      ? groundingCorrection
      : "The previous candidate was rejected. Regenerate the closing without inventing a detail.",
    recovery
      ? "Return reaction, focus, and question separately. For recovery, set reaction and focus to null."
      : "Return reaction, focus, and question separately. Choose at most one focus from the most recent understood studentResponse.",
    "A follow-up may react briefly or mention one learner-owned detail, but must not summarize a list.",
    expectsQuestion
      ? questionPolicyCorrection
      : "For a closing, use reaction only and set focus and question to null.",
    expectsQuestion
      ? questionStyleCorrection
      : "Prefer one or two short, simple sentences. After a meaningful answer the question must be an open WH question, not an either-or or yes/no question.",
    "Return only data matching the schema.",
  ].join(" ");
}

/**
 * Generate Coco's next dynamic reply for one conversation turn. Rebuilds
 * the full grounding payload fresh every call via buildConversationPrompt
 * — never reuses a provider-side response id or any stateful conversation object.
 * Conversation history is passed purely as data inside the JSON user
 * payload, never string-concatenated into system instructions
 * (prompt-injection mitigation, T-11-04).
 */
export async function generateCocoReply(
  input: GenerateCocoReplyInput,
  deps?: GenerateCocoReplyDeps,
): Promise<GenerateCocoReplyResult> {
  const validInput = conversationTurnInputSchema.safeParse(input);
  if (!validInput.success) {
    return { ok: false, error: "invalid_input" };
  }

  if (!deps?.client && !hasApiKey(deps)) {
    return { ok: false, error: "missing_api_key" };
  }

  const recovery =
    validInput.data.generationPurpose?.kind === "unclear_recovery"
      ? validInput.data.generationPurpose
      : null;
  const systemMessage = systemMessageFor(
    validInput.data.safetyMode,
    recovery !== null,
  );
  const conversationPrompt = buildConversationPrompt(validInput.data);
  const groundingExchange = mostRecentUnderstoodExchange(validInput.data);
  const activeQuestion =
    recovery?.fallbackQuestion ??
    (validInput.data.responseHandling === "review_pending"
      ? undefined
      : groundingExchange?.cocoLine);
  const latestResponse = groundingExchange?.studentResponse;
  const topicGroundingText =
    recovery?.fallbackQuestion ??
    (validInput.data.responseHandling === "review_pending" && !groundingExchange
      ? validInput.data.conversationHistory[0]?.cocoLine
      : undefined);
  const replyMode = conversationReplyMode(validInput.data);
  const expectsQuestion = replyMode === "follow_up";

  const first = await structuredOutputCall({
    deps,
    model: resolveModel(deps),
    systemMessage,
    userContent: JSON.stringify(conversationPrompt),
    format: zodTextFormat(generatedCocoReplyPartsSchema, "coco_reply"),
  });
  if (!first.ok) {
    log("error", "ai.conversation_generation_failed", {
      error: "provider_failed",
    });
    return {
      ok: false,
      error:
        first.error === "missing_api_key"
          ? "missing_api_key"
          : "provider_failed",
    };
  }

  {
    const parsed = parseGeneratedCocoReply(first.outputParsed);
    if (!parsed.ok) {
      return { ok: false, error: "schema_failed" };
    }

    const linePolicy = validateGeneratedCocoReplyParts(parsed.reply, {
      expectsQuestion,
      activeQuestion,
      latestStudentResponse: latestResponse,
      topicGroundingText,
      allowClosedQuestion: recovery !== null,
      questionOnly: recovery !== null,
      requireClosingGrounding:
        !expectsQuestion && validInput.data.responseHandling === "normal",
    });
    if (!linePolicy.ok) {
      log("warn", "ai.conversation_line_policy_rejected", {
        reasons: linePolicy.reasons,
        attempt: "first",
      });
      const correctedCall = await structuredOutputCall({
        deps,
        model: resolveModel(deps),
        systemMessage: `${systemMessage} ${replyPolicyCorrection(expectsQuestion, linePolicy.reasons, recovery !== null)}`,
        userContent: JSON.stringify({
          ...conversationPrompt,
          rejectedCandidate: {
            reaction: parsed.reply.reaction,
            focus: parsed.reply.focus,
            question: parsed.reply.question,
          },
          violations: linePolicy.reasons,
        }),
        format: zodTextFormat(generatedCocoReplyPartsSchema, "coco_reply"),
      });
      if (!correctedCall.ok) {
        log("error", "ai.conversation_generation_failed", {
          error: "provider_failed",
        });
        return {
          ok: false,
          error:
            correctedCall.error === "missing_api_key"
              ? "missing_api_key"
              : "provider_failed",
        };
      }
      {
        const corrected = parseGeneratedCocoReply(correctedCall.outputParsed);
        if (!corrected.ok) {
          return { ok: false, error: "schema_failed" };
        }
        const correctedPolicy = validateGeneratedCocoReplyParts(
          corrected.reply,
          {
            expectsQuestion,
            activeQuestion,
            latestStudentResponse: latestResponse,
            topicGroundingText,
            allowClosedQuestion: recovery !== null,
            questionOnly: recovery !== null,
            requireClosingGrounding:
              !expectsQuestion && validInput.data.responseHandling === "normal",
          },
        );
        if (!correctedPolicy.ok) {
          log("warn", "ai.conversation_line_policy_rejected", {
            reasons: correctedPolicy.reasons,
            attempt: "corrected",
          });
          return {
            ok: false,
            error: "reply_policy_failed",
            violations: correctedPolicy.reasons,
            rejectedCandidate: {
              reaction: corrected.reply.reaction,
              focus: corrected.reply.focus,
              question: corrected.reply.question,
            },
            rejectedAttempt: "corrected",
          };
        }
        return {
          ok: true,
          reply: expectsQuestion
            ? corrected.reply
            : withClosingSignOff(corrected.reply),
        };
      }
    }

    return {
      ok: true,
      reply: expectsQuestion ? parsed.reply : withClosingSignOff(parsed.reply),
    };
  }
}
