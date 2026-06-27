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
      <TranscriptBlock
        label="Repeat attempt"
        transcript={turn.repeatTranscript}
      />
      <AudioClipList label="Original answer audio" clips={originalClips} />
      <AudioClipList label="Repeat attempt audio" clips={repeatClips} />
    </article>
  );
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
  padding: 20,
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
  padding: 20,
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
