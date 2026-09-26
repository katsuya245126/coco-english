"use client";

import type { ReactNode } from "react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildTranslationSegments,
  clampPhrasesToPage,
  parseTranslationHint,
  type TranslatableCocoLine,
  type TranslationPhrase,
  type TranslationSegment,
} from "@/domain/ai/translation-hint";
import {
  paginateDialogueText,
} from "@/domain/conversation/dialogue-pagination";
import {
  mascotDialogueBoxStyle,
  mascotCompactSpriteStyle,
  mascotDialogueCopyStyle,
  mascotDialogueNextButtonStyle,
  mascotDialoguePageIndicatorStyle,
  mascotDialoguePagerStyle,
  mascotDialoguePrevButtonStyle,
  mascotDialogueShellStyle,
  mascotDialogueTailStyle,
  mascotDialogueTextStyle,
  mascotDialogueToolsStyle,
  mascotHintSpinnerStyle,
  mascotNameTabStyle,
  mascotPictureDialogueCopyStyle,
  mascotPhraseButtonStyle,
  mascotStatusTextStyle,
  mascotToolButtonPressedStyle,
  mascotToolButtonStyle,
  mascotTranslationAnchorStyle,
  mascotTranslationBubbleStyle,
  mascotDialogueHintTextStyle,
} from "@/components/student/styles";

type CocoDialogueBoxProps = {
  assignmentStudentId: string;
  displayName: string;
  dialogueText?: string | null;
  voiceControl?: ReactNode;
  translationLine?: TranslatableCocoLine | null;
  isThinking?: boolean;
  compactSpriteSrc?: string | null;
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
  compactSpriteSrc = null,
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
  const expandedPhraseRef = useRef<HTMLSpanElement>(null);
  const translationBubbleRef = useRef<HTMLSpanElement>(null);
  // The bubble hangs from a zero-width marker after the phrase; place it just
  // under the phrase's last line, kept inside the text column.
  useLayoutEffect(() => {
    const phrase = expandedPhraseRef.current;
    const bubble = translationBubbleRef.current;
    const text = bubble?.closest("p");
    if (!phrase || !bubble || !text) return;
    const position = () => {
      const lastLine = [...phrase.getClientRects()].at(-1);
      const marker = bubble.parentElement?.getBoundingClientRect();
      if (!lastLine || !marker) return;
      const column = text.getBoundingClientRect();
      bubble.style.maxWidth = `${column.width}px`;
      const left = Math.max(
        column.left,
        Math.min(lastLine.left, column.right - bubble.offsetWidth),
      );
      bubble.style.marginLeft = `${left - marker.left}px`;
      bubble.style.marginTop = `${lastLine.bottom - marker.top + 4}px`;
    };
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  });
  const expandedPhrase =
    segments && expandedPhraseIndex !== null ? phrases[expandedPhraseIndex] : null;
  // Only while the phrase is on the visible page.
  const expandedTranslation =
    expandedPhrase &&
    currentPage &&
    pagePhrases.some(
      (phrase) =>
        currentPage.start + phrase.start >= expandedPhrase.start &&
        currentPage.start + phrase.end <= expandedPhrase.end,
    )
      ? expandedPhrase.translation
      : null;
  const phraseIndexOf = (pagePhrase: { start: number; end: number }) => {
    const absoluteStart = (currentPage?.start ?? 0) + pagePhrase.start;
    const absoluteEnd = (currentPage?.start ?? 0) + pagePhrase.end;
    return phrases.findIndex(
      (phrase) => phrase.start <= absoluteStart && phrase.end >= absoluteEnd,
    );
  };
  function renderSegments(pageSegments: TranslationSegment[]) {
    return pageSegments.map((segment, index) => {
      if (segment.kind === "text") return segment.text;
      const phraseIndex = phraseIndexOf(segment.phrase);
      const isExpanded = expandedPhraseIndex === phraseIndex;
      const open = () => setExpandedPhraseIndex(phraseIndex);
      // A span, not a <button>: buttons render as atomic boxes that cannot
      // wrap across lines with the sentence.
      return (
        <Fragment key={index}>
          <span
            ref={isExpanded ? expandedPhraseRef : undefined}
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            onClick={open}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              open();
            }}
            style={mascotPhraseButtonStyle}
          >
            {segment.text}
          </span>
          {isExpanded && expandedTranslation ? (
            // Zero-width and top-aligned: it makes only this line taller, so
            // the bubble has room under the phrase without breaking the
            // sentence or covering the next line.
            <span style={mascotTranslationAnchorStyle}>
              <span
                ref={translationBubbleRef}
                role="status"
                style={mascotTranslationBubbleStyle}
              >
                {expandedTranslation}
              </span>
            </span>
          ) : null}
        </Fragment>
      );
    });
  }
  const isHintLoading = translationState.kind === "loading";
  const isHintRateLimited = translationState.kind === "rate_limited";
  // The button shows `한국어` in every state so its width never jumps, but a
  // lone glyph is a poor accessible name — aria-label/title stay English and
  // keep carrying the error distinction.
  const hintAccessibleLabel = isHintRateLimited
    ? "Wait, then retry hint"
    : translationState.kind === "error"
      ? "Retry hint"
      : "Hint";
  const hintLabel = isHintLoading ? "Loading hint" : hintAccessibleLabel;
  const hasTranslation = Boolean(translationLine && dialogueText);

  return (
    <div style={mascotDialogueShellStyle}>
      <div style={mascotDialogueBoxStyle}>
        <span aria-hidden="true" style={mascotDialogueTailStyle} />
        <span style={mascotNameTabStyle}>{displayName}</span>
        <div
          style={
            compactSpriteSrc
              ? mascotPictureDialogueCopyStyle
              : mascotDialogueCopyStyle
          }
          data-picture={compactSpriteSrc ? "true" : "false"}
        >
          {compactSpriteSrc ? (
            <img
              src={compactSpriteSrc}
              alt=""
              aria-hidden="true"
              width={58}
              height={58}
              style={mascotCompactSpriteStyle}
            />
          ) : null}
          {currentPage ? (
            <p
              style={
                segments ? mascotDialogueHintTextStyle : mascotDialogueTextStyle
              }
              aria-live="polite"
              aria-atomic="true"
            >
              {isThinking ? (
                <>
                  {currentPage.text.replace(/\s*\.\.\.$|\s*…$/u, "")}
                  <ThinkingDots />
                </>
              ) : segments
                ? renderSegments(segments)
                : currentPage.text}
            </p>
          ) : null}
        </div>
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
                ...mascotDialoguePrevButtonStyle,
                opacity: safePageIndex === 0 ? 0.3 : 1,
              }}
            >
              <ChevronIcon direction="left" />
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
                ...mascotDialogueNextButtonStyle,
                opacity: safePageIndex === pages.length - 1 ? 0.35 : 1,
              }}
            >
              Next
              <ChevronIcon direction="right" />
            </button>
          </nav>
        ) : null}
      </div>
      {hasTranslation || voiceControl ? (
        <div style={mascotDialogueToolsStyle}>
          {voiceControl}
          {hasTranslation ? (
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
                ...mascotToolButtonStyle,
                ...(translationVisible ? mascotToolButtonPressedStyle : null),
              }}
            >
              <span lang="ko">한국어</span>
              {isHintLoading ? <HintSpinner /> : null}
            </button>
          ) : null}
        </div>
      ) : null}
      {isHintRateLimited ? (
        <p role="status" style={mascotStatusTextStyle}>
          Please wait a few minutes, then retry the hint.
        </p>
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

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
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
