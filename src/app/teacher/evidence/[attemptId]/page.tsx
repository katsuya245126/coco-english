import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { getAttemptEvidenceForTeacher } from "@/server/teacher/audio-evidence";
import { AudioClipPlayer } from "@/components/teacher/AudioClipPlayer";
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

  return (
    <div style={shellStyle}>
      <header style={topBarStyle}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#4B5563" }}>
          {profile.display_name ?? "Teacher"}
        </span>
        <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/teacher" style={navLinkStyle}>
            Classes
          </Link>
          <Link href="/teacher/missions" style={navLinkStyle}>
            Missions
          </Link>
          <form action="/auth/logout" method="post">
            <button type="submit" style={logoutButtonStyle}>
              Log out
            </button>
          </form>
        </nav>
      </header>

      <main style={mainStyle}>
        <p style={eyebrowStyle}>
          <Link href="/teacher" style={linkStyle}>
            Teacher dashboard
          </Link>
        </p>
        <h1 style={titleStyle}>Attempt evidence</h1>

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
        </section>

        <section aria-label="Turn transcripts" style={turnListStyle}>
          {evidence.turns.map((turn) => (
            <TurnEvidenceSection key={turn.id} turn={turn} />
          ))}
        </section>
      </main>
    </div>
  );
}

function TurnEvidenceSection({ turn }: { turn: AttemptTurnEvidence }) {
  const originalClips = turn.audioClips.filter(
    (clip) => clip.clipKind === "original_answer",
  );
  const repeatClips = turn.audioClips.filter(
    (clip) => clip.clipKind === "repeat_attempt",
  );

  return (
    <article style={turnCardStyle}>
      <h2 style={turnHeadingStyle}>Turn {turn.turnOrder}</h2>
      <TranscriptBlock
        label="Original answer"
        transcript={turn.originalTranscript}
      />
      <AnnotationGrid turn={turn} />
      {turn.improvedSentence && (
        <TranscriptBlock
          label="Improved sentence"
          transcript={turn.improvedSentence}
        />
      )}
      <TranscriptBlock
        label="Repeat attempt"
        transcript={turn.repeatTranscript}
      />
      {turn.reviewReason && (
        <div style={reviewBlockStyle}>
          <p style={reviewBadgeStyle}>Teacher review</p>
          <p style={reviewReasonTextStyle}>
            {reviewReasonLabel(turn.reviewReason)}
          </p>
        </div>
      )}
      <AudioClipList label="Original answer audio" clips={originalClips} />
      <AudioClipList label="Repeat attempt audio" clips={repeatClips} />
    </article>
  );
}

function AnnotationGrid({ turn }: { turn: AttemptTurnEvidence }) {
  const rows: [string, string | null][] = [
    ["Communicated clearly?", friendlyMeaningResult(turn.meaningResult)],
    ["Used the target language?", friendlyPatternResult(turn.targetPatternResult)],
    ...(turn.repeatResult !== null
      ? [["Repeated correctly?", friendlyRepeatResult(turn.repeatResult)] as [string, string]]
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

function TranscriptBlock({
  label,
  transcript,
}: {
  label: string;
  transcript: string | null;
}) {
  return (
    <div style={transcriptBlockStyle}>
      <p style={labelStyle}>{label}</p>
      <p style={transcriptStyle}>{transcript || "No transcript recorded."}</p>
    </div>
  );
}

function AudioClipList({
  label,
  clips,
}: {
  label: string;
  clips: AttemptAudioClipEvidence[];
}) {
  if (clips.length === 0) {
    return null;
  }

  return (
    <div style={audioListStyle}>
      {clips.map((clip, index) => (
        <AudioClipPlayer
          key={clip.id}
          audioClipId={clip.id}
          label={clips.length > 1 ? `${label} ${index + 1}` : label}
          unavailableCopy={
            clip.processingStatus === "deleted"
              ? "This audio is no longer available."
              : "Audio is not available for this clip."
          }
        />
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

const topBarStyle: React.CSSProperties = {
  minHeight: 56,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: "0 24px",
  background: "#FFFFFF",
  borderBottom: "1px solid #E5E7EB",
  flexWrap: "wrap",
};

const navLinkStyle: React.CSSProperties = {
  color: "#2563EB",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
};

const logoutButtonStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 14,
  cursor: "pointer",
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
  gap: 8,
  marginTop: 12,
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
