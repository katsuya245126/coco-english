const WORD_PATTERN = /[\p{L}\p{N}']+/gu;
const TRAILING_CONTEXT_PATTERN =
  /\s+(after|before|for|in|inside|outside|on|at|with|near|about|this|next|last|every)(?:\s+[\p{L}\p{N}'\s]*)?$/iu;
const WHO_TRAILING_CONTEXT_PATTERN =
  /\s+(after|before|for|in|inside|outside|on|at|near|about|this|next|last|every)(?:\s+[\p{L}\p{N}'\s]*)?$/iu;
// Context that reads naturally BEFORE "with" in a who frame, so it can be
// relocated instead of dropped: "go with to the PC room" -> "go to the PC room
// with ____". Only a to-destination qualifies; "at school" or "on the weekend"
// ahead of "with" reads stilted for a child, so those are dropped instead.
const WHO_RELOCATABLE_DESTINATION = /^to\s+[\p{L}\p{N}'][\p{L}\p{N}'\s]*$/iu;

function sentenceCase(value: string) {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

function cleanQuestion(input: string) {
  const questions = input.match(/[^.?!]*\?/gu);
  const question = questions?.at(-1) ?? input;
  return question.replace(/\s+/gu, " ").trim();
}

function cleanPhrase(value: string) {
  return value
    .replace(/\?$/u, "")
    .replace(/\b(?:today|tomorrow|now)\b/giu, "")
    .replace(/\byourself\b/giu, "myself")
    .replace(/\byour\b/giu, "my")
    .replace(/\s+/gu, " ")
    .trim();
}

function hasWords(value: string) {
  WORD_PATTERN.lastIndex = 0;
  return WORD_PATTERN.test(value);
}

function completeFrame(value: string) {
  const frame = value.replace(/\s+/gu, " ").trim();
  if (!hasWords(frame) || !frame.includes("____")) return null;
  return `${sentenceCase(frame)}.`;
}

function withFinalBlank(value: string) {
  const frame = value.replace(/\s+/gu, " ").trim();
  if (!hasWords(frame)) return null;
  return completeFrame(`${frame} ____`);
}

function dropTrailingContext(value: string) {
  return cleanPhrase(value).replace(TRAILING_CONTEXT_PATTERN, "").trim();
}

function splitTrailingContext(value: string) {
  const phrase = cleanPhrase(value);
  const match = phrase.match(TRAILING_CONTEXT_PATTERN);
  if (!match || match.index === undefined) {
    return { core: phrase, context: "" };
  }

  return {
    core: phrase.slice(0, match.index).trim(),
    context: phrase.slice(match.index).trim(),
  };
}

function frameBroadObject(prefix: string, verbPhrase: string) {
  const core = dropTrailingContext(verbPhrase);
  if (!core) return null;
  if (core.toLowerCase() === "do") return completeFrame(`I ${prefix} ____`);
  return completeFrame(`I ${prefix} ${core} ____`);
}

function framePresentObject(verbPhrase: string) {
  const { core, context } = splitTrailingContext(verbPhrase);
  if (!core) return null;
  if (core.toLowerCase() === "do") {
    return context ? completeFrame(`I ____ ${context}`) : completeFrame("I ____");
  }
  return context
    ? completeFrame(`I ${core} ____ ${context}`)
    : completeFrame(`I ${core} ____`);
}

/**
 * A `who` question asks for a PERSON, so the blank marks the person slot and
 * must stay welded to `with`. Appending it after the trailing phrase instead
 * produced "I usually go with to the PC room ____." (UAT 2026-07-27, attempt
 * 992af2e2) — the student read the hint aloud and the evaluator correctly
 * rejected it.
 *
 * Splitting on `with` rather than enumerating what may follow it is deliberate:
 * the earlier stripper missed `to`, and `during`, `over`, `by`, `around`,
 * `from`, and `while` failed the same way. Anything after `with` is context by
 * definition, so no preposition list can go stale here.
 *
 * A `to`-destination is the one context that reads naturally ahead of `with`
 * ("I go to the PC room with ____."), so it is relocated. Everything else is
 * dropped rather than stranded, which leaves every previously correct hint
 * byte-identical.
 */
function frameWhoDetail(verbPhrase: string) {
  const phrase = cleanPhrase(verbPhrase);
  const withMatch = phrase.match(/^(.*?)\s*\bwith\b\s*(.*)$/iu);

  if (withMatch) {
    const core = withMatch[1].trim();
    const trailing = withMatch[2].trim();
    const destination = WHO_RELOCATABLE_DESTINATION.test(trailing)
      ? trailing
      : "";
    const lead = [core, destination].filter(Boolean).join(" ");
    // Bare "Who do you go with?" still needs a verb to build a frame from.
    if (!lead) return null;
    return completeFrame(`I ${lead} with ____`);
  }

  const core = phrase.replace(WHO_TRAILING_CONTEXT_PATTERN, "").trim();
  return withFinalBlank(`I ${core}`);
}

function frameWhereDetail(verbPhrase: string) {
  const phrase = cleanPhrase(verbPhrase);
  if (!phrase) return null;
  return completeFrame(`I ${phrase} at ____`);
}

export function buildReplyHintFrame(prompt: string): string | null {
  const question = cleanQuestion(prompt);

  const futureGoingTo = question.match(
    /^what(?:\s+[\p{L}\p{N}']+)?\s+are\s+you\s+going\s+to\s+(.+)\?$/iu,
  );
  if (futureGoingTo) {
    return frameBroadObject("am going to", futureGoingTo[1]);
  }

  const futureWill = question.match(
    /^what(?:\s+[\p{L}\p{N}']+)?\s+will\s+you\s+(.+)\?$/iu,
  );
  if (futureWill) {
    return frameBroadObject("will", futureWill[1]);
  }

  const likeToDo = question.match(
    /^what\s+do\s+you\s+like\s+to\s+do(?:\s+(.+))?\?$/iu,
  );
  if (likeToDo) {
    return completeFrame("I like to ____");
  }

  const likeToObject = question.match(
    /^what(?:\s+[\p{L}\p{N}']+)?\s+do\s+you\s+like\s+to\s+(.+)\?$/iu,
  );
  if (likeToObject) {
    return frameBroadObject("like to", likeToObject[1]);
  }

  const whoQuestion = question.match(/^who\s+do\s+you\s+(.+)\?$/iu);
  if (whoQuestion) {
    return frameWhoDetail(whoQuestion[1]);
  }

  const whereQuestion = question.match(/^where\s+do\s+you\s+(.+)\?$/iu);
  if (whereQuestion) {
    return frameWhereDetail(whereQuestion[1]);
  }

  const whenQuestion = question.match(/^when\s+do\s+you\s+(.+)\?$/iu);
  if (whenQuestion) {
    return withFinalBlank(`I ${cleanPhrase(whenQuestion[1])}`);
  }

  const presentWhat = question.match(
    /^what(?:\s+[\p{L}\p{N}']+)?\s+do\s+you\s+(.+)\?$/iu,
  );
  if (presentWhat) {
    return framePresentObject(presentWhat[1]);
  }

  return null;
}
