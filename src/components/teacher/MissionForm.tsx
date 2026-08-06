"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createMissionAction,
  generateOpenerAction,
  updateMissionAction,
  type MissionActionResult,
} from "@/app/teacher/missions/actions";
import type {
  MissionFormInput,
  MissionLevel,
  MissionTurnInput,
} from "@/domain/mission/schemas";
import { serializeMissionTurns } from "@/domain/mission/mission-turn-serialization";
import type { MissionWithTurns } from "@/server/mission/mission-service";
import { createEmptyTurn, TurnEditor } from "@/components/teacher/TurnEditor";
import { HoverButton } from "@/components/ui/HoverButton";
import { primaryHover, secondaryHover } from "@/components/ui/hover-styles";

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
  const [level, setLevel] = useState<MissionLevel>(
    mission?.level ?? "elementary",
  );
  const [turns, setTurns] = useState<MissionTurnInput[]>(
    mission?.turns.map((turn) => ({
      prompt: turn.prompt,
      targetExample: turn.targetExample,
      hintLadder: turn.hintLadder,
      answerShape: turn.answerShape,
    })) ?? [createEmptyTurn()],
  );
  const [conversationMode, setConversationMode] = useState(
    mission?.conversationMode ?? false,
  );
  const [requiredTurns, setRequiredTurns] = useState(
    mission?.conversationMode ? mission.requiredTurns : 5,
  );
  const [requireCompleteSentenceAnswers, setRequireCompleteSentenceAnswers] =
    useState(mission?.requireCompleteSentenceAnswers ?? true);
  const [opener, setOpener] = useState(
    mission?.conversationMode ? mission.turns[0]?.prompt ?? "" : "",
  );
  const [generatingOpener, setGeneratingOpener] = useState(false);
  const [openerError, setOpenerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleGenerateOpener() {
    setOpenerError(null);
    setGeneratingOpener(true);
    const result = await generateOpenerAction({ targetPattern });
    setGeneratingOpener(false);
    if (result.ok) {
      setOpener(result.opener);
    } else {
      setOpenerError(result.error);
    }
  }

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
    formData.set("level", level);
    formData.set(
      "requiredTurns",
      String(conversationMode ? requiredTurns : turns.length),
    );
    formData.set(
      "turns",
      JSON.stringify(
        serializeMissionTurns({
          conversationMode,
          opener,
          targetPattern,
          turns,
        }),
      ),
    );
    formData.set("conversationMode", conversationMode ? "true" : "false");
    formData.set(
      "requireCompleteSentenceAnswers",
      requireCompleteSentenceAnswers ? "true" : "false",
    );

    const result: MissionActionResult =
      mode === "edit"
        ? await updateMissionAction(formData)
        : await createMissionAction(formData);

    if (result.ok) {
      window.location.href = "/teacher/missions?saved=1";
    } else {
      setSubmitting(false);
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

      <section style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input
            id="conversation-mode"
            type="checkbox"
            checked={conversationMode}
            onChange={(event) => setConversationMode(event.target.checked)}
            aria-describedby="conversation-mode-help"
            style={toggleInputStyle}
          />
          <label htmlFor="conversation-mode" style={labelStyle}>
            Dynamic conversation mode
          </label>
        </div>
        <p id="conversation-mode-help" style={helpTextStyle}>
          Coco responds naturally to what your student says, instead of
          following fixed turns. Off by default.
        </p>

        {conversationMode ? (
          <div style={{ marginTop: 16, maxWidth: 240 }}>
            <label htmlFor="required-turns" style={labelStyle}>
              Turns to complete this mission
            </label>
            <input
              id="required-turns"
              type="number"
              min={3}
              max={8}
              value={requiredTurns}
              onChange={(event) =>
                setRequiredTurns(Number(event.target.value))
              }
              aria-describedby="required-turns-help"
              style={{ ...inputStyle, marginTop: 8 }}
            />
            <p id="required-turns-help" style={helpTextStyle}>
              {"How many turns the student needs to complete this mission."}
            </p>
            {requiredTurns < 3 || requiredTurns > 8 ? (
              <p role="alert" style={fieldErrorStyle}>
                Choose between 3 and 8 turns.
              </p>
            ) : null}

            <div style={{ marginTop: 24, maxWidth: 560 }}>
              <label htmlFor="coco-opening-line" style={labelStyle}>
                {"Coco's opening line"}
              </label>
              <p id="coco-opening-line-help" style={helpTextStyle}>
                {"Coco's first question for every student in this mission."}
              </p>
              <textarea
                id="coco-opening-line"
                name="opener"
                value={opener}
                onChange={(event) => setOpener(event.target.value)}
                aria-describedby="coco-opening-line-help"
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
              <div style={{ marginTop: 8 }}>
                <HoverButton
                  type="button"
                  onClick={handleGenerateOpener}
                  disabled={generatingOpener}
                  style={secondaryButtonStyle}
                  hoverStyle={secondaryHover}
                >
                  {generatingOpener ? (
                    <span
                      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                    >
                      <span className="spinner" aria-hidden="true" />
                      Generating…
                    </span>
                  ) : (
                    "Generate opener"
                  )}
                </HoverButton>
              </div>
              {openerError ? (
                <p role="alert" style={fieldErrorStyle}>
                  {openerError}
                </p>
              ) : null}
            </div>

            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  id="require-complete-sentence-answers"
                  type="checkbox"
                  checked={requireCompleteSentenceAnswers}
                  onChange={(event) =>
                    setRequireCompleteSentenceAnswers(event.target.checked)
                  }
                  aria-describedby="require-complete-sentence-answers-help"
                  style={toggleInputStyle}
                />
                <label
                  htmlFor="require-complete-sentence-answers"
                  style={labelStyle}
                >
                  Require complete-sentence answers
                </label>
              </div>
              <p
                id="require-complete-sentence-answers-help"
                style={helpTextStyle}
              >
                When an answer is understandable but incomplete, Coco helps
                the student say one complete sentence before continuing.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {conversationMode ? null : (
        <TurnEditor turns={turns} onChange={setTurns} />
      )}

      <div style={footerStyle}>
        <HoverButton
          type="button"
          onClick={() => router.push("/teacher/missions")}
          style={secondaryButtonStyle}
          hoverStyle={secondaryHover}
        >
          Cancel
        </HoverButton>
        <HoverButton
          type="submit"
          disabled={submitting}
          style={primaryButtonStyle}
          hoverStyle={primaryHover}
        >
          {submitting ? (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <span className="spinner" aria-hidden="true" />
              Saving…
            </span>
          ) : (
            "Save mission"
          )}
        </HoverButton>
      </div>
    </form>
  );
}

function Field(props: {
  id: string;
  name: keyof Pick<MissionFormInput, "title" | "targetPattern">;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const errorId = `${props.id}-error`;
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
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? errorId : undefined}
        style={inputStyle}
      />
      {props.error ? (
        <p id={errorId} role="alert" style={fieldErrorStyle}>
          {props.error}
        </p>
      ) : null}
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

const helpTextStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 400,
  color: "#4B5563",
  margin: "4px 0 0",
};

const toggleInputStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  minWidth: 44,
  minHeight: 44,
  accentColor: "#2563EB",
  cursor: "pointer",
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

const errorStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#B42318",
  margin: 0,
};

const fieldErrorStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#B42318",
  margin: "8px 0 0",
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
