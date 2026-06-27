import { LandingPanel } from "@/components/landing/LandingPanel";
import { pageStyle, panelStyle } from "@/components/student/styles";

// Root route: front door directing teachers to /auth/login and students to
// /join. Replaces the Phase 1 foundation smoke-test panel. Mobile-first ≤420px.
export default function Home() {
  return (
    <main style={pageStyle}>
      <div style={panelStyle}>
        <LandingPanel />
      </div>
    </main>
  );
}
