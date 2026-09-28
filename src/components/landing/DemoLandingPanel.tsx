import {
  bodyStyle,
  displayTitleStyle,
  primaryButtonStyle,
} from "@/components/student/styles";

export type DemoLandingState = "ready" | "busy" | "resting" | "error";

const MESSAGES: Record<Exclude<DemoLandingState, "ready">, { en: string; ko: string }> = {
  busy: {
    en: "Lots of demos started from your network. Try again in an hour.",
    ko: "같은 네트워크에서 체험이 많이 시작되었어요. 한 시간 뒤에 다시 시도해 주세요.",
  },
  resting: {
    en: "Coco is resting after a busy day. Come back tomorrow!",
    ko: "코코가 오늘 많이 연습해서 쉬고 있어요. 내일 다시 와 주세요!",
  },
  error: {
    en: "Something went wrong. Please try again.",
    ko: "문제가 생겼어요. 다시 시도해 주세요.",
  },
};

// Front door on the public demo deployment: one button creates a throwaway
// student in the demo class. Shown instead of LandingPanel when the demo gate
// is on.
export function DemoLandingPanel({ state }: { state: DemoLandingState }) {
  const message = state === "ready" ? null : MESSAGES[state];
  return (
    <div>
      <h1 style={displayTitleStyle}>Coco English</h1>
      <p style={bodyStyle}>
        Practice speaking English with Coco, just like a student would.
        <br />
        학생처럼 코코와 영어 말하기를 연습해 보세요.
      </p>

      {message ? (
        <p role="status" style={bodyStyle}>
          {message.en}
          <br />
          {message.ko}
        </p>
      ) : null}

      {state === "resting" ? null : (
        <form action="/demo/start" method="post">
          <button
            className="student-primary-button"
            type="submit"
            style={{ ...primaryButtonStyle, width: "100%" }}
          >
            Try the demo · 체험하기
          </button>
        </form>
      )}

      <p style={{ ...bodyStyle, fontSize: 13, marginTop: 16 }}>
        This is a demo. Your recordings are used only to run this session and are
        deleted every night.
        <br />
        체험용 데모입니다. 녹음은 이 체험에만 사용되며 매일 밤 삭제됩니다.
      </p>
    </div>
  );
}
