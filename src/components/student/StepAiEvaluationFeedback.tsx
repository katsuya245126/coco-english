"use client";

import type { CSSProperties } from "react";
import {
  evaluationErrorStyle,
  evaluationReviewStyle,
  evaluationSuccessStyle,
  improvedSentenceCardStyle,
  primaryButtonStyle,
  stepCardStyle,
} from "@/components/student/styles";
import { CocoSpeechAudio } from "@/components/student/CocoSpeechAudio";
import {
  STAR_BAND_COPY,
  type PronunciationStarBand,
  type WordHighlight,
} from "@/domain/pronunciation/scoring";

type OriginalOutcome =
  | "checking"
  | "acceptedOriginal"
  | "needsCorrection"
  | "retryOriginal"
  | "teacherReview";

type RepeatOutcome = "repeatAccepted" | "repeatRetry" | "repeatReview";

type StepAiEvaluationFeedbackProps = {
  assignmentStudentId: string;
  turnOrder: number;
  mode: "original" | "repeat";
  outcome: OriginalOutcome | RepeatOutcome;
  transcript?: string | null;
  audioUrl?: string;
  improvedSentence?: string | null;
  starBand?: PronunciationStarBand | null;
  wordsToPractice?: WordHighlight[];
  /**
   * True on a 1-star result the student hasn't yet retried this turn — hides
   * Continue so a retry is the only way forward. Never true after a retry
   * (even another 1-star), so a genuinely struggling student is never
   * trapped on one turn (D-04 checkpoint decision, 2026-07-03).
   */
  forceRetryBeforeContinue?: boolean;
  onContinue?: () => void | Promise<void>;
  onRetry?: () => void;
  isSubmitting?: boolean;
};

export function StepAiEvaluationFeedback({
  assignmentStudentId,
  turnOrder,
  mode,
  outcome,
  transcript,
  audioUrl,
  improvedSentence,
  starBand,
  wordsToPractice,
  forceRetryBeforeContinue = false,
  onContinue,
  onRetry,
  isSubmitting = false,
}: StepAiEvaluationFeedbackProps) {
  if (outcome === "checking") {
    return (
      <div style={stepCardStyle} aria-live="polite">
        <p style={{ fontSize: 16, color: "#4B5563", margin: 0 }}>
          {mode === "original" ? "Checking your answer..." : "Checking your repeat..."}
        </p>
      </div>
    );
  }

  if (outcome === "acceptedOriginal") {
    return (
      <div style={stepCardStyle} aria-live="polite">
        <Transcript transcript={transcript} audioUrl={audioUrl} />
        <div style={evaluationSuccessStyle}>
          <h2 style={headingInlineStyle}>Nice answer!</h2>
        </div>
        <PronunciationStars starBand={starBand} />
        <WordsToPractice words={wordsToPractice} />
        {forceRetryBeforeContinue ? (
          <RecordAgainRequiredNotice />
        ) : (
          <button
            type="button"
            style={{ ...primaryButtonStyle, marginTop: 16 }}
            onClick={onContinue}
            disabled={isSubmitting}
          >
            Continue practice
          </button>
        )}
        <RecordingReview onRetry={onRetry} />
      </div>
    );
  }

  if (outcome === "needsCorrection") {
    return (
      <div style={stepCardStyle} aria-live="polite">
        <Transcript transcript={transcript} audioUrl={audioUrl} />
        <div style={{ ...improvedSentenceCardStyle, marginTop: transcript ? 16 : 0 }}>
          <div style={improvedSentenceHeaderStyle}>
            <p style={improvedSentenceLabelStyle}>
              Nice try! Here is a clearer way to say it:
            </p>
            {/* Voice reads the actual improved sentence (D-07). The
                transcript above is never voiced (D-10). */}
            <CocoSpeechAudio
              assignmentStudentId={assignmentStudentId}
              line={{ lineKind: "improved_sentence", turnOrder }}
            />
          </div>
          <p style={sentenceStyle}>{improvedSentence}</p>
        </div>
        <PronunciationStars starBand={starBand} />
        <WordsToPractice words={wordsToPractice} />
        <p style={{ ...bodyInlineStyle, marginTop: 16 }}>
          Now say it out loud.
        </p>
        <RecordingReview onRetry={onRetry} />
        {forceRetryBeforeContinue ? (
          <RecordAgainRequiredNotice />
        ) : (
          <button
            type="button"
            style={{ ...secondaryButtonStyle, marginTop: 12 }}
            onClick={onContinue}
            disabled={isSubmitting}
          >
            Continue practice
          </button>
        )}
      </div>
    );
  }

  if (outcome === "retryOriginal") {
    return (
      <div style={stepCardStyle} aria-live="polite" role="alert">
        <Transcript transcript={transcript} audioUrl={audioUrl} />
        <div style={{ ...evaluationErrorStyle, marginTop: transcript ? 16 : 0 }}>
          <h2 style={headingInlineStyle}>Try that in English.</h2>
        </div>
        <RecordingReview onRetry={onRetry} />
      </div>
    );
  }

  if (outcome === "teacherReview" || outcome === "repeatReview") {
    return (
      <div style={stepCardStyle} aria-live="polite">
        <Transcript transcript={transcript} audioUrl={audioUrl} />
        <div style={{ ...evaluationReviewStyle, marginTop: transcript ? 16 : 0 }}>
          <p style={badgeStyle}>Teacher review</p>
          <h2 style={headingInlineStyle}>Your teacher will check this answer.</h2>
        </div>
        <button
          type="button"
          style={{ ...primaryButtonStyle, marginTop: 16 }}
          onClick={onContinue}
          disabled={isSubmitting}
        >
          Continue mission
        </button>
        <RecordingReview onRetry={onRetry} />
      </div>
    );
  }

  if (outcome === "repeatAccepted") {
    return (
      <div style={stepCardStyle} aria-live="polite">
        <Transcript transcript={transcript} audioUrl={audioUrl} />
        <div style={evaluationSuccessStyle}>
          <h2 style={headingInlineStyle}>Good repeat.</h2>
        </div>
        <PronunciationStars starBand={starBand} />
        <WordsToPractice words={wordsToPractice} />
        {forceRetryBeforeContinue ? (
          <RecordAgainRequiredNotice />
        ) : (
          <button
            type="button"
            style={{ ...primaryButtonStyle, marginTop: 16 }}
            onClick={onContinue}
            disabled={isSubmitting}
          >
            Continue mission
          </button>
        )}
        <RecordingReview onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div style={stepCardStyle} aria-live="polite" role="alert">
      <Transcript transcript={transcript} audioUrl={audioUrl} />
      {improvedSentence && (
        <div style={{ ...improvedSentenceCardStyle, marginTop: transcript ? 16 : 0 }}>
          <p style={{ ...improvedSentenceLabelStyle, marginBottom: 8 }}>
            Say this sentence:
          </p>
          <p style={sentenceStyle}>{improvedSentence}</p>
        </div>
      )}
      <div style={{ ...evaluationErrorStyle, marginTop: 16 }}>
        <h2 style={headingInlineStyle}>Try the repeat again.</h2>
        <p style={bodyInlineStyle}>Listen to the sentence and record it one more time.</p>
      </div>
      <button
        type="button"
        style={{ ...recordAgainButtonStyle, marginTop: 16 }}
        onClick={onRetry}
      >
        <MicIcon />
        Try again
      </button>
    </div>
  );
}

function Transcript({
  transcript,
  audioUrl,
}: {
  transcript?: string | null;
  audioUrl?: string;
}) {
  if (!transcript) return null;
  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
        We heard:
      </p>
      <p style={{ fontSize: 16, color: "#111827", margin: 0, lineHeight: 1.5 }}>
        {transcript}
      </p>
      {audioUrl && (
        <audio controls src={audioUrl} style={{ height: 36, width: "100%", marginTop: 8 }} />
      )}
    </div>
  );
}

function PronunciationStars({
  starBand,
}: {
  starBand?: PronunciationStarBand | null;
}) {
  if (starBand === null || starBand === undefined) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
        Your pronunciation:
      </p>
      <div style={{ display: "flex", gap: 4 }} aria-hidden="true">
        {[1, 2, 3].map((slot) => (
          <span
            key={slot}
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: slot <= starBand ? "#F59E0B" : "#D1D5DB",
              lineHeight: 1,
            }}
          >
            {slot <= starBand ? "★" : "☆"}
          </span>
        ))}
      </div>
      <p style={{ fontSize: 16, color: "#4B5563", margin: "4px 0 0", lineHeight: 1.5 }}>
        {STAR_BAND_COPY[starBand]}
      </p>
    </div>
  );
}

function WordsToPractice({ words }: { words?: WordHighlight[] }) {
  if (!words || words.length === 0) return null;

  function speakWord(word: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
        Words to practice — tap to hear:
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {words.map((entry, index) => (
          <button
            key={`${entry.word}-${index}`}
            type="button"
            onClick={() => speakWord(entry.word)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 14,
              fontWeight: 600,
              color: "#B45309",
              background: "#FEF3C7",
              border: "1px solid #F59E0B",
              borderRadius: 999,
              padding: "6px 12px",
              lineHeight: 1.25,
              cursor: "pointer",
            }}
          >
            <SmallSpeakerIcon />
            {entry.word}
          </button>
        ))}
      </div>
    </div>
  );
}

function SmallSpeakerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function RecordAgainRequiredNotice() {
  return (
    <p
      role="status"
      style={{ fontSize: 14, color: "#4B5563", margin: "16px 0 0", lineHeight: 1.5 }}
    >
      Give it one more try before you continue!
    </p>
  );
}

function RecordingReview({ onRetry }: { onRetry?: () => void }) {
  if (!onRetry) return null;
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #E5E7EB" }}>
      <button type="button" onClick={onRetry} style={recordAgainButtonStyle}>
        <MicIcon />
        Record again
      </button>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

const headingInlineStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  color: "#111827",
  margin: "0 0 8px",
  lineHeight: 1.25,
};

const bodyInlineStyle: CSSProperties = {
  fontSize: 16,
  color: "#4B5563",
  margin: 0,
  lineHeight: 1.5,
};

const sentenceStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  color: "#111827",
  margin: 0,
  lineHeight: 1.25,
};

// Header row: the "clearer way to say it" label and the Coco speaker button
// share a vertically-centered baseline so the 44px button never floats above
// the text. The label carries no bottom margin — the card's own padding and the
// row's spacing give the sentence beneath consistent breathing room.
const improvedSentenceHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const improvedSentenceLabelStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#4B5563",
  margin: 0,
  lineHeight: 1.4,
};

const badgeStyle: CSSProperties = {
  display: "inline-block",
  fontSize: 14,
  fontWeight: 600,
  color: "#B45309",
  margin: "0 0 8px",
};

const recordAgainButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "12px 16px",
  background: "#FFFFFF",
  color: "#374151",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};
