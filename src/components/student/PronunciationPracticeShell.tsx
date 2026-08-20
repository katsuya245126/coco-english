"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PRACTICE_SOUNDS, nextPracticeWordOrder } from "@/domain/pronunciation/practice";
import type {
  PronunciationPracticePageState,
  PronunciationPracticeWordState,
  PronunciationWordTryState,
} from "@/server/student-access/pronunciation-flow";
import type { PracticeTryOutcome } from "@/domain/pronunciation/practice";
import { completePronunciationAttemptAction } from "@/app/student/pronunciation/[assignmentStudentId]/actions";
import { CocoSpeechAudio } from "@/components/student/CocoSpeechAudio";
import { MascotStage } from "@/components/student/MascotStage";
import { VoiceRecorderControl } from "@/components/student/VoiceRecorderControl";
import Link from "next/link";
import {
  bodyStyle,
  displayTitleStyle,
  errorTextStyle,
  mascotHintTabStyle,
  missionContentStyle,
  missionPageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
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
  const mascotAmplitudeRef = useRef(0);
  const [mascotPlaying, setMascotPlaying] = useState(false);

  const handleMascotAmplitudeFrame = useCallback((level: number) => {
    mascotAmplitudeRef.current = level;
  }, []);

  const handleMascotPlayingChange = useCallback((playing: boolean) => {
    setMascotPlaying(playing);
    if (!playing) mascotAmplitudeRef.current = 0;
  }, []);

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

  const practiceAudioTabs = currentWord ? (
    <span style={{ display: "flex", alignItems: "center" }}>
      <button
        type="button"
        aria-label="Hear the word"
        title="Hear the word"
        disabled={currentWordAudioStatus !== "ready"}
        style={mascotHintTabStyle}
        onClick={() => replay(wordAudioRef)}
      >
        Hear the word
      </button>
      <button
        type="button"
        aria-label={`Hear the ${sound.ipa} sound`}
        title={`Hear the ${sound.ipa} sound`}
        style={mascotHintTabStyle}
        onClick={() => replay(soundAudioRef)}
      >
        Hear the {sound.ipa} sound
      </button>
      {lastTry && feedbackVariant ? (
        <CocoSpeechAudio
          assignmentStudentId={page.assignmentStudentId}
          label="Play Coco's message"
          presentation="dialogue-tab"
          line={{
            lineKind: "coco_feedback",
            turnOrder: currentWord.order,
            feedbackVariant,
          }}
          onAmplitudeFrame={handleMascotAmplitudeFrame}
          onPlayingChange={handleMascotPlayingChange}
        />
      ) : null}
    </span>
  ) : null;

  return (
    <main style={missionPageStyle}>
      <div style={missionContentStyle}>
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
        <div
          role="group"
          aria-label={`${finishedWordCount} of 5 words completed`}
          style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 8px" }}
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
                style={{
                  width: 14,
                  height: 14,
                  flexShrink: 0,
                  borderRadius: "50%",
                  border: state === "current" ? "3px solid #2563EB" : "2px solid #CBD5E1",
                  background: state === "finished" ? "#2563EB" : "#FFFFFF",
                  boxSizing: "border-box",
                }}
              />
            );
          })}
        </div>

        {showResult ? (
          <div aria-label="Pronunciation practice result">
            <MascotStage
              assignmentStudentId={page.assignmentStudentId}
              displayName="Coco"
              dialogueText="You did it!"
              expression="celebrate"
              step="question"
              playing={mascotPlaying}
              amplitudeRef={mascotAmplitudeRef}
            />
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
            <div
              style={{
                textAlign: "center",
                fontSize: "clamp(40px, 14vw, 52px)",
                lineHeight: 1.1,
                fontWeight: 700,
                overflowWrap: "anywhere",
                margin: "22px 0 18px",
              }}
            >
              {highlightedWord(currentWord, lastTry ? lastTry.targetSoundPassed : null)}
            </div>
            <MascotStage
              assignmentStudentId={page.assignmentStudentId}
              displayName="Coco"
              dialogueText={lastTry?.message ?? "Listen, then say it!"}
              expression={lastTry ? EXPRESSION_BY_OUTCOME[lastTry.outcome] : "happy"}
              step="question"
              playing={mascotPlaying}
              amplitudeRef={mascotAmplitudeRef}
              voiceControl={practiceAudioTabs}
            />
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
            {/* Reserved verdict/action space keeps the recorder and Next word
                in one place while the stage dialogue changes. */}
            <div aria-live="polite" style={{ minHeight: 84, marginBottom: 16 }} />

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
      </div>
    </main>
  );
}
