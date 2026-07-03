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
        <Transcript transcript={transcript} />
        <div style={evaluationSuccessStyle}>
          <h2 style={headingInlineStyle}>Nice answer!</h2>
        </div>
        <PronunciationStars starBand={starBand} />
        <button
          type="button"
          style={{ ...primaryButtonStyle, marginTop: 16 }}
          onClick={onContinue}
          disabled={isSubmitting}
        >
          Continue practice
        </button>
        <RecordingReview audioUrl={audioUrl} onRetry={onRetry} />
      </div>
    );
  }

  if (outcome === "needsCorrection") {
    return (
      <div style={stepCardStyle} aria-live="polite">
        <Transcript transcript={transcript} />
        <div style={{ ...improvedSentenceCardStyle, marginTop: transcript ? 16 : 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
                  Nice try! Here is a clearer way to say it:
            </p>
            {/* Voice only Coco-style feedback + improved sentence (D-09).
                The transcript above is never voiced (D-10). */}
            <CocoSpeechAudio
              assignmentStudentId={assignmentStudentId}
              line={{ lineKind: "coco_feedback", turnOrder }}
            />
          </div>
          <p style={sentenceStyle}>{improvedSentence}</p>
        </div>
        <PronunciationStars starBand={starBand} />
        <p style={{ ...bodyInlineStyle, marginTop: 16 }}>
          Now say it out loud.
        </p>
        <button
          type="button"
          style={{ ...primaryButtonStyle, marginTop: 8 }}
          onClick={onContinue}
          disabled={isSubmitting}
        >
          Continue practice
        </button>
        <RecordingReview audioUrl={audioUrl} onRetry={onRetry} />
      </div>
    );
  }

  if (outcome === "retryOriginal") {
    return (
      <div style={stepCardStyle} aria-live="polite" role="alert">
        <Transcript transcript={transcript} />
        <div style={{ ...evaluationErrorStyle, marginTop: transcript ? 16 : 0 }}>
          <h2 style={headingInlineStyle}>Try that in English.</h2>
        </div>
        <RecordingReview audioUrl={audioUrl} onRetry={onRetry} />
      </div>
    );
  }

  if (outcome === "teacherReview" || outcome === "repeatReview") {
    return (
      <div style={stepCardStyle} aria-live="polite">
        <Transcript transcript={transcript} />
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
        <RecordingReview audioUrl={audioUrl} onRetry={onRetry} />
      </div>
    );
  }

  if (outcome === "repeatAccepted") {
    return (
      <div style={stepCardStyle} aria-live="polite">
        <Transcript transcript={transcript} />
        <div style={evaluationSuccessStyle}>
          <h2 style={headingInlineStyle}>Good repeat.</h2>
        </div>
        <PronunciationStars starBand={starBand} />
        <button
          type="button"
          style={{ ...primaryButtonStyle, marginTop: 16 }}
          onClick={onContinue}
          disabled={isSubmitting}
        >
          Continue mission
        </button>
        <RecordingReview audioUrl={audioUrl} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div style={stepCardStyle} aria-live="polite" role="alert">
      <Transcript transcript={transcript} />
      {improvedSentence && (
        <div style={{ ...improvedSentenceCardStyle, marginTop: transcript ? 16 : 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
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
        style={{ ...primaryButtonStyle, marginTop: 16 }}
        onClick={onRetry}
      >
        Try again
      </button>
      <RecordingReview audioUrl={audioUrl} onRetry={undefined} />
    </div>
  );
}

function Transcript({ transcript }: { transcript?: string | null }) {
  if (!transcript) return null;
  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
        We heard:
      </p>
      <p style={{ fontSize: 16, color: "#111827", margin: 0, lineHeight: 1.5 }}>
        {transcript}
      </p>
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

function RecordingReview({ audioUrl, onRetry }: { audioUrl?: string; onRetry?: () => void }) {
  if (!audioUrl && !onRetry) return null;
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {audioUrl && (
        <audio controls src={audioUrl} style={{ height: 36, flex: 1, minWidth: 180 }} />
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ fontSize: 14, color: "#6B7280", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
          Record again
        </button>
      )}
    </div>
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

const badgeStyle: CSSProperties = {
  display: "inline-block",
  fontSize: 14,
  fontWeight: 600,
  color: "#B45309",
  margin: "0 0 8px",
};
