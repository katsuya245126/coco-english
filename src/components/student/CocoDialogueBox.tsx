"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildTranslationSegments,
  clampPhrasesToPage,
  parseTranslationHint,
  type TranslatableCocoLine,
  type TranslationPhrase,
} from "@/domain/ai/translation-hint";
import {
  paginateDialogueText,
} from "@/domain/conversation/dialogue-pagination";
import {
  mascotDialogueActionsStyle,
  mascotDialogueBoxStyle,
  mascotDialoguePageButtonStyle,
  mascotDialoguePageIndicatorStyle,
  mascotDialoguePagerStyle,
  mascotDialogueShellStyle,
  mascotDialogueTextStyle,
  mascotDialogueTabsStyle,
  mascotHintSpinnerStyle,
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
  isThinking?: boolean;
};

type TranslationUiState =
  | { kind: "inactive" }
  | { kind: "loading" }
  | { kind: "ready"; phrases: TranslationPhrase[] }
  | { kind: "error" }
  | { kind: "rate_limited" };

export function CocoDialogueBox({
  assignmentStudentId,
  displayName,
  dialogueText,
  voiceControl,
  translationLine,
  isThinking = false,
}: CocoDialogueBoxProps) {
  const [translationState, setTranslationState] =
    useState<TranslationUiState>({ kind: "inactive" });
  const [translationVisible, setTranslationVisible] = useState(false);
  const [expandedPhraseIndex, setExpandedPhraseIndex] = useState<number | null>(
    null,
  );
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  // The next-page button pulses until the student uses the pager, then stops
  // for the rest of the turn — it has done its job. Reset per turn below.
  const [pagerUsed, setPagerUsed] = useState(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const requestTokenRef = useRef(0);

  const phrases = useMemo(
    () =>
      translationState.kind === "ready" ? translationState.phrases : [],
    [translationState],
  );
  const pages = useMemo(
    () => paginateDialogueText(dialogueText ?? ""),
    [dialogueText],
  );
  const safePageIndex = Math.min(
    currentPageIndex,
    Math.max(0, pages.length - 1),
  );
  const currentPage = pages[safePageIndex] ?? null;

  useEffect(() => {
    requestTokenRef.current += 1;
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setTranslationState({ kind: "inactive" });
    setTranslationVisible(false);
    setExpandedPhraseIndex(null);
    setCurrentPageIndex(0);
    setPagerUsed(false);
    return () => {
      requestTokenRef.current += 1;
      activeRequestRef.current?.abort();
    };
  }, [
    assignmentStudentId,
    dialogueText,
    translationLine?.lineKind,
    translationLine?.turnOrder,
  ]);

  useEffect(() => {
    setCurrentPageIndex((index) =>
      Math.min(index, Math.max(0, pages.length - 1)),
    );
  }, [pages.length]);

  async function loadTranslationHint() {
    if (!translationLine || !dialogueText) return;
    if (translationState.kind === "ready") {
      const phraseIndex = firstPhraseIndexOnPage(
        translationState.phrases,
        currentPage,
      );
      const nextVisible = !translationVisible;
      setTranslationVisible(nextVisible);
      setExpandedPhraseIndex(nextVisible ? phraseIndex : null);
      return;
    }
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    const requestToken = requestTokenRef.current + 1;
    requestTokenRef.current = requestToken;
    setTranslationState({ kind: "loading" });
    setTranslationVisible(false);
    setExpandedPhraseIndex(null);

    try {
      const response = await fetch(
        `/student/missions/${assignmentStudentId}/translation-hint`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            lineKind: translationLine.lineKind,
            turnOrder: translationLine.turnOrder,
          }),
        },
      );
      const payload: unknown = await response.json();
      if (requestTokenRef.current !== requestToken) return;
      // A budget denial is a wait-and-retry state, not a provider outage, so it
      // is mapped before the generic failure parsing below.
      if (
        response.status === 429 &&
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        payload.error === "rate_limited"
      ) {
        setTranslationState({ kind: "rate_limited" });
        setTranslationVisible(false);
        return;
      }
      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("ok" in payload) ||
        payload.ok !== true ||
        !("phrases" in payload)
      ) {
        setTranslationState({ kind: "error" });
        setTranslationVisible(false);
        return;
      }

      const parsed = parseTranslationHint(dialogueText, {
        phrases: payload.phrases,
      });
      if (requestTokenRef.current !== requestToken) return;
      if (!parsed.ok) {
        setTranslationState({ kind: "error" });
        setTranslationVisible(false);
        return;
      }
      const firstPhrase = parsed.hint.phrases[0];
      if (!firstPhrase) {
        setTranslationState({ kind: "error" });
        setTranslationVisible(false);
        return;
      }
      setTranslationState({ kind: "ready", phrases: parsed.hint.phrases });
      setTranslationVisible(true);
      setExpandedPhraseIndex(
        firstPhraseIndexOnPage(parsed.hint.phrases, currentPage),
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (requestTokenRef.current !== requestToken) return;
      setTranslationState({ kind: "error" });
      setTranslationVisible(false);
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
      }
    }
  }

  const pagePhrases = currentPage
    ? clampPhrasesToPage(phrases, currentPage)
    : [];
  const segments = currentPage && translationVisible
    ? buildTranslationSegments(currentPage.text, pagePhrases)
    : null;
  const isHintLoading = translationState.kind === "loading";
  const isHintRateLimited = translationState.kind === "rate_limited";
  // The tab shows a bare `한` in every state so its width never jumps, but a
  // lone glyph is a poor accessible name — aria-label/title stay English and
  // keep carrying the error distinction.
  const hintAccessibleLabel = isHintRateLimited
    ? "Wait, then retry hint"
    : translationState.kind === "error"
      ? "Retry hint"
      : "Hint";
  const hintLabel = isHintLoading ? "Loading hint" : hintAccessibleLabel;

  return (
    <div style={mascotDialogueShellStyle}>
      <div style={mascotDialogueTabsStyle}>
        <span style={mascotNameTabStyle}>{displayName}</span>
        {translationLine && dialogueText ? (
          <div style={mascotDialogueActionsStyle}>
            <button
              type="button"
              className="student-tinted-button"
              aria-label={hintLabel}
              title={hintLabel}
              aria-pressed={translationVisible}
              aria-busy={isHintLoading}
              disabled={isHintLoading}
              onClick={loadTranslationHint}
              style={{
                ...mascotHintTabStyle,
                ...(voiceControl ? null : { borderRight: 0 }),
              }}
            >
              <span>한</span>
              {isHintLoading ? <HintSpinner /> : null}
            </button>
            {voiceControl ? (
              <span style={mascotVoiceTabStyle}>{voiceControl}</span>
            ) : null}
          </div>
        ) : voiceControl ? (
          <div style={mascotDialogueActionsStyle}>
            <span style={mascotVoiceTabStyle}>{voiceControl}</span>
          </div>
        ) : null}
      </div>

      <div style={mascotDialogueBoxStyle}>
        {currentPage ? (
          <p
            style={mascotDialogueTextStyle}
            aria-live="polite"
            aria-atomic="true"
          >
            {isThinking ? (
              <>
                {currentPage.text.replace(/\s*\.\.\.$|\s*…$/u, "")}
                <ThinkingDots />
              </>
            ) : segments
              ? segments.map((segment) => {
                  if (segment.kind === "text") return segment.text;
                  const absoluteStart = currentPage.start + segment.phrase.start;
                  const absoluteEnd = currentPage.start + segment.phrase.end;
                  const phraseIndex = phrases.findIndex(
                    (phrase) =>
                      phrase.start <= absoluteStart && phrase.end >= absoluteEnd,
                  );
                  const isExpanded = expandedPhraseIndex === phraseIndex;
                  return (
                    <span
                      key={`${absoluteStart}-${absoluteEnd}`}
                      style={{ position: "relative", display: "inline" }}
                    >
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedPhraseIndex(isExpanded ? null : phraseIndex)
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
              : currentPage.text}
          </p>
        ) : null}
      </div>
      {isHintRateLimited ? (
        <span role="status" style={mascotTranslationBubbleStyle}>
          Please wait a few minutes, then retry the hint.
        </span>
      ) : null}
      {pages.length > 1 ? (
        <nav aria-label="Dialogue pages" style={mascotDialoguePagerStyle}>
          <button
            type="button"
            className="student-tinted-button"
            aria-label="Previous dialogue page"
            disabled={safePageIndex === 0}
            onClick={() => {
              setPagerUsed(true);
              setCurrentPageIndex((index) => Math.max(0, index - 1));
            }}
            style={{
              ...mascotDialoguePageButtonStyle,
              opacity: safePageIndex === 0 ? 0.35 : 1,
            }}
          >
            ‹
          </button>
          <span style={mascotDialoguePageIndicatorStyle}>
            {safePageIndex + 1} / {pages.length}
          </span>
          <button
            type="button"
            className={
              pagerUsed
                ? "student-tinted-button"
                : "student-tinted-button student-pager-pulse"
            }
            aria-label="Next dialogue page"
            disabled={safePageIndex === pages.length - 1}
            onClick={() => {
              setPagerUsed(true);
              setCurrentPageIndex((index) => Math.min(pages.length - 1, index + 1));
            }}
            style={{
              ...mascotDialoguePageButtonStyle,
              opacity: safePageIndex === pages.length - 1 ? 0.35 : 1,
            }}
          >
            ›
          </button>
        </nav>
      ) : null}
    </div>
  );
}

function firstPhraseIndexOnPage(
  phrases: TranslationPhrase[],
  page: { start: number; end: number } | null,
): number | null {
  if (!page) return null;
  const index = phrases.findIndex(
    (phrase) => phrase.start < page.end && phrase.end > page.start,
  );
  return index >= 0 ? index : null;
}

function ThinkingDots() {
  return (
    <span aria-hidden="true" style={{ display: "inline-flex", gap: 3, marginLeft: 4 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="thinking-dot"
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "currentColor",
            animation: `thinking-dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

function HintSpinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      style={mascotHintSpinnerStyle}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}
