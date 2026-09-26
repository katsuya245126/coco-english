import { LandingPanel } from "@/components/landing/LandingPanel";
import { JoinShell } from "@/components/student/JoinShell";

// Root route: front door directing teachers to /auth/login and students to
// /join. Shares the sticker-book join frame so students see Coco first.
export default function Home() {
  return (
    <JoinShell>
      <LandingPanel />
    </JoinShell>
  );
}
