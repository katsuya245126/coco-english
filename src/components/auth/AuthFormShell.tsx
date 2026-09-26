import type { ReactNode } from "react";
import { JoinShell } from "@/components/student/JoinShell";
import { displayTitleStyle } from "@/components/student/styles";

const TEACHER_HERO = { hi: "Welcome!", line: "Coco's teacher room" };

// Teacher auth surface, in the same sticker-book frame as the student entry
// screens so the front door feels like one app.
export function AuthFormShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <JoinShell hero={TEACHER_HERO}>
      <h1 style={{ ...displayTitleStyle, marginBottom: 4 }}>{title}</h1>
      {children}
      {footer ? <div className="auth-footer">{footer}</div> : null}
    </JoinShell>
  );
}
