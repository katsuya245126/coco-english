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
import {
  bodyStyle,
  displayTitleStyle,
  primaryButtonStyle,
  stepCardStyle,
} from "@/components/student/styles";

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

function highlightedWord(word: PronunciationPracticeWordState) {
  const start = Math.max(0, Math.min(word.text.length, word.highlightStart));
  const end = Math.max(start, Math.min(word.text.length, start + word.highlightLength));
  return (
    <span aria-label={word.text}>
      {word.text.slice(0, start)}
      <mark>{word.text.slice(start, end)}</mark>
      {word.text.slice(end)}
    </span>
  );
}

function starsFor(word: PronunciationPracticeWordState): string {
  const result = word.resultTry;
  if (!result || result.outcome === "different_word" || result.starBand === null) {
    return "☆☆☆";
  }
  return "★".repeat(result.starBand) + "☆".repeat(3 - result.starBand);
}

function resultFeedback(word: PronunciationPracticeWordState): string {
  if (word.resultTry?.outcome === "different_word") return "Good try!";
  if (word.resultTry?.outcome === "passed") return "Good job!";
  return "Practice more.";
}

export function PronunciationPracticeShell({ page }: PronunciationPracticeShellProps) {
  const [words, setWords] = useState(page.words);
  const [currentWordOrder, setCurrentWordOrder] = useState(page.currentWordOrder);
  const [readOnly, setReadOnly] = useState(page.readOnly);
  const [completed, setCompleted] = useState(page.completed);
  const [feedback, setFeedback] = useState<{ message: string } | null>(null);
  const [feedbackVariant, setFeedbackVariant] = useState<string | null>(null);
  const [wordAudioUrls, setWordAudioUrls] = useState<Record<number, string>>({});
  const wordAudioCache = useRef(new Map<number, string>());
  const autoPlayedWordOrders = useRef(new Set<number>());
  const soundAudioRef = useRef<HTMLAudioElement | null>(null);
  const wordAudioRef = useRef<HTMLAudioElement | null>(null);

  const currentWord = words.find((word) => word.order === currentWordOrder) ?? null;
  const sound = PRACTICE_SOUNDS[page.soundId];

  useEffect(() => {
    if (currentWordOrder === null || wordAudioCache.current.has(currentWordOrder)) return;
    let cancelled = false;
    fetch(`/student/pronunciation/${page.assignmentStudentId}/word-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordOrder: currentWordOrder }),
    })
      .then(async (response) => (response.ok ? (await response.json()) as { ok?: boolean; audioUrl?: string } : null))
      .then((result) => {
        if (cancelled || !result?.ok || !result.audioUrl) return;
        wordAudioCache.current.set(currentWordOrder, result.audioUrl);
        setWordAudioUrls((urls) => ({ ...urls, [currentWordOrder]: result.audioUrl! }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentWordOrder, page.assignmentStudentId]);

  const currentWordAudioUrl = currentWordOrder === null
    ? null
    : wordAudioUrls[currentWordOrder] ?? null;

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
    setFeedback({ message: result.feedback });
    setFeedbackVariant(feedbackVariantFor(result));

    const nextWord = nextPracticeWordOrder({
      words: updatedWords.map((word) => ({
        order: word.order,
        passed: word.passed,
        validTryCount: word.validTryCount,
      })),
    });
    if (nextWord === null) {
      const completion = await completePronunciationAttemptAction({
        assignmentStudentId: page.assignmentStudentId,
        attemptId: page.attemptId,
      });
      if (completion.ok) {
        setCompleted(true);
        setReadOnly(true);
        setCurrentWordOrder(null);
      }
    }
  }

  function nextWord() {
    const next = nextPracticeWordOrder({
      words: words.map((word) => ({
        order: word.order,
        passed: word.passed,
        validTryCount: word.validTryCount,
      })),
    });
    if (next === null) return;
    setCurrentWordOrder(next);
    setFeedback(null);
    setFeedbackVariant(null);
  }

  const progress = Math.round((words.filter((word) => word.finished).length / words.length) * 100);
  const showResult = readOnly || completed;

  return (
    <main style={{ minHeight: "100vh", background: "#F7F8FA", padding: 24 }}>
      <section style={{ ...stepCardStyle, maxWidth: 640, margin: "0 auto" }}>
        <div aria-label="Coco" style={{ fontSize: 28, marginBottom: 8 }}>🐨 <span style={{ fontSize: 16, verticalAlign: "middle" }}>Coco</span></div>
        <p style={bodyStyle}>{sound.label} practice</p>
        <h1 style={displayTitleStyle}>{page.title}</h1>
        <p aria-label={`${words.filter((word) => word.finished).length} of 5 words completed`} style={bodyStyle}>
          {showResult ? "Practice result" : `Word ${currentWordOrder ?? words.length} of 5`} · {progress}% complete
        </p>
        <div aria-hidden="true" style={{ height: 6, borderRadius: 999, background: "#E5E7EB", marginBottom: 20 }}>
          <div style={{ width: `${progress}%`, height: "100%", borderRadius: 999, background: "#2563EB" }} />
        </div>

        {showResult ? (
          <div aria-label="Pronunciation practice result">
            {words.map((word) => (
              <article key={word.order} style={{ borderTop: "1px solid #E5E7EB", padding: "14px 0" }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{highlightedWord(word)}</div>
                <div aria-label={`${starsFor(word)} stars`} style={{ fontSize: 22, letterSpacing: 2 }}>{starsFor(word)}</div>
                <p style={bodyStyle}>{resultFeedback(word)}</p>
                <p style={bodyStyle}>{word.resultTry?.targetSoundPassed ? "Target sound clear" : "Practice more"}</p>
              </article>
            ))}
          </div>
        ) : currentWord ? (
          <>
            <div style={{ textAlign: "center", fontSize: 42, fontWeight: 700, margin: "28px 0" }}>
              {highlightedWord(currentWord)}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20 }}>
              <button type="button" aria-label="Play sound" style={primaryButtonStyle} onClick={() => replay(soundAudioRef)}>
                Play sound
              </button>
              <button type="button" aria-label="Play word" disabled={!wordAudioUrls[currentWord.order]} style={primaryButtonStyle} onClick={() => replay(wordAudioRef)}>
                Play word
              </button>
            </div>
            <audio ref={soundAudioRef} src={sound.clip} preload="auto" />
            {wordAudioUrls[currentWord.order] ? <audio ref={wordAudioRef} src={wordAudioUrls[currentWord.order]} preload="auto" /> : null}
            <p style={bodyStyle}>Say the word clearly.</p>
            <VoiceRecorderControl
              mode="practice"
              maxSeconds={10}
              disabled={currentWord.finished}
              onRecorded={recordWord}
            />
            {feedback ? (
              <div aria-live="polite" style={{ marginTop: 16 }}>
                <p style={bodyStyle}>{feedback.message}</p>
                <p style={bodyStyle}>{currentWord.resultTry?.targetSoundPassed ? "Target sound clear" : "Practice more"}</p>
                {feedbackVariant ? (
                  <CocoSpeechAudio
                    assignmentStudentId={page.assignmentStudentId}
                    line={{
                      lineKind: "coco_feedback",
                      turnOrder: currentWord.order,
                      feedbackVariant,
                    }}
                  />
                ) : null}
              </div>
            ) : null}
            {currentWord.finished && nextPracticeWordOrder({ words: words.map((word) => ({ order: word.order, passed: word.passed, validTryCount: word.validTryCount })) }) !== null ? (
              <button type="button" aria-label="Next word" style={{ ...primaryButtonStyle, marginTop: 16 }} onClick={nextWord}>
                Next word
              </button>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
