"use client";

import type { MissionTurnInput } from "@/domain/mission/schemas";
import { HoverButton } from "@/components/ui/HoverButton";
import { secondaryHover } from "@/components/ui/hover-styles";

type TurnEditorProps = {
  turns: MissionTurnInput[];
  onChange: (turns: MissionTurnInput[]) => void;
  errors?: Record<string, string>;
};

const emptyTurn: MissionTurnInput = {
  prompt: "",
  targetPattern: "",
  targetExample: "",
  hintLadder: { tier1: "", tier2: "", tier3: "" },
  answerShape: "open",
};

export function createEmptyTurn(): MissionTurnInput {
  return {
    prompt: "",
    targetPattern: "",
    targetExample: "",
    hintLadder: { tier1: "", tier2: "", tier3: "" },
    answerShape: "open",
  };
}

export function TurnEditor({ turns, onChange, errors = {} }: TurnEditorProps) {
  function updateTurn(
    index: number,
    patch: Partial<MissionTurnInput> | { hintLadder: Partial<MissionTurnInput["hintLadder"]> },
  ) {
    const next = turns.map((turn, turnIndex) => {
      if (turnIndex !== index) return turn;
      if ("hintLadder" in patch) {
        return {
          ...turn,
          hintLadder: {
            ...emptyTurn.hintLadder,
            ...turn.hintLadder,
            ...patch.hintLadder,
          },
        };
      }
      return { ...turn, ...patch };
    });
    onChange(next);
  }

  const emptyHintLadder = { tier1: "", tier2: "", tier3: "" };

  return (
    <section style={panelStyle}>
      <div style={sectionHeaderStyle}>
        <h2 style={headingStyle}>Turns</h2>
        <HoverButton
          type="button"
          onClick={() => onChange([...turns, { ...emptyTurn }])}
          style={secondaryButtonStyle}
          hoverStyle={secondaryHover}
        >
          Add turn
        </HoverButton>
      </div>

      {errors.turns ? (
        <p role="alert" style={errorStyle}>
          {errors.turns}
        </p>
      ) : null}

      <div style={{ display: "grid", gap: 24 }}>
        {turns.map((turn, index) => {
          const hintLadder = turn.hintLadder ?? emptyHintLadder;
          return (
          <div key={index} style={turnBlockStyle}>
            <div style={sectionHeaderStyle}>
              <h3 style={labelStyle}>Turn {index + 1}</h3>
              {turns.length > 1 ? (
                <HoverButton
                  type="button"
                  onClick={() =>
                    onChange(turns.filter((_, turnIndex) => turnIndex !== index))
                  }
                  style={destructiveTextButtonStyle}
                  hoverStyle={secondaryHover}
                >
                  Remove turn
                </HoverButton>
              ) : null}
            </div>

            <Field
              id={`turn-${index}-prompt`}
              label="Buddy question"
              value={turn.prompt}
              placeholder="What question should the buddy ask?"
              error={errors[`turns.${index}.prompt`]}
              onChange={(value) => updateTurn(index, { prompt: value })}
            />
            <Field
              id={`turn-${index}-target-pattern`}
              label="Target pattern"
              value={turn.targetPattern ?? ""}
              placeholder='e.g. "I like ___ing"'
              error={errors[`turns.${index}.targetPattern`]}
              onChange={(value) => updateTurn(index, { targetPattern: value })}
            />
            <Field
              id={`turn-${index}-target`}
              label="Example answer"
              value={turn.targetExample}
              placeholder="One correct student answer using the target pattern"
              error={errors[`turns.${index}.targetExample`]}
              onChange={(value) => updateTurn(index, { targetExample: value })}
            />

            <p style={{ ...labelStyle, color: "#4B5563", marginTop: 16 }}>
              Hints
            </p>
            <Field
              id={`turn-${index}-hint-1`}
              label="Hint 1: Target pattern"
              value={hintLadder.tier1 ?? ""}
              placeholder='e.g. "I like ___ing"'
              error={errors[`turns.${index}.hintLadder.tier1`]}
              onChange={(value) =>
                updateTurn(index, { hintLadder: { tier1: value } })
              }
            />
            <Field
              id={`turn-${index}-hint-2`}
              label="Hint 2: Word bank"
              value={hintLadder.tier2 ?? ""}
              placeholder='e.g. "play, soccer, like"'
              error={errors[`turns.${index}.hintLadder.tier2`]}
              onChange={(value) =>
                updateTurn(index, { hintLadder: { tier2: value } })
              }
            />
            <Field
              id={`turn-${index}-hint-3`}
              label="Hint 3: Full example"
              value={hintLadder.tier3 ?? ""}
              placeholder='e.g. "I like playing soccer."'
              error={errors[`turns.${index}.hintLadder.tier3`]}
              onChange={(value) =>
                updateTurn(index, { hintLadder: { tier3: value } })
              }
            />
          </div>
          );
        })}
      </div>
    </section>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const errorId = `${props.id}-error`;
  return (
    <div style={{ marginTop: 16 }}>
      <label htmlFor={props.id} style={labelStyle}>
        {props.label}
      </label>
      <input
        id={props.id}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? errorId : undefined}
        style={inputStyle}
      />
      {props.error ? (
        <p id={errorId} role="alert" style={errorStyle}>
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

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
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
  margin: 0,
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

const errorStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#B42318",
  margin: "8px 0 0",
};

const turnBlockStyle: React.CSSProperties = {
  borderTop: "1px solid #E5E7EB",
  paddingTop: 24,
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

const destructiveTextButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "none",
  color: "#B42318",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 44,
  transition: "background 0.15s ease, border-color 0.15s ease",
};
