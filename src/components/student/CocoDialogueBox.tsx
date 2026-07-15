"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  buildTranslationSegments,
  parseTranslationHint,
  type TranslatableCocoLine,
  type TranslationPhrase,
} from "@/domain/ai/translation-hint";
import {
  mascotDialogueBoxStyle,
  mascotDialogueTextStyle,
  mascotDialogueTabsStyle,
  mascotHintTabStyle,
  mascotNameTabStyle,
  mascotPhraseButtonStyle,
  mascotTranslationBubbleStyle,
  mascotVoiceTabStyle,
} from "@/components/student/styles";

type CocoDialogueBoxProps = {
  assignmentStudentId: string;
  displayName: string;
  dialogueText?: string | null;
  voiceControl?: ReactNode;
  translationLine?: TranslatableCocoLine | null;
};

type TranslationUiState =
  | { kind: "inactive" }
  | { kind: "loading" }
  | { kind: "ready"; phrases: TranslationPhrase[] }
  | { kind: "error" };

export function CocoDialogueBox({
  assignmentStudentId,
  displayName,
  dialogueText,
  voiceControl,
  translationLine,
}: CocoDialogueBoxProps) {
  const [translationState, setTranslationState] =
    useState<TranslationUiState>({ kind: "inactive" });
  const [expandedPhraseIndex, setExpandedPhraseIndex] = useState<number | null>(
    null,
  );

  useEffect(() => {
    setTranslationState({ kind: "inactive" });
    setExpandedPhraseIndex(null);
  }, [
    assignmentStudentId,
    dialogueText,
    translationLine?.lineKind,
    translationLine?.turnOrder,
  ]);

  async function loadTranslationHint() {
    if (!translationLine || !dialogueText) return;
    setTranslationState({ kind: "loading" });
    setExpandedPhraseIndex(null);

    try {
      const response = await fetch(
        `/student/missions/${assignmentStudentId}/translation-hint`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lineKind: translationLine.lineKind,
            turnOrder: translationLine.turnOrder,
          }),
        },
      );
      const payload: unknown = await response.json();
      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("ok" in payload) ||
        payload.ok !== true ||
        !("phrases" in payload)
      ) {
        setTranslationState({ kind: "error" });
        return;
      }

      const parsed = parseTranslationHint(dialogueText, {
        phrases: payload.phrases,
      });
      if (!parsed.ok) {
        setTranslationState({ kind: "error" });
        return;
      }
      setTranslationState({ kind: "ready", phrases: parsed.hint.phrases });
    } catch {
      setTranslationState({ kind: "error" });
    }
  }

  const segments =
    dialogueText && translationState.kind === "ready"
      ? buildTranslationSegments(dialogueText, translationState.phrases)
      : null;

  return (
    <div style={mascotDialogueBoxStyle}>
      <div style={mascotDialogueTabsStyle}>
        <span style={mascotNameTabStyle}>{displayName}</span>
        {translationLine && dialogueText ? (
          <button
            type="button"
            aria-pressed={translationState.kind === "ready"}
            aria-busy={translationState.kind === "loading"}
            onClick={loadTranslationHint}
            style={mascotHintTabStyle}
          >
            Hint
          </button>
        ) : null}
        <span style={mascotVoiceTabStyle}>{voiceControl}</span>
      </div>

      {dialogueText ? (
        <p style={mascotDialogueTextStyle}>
          {segments
            ? segments.map((segment, index) => {
                if (segment.kind === "text") return segment.text;
                const isExpanded = expandedPhraseIndex === index;
                return (
                  <span key={`${segment.phrase.start}-${segment.phrase.end}`} style={{ position: "relative", display: "inline-block" }}>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedPhraseIndex(isExpanded ? null : index)
                      }
                      style={mascotPhraseButtonStyle}
                    >
                      {segment.text}
                    </button>
                    {isExpanded ? (
                      <span role="status" style={mascotTranslationBubbleStyle}>
                        {segment.phrase.translation}
                      </span>
                    ) : null}
                  </span>
                );
              })
            : dialogueText}
        </p>
      ) : null}

      {translationState.kind === "error" ? (
        <button
          type="button"
          title="Retry translation"
          aria-label="Retry translation"
          onClick={loadTranslationHint}
          style={mascotHintTabStyle}
        >
          Translation unavailable
        </button>
      ) : null}
    </div>
  );
}
