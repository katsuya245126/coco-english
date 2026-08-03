import { AudioClipPlayer } from "@/components/teacher/AudioClipPlayer";
import type {
  AttemptEvidence,
} from "@/server/teacher/audio-evidence";
import type { PronunciationTryEvidence } from "@/server/teacher/pronunciation-evidence";

type PronunciationEvidenceProps = {
  evidence: AttemptEvidence;
};

export function PronunciationEvidence({ evidence }: PronunciationEvidenceProps) {
  const words = evidence.pronunciationWords ?? [];

  return (
    <section aria-label="Pronunciation evidence" style={listStyle}>
      {words.map((word) => (
        <article key={word.order} style={cardStyle}>
          <header style={headerStyle}>
            <h2 style={headingStyle}>Word {word.order}: {word.word}</h2>
            <span>{word.attemptCount} {word.attemptCount === 1 ? "try" : "tries"}</span>
          </header>
          <div style={detailsStyle}>
            <TrySummary label="First try" tryRow={word.firstTry} />
            <TrySummary label="Result try" tryRow={word.resultTry} />
          </div>
          <div style={audioListStyle}>
            {word.firstTry ? (
              <AudioClipPlayer
                audioClipId={word.firstTry.audioClipId}
                label="First try audio"
              />
            ) : null}
            {word.resultTry ? (
              <AudioClipPlayer
                audioClipId={word.resultTry.audioClipId}
                label="Result audio"
              />
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}

function TrySummary({
  label,
  tryRow,
}: {
  label: string;
  tryRow: PronunciationTryEvidence | null;
}) {
  return (
    <div>
      <p style={labelStyle}>{label}</p>
      <p style={valueStyle}>
        {tryRow ? `${tryRow.outcome.replaceAll("_", " ")} · ${tryRow.transcript}` : "No try recorded."}
      </p>
    </div>
  );
}

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
};

const cardStyle: React.CSSProperties = {
  padding: 24,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#FFFFFF",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12,
  flexWrap: "wrap",
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 600,
};

const detailsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const labelStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 14,
  fontWeight: 600,
  color: "#4B5563",
};

const valueStyle: React.CSSProperties = {
  margin: 0,
  lineHeight: 1.5,
};

const audioListStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 16,
};
