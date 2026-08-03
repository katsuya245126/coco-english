"use client";

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
import Image from "next/image";
import Link from "next/link";
import {
  bodyStyle,
  displayTitleStyle,
  errorTextStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  stepCardStyle,
} from "@/components/student/styles";

const backLinkStyle = {
  ...secondaryButtonStyle,
  width: 44,
  minHeight: 44,
  padding: 0,
  marginBottom: 12,
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

/**
 * The word with its target letters marked. `targetSoundPassed` tints those
 * letters once a try has been scored: green when the target sound was clear,
 * amber and underlined when it stayed weak. Before any try it stays neutral.
 * The tint is a second signal only — Coco's message carries the verdict on
 * its own, and the underline keeps the mark readable without color.
 */
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
        : { background: "transparent", color: "#854F0B", textDecoration: "underline" };
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

function resultFeedback(word: PronunciationPracticeWordState): string {
  if (word.resultTry?.outcome === "different_word") return "Good try!";
  if (word.resultTry?.outcome === "passed") return "Good job!";
  return "Practice more.";
}

/**
 * Coco's face for a try outcome. A passed try celebrates; anything else
 * encourages. Nothing here is sad: a weak try is "not yet", not a failure.
 */
const EXPRESSION_BY_OUTCOME: Record<PracticeTryOutcome, "celebrate" | "encouraging"> = {
  passed: "celebrate",
  target_weak: "encouraging",
  word_weak: "encouraging",
  different_word: "encouraging",
};

/**
 * The tone of a try. A weak try is amber, never red: the child said a real
 * word and is being asked to try again, which is not an error state. Red
 * stays reserved for the genuine failures handled by `errorTextStyle`.
 */
const VERDICT_TONE = {
  celebrate: { background: "#EAF3DE", border: "#97C459", title: "#173404", detail: "#3B6D11" },
  encourage: { background: "#FAEEDA", border: "#EF9F27", title: "#412402", detail: "#854F0B" },
} as const;

/**
 * One verdict for one try: Coco's face, his message, and the whole-word stars
 * underneath as a labelled detail.
 *
 * The stars and the target sound measure different things — the stars score
 * the whole word, the message reflects the target phoneme — so a strong word
 * can carry a weak target sound. Showing both as competing pass/fail badges
 * read as a contradiction ("three stars" beside a red cross), so the message
 * is the single verdict and the stars are explicitly labelled as the whole
 * word. The slot keeps one height across outcomes so the screen never grows.
 */
function TryVerdict({
  outcome,
  starBand,
  message,
  starsTestId,
  children,
}: {
  outcome: PracticeTryOutcome;
  starBand: number | null;
  message: string;
  starsTestId?: string;
  children?: React.ReactNode;
}) {
  const stars = starsForBand(starBand);
  const filled = starBand === null ? 0 : Math.max(0, Math.min(3, Math.round(starBand)));
  const expression = EXPRESSION_BY_OUTCOME[outcome];
  const tone = outcome === "passed" ? VERDICT_TONE.celebrate : VERDICT_TONE.encourage;
  return (
    <div
      data-testid="try-verdict"
      data-outcome={outcome}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        minHeight: 84,
        padding: 14,
        borderRadius: 16,
        background: tone.background,
        border: `2px solid ${tone.border}`,
      }}
    >
      <Image
        data-testid="coco-face"
        data-expression={expression}
        src={`/images/coco-${expression}-alpha.png`}
        alt=""
        width={44}
        height={44}
        style={{ flexShrink: 0, borderRadius: "50%", objectFit: "cover" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...bodyStyle, margin: 0, fontSize: 17, fontWeight: 600, color: tone.title }}>{message}</p>
        <p style={{ ...bodyStyle, margin: "3px 0 0", fontSize: 13, color: tone.detail }}>
          <span
            data-testid={starsTestId}
            aria-label={`${filled} of 3 stars for the whole word`}
            style={{ letterSpacing: 1 }}
          >
            {stars}
          </span>{" "}
          whole word
        </p>
      </div>
      {children}
    </div>
  );
}

export function PronunciationPracticeShell({ page }: PronunciationPracticeShellProps) {
  const [words, setWords] = useState(page.words);
  const [currentWordOrder, setCurrentWordOrder] = useState(page.currentWordOrder);
  const [readOnly, setReadOnly] = useState(page.readOnly);
  const [completed, setCompleted] = useState(page.completed);
  // Holds the try the student just made. The result strip must read this and
  // not the word's derived resultTry: after a weak try 1 followed by try 2,
  // resultTry still points at an earlier try and would show a stale sound
  // status next to the new stars.
  const [lastTry, setLastTry] = useState<
    {
      message: string;
      starBand: 1 | 2 | 3 | null;
      targetSoundPassed: boolean;
      outcome: PracticeTryOutcome;
    } | null
  >(null);
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
        if (!response.ok || !result?.ok || !result.audioUrl) {
          setWordAudioStatus((statuses) => ({
            ...statuses,
            [order]: result?.error === "not_found" ? "not_found" : "unavailable",
          }));
          return;
        }
        wordAudioCache.current.set(order, result.audioUrl);
        setWordAudioUrls((urls) => ({ ...urls, [order]: result.audioUrl! }));
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
      throw new Error(error === "rate_limited" ? "Please wait, then try again." : "We could not save that word. Try again.");
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
      starBand: result.outcome === "different_word" ? null : result.starBand,
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

  const progress = Math.round((words.filter((word) => word.finished).length / words.length) * 100);
  const showResult = readOnly || completed;

  return (
    <main style={{ minHeight: "100vh", background: "#F7F8FA", padding: 24 }}>
      <section style={{ ...stepCardStyle, maxWidth: 640, margin: "0 auto" }}>
        {showResult ? (
          <Link
            href="/student/home"
            className="student-primary-button"
            style={backLinkStyle}
            aria-label="Back to homework list"
            title="Back to homework list"
          >
            ←
          </Link>
        ) : null}
        <h1 style={{ ...displayTitleStyle, marginBottom: 4 }}>{page.title}</h1>
        <p
          aria-label={`${words.filter((word) => word.finished).length} of 5 words completed`}
          style={{ ...bodyStyle, marginBottom: 8 }}
        >
          {showResult ? "Practice result" : `Word ${currentWordOrder ?? words.length} of 5`} · {progress}% complete
        </p>
        <div aria-hidden="true" style={{ height: 6, borderRadius: 999, background: "#E5E7EB", marginBottom: 20 }}>
          <div style={{ width: `${progress}%`, height: "100%", borderRadius: 999, background: "#2563EB" }} />
        </div>

        {showResult ? (
          <div aria-label="Pronunciation practice result">
            {words.map((word) => (
              <article key={word.order} style={{ borderTop: "1px solid #E5E7EB", padding: "14px 0" }}>
                <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                  {highlightedWord(word, word.resultTry?.targetSoundPassed ?? false)}
                </div>
                {/* Amber, not red: a word still worth practising is not a
                    failure. The stars score the whole word, so they keep the
                    neutral text color and say so in their label. */}
                <div
                  aria-label={`${starsFor(word).split("★").length - 1} of 3 stars for the whole word`}
                  style={{ fontSize: 22, letterSpacing: 2, color: "#111827" }}
                >
                  {starsFor(word)}
                </div>
                <p style={{ ...bodyStyle, marginBottom: 4 }}>{resultFeedback(word)}</p>
                <p style={{ ...bodyStyle, margin: 0, color: word.resultTry?.targetSoundPassed ? "#15803D" : "#854F0B" }}>
                  {word.resultTry?.targetSoundPassed ? `${sound.label} sound clear` : "Practice more"}
                </p>
              </article>
            ))}
            <Link
              href="/student/home"
              className="student-primary-button"
              style={{ ...primaryButtonStyle, display: "block", textAlign: "center", textDecoration: "none", marginTop: 24 }}
            >
              Back to homework
            </Link>
          </div>
        ) : currentWord ? (
          <>
            <div style={{ textAlign: "center", fontSize: 42, fontWeight: 700, margin: "28px 0" }}>
              {highlightedWord(currentWord, lastTry ? lastTry.targetSoundPassed : null)}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20 }}>
              <button type="button" aria-label="Play sound" style={secondaryButtonStyle} onClick={() => replay(soundAudioRef)}>
                Play sound
              </button>
              <button type="button" aria-label="Play word" disabled={currentWordAudioStatus !== "ready"} style={secondaryButtonStyle} onClick={() => replay(wordAudioRef)}>
                Play word
              </button>
            </div>
            <audio ref={soundAudioRef} src={sound.clip} preload="auto" />
            {wordAudioUrls[currentWord.order] ? <audio ref={wordAudioRef} src={wordAudioUrls[currentWord.order]} preload="auto" /> : null}
            {currentWordAudioStatus === "loading" ? (
              <p role="status" style={bodyStyle}>Loading word audio…</p>
            ) : null}
            {currentWordAudioStatus === "not_found" ? (
              <p role="status" style={bodyStyle}>
                Word audio isn&apos;t ready right now. You can still practice the sound.
              </p>
            ) : null}
            {currentWordAudioStatus === "unavailable" ? (
              <div role="status" style={bodyStyle}>
                <span>Word audio didn&apos;t load. Try again.</span>{" "}
                <button
                  type="button"
                  aria-label="Try word audio again"
                  style={secondaryButtonStyle}
                  onClick={() => setWordAudioRetryCount((count) => count + 1)}
                >
                  Try again
                </button>
              </div>
            ) : null}
            {/* Result zone. Reserved even when empty so that the screen keeps
                one height across a try and the action below never shifts. */}
            <div aria-live="polite" style={{ minHeight: 84, marginBottom: 16 }}>
              {lastTry ? (
                <TryVerdict
                  outcome={lastTry.outcome}
                  starBand={lastTry.starBand}
                  message={lastTry.message}
                  starsTestId="try-stars"
                >
                  {feedbackVariant ? (
                    <CocoSpeechAudio
                      assignmentStudentId={page.assignmentStudentId}
                      label="Play Coco's message"
                      line={{
                        lineKind: "coco_feedback",
                        turnOrder: currentWord.order,
                        feedbackVariant,
                      }}
                    />
                  ) : null}
                </TryVerdict>
              ) : null}
            </div>

            {completionError ? <p role="alert" style={errorTextStyle}>{completionError}</p> : null}

            {/* Action zone. The recorder and Next word share this slot so the
                primary action stays in one place through the whole word. */}
            {currentWord.finished ? (
              <button type="button" aria-label="Next word" style={primaryButtonStyle} onClick={() => void nextWord()}>
                Next word
              </button>
            ) : (
              <VoiceRecorderControl
                key={`${currentWord.order}:${currentWord.validTryCount}`}
                mode="practice"
                maxSeconds={10}
                disabled={currentWord.finished}
                onRecorded={recordWord}
              />
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
