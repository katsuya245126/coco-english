"use client";

import { useState } from "react";
import {
  generateMissionDraftAction,
  type GenerateMissionDraftActionResult,
} from "@/app/teacher/missions/actions";
import type {
  GeneratedMissionDraft,
  GenerateMissionDraftInput,
} from "@/domain/ai/mission-generation";
import type { MissionLevel } from "@/domain/mission/schemas";
import { HoverButton } from "@/components/ui/HoverButton";
import { primaryHover, secondaryHover } from "@/components/ui/hover-styles";

type MissionDraftPanelProps = {
  targetPattern: string;
  topic: string;
  level: MissionLevel;
  requiredTurns: number;
  onUseDraft: (draft: GeneratedMissionDraft) => void;
};

type DraftStatus =
  | "idle"
  | "generating"
  | "ready"
  | "failed-schema"
  | "service-failed"
  | "invalid-input";

export function MissionDraftPanel({
  targetPattern,
  topic,
  level,
  requiredTurns,
  onUseDraft,
}: MissionDraftPanelProps) {
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [draft, setDraft] = useState<GeneratedMissionDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setStatus("generating");
    setError(null);

    const payload: GenerateMissionDraftInput = {
      targetPattern,
      topic,
      level,
      requiredTurns,
      dueAt: null,
    };
    const result: GenerateMissionDraftActionResult =
      await generateMissionDraftAction(payload);

    if (result.ok) {
      setDraft(result.draft);
      setStatus("ready");
      return;
    }

    setDraft(null);
    setError(result.error);
    setStatus(result.reason);
  }

  return (
    <section style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <h2 style={headingStyle}>AI mission draft</h2>
          <p style={bodyStyle}>
            Create a draft from your class target. You can edit everything
            before assigning.
          </p>
        </div>
        <HoverButton
          type="button"
          onClick={handleGenerate}
          disabled={status === "generating"}
          style={primaryButtonStyle}
          hoverStyle={primaryHover}
        >
          {status === "generating"
            ? "Creating a mission draft..."
            : draft
              ? "Generate again"
              : "Generate draft"}
        </HoverButton>
      </div>

      <div aria-live="polite" style={statusAreaStyle}>
        {status === "idle" ? (
          <div>
            <h3 style={subheadingStyle}>No AI draft yet</h3>
            <p style={mutedStyle}>
              Enter the target pattern, topic, level, turns, and due date, then
              generate a mission draft.
            </p>
          </div>
        ) : null}

        {status === "generating" ? (
          <p style={mutedStyle}>Creating a mission draft...</p>
        ) : null}

        {status === "ready" && draft ? (
          <div style={{ display: "grid", gap: 16 }}>
            <p style={successStyle}>
              Draft ready. Review and edit before assigning.
            </p>
            <DraftPreview draft={draft} />
            <div style={actionsStyle}>
              <HoverButton
                type="button"
                onClick={() => onUseDraft(draft)}
                style={primaryButtonStyle}
                hoverStyle={primaryHover}
              >
                Use draft
              </HoverButton>
              <HoverButton type="button" style={secondaryButtonStyle} hoverStyle={secondaryHover}>
                Keep editing
              </HoverButton>
            </div>
          </div>
        ) : null}

        {status === "failed-schema" ? (
          <p role="alert" style={errorBoxStyle}>
            {error ??
              "The draft did not match the mission format. Try again or write the mission manually."}
          </p>
        ) : null}

        {status === "service-failed" || status === "invalid-input" ? (
          <p role="alert" style={errorBoxStyle}>
            {error ??
              "AI generation is not available right now. Write the mission manually or try again later."}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function DraftPreview({ draft }: { draft: GeneratedMissionDraft }) {
  return (
    <section style={previewStyle}>
      <h3 style={subheadingStyle}>Draft preview</h3>
      <p style={mutedStyle}>Check the turns, examples, and hints before saving.</p>
      <dl style={detailsStyle}>
        <div>
          <dt style={labelStyle}>Mission title</dt>
          <dd style={detailValueStyle}>{draft.title}</dd>
        </div>
        <div>
          <dt style={labelStyle}>Target pattern</dt>
          <dd style={detailValueStyle}>{draft.targetPattern}</dd>
        </div>
        <div>
          <dt style={labelStyle}>Topic</dt>
          <dd style={detailValueStyle}>{draft.topic}</dd>
        </div>
        <div>
          <dt style={labelStyle}>Level</dt>
          <dd style={detailValueStyle}>{draft.level}</dd>
        </div>
        <div>
          <dt style={labelStyle}>Required turns</dt>
          <dd style={detailValueStyle}>{draft.requiredTurns}</dd>
        </div>
      </dl>
      <ol style={turnListStyle}>
        {draft.turns.map((turn, index) => (
          <li key={`${turn.prompt}-${index}`} style={turnCardStyle}>
            <p style={labelStyle}>Turn {index + 1}</p>
            <p style={bodyStyle}>{turn.prompt}</p>
            <p style={exampleStyle}>{turn.targetExample}</p>
            <dl style={hintListStyle}>
              <div>
                <dt style={labelStyle}>Hint 1</dt>
                <dd style={detailValueStyle}>{turn.hintLadder.tier1}</dd>
              </div>
              <div>
                <dt style={labelStyle}>Hint 2</dt>
                <dd style={detailValueStyle}>{turn.hintLadder.tier2}</dd>
              </div>
              <div>
                <dt style={labelStyle}>Hint 3</dt>
                <dd style={detailValueStyle}>{turn.hintLadder.tier3}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 24,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const headingStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  lineHeight: 1.25,
  margin: 0,
};

const subheadingStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.4,
  margin: 0,
};

const bodyStyle: React.CSSProperties = {
  fontSize: 16,
  lineHeight: 1.5,
  color: "#111827",
  margin: "8px 0 0",
};

const mutedStyle: React.CSSProperties = {
  fontSize: 16,
  lineHeight: 1.5,
  color: "#4B5563",
  margin: "8px 0 0",
};

const statusAreaStyle: React.CSSProperties = {
  marginTop: 16,
};

const previewStyle: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: 16,
};

const detailsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  margin: "16px 0",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  color: "#111827",
  margin: 0,
};

const detailValueStyle: React.CSSProperties = {
  fontSize: 16,
  lineHeight: 1.5,
  color: "#4B5563",
  margin: "4px 0 0",
};

const turnListStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  paddingLeft: 20,
  margin: 0,
};

const turnCardStyle: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: 16,
};

const exampleStyle: React.CSSProperties = {
  fontSize: 16,
  lineHeight: 1.5,
  color: "#111827",
  background: "#F0FDF4",
  border: "1px solid #BBF7D0",
  borderRadius: 8,
  padding: 12,
  margin: "12px 0 0",
};

const hintListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  margin: "12px 0 0",
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 44,
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "none",
  color: "#111827",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 16,
  cursor: "pointer",
  minHeight: 44,
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const successStyle: React.CSSProperties = {
  color: "#177245",
  fontSize: 14,
  fontWeight: 600,
  margin: 0,
};

const errorBoxStyle: React.CSSProperties = {
  color: "#B42318",
  background: "#FEF2F2",
  border: "1px solid #FCA5A5",
  borderRadius: 8,
  padding: 16,
  margin: 0,
};
