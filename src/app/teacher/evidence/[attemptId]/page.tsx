import { notFound } from "next/navigation";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { getAttemptEvidenceForTeacher } from "@/server/teacher/audio-evidence";
import { AudioClipPlayer } from "@/components/teacher/AudioClipPlayer";
import { SubmissionReviewControls } from "@/components/teacher/SubmissionReviewControls";
import { changeAttemptReview } from "@/server/teacher/assignment-operations";
import { PronunciationDiagnosticPanel } from "@/components/teacher/PronunciationDiagnosticPanel";
import { MissionAudioClarificationControl } from "@/components/teacher/MissionAudioClarificationControl";
import { HoverLink } from "@/components/ui/HoverLink";
import { subtleHover } from "@/components/ui/hover-styles";
import type {
  AttemptAudioClipEvidence,
  AttemptTurnEvidence,
} from "@/server/teacher/audio-evidence";

export const dynamic = "force-dynamic";

export default async function AttemptEvidencePage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const [{ attemptId }, profile] = await Promise.all([
    params,
    requireTeacherProfile(),
  ]);
  const evidence = await getAttemptEvidenceForTeacher({
    teacherId: profile.id,
    attemptId,
  });

  if (!evidence) {
    notFound();
  }
  await changeAttemptReview({ teacherId: profile.id, attemptId, action: "mark_viewed" });

  return (
    <div style={shellStyle}>
      <main style={mainStyle}>
        <p style={eyebrowStyle}>
          {evidence.classId && evidence.assignmentId ? (
            <HoverLink
              href={`/teacher/classes/${evidence.classId}/review/${evidence.assignmentId}`}
              style={linkStyle}
              hoverStyle={subtleHover}
            >
              ← Back to assignment review
            </HoverLink>
          ) : (
            <HoverLink href="/teacher" style={linkStyle} hoverStyle={subtleHover}>
              Teacher dashboard
            </HoverLink>
          )}
        </p>
        <h1 style={titleStyle}>Attempt evidence</h1>

        <SubmissionReviewControls
          attemptId={attemptId}
          assignedHomeworkId={evidence.assignmentStudentId}
          assignmentStudentStatus={evidence.assignmentStudentStatus}
          classId={evidence.classId}
          assignmentId={evidence.assignmentId}
          dismissed={evidence.dismissedAt != null}
        />

        <section style={summaryStyle} aria-label="Attempt summary">
          <div>
            <p style={labelStyle}>Student</p>
            <p style={valueStyle}>{evidence.studentName}</p>
          </div>
          <div>
            <p style={labelStyle}>Mission</p>
            <p style={valueStyle}>{evidence.missionTitle}</p>
          </div>
          <div>
            <p style={labelStyle}>Status</p>
            <p style={valueStyle}>{evidence.attemptStatus}</p>
            {evidence.reviewReason && (
              <p style={reviewReasonInlineStyle}>
                {reviewReasonLabel(evidence.reviewReason)}
              </p>
            )}
          </div>
          <div>
            <p style={labelStyle}>Submitted</p>
            <p style={valueStyle}>
              {formatDateTime(evidence.submittedAt ?? evidence.completedAt)}
            </p>
          </div>
          <div>
            <p style={labelStyle}>Attempts</p>
            <p style={valueStyle}>{evidence.attemptCount}</p>
          </div>
        </section>

        <section aria-label="Turn transcripts" style={turnListStyle}>
          {evidence.turns.map((turn) => (
            <TurnEvidenceSection
              key={turn.id}
              turn={turn}
              attemptId={evidence.attemptId}
              conversationMode={evidence.conversationMode}
            />
          ))}
        </section>
      </main>
    </div>
  );
}

function TurnEvidenceSection({
  turn,
  attemptId,
  conversationMode,
}: {
  turn: AttemptTurnEvidence;
  attemptId: string;
  conversationMode: boolean;
}) {
  const originalClips = turn.audioClips.filter(
    (clip) => clip.clipKind === "original_answer",
  );
  const repeatClips = turn.audioClips.filter(
    (clip) => clip.clipKind === "repeat_attempt",
  );

  return (
    <article style={turnCardStyle}>
      <h2 style={turnHeadingStyle}>Turn {turn.turnOrder}</h2>
      {turn.question && (
        <TranscriptBlock label="Question asked" transcript={turn.question} />
      )}
      {turn.replyHintFrame && (
        <div style={transcriptBlockStyle}>
          <div style={hintHeaderStyle}>
            <p style={labelStyle}>Hint</p>
            {turn.hintLevelUsed > 0 && (
              <span style={hintExpandedChipStyle}>Expanded</span>
            )}
          </div>
          <p style={transcriptStyle}>{turn.replyHintFrame}</p>
        </div>
      )}
      <TranscriptBlock
        label="Raw student transcript"
        transcript={turn.originalTranscript}
        interpretation={turn.originalDisplayTranscript}
      />
      <AnnotationGrid turn={turn} conversationMode={conversationMode} />
      {turn.improvedSentence && (
        <TranscriptBlock
          label="Improved sentence"
          transcript={turn.improvedSentence}
        />
      )}
      {turn.repeatTranscript && (
        <TranscriptBlock
          label="Raw repeat transcript"
          transcript={turn.repeatTranscript}
          interpretation={turn.repeatDisplayTranscript}
        />
      )}
      {turn.reviewReason && (
        <div style={reviewBlockStyle}>
          <p style={reviewBadgeStyle}>Teacher review</p>
          <p style={reviewReasonTextStyle}>
            {reviewReasonLabel(turn.reviewReason)}
          </p>
        </div>
      )}
      <AudioClipList
        label="Student answer audio"
        clips={originalClips}
        attemptId={attemptId}
      />
      <AudioClipList
        label="Repeat attempt audio"
        clips={repeatClips}
        attemptId={attemptId}
      />
    </article>
  );
}

function AnnotationGrid({
  turn,
  conversationMode,
}: {
  turn: AttemptTurnEvidence;
  conversationMode: boolean;
}) {
  // Free-talking missions treat the target pattern as soft context, not a
  // per-turn goal, so "Not found" there reads as a failure that isn't one.
  const rows: [string, string | null][] = [
    ["Meaning understood", friendlyMeaningResult(turn.meaningResult)],
    ...(conversationMode
      ? []
      : [
          [
            "Expected target pattern",
            turn.targetPattern,
          ] as [string, string | null],
          [
            "Target pattern result",
            friendlyPatternResult(turn.targetPatternResult),
          ] as [string, string],
        ]),
    ...(turn.repeatResult !== null
      ? [["Repeat result", friendlyRepeatResult(turn.repeatResult)] as [string, string]]
      : []),
  ];

  return (
    <div style={annotationGridStyle} aria-label="AI annotations">
      {rows.map(([label, value]) => (
        <div key={label} style={annotationItemStyle}>
          <p style={annotationLabelStyle}>{label}</p>
          <p style={annotationValueStyle(value)}>{value ?? "—"}</p>
        </div>
      ))}
    </div>
  );
}

function friendlyMeaningResult(r: string) {
  if (r === "Understood") return "Yes";
  if (r === "Try again") return "Not clearly";
  return "Needs your review";
}

function friendlyPatternResult(r: string) {
  if (r === "Target pattern used") return "Yes";
  if (r === "Target pattern missing") return "Not found";
  return "Needs your review";
}

function friendlyRepeatResult(r: string) {
  if (r === "Accepted") return "Yes, good enough";
  if (r === "Try again") return "Not close enough";
  return "Needs your review";
}

const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/u;

function TranscriptBlock({
  label,
  transcript,
  interpretation,
}: {
  label: string;
  transcript: string | null;
  /**
   * The learner-facing reading of a Hangul transcript. Undefined for blocks
   * that carry no student speech (the question, the improved sentence).
   * Explicit `null` means the reading was withheld from the student.
   */
  interpretation?: string | null;
}) {
  const showsInterpretation =
    interpretation !== undefined &&
    interpretation !== null &&
    interpretation !== transcript;
  const withheld =
    interpretation === null && transcript !== null && HANGUL.test(transcript);

  return (
    <div style={transcriptBlockStyle}>
      <p style={labelStyle}>{label}</p>
      <p style={transcriptStyle}>{transcript || "No transcript recorded."}</p>
      {showsInterpretation && (
        <>
          <p style={labelStyle}>Learner-facing interpretation</p>
          <p style={transcriptStyle}>{interpretation}</p>
        </>
      )}
      {withheld && (
        <p style={withheldNoteStyle}>
          Learner transcript hidden because the Hangul reading was Korean
          vocabulary or could not be interpreted safely.
        </p>
      )}
    </div>
  );
}

function AudioClipList({
  label,
  clips,
  attemptId,
}: {
  label: string;
  clips: AttemptAudioClipEvidence[];
  attemptId: string;
}) {
  if (clips.length === 0) {
    return null;
  }

  return (
    <div style={audioListStyle}>
      {clips.map((clip, index) => (
        <div key={clip.id} style={audioClipGroupStyle}>
          <AudioClipPlayer
            audioClipId={clip.id}
            label={clips.length > 1 ? `${label} ${index + 1}` : label}
            unavailableCopy={
              clip.processingStatus === "deleted"
                ? "This audio is no longer available."
                : "Audio is not available for this clip."
            }
          />
          <PronunciationDiagnosticPanel
            pronunciationScore={clip.pronunciationScore}
            audioClipId={clip.id}
            attemptId={attemptId}
          />
          <MissionAudioClarificationControl
            audioClipId={clip.id}
            attemptId={attemptId}
            automaticTranscript={clip.automaticTranscript}
            teacherConfirmedText={clip.teacherConfirmedText}
            teacherConfirmedAt={clip.teacherConfirmedAt}
            clarificationAvailable={clip.clarificationAvailable}
          />
        </div>
      ))}
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Not submitted";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function reviewReasonLabel(reason: string) {
  if (reason === "low_confidence") {
    return "AI was not confident enough to decide.";
  }
  if (reason === "ambiguous") {
    return "The answer was ambiguous and needs a teacher check.";
  }
  if (reason === "failed_schema") {
    return "AI returned an invalid result, so this was routed to teacher review.";
  }
  if (reason === "provider_failed") {
    return "AI could not complete the check, so this was routed to teacher review.";
  }
  return "This answer needs a teacher check.";
}

const shellStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "#F7F8FA",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  color: "#111827",
};

const mainStyle: React.CSSProperties = {
  maxWidth: 920,
  margin: "0 auto",
  padding: 32,
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 14,
  margin: "0 0 8px",
};

const linkStyle: React.CSSProperties = {
  color: "#2563EB",
  textDecoration: "none",
  borderRadius: 6,
  transition: "background 0.15s ease",
};

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 600,
  lineHeight: 1.2,
  margin: "0 0 24px",
};

const summaryStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 16,
  marginBottom: 24,
  padding: 24,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#FFFFFF",
};

const labelStyle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: 14,
  fontWeight: 600,
  color: "#4B5563",
};

const valueStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  color: "#111827",
};

const turnListStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
};

const turnCardStyle: React.CSSProperties = {
  padding: 24,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#FFFFFF",
};

const turnHeadingStyle: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 20,
  fontWeight: 600,
  lineHeight: 1.25,
};

const withheldNoteStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 14,
  color: "#92400E",
};

const hintHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

// Highlighted: the student expanded the hint — the teacher likely cares.
const hintExpandedChipStyle: React.CSSProperties = {
  margin: "0 0 6px",
  padding: "1px 8px",
  borderRadius: 9999,
  fontSize: 12,
  fontWeight: 600,
  background: "#DCFCE7",
  color: "#166534",
};

const transcriptBlockStyle: React.CSSProperties = {
  marginBottom: 16,
};

const transcriptStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.5,
  color: "#111827",
};

const audioListStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  marginTop: 12,
};

const audioClipGroupStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const annotationGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 16,
  padding: 12,
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  background: "#F7F8FA",
};

const annotationItemStyle: React.CSSProperties = {
  minWidth: 0,
};

const reviewBlockStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 12,
  border: "1px solid #FDE68A",
  borderRadius: 8,
  background: "#FFFBEB",
};

const reviewBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  margin: "0 0 6px",
  fontSize: 14,
  fontWeight: 600,
  color: "#B45309",
};

const reviewReasonTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.5,
  color: "#4B5563",
};

const reviewReasonInlineStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 14,
  lineHeight: 1.4,
  color: "#4B5563",
};

const annotationLabelStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 14,
  fontWeight: 600,
  color: "#6B7280",
};

function annotationValueStyle(value: string | null): React.CSSProperties {
  const v = value ?? "";
  if (v === "Yes" || v === "Yes, good enough") {
    return { margin: 0, fontSize: 16, fontWeight: 600, color: "#065F46" };
  }
  if (v === "Not clearly" || v === "Not found" || v === "Not close enough") {
    return { margin: 0, fontSize: 16, fontWeight: 600, color: "#B91C1C" };
  }
  if (v === "Needs your review") {
    return { margin: 0, fontSize: 16, fontWeight: 600, color: "#92400E" };
  }
  return { margin: 0, fontSize: 16, color: "#374151" };
}
