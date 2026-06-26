import { JoinForm } from "@/components/student/JoinForm";
import { pageStyle, panelStyle } from "@/components/student/styles";

// Manual class-code entry (STUD-01 fallback, D-10). Mobile-first ≤420px. Offers
// the remembered-class banner so a returning device can re-enter (D-12/D-18),
// while still requiring the PIN each visit (D-13/D-17).
export default function JoinPage() {
  return (
    <main style={pageStyle}>
      <div style={panelStyle}>
        <JoinForm showRemembered />
      </div>
    </main>
  );
}
