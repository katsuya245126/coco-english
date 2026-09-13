"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PRACTICE_SOUNDS, nextPracticeWordOrder } from "@/domain/pronunciation/practice";
import type {
  PronunciationPracticePageState,
  PronunciationPracticeWordState,
  PronunciationWordTryState,
} from "@/server/student-access/pronunciation-flow";
import type { PracticeTryOutcome } from "@/domain/pronunciation/practice";
import { completePronunciationAttemptAction } from "@/app/student/pronunciation/[assignmentStudentId]/actions";
import { CocoSpeechAudio } from "@/components/student/CocoSpeechAudio";
import { VoiceRecorderControl } from "@/components/student/VoiceRecorderControl";
import {
  missionContentStyle,
  missionPageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from "@/components/student/styles";
import styles from "./PronunciationPracticeShell.module.css";

const backLinkStyle = {
  ...secondaryButtonStyle,
  width: 44,
  minHeight: 44,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  fontSize: 20,
  boxSizing: "border-box",
} as const;

type PronunciationPracticeShellProps = {
  page: PronunciationPracticePageState;
};

type UploadResponse =
  | {
      ok: true;
      audioClipId: string;
      tryNumber: 1 | 2 | 3;
      transcript: string;
      outcome: PracticeTryOutcome;
      starBand: 1 | 2 | 3 | null;
      fullWordPassed: boolean;
      targetSoundAccuracy: number | null;
      targetSoundPassed: boolean;
      feedback: string;
    }
  | { ok: false; error?: string };

type WordAudioStatus = "loading" | "ready" | "not_found" | "unavailable";
type WordAudioResponse = { ok?: boolean; audioUrl?: string; error?: string };

const FEEDBACK_VARIANTS = {
  passed: "pronunciation_good",
  target_weak: "pronunciation_target_weak",
  word_weak: "pronunciation_word_weak",
  different_word: "pronunciation_different_word",
} as const;

function feedbackVariantFor(result: UploadResponse & { ok: true }) {
  return result.outcome !== "passed" && result.tryNumber === 3
    ? "pronunciation_good_try"
    : FEEDBACK_VARIANTS[result.outcome];
}

/** The target letters carry a small visual cue alongside Coco's latest verdict. */
function highlightedWord(
  word: PronunciationPracticeWordState,
  targetSoundPassed: boolean | null = null,
) {
  const start = Math.max(0, Math.min(word.text.length, word.highlightStart));
  const end = Math.max(start, Math.min(word.text.length, start + word.highlightLength));
  const markStyle =
    targetSoundPassed === null
      ? { background: "#FEF9C3", color: "#111827" }
      : targetSoundPassed
        ? { background: "transparent", color: "#15803D" }
        : { background: "transparent", color: "#B91C1C", textDecoration: "underline" };
  return (
    <span aria-label={word.text}>
      {word.text.slice(0, start)}
      <mark style={markStyle}>{word.text.slice(start, end)}</mark>
      {word.text.slice(end)}
    </span>
  );
}

function starsForBand(starBand: number | null): string {
  // A different word or an unscored try derives three empty stars: Coco could
  // not score the word, which is not the same as a score of zero. One star
  // stays reserved for a scored word below 60.
  if (starBand === null) return "☆☆☆";
  const filled = Math.max(0, Math.min(3, Math.round(starBand)));
  return "★".repeat(filled) + "☆".repeat(3 - filled);
}

function starsFor(word: PronunciationPracticeWordState): string {
  const result = word.resultTry;
  if (!result || result.outcome === "different_word") return starsForBand(null);
  return starsForBand(result.starBand);
}

/** A passed try celebrates; anything else encourages another try. */
const EXPRESSION_BY_OUTCOME: Record<PracticeTryOutcome, "celebrate" | "encouraging"> = {
  passed: "celebrate",
  target_weak: "encouraging",
  word_weak: "encouraging",
  different_word: "encouraging",
};

const SPRITE_BY_EXPRESSION = {
  happy: "/images/coco-happy-alpha.png",
  celebrate: "/images/coco-celebrate-alpha.png",
  encouraging: "/images/coco-encouraging-alpha.png",
} as const;

export function PronunciationPracticeShell({ page }: PronunciationPracticeShellProps) {
  const [words, setWords] = useState(page.words);
  const [currentWordOrder, setCurrentWordOrder] = useState(page.currentWordOrder);
  const [readOnly, setReadOnly] = useState(page.readOnly);
  const [completed, setCompleted] = useState(page.completed);
  // Holds the try the student just made. The stage must read this and not the
  // word's derived resultTry, which can still point at an earlier try.
  const [lastTry, setLastTry] = useState<{
    message: string;
    targetSoundPassed: boolean;
    outcome: PracticeTryOutcome;
  } | null>(null);
  const [feedbackVariant, setFeedbackVariant] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [wordAudioUrls, setWordAudioUrls] = useState<Record<number, string>>({});
  const [wordAudioStatus, setWordAudioStatus] = useState<Record<number, WordAudioStatus>>({});
  const [wordAudioRetryCount, setWordAudioRetryCount] = useState(0);
  const wordAudioCache = useRef(new Map<number, string>());
  const autoPlayedWordOrders = useRef(new Set<number>());
  const soundAudioRef = useRef<HTMLAudioElement | null>(null);
  const wordAudioRef = useRef<HTMLAudioElement | null>(null);

  const currentWord = words.find((word) => word.order === currentWordOrder) ?? null;
  const sound = PRACTICE_SOUNDS[page.soundId];

  useEffect(() => {
    if (currentWordOrder === null || wordAudioCache.current.has(currentWordOrder)) return;
    const order = currentWordOrder;
    let cancelled = false;
    setWordAudioStatus((statuses) => ({ ...statuses, [order]: "loading" }));
    fetch(`/student/pronunciation/${page.assignmentStudentId}/word-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordOrder: order }),
    })
      .then(async (response) => ({
        response,
        result: (await response.json().catch(() => null)) as WordAudioResponse | null,
      }))
      .then(({ response, result }) => {
        if (cancelled) return;
        const audioUrl = result?.audioUrl;
        if (!response.ok || !result?.ok || !audioUrl) {
          setWordAudioStatus((statuses) => ({
            ...statuses,
            [order]: result?.error === "not_found" ? "not_found" : "unavailable",
          }));
          return;
        }
        wordAudioCache.current.set(order, audioUrl);
        setWordAudioUrls((urls) => ({ ...urls, [order]: audioUrl }));
        setWordAudioStatus((statuses) => ({ ...statuses, [order]: "ready" }));
      })
      .catch(() => {
        if (!cancelled) {
          setWordAudioStatus((statuses) => ({ ...statuses, [order]: "unavailable" }));
        }
      })
    return () => {
      cancelled = true;
    };
  }, [currentWordOrder, page.assignmentStudentId, wordAudioRetryCount]);

  const currentWordAudioUrl = currentWordOrder === null
    ? null
    : wordAudioUrls[currentWordOrder] ?? null;
  const currentWordAudioStatus = currentWordOrder === null
    ? null
    : wordAudioStatus[currentWordOrder] ?? "loading";

  useEffect(() => {
    if (
      currentWordOrder === null ||
      !currentWordAudioUrl ||
      autoPlayedWordOrders.current.has(currentWordOrder) ||
      !wordAudioRef.current
    ) {
      return;
    }
    autoPlayedWordOrders.current.add(currentWordOrder);
    const audio = wordAudioRef.current;
    audio.currentTime = 0;
    try {
      void Promise.resolve(audio.play()).catch(() => undefined);
    } catch {
      // Autoplay is optional when the browser cannot start media playback.
    }
  }, [currentWordAudioUrl, currentWordOrder]);

  function replay(audioRef: { current: HTMLAudioElement | null }) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    void audioRef.current.play().catch(() => undefined);
  }

  async function recordWord(blob: Blob, metadata: { mimeType: string; durationMs: number }) {
    if (!currentWord || readOnly || completed) return;
    const formData = new FormData();
    formData.set("file", blob, "practice.webm");
    formData.set("attemptId", page.attemptId);
    formData.set("turnOrder", String(currentWord.order));
    formData.set("mimeType", metadata.mimeType);
    formData.set("durationMs", String(metadata.durationMs));

    const response = await fetch(`/student/pronunciation/${page.assignmentStudentId}/audio`, {
      method: "POST",
      body: formData,
    });
    const result = (await response.json().catch(() => null)) as UploadResponse | null;
    if (!response.ok || !result || result.ok !== true) {
      const error = result && "error" in result ? result.error : undefined;
      const recognitionOrScoringFailure =
        error === "transcription_failed" ||
        error === "unclear_transcript" ||
        error === "scoring_failed";
      throw new Error(
        error === "rate_limited"
          ? "Please wait, then try again."
          : recognitionOrScoringFailure
            ? "We couldn't check that recording. Try again."
            : "We could not save that word. Try again.",
      );
    }

    const tryState: PronunciationWordTryState = {
      id: result.audioClipId,
      tryNumber: result.tryNumber,
      transcript: result.transcript,
      outcome: result.outcome,
      wordAccuracy: result.starBand === null ? null : result.starBand >= 2 ? 60 : 59,
      starBand: result.starBand,
      fullWordPassed: result.fullWordPassed,
      targetSoundAccuracy: result.targetSoundAccuracy,
      targetSoundPassed: result.targetSoundPassed,
      createdAt: new Date().toISOString(),
    };
    const updatedWords = words.map((word) => {
      if (word.order !== currentWord.order) return word;
      const nextTries = [...(word.firstTry ? [word.firstTry] : []), ...(word.resultTry && word.resultTry.id !== word.firstTry?.id ? [word.resultTry] : []), tryState]
        .sort((a, b) => a.tryNumber - b.tryNumber);
      const passed = nextTries.some((tryRow) => tryRow.outcome === "passed");
      const finished = passed || nextTries.some((tryRow) => tryRow.tryNumber === 3);
      return {
        ...word,
        validTryCount: nextTries.length,
        remainingTryCount: Math.max(0, 3 - nextTries.length),
        passed,
        finished,
        firstTry: nextTries.find((tryRow) => tryRow.tryNumber === 1) ?? null,
        resultTry: nextTries.find((tryRow) => tryRow.outcome === "passed") ?? nextTries.find((tryRow) => tryRow.tryNumber === 3) ?? nextTries.at(-1) ?? null,
      };
    });
    setWords(updatedWords);
    setLastTry({
      message: result.feedback,
      targetSoundPassed: result.targetSoundPassed,
      outcome: result.outcome,
    });
    setFeedbackVariant(feedbackVariantFor(result));
    setCompletionError(null);
  }

  async function nextWord() {
    const next = nextPracticeWordOrder({
      words: words.map((word) => ({
        order: word.order,
        passed: word.passed,
        validTryCount: word.validTryCount,
      })),
    });
    if (next !== null) {
      setCurrentWordOrder(next);
      setLastTry(null);
      setFeedbackVariant(null);
      setCompletionError(null);
      return;
    }

    const completion = await completePronunciationAttemptAction({
      assignmentStudentId: page.assignmentStudentId,
      attemptId: page.attemptId,
    });
    if (!completion.ok) {
      setCompletionError("We couldn't finish this practice. Try again.");
      return;
    }
    setCompleted(true);
    setReadOnly(true);
    setCurrentWordOrder(null);
    setCompletionError(null);
  }

  const finishedWordCount = words.filter((word) => word.finished).length;
  const showResult = readOnly || completed;
  const feedbackExpression = lastTry
    ? EXPRESSION_BY_OUTCOME[lastTry.outcome]
    : "happy";

  const soundAudioControl = currentWord ? (
    <div className={styles.soundAudioControl}>
      <button
        type="button"
        aria-label={`Hear the ${sound.label} sound`}
        title={`Hear the ${sound.label} sound`}
        className={styles.soundButton}
        onClick={() => replay(soundAudioRef)}
      >
        {sound.label} sound
      </button>
    </div>
  ) : null;

  const feedbackAudio = currentWord && lastTry && feedbackVariant ? (
    <CocoSpeechAudio
      assignmentStudentId={page.assignmentStudentId}
      label="Play Coco's message"
      line={{
        lineKind: "coco_feedback",
        turnOrder: currentWord.order,
        feedbackVariant,
      }}
      playbackKey={currentWord.validTryCount}
    />
  ) : null;

  return (
    <main
      className="pronunciation-practice-shell"
      style={{ ...missionPageStyle, background: "#EFF6FF" }}
    >
      <div style={missionContentStyle}>
        <section className={styles.card} data-testid="pronunciation-practice-card">
          <header className={`${styles.header} ${showResult ? styles.resultHeader : ""}`}>
            <div className={styles.headerCopy}>
              <h1 className={styles.title}>{page.title}</h1>
            </div>
            {showResult ? (
              <Link
                href="/student/home"
                className={`${styles.backLink} student-secondary-button`}
                style={backLinkStyle}
                aria-label="Back to homework list"
                title="Back to homework list"
              >
                ←
              </Link>
            ) : null}
            <p className={styles.wordCount} aria-live="polite">
              {currentWord ? `Word ${currentWord.order} of 5` : "5 words complete"}
            </p>
          </header>
          <div
            role="group"
            aria-label={`${finishedWordCount} of 5 words completed`}
            className={styles.progress}
          >
            {words.map((word) => {
              const state = word.finished
                ? "finished"
                : word.order === currentWordOrder
                  ? "current"
                  : "upcoming";
              return (
                <span
                  key={word.order}
                  data-testid={`progress-dot-${word.order}`}
                  data-state={state}
                  aria-hidden="true"
                  className={styles.progressDot}
                />
              );
            })}
          </div>

          {showResult ? (
            <div aria-label="Pronunciation practice result" className={styles.completion}>
              <div className={styles.completionCelebration} data-testid="completion-celebration">
                <Image
                  src={SPRITE_BY_EXPRESSION.celebrate}
                  alt=""
                  width={76}
                  height={76}
                  className={styles.cocoPortrait}
                />
                <p className={styles.celebrationLine}>You did it!</p>
              </div>
              <div className={styles.resultList}>
                {words.map((word) => {
                  const differentWord = word.resultTry?.outcome === "different_word";
                  return (
                    <article key={word.order} className={styles.resultRow}>
                      <div className={styles.resultWord}>
                        {highlightedWord(
                          word,
                          differentWord ? null : word.resultTry?.targetSoundPassed ?? false,
                        )}
                      </div>
                      <div className={styles.resultDetails}>
                        <div className={styles.scoreLine}>
                          <span className={styles.metricLabel}>Whole word</span>
                          <span
                            aria-label={`${starsFor(word).split("★").length - 1} of 3 stars for the whole word`}
                            className={styles.stars}
                          >
                            {starsFor(word)}
                          </span>
                        </div>
                        {differentWord ? (
                          <p className={styles.soundNeedsPractice}>Good try!</p>
                        ) : null}
                        <p
                          className={
                            differentWord
                              ? styles.soundUnassessed
                              : word.resultTry?.targetSoundPassed
                                ? styles.soundClear
                                : styles.soundNeedsPractice
                          }
                        >
                          <span className={styles.metricLabel}>{sound.label} sound</span>{" "}
                          {differentWord
                            ? "not assessed"
                            : word.resultTry?.targetSoundPassed
                              ? "clear"
                              : "Practice more"}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
              <Link
                href="/student/home"
                className={`${styles.homeButton} student-primary-button`}
                style={{ ...primaryButtonStyle, textAlign: "center", textDecoration: "none" }}
              >
                Back to homework
              </Link>
            </div>
          ) : currentWord ? (
            <>
              <div className={styles.wordArea} data-testid="practice-word-area">
                <div className={styles.wordDisplay}>
                  <div className={styles.word}>
                    {highlightedWord(
                      currentWord,
                      lastTry?.outcome === "different_word"
                        ? null
                        : lastTry?.targetSoundPassed ?? null,
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Hear the word"
                    title="Hear the word"
                    disabled={currentWordAudioStatus !== "ready"}
                    className={styles.wordAudioButton}
                    onClick={() => replay(wordAudioRef)}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M4 10v4h4l5 4V6l-5 4H4Z" fill="currentColor" stroke="none" />
                      <path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a8.5 8.5 0 0 1 0 11" />
                    </svg>
                  </button>
                </div>
                {currentWord.finished && currentWord.resultTry && currentWord.resultTry.starBand !== null ? (
                  <span
                    data-testid="try-stars"
                    role="img"
                    aria-label={`${currentWord.resultTry.starBand} of 3 stars for the whole word`}
                    className={styles.tryStars}
                  >
                    {"⭐".repeat(currentWord.resultTry.starBand)}
                  </span>
                ) : null}
              </div>
              {soundAudioControl}
              <audio ref={soundAudioRef} src={sound.clip} preload="auto" />
              {wordAudioUrls[currentWord.order] ? (
                <audio ref={wordAudioRef} src={wordAudioUrls[currentWord.order]} preload="auto" />
              ) : null}
              {currentWordAudioStatus === "loading" ? (
                <p role="status" className={styles.audioStatus}>Loading word audio…</p>
              ) : null}
              {currentWordAudioStatus === "not_found" ? (
                <p role="status" className={styles.audioStatus}>
                  Word audio isn&apos;t ready right now. You can still practice the sound.
                </p>
              ) : null}
              {currentWordAudioStatus === "unavailable" ? (
                <div role="status" className={styles.audioStatus}>
                  <span>Word audio didn&apos;t load. Try again.</span>{" "}
                  <button
                    type="button"
                    aria-label="Try word audio again"
                    className={styles.audioRetry}
                    onClick={() => setWordAudioRetryCount((count) => count + 1)}
                  >
                    Try again
                  </button>
                </div>
              ) : null}
              <div className={styles.feedback} data-testid="coco-feedback" aria-live="polite">
                <Image
                  src={SPRITE_BY_EXPRESSION[feedbackExpression]}
                  alt=""
                  width={64}
                  height={64}
                  className={styles.cocoPortrait}
                />
                <div className={styles.feedbackCopy}>
                  <span className={styles.cocoName}>Coco</span>
                  <p className={styles.feedbackMessage} data-testid="coco-feedback-message">
                    {lastTry?.message ?? "Listen, then say it!"}
                  </p>
                  {feedbackAudio ? <div className={styles.feedbackAudio}>{feedbackAudio}</div> : null}
                </div>
              </div>
              <div className={styles.actionZone}>
                {completionError ? <p role="alert" className={styles.completionError}>{completionError}</p> : null}
                {currentWord.finished ? (
                  <div className={styles.nextActionPanel}>
                    <button
                      type="button"
                      aria-label="Next word"
                      className={`${styles.nextButton} student-primary-button`}
                      style={primaryButtonStyle}
                      onClick={() => void nextWord()}
                    >
                      Next word
                    </button>
                  </div>
                ) : (
                  <VoiceRecorderControl
                    key={`${currentWord.order}:${currentWord.validTryCount}`}
                    mode="practice"
                    maxSeconds={10}
                    disabled={currentWord.finished}
                    onRecorded={recordWord}
                  />
                )}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
