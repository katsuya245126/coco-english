function shown(value) {
  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}

export function formatEvaluation(evaluation, { label = "evaluation" } = {}) {
  const value =
    evaluation && typeof evaluation === "object" && !Array.isArray(evaluation)
      ? evaluation
      : {};
  const lines = [`    ${label}:`];
  if (Object.keys(value).length === 0) {
    return [...lines, "      (no evaluation recorded)"];
  }

  const fields = [
    ["outcome", value.outcome],
    ["meaning understood", value.meaningUnderstood],
    ["target pattern attempted", value.targetPatternAttempted],
    ["correction needed", value.correctionNeeded],
    ["correction severity", value.correctionSeverity],
    ["correction reason", value.correctionReason],
    ["improved sentence", value.improvedSentence],
    ["retry reason", value.retryReason],
    ["repeat close enough", value.repeatCloseEnough],
    ["language", value.englishLanguage],
    ["confidence", value.confidence],
    ["review reason", value.reviewReason],
    [
      "contract violations",
      Array.isArray(value.contractViolations)
        ? value.contractViolations.join(", ")
        : null,
    ],
    ["policy version", value.policyVersion],
    ["evaluator model", value.evaluationModel],
    ["evaluation source", value.evaluationSource],
    ["transcription model", value.transcriptionModel],
    [
      "transcription confidence",
      value.transcriptionConfidence
        ? `minLogprob=${value.transcriptionConfidence.minLogprob} tokenCount=${value.transcriptionConfidence.tokenCount}`
        : null,
    ],
    ["runtime version", value.runtimeVersion],
  ];
  for (const [field, fieldValue] of fields) {
    lines.push(`      ${field}: ${shown(fieldValue)}`);
  }

  if (value.originalEvaluation) {
    lines.push(
      ...formatEvaluation(value.originalEvaluation, {
        label: "original evaluation (before repeat)",
      }),
    );
  } else if (
    "repeatCloseEnough" in value ||
    value.outcome === "accepted_repeat" ||
    value.outcome === "repeat_accepted" ||
    value.outcome === "retry_repeat"
  ) {
    lines.push(
      "      original evaluation unavailable (legacy row or stale runtime)",
    );
  }

  return lines;
}

export function formatAssignmentPolicy(snapshot) {
  return [
    `  conversation mode: ${snapshot?.conversationMode === true}`,
    `  scene premise: ${snapshot?.scenePremise ?? "—"}`,
    `  target pattern: ${snapshot?.targetPattern ?? "—"}`,
    `  require complete sentence answers: ${snapshot?.requireCompleteSentenceAnswers ?? true}`,
    ...(snapshot?.turns ?? []).map(
      (turn) =>
        `  turn ${turn.turnOrder} answer shape: ${turn.answerShape ?? "fixed"}`,
    ),
  ];
}

export function formatAudioClip(clip) {
  const pronunciationScores = Array.isArray(clip.pronunciation_scores)
    ? clip.pronunciation_scores
    : clip.pronunciation_scores
      ? [clip.pronunciation_scores]
      : [];
  const lines = [
    `    audio clip: ${shown(clip.clip_kind)}`,
    `      processing status: ${shown(clip.processing_status)}`,
    `      duration: ${shown(clip.duration_ms)}${clip.duration_ms == null ? "" : " ms"}`,
    `      byte size: ${shown(clip.byte_size)}`,
    `      MIME type: ${shown(clip.mime_type)}`,
    `      created at: ${shown(clip.created_at)}`,
    `      updated at: ${shown(clip.updated_at)}`,
  ];
  for (const score of pronunciationScores) {
    lines.push(
      `      pronunciation: accuracy=${shown(score.accuracy_score)} fluency=${shown(score.fluency_score)} completeness=${shown(score.completeness_score)} overall=${shown(score.pronunciation_score)} stars=${shown(score.star_band)}`,
    );
  }
  return lines;
}

function turnContext(turn, input) {
  const isContext =
    input &&
    typeof input === "object" &&
    ("snapshotTurn" in input ||
      "promptAnswered" in input ||
      "conversationMode" in input ||
      "generatedTurn" in input);
  if (isContext) {
    return {
      promptAnswered: input.promptAnswered ?? null,
      snapshotTurn: input.snapshotTurn ?? {},
      conversationMode: input.conversationMode === true,
      generatedTurn: input.generatedTurn === true,
      targetPattern: input.targetPattern ?? null,
    };
  }

  const snapshotTurn = input ?? {};
  const templatePrompt = turn.mission_turn_templates?.prompt ?? null;
  const promptAnswered =
    templatePrompt ??
    (turn.coco_line && snapshotTurn.prompt === turn.coco_line
      ? null
      : snapshotTurn.prompt ?? null);
  return {
    promptAnswered,
    snapshotTurn,
    conversationMode: false,
    generatedTurn: false,
    targetPattern: null,
  };
}

export function formatAttemptTurn(turn, input = {}) {
  const context = turnContext(turn, input);
  const snapshotTurn = context.snapshotTurn;
  const evaluation = turn.evaluation ?? {};
  const hintLevel = turn.hint_level_used ?? 0;
  const promptAnswered =
    context.promptAnswered ??
    (context.generatedTurn ? "unavailable (legacy linkage)" : "—");
  const answerShape =
    snapshotTurn.answerShape ??
    (context.conversationMode ? "open (runtime default)" : "fixed");
  // Read the stored column; never re-derive. A row written before the
  // reply_hint_frame migration has null here and is reported as such, so an old
  // attempt is not misread as "no hint was available to the student".
  const replyHintFrame =
    turn.reply_hint_frame == null
      ? "not recorded (pre-migration or no frame matched)"
      : turn.reply_hint_frame;
  const lines = [
    `  Turn ${shown(turn.turn_order)}`,
    `    prompt answered: ${promptAnswered}`,
    ...(context.conversationMode
      ? [`    reply hint frame: ${replyHintFrame}`]
      : []),
    `    next Coco line: ${shown(turn.coco_line)}`,
    ...(context.conversationMode
      ? [`    lesson context (soft): ${shown(context.targetPattern)}`]
      : [`    target: ${shown(snapshotTurn.targetExample)}`]),
    `    answer shape: ${answerShape}`,
    `    said (original): ${shown(turn.original_transcript)}`,
    `    improved sentence: ${shown(turn.improved_sentence)}`,
    `    said (repeat): ${shown(turn.repeat_transcript)}`,
    `    hint level used: ${shown(hintLevel)}`,
    `    created at: ${shown(turn.created_at)}`,
    `    updated at: ${shown(turn.updated_at)}`,
    ...formatEvaluation(evaluation, {
      label:
        "originalEvaluation" in evaluation ||
        "repeatCloseEnough" in evaluation
          ? "repeat evaluation"
          : "original evaluation",
    }),
  ];

  const hintShown = snapshotTurn.hintLadder?.[`tier${hintLevel}`];
  if (hintLevel > 0 && hintShown) {
    lines.push(`    hint shown (tier${hintLevel}): ${hintShown}`);
  }

  const event = turn.moderation_event;
  if (event) {
    lines.push(`    moderation event: ${shown(event.kind)}`);
    if (event.cause) lines.push(`      fallback cause: ${shown(event.cause)}`);
    if (event.violations) {
      lines.push(`      violations: ${event.violations.join(", ")}`);
    }
    if (event.rejectedAttempt) {
      lines.push(`      rejected attempt: ${shown(event.rejectedAttempt)}`);
    }
    if (event.rejectedCandidate) {
      lines.push(
        `      rejected reaction: ${shown(event.rejectedCandidate.reaction)}`,
        `      rejected focus: ${shown(event.rejectedCandidate.focus)}`,
        `      rejected question: ${shown(event.rejectedCandidate.question)}`,
      );
    }
  }

  for (const clip of turn.audio_clips ?? []) {
    lines.push(...formatAudioClip(clip));
  }
  return lines;
}
