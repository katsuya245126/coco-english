"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createMissionAction,
  updateMissionAction,
  type MissionActionResult,
} from "@/app/teacher/missions/actions";
import type {
  MissionFormInput,
  MissionLevel,
  MissionTurnInput,
} from "@/domain/mission/schemas";
import type { MissionWithTurns } from "@/server/mission/mission-service";
import { createEmptyTurn, TurnEditor } from "@/components/teacher/TurnEditor";

type MissionFormProps = {
  mode: "create" | "edit";
  mission?: MissionWithTurns;
  activeAssignmentCount?: number;
};

const levelOptions: Array<{ value: MissionLevel; label: string }> = [
  { value: "beginner", label: "Beginner" },
  { value: "elementary", label: "Elementary" },
  { value: "intermediate", label: "Intermediate" },
];

export function MissionForm({
  mode,
  mission,
  activeAssignmentCount = 0,
}: MissionFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(mission?.title ?? "");
  const [targetPattern, setTargetPattern] = useState(
    mission?.targetPattern ?? "",
  );
  const [topic, setTopic] = useState(mission?.topic ?? "");
  const [level, setLevel] = useState<MissionLevel>(
    mission?.level ?? "elementary",
  );
  const [turns, setTurns] = useState<MissionTurnInput[]>(
    mission?.turns.map((turn) => ({
      prompt: turn.prompt,
      targetExample: turn.targetExample,
      hintLadder: turn.hintLadder,
    })) ?? [createEmptyTurn()],
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    if (mode === "edit" && mission) {
      formData.set("missionId", mission.id);
    }
    formData.set("title", title);
    formData.set("targetPattern", targetPattern);
    formData.set("topic", topic);
    formData.set("level", level);
    formData.set("requiredTurns", String(turns.length));
    formData.set("turns", JSON.stringify(turns));

    const result: MissionActionResult =
      mode === "edit"
        ? await updateMissionAction(formData)
        : await createMissionAction(formData);

    setSubmitting(false);
    if (result.ok) {
      router.push(`/teacher/missions/${result.missionId}`);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 24 }}>
      {activeAssignmentCount > 0 ? (
        <p style={noticeStyle}>
          This mission has {activeAssignmentCount} active assignment(s). Edits
          apply to future assignments only; existing homework is unchanged.
        </p>
      ) : null}

      {error ? (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      ) : null}

      <section style={panelStyle}>
        <h2 style={headingStyle}>Mission details</h2>
        <Field
          id="mission-title"
          name="title"
          label="Mission title"
          value={title}
          onChange={setTitle}
        />
        <Field
          id="target-pattern"
          name="targetPattern"
          label="Target pattern"
          value={targetPattern}
          onChange={setTargetPattern}
        />
        <Field
          id="topic"
          name="topic"
          label="Topic"
          value={topic}
          onChange={setTopic}
        />

        <div style={{ marginTop: 16, maxWidth: 240 }}>
          <label htmlFor="level" style={labelStyle}>
            Level
          </label>
          <select
            id="level"
            name="level"
            value={level}
            onChange={(event) => setLevel(event.target.value as MissionLevel)}
            style={inputStyle}
          >
            {levelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <TurnEditor turns={turns} onChange={setTurns} />

      <div style={footerStyle}>
        <button
          type="button"
          onClick={() => router.push("/teacher/missions")}
          style={secondaryButtonStyle}
        >
          Cancel
        </button>
        <button type="submit" disabled={submitting} style={primaryButtonStyle}>
          {submitting ? "Saving..." : "Save mission"}
        </button>
      </div>
    </form>
  );
}

function Field(props: {
  id: string;
  name: keyof Pick<
    MissionFormInput,
    "title" | "targetPattern" | "topic"
  >;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <label htmlFor={props.id} style={labelStyle}>
        {props.label}
      </label>
      <input
        id={props.id}
        name={props.name}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 24,
};

const headingStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  lineHeight: 1.25,
  margin: 0,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  color: "#111827",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: "10px 12px",
  fontSize: 16,
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  boxSizing: "border-box",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
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
};

const errorStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#B42318",
  margin: 0,
};

const noticeStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#B45309",
  background: "#FFF7ED",
  border: "1px solid #FDBA74",
  borderRadius: 8,
  padding: 16,
  margin: 0,
};
