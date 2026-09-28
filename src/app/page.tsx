import { DemoLandingPanel, type DemoLandingState } from "@/components/landing/DemoLandingPanel";
import { LandingPanel } from "@/components/landing/LandingPanel";
import { JoinShell } from "@/components/student/JoinShell";
import { demoClassId } from "@/server/demo/demo-config";
import { isRequestBudgetExhausted } from "@/server/security/request-budget";

// Root route: front door directing teachers to /auth/login and students to
// /join. Shares the sticker-book join frame so students see Coco first. On the
// public demo deployment it is the "Try the demo" entry instead.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const classId = demoClassId();
  if (!classId) {
    return (
      <JoinShell>
        <LandingPanel />
      </JoinShell>
    );
  }

  const { demo } = await searchParams;
  const resting = await isRequestBudgetExhausted({
    actorId: `demo-class:${classId}`,
    operation: "demo_daily",
  });
  const state: DemoLandingState = resting
    ? "resting"
    : demo === "resting" || demo === "busy" || demo === "error"
      ? demo
      : "ready";

  return (
    <JoinShell>
      <DemoLandingPanel state={state} />
    </JoinShell>
  );
}
