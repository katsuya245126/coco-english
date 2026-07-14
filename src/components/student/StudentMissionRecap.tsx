import type { CSSProperties } from "react";
import type { StudentMissionRecap as Recap } from "@/server/student-access/student-history";
import { StudentHistoryAudioPlayer } from "./StudentHistoryAudioPlayer";

export function StudentMissionRecap({ recap }: { recap: Recap }) {
  return <>
    <section style={scene}><strong>Practice: “{recap.targetPattern}”</strong><p style={small}>Conversation with Coco · {recap.turns.length} turns</p></section>
    {recap.turns.map((turn) => <section key={turn.id} style={{ marginBottom: 20 }}>
      <p style={speaker}>Coco</p><div style={cocoBubble}>{turn.cocoPrompt}</div>
      <p style={{ ...speaker, marginLeft: 28, marginTop: 12 }}>You said</p><div style={studentBubble}><p style={{ margin: 0 }}>{turn.transcript}</p>
        {turn.audio?.playback === "available" ? <StudentHistoryAudioPlayer audioClipId={turn.audio.id} /> : turn.audio?.playback === "expired" ? <p style={muted}>Recording expired</p> : <p style={muted}>Recording unavailable</p>}
      </div>
      {turn.pronunciation ? <div style={feedback}><strong>{"★".repeat(turn.pronunciation.starBand)} Pronunciation</strong>
        {turn.pronunciation.words.length === 0
          ? <p style={{ margin: "6px 0 0" }}>Great job!</p>
          : <p style={{ margin: "6px 0 0" }}>Words to practice: {turn.pronunciation.words.map((word) => word.word).join(" · ")}</p>}
      </div> : null}
    </section>)}
    <p style={{ ...muted, textAlign: "center" }}>Read-only recap · This completed mission cannot be edited or resubmitted.</p>
  </>;
}
const scene: CSSProperties = { background: "#EEF2FF", borderRadius: 10, padding: 14, margin: "18px 0" };
const speaker: CSSProperties = { margin: "0 0 5px 4px", fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", color: "#64748B", fontWeight: 700 };
const cocoBubble: CSSProperties = { border: "1px solid #E2E8F0", borderRadius: 12, padding: 13, lineHeight: 1.5 };
const studentBubble: CSSProperties = { background: "#DBEAFE", color: "#1E3A8A", borderRadius: 12, padding: 13, marginLeft: 28, lineHeight: 1.5 };
const feedback: CSSProperties = { background: "#F0FDF4", color: "#166534", borderRadius: 8, padding: 10, margin: "8px 0 0 28px", fontSize: 14 };
const small: CSSProperties = { margin: "5px 0 0", color: "#64748B", fontSize: 14 };
const muted: CSSProperties = { margin: "9px 0 0", color: "#64748B", fontSize: 14 };
