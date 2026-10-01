import Link from "next/link";
import {
  bodyStyle,
  displayTitleStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from "@/components/student/styles";

// Front door for the app. Students have no password accounts (D-13/D-17) and
// enter via /join every visit; teachers sign in with email/password at
// /auth/login. This screen just routes each audience to the right entry point.
// Mobile-first, reusing the shared student panel + button tokens.
export function LandingPanel() {
  return (
    <div>
      <h1 style={displayTitleStyle}>Coco English</h1>
      <p style={bodyStyle}>Choose how you want to start.</p>

      <Link
        className="student-primary-button"
        href="/join"
        style={{
          ...primaryButtonStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textDecoration: "none",
        }}
      >
        I&rsquo;m a student
      </Link>

      <Link
        className="student-secondary-button"
        href="/auth/login"
        style={{
          ...secondaryButtonStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textDecoration: "none",
          marginTop: 12,
        }}
      >
        I&rsquo;m a teacher
      </Link>

      <p style={{ ...bodyStyle, fontSize: 13, margin: "20px 0 0", textAlign: "center" }}>
        Just visiting?{" "}
        <a
          href="https://coco-english-demo.vercel.app/"
          target="_blank"
          rel="noopener"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          Try the demo
        </a>
      </p>
    </div>
  );
}
