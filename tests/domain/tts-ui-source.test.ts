import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Student TTS UI source-boundary checks (VOICE-02, VOICE-04, D-01..D-16).
 *
 * These are deterministic static/source checks — no browser, microphone,
 * OpenAI API key, or Supabase network access required. Browser-required
 * autoplay/audio semantics live in tests/e2e/student-coco-voice.spec.ts.
 */

const PROJECT_ROOT = resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return readFileSync(join(PROJECT_ROOT, relativePath), "utf8");
}

function collectFilesAbs(absDir: string): string[] {
  if (!existsSync(absDir)) return [];
  const files: string[] = [];
  const entries = readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(absDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesAbs(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectFiles(dir: string): string[] {
  return collectFilesAbs(join(PROJECT_ROOT, dir));
}

describe("CocoSpeechAudio replay UI source contract (VOICE-02, D-12, D-13)", () => {
  it("renders an inline icon-only replay control with accessible label 'Play Coco'", () => {
    const source = readSource("src/components/student/CocoSpeechAudio.tsx");

    expect(source).toContain('aria-label="Play Coco"');
    expect(source).toContain("<audio");
  });

  it("uses an inline SVG speaker icon instead of emoji glyphs", () => {
    const source = readSource("src/components/student/CocoSpeechAudio.tsx");

    expect(source).toContain("function SpeakerIcon");
    expect(source).toContain("<svg");
    expect(source).toContain('stroke: "currentColor"');
    expect(source).toContain('fill="currentColor"');
    expect(source).toMatch(/M15\.54 8\.46a5 5 0 0 1 0 7\.07/);
    expect(source).not.toMatch(/[🔈🔊🔇…]/u);
  });

  it("uses a standard audio element, catches rejected play() promises, and exposes loading/ready/playing/error states", () => {
    const source = readSource("src/components/student/CocoSpeechAudio.tsx");

    expect(source).toContain("<audio");
    expect(source).toMatch(/\.play\(\)/);
    expect(source).toMatch(/catch/);
  });
});

describe("Coco voice line integration in mission step cards (D-06..D-11)", () => {
  it("wires CocoSpeechAudio into the buddy question, improved repeat, transition, and completion steps", () => {
    const questionSource = readSource(
      "src/components/student/StepBuddyQuestion.tsx",
    );
    const repeatSource = readSource(
      "src/components/student/StepImprovedRepeat.tsx",
    );
    const transitionSource = readSource(
      "src/components/student/StepTurnTransition.tsx",
    );
    const completeSource = readSource(
      "src/components/student/StepMissionComplete.tsx",
    );

    expect(questionSource).toContain("CocoSpeechAudio");
    expect(repeatSource).toContain("CocoSpeechAudio");
    expect(transitionSource).toContain("CocoSpeechAudio");
    expect(completeSource).toContain("CocoSpeechAudio");
  });

  it("omits the old visible 'Coco asks:' label from the buddy question card", () => {
    const questionSource = readSource(
      "src/components/student/StepBuddyQuestion.tsx",
    );
    const shellSource = readSource(
      "src/components/student/MissionFlowShell.tsx",
    );

    expect(questionSource).not.toContain("questionLabel");
    expect(questionSource).not.toContain("Coco asks:");
    expect(shellSource).not.toContain("questionLabel={characterProfile.questionLabel}");
  });

  it("does not send student transcript text to CocoSpeechAudio (D-10)", () => {
    const repeatSource = readSource(
      "src/components/student/StepImprovedRepeat.tsx",
    );
    const feedbackSource = readSource(
      "src/components/student/StepAiEvaluationFeedback.tsx",
    );

    // The transcript block itself must remain a plain text render, never
    // passed as the `text` prop into a CocoSpeechAudio invocation.
    expect(repeatSource).not.toMatch(
      /<CocoSpeechAudio[^>]*text=\{originalTranscript\}/,
    );
    expect(feedbackSource).not.toMatch(
      /<CocoSpeechAudio[^>]*text=\{transcript\}/,
    );
  });

  it("keeps recording controls available while Coco audio is loading or playing (D-04)", () => {
    const questionSource = readSource(
      "src/components/student/StepBuddyQuestion.tsx",
    );
    const repeatSource = readSource(
      "src/components/student/StepImprovedRepeat.tsx",
    );

    expect(questionSource).not.toMatch(
      /VoiceRecorderControl[\s\S]*disabled=\{.*(ttsLoading|audioLoading|cocoLoading|speechLoading)/,
    );
    expect(repeatSource).not.toMatch(
      /VoiceRecorderControl[\s\S]*disabled=\{.*(ttsLoading|audioLoading|cocoLoading|speechLoading)/,
    );
  });

  it("renders active Coco lines from the persistent mascot dialogue instead of duplicating them in step cards", () => {
    const shellSource = readSource(
      "src/components/student/MissionFlowShell.tsx",
    );

    expect(shellSource).toContain("getMascotDialogue");
    expect(shellSource).toContain("dialogueText={mascotDialogue.text}");
    expect(shellSource).toContain("voiceControl={");
    expect(shellSource).toContain("showCocoLine={false}");
    expect(shellSource).toContain("`Try this: ${sentence}`");
    expect(shellSource).toContain("`Try this: ${flow.originalFeedback.improvedSentence}`");
    expect(shellSource).toContain("`Try again: ${sentence}`");
    expect(shellSource).toContain('feedbackVariant: "accepted_original"');
    expect(shellSource).toContain('feedbackVariant: "retry_original"');
    expect(shellSource).toContain('feedbackVariant: "teacher_check"');
    expect(shellSource).toContain('feedbackVariant: "repeat_accepted"');
    expect(shellSource).toContain('feedbackVariant: "repeat_check"');
    expect(shellSource).toContain("if (actionError)");
  });

  it("keeps the mascot dialogue box at a stable height", () => {
    const stylesSource = readSource("src/components/student/styles.ts");

    expect(stylesSource).toContain("height: 104");
    expect(stylesSource).toContain('overflowY: "auto"');
    expect(stylesSource).not.toContain("minHeight: 64");
  });

  it("uses upper-body mascot framing and state-specific thinking/sad sprites", () => {
    const stageSource = readSource("src/components/student/MascotStage.tsx");
    const stylesSource = readSource("src/components/student/styles.ts");

    expect(stageSource).toContain('thinking: "coco-thinking-alpha.png"');
    expect(stageSource).toContain('sad: "coco-sad-alpha.png"');
    expect(stageSource).toContain('objectFit: "cover"');
    expect(stageSource).toContain('objectPosition: "center 18%"');
    expect(stylesSource).toContain("left: 72");
    expect(stylesSource).toContain("right: 72");
    expect(stylesSource).toContain("bottom: 72");
    expect(stylesSource).toContain("height: 198");
  });

  it("does not pre-attach Web Audio analyser nodes before playback can run", () => {
    const source = readSource("src/components/student/CocoSpeechAudio.tsx");

    expect(source).toContain("ensureAnalyserReady");
    expect(source).toContain('sharedAudioContext?.state === "running"');
    expect(source).not.toMatch(/useEffect\(\(\) => \{\s*if \(!audioUrl \|\| !onAmplitudeFrame\) return;/);
  });
});

describe("Student/server TTS boundary (T-08-01)", () => {
  const SCAN_DIRS = [
    "src/app/student",
    "src/server/student-access",
    "src/components/student",
    "src/domain/character",
    "src/domain/audio",
  ];

  const FORBIDDEN_CLIENT_TOKENS = ["openai", "@/server/audio/tts-generator"];

  it("no student client module imports OpenAI or the server TTS adapter", () => {
    const violations: string[] = [];

    for (const dir of SCAN_DIRS) {
      for (const filePath of collectFiles(dir)) {
        const content = readFileSync(filePath, "utf8");
        const relativePath = filePath.replace(PROJECT_ROOT + "/", "");
        const isClientModule = content.includes('"use client"');

        if (!isClientModule) continue;

        for (const token of FORBIDDEN_CLIENT_TOKENS) {
          if (
            content.includes(`"${token}"`) ||
            content.includes(`'${token}'`) ||
            content.includes(`from "${token}`) ||
            content.includes(`from '${token}`)
          ) {
            violations.push(`${relativePath} contains forbidden token: ${token}`);
          }
        }
      }
    }

    expect(violations, `TTS client boundary violated:\n${violations.join("\n")}`).toEqual([]);
  });

  it("CocoSpeechAudio does not import server-role Supabase utilities", () => {
    const source = readSource("src/components/student/CocoSpeechAudio.tsx");

    expect(source).not.toMatch(/createSupabaseServiceClient/);
    expect(source).not.toMatch(/from ["']openai["']/);
  });
});

describe("No teacher-facing replay telemetry (D-16)", () => {
  it("teacher evidence surfaces do not reference Coco TTS replay counts", () => {
    const teacherDir = collectFiles("src/components/teacher");
    const violations: string[] = [];

    for (const filePath of teacherDir) {
      const content = readFileSync(filePath, "utf8");
      if (/replayCount|ttsReplay|cocoReplay/i.test(content)) {
        violations.push(filePath.replace(PROJECT_ROOT + "/", ""));
      }
    }

    expect(violations).toEqual([]);
  });
});
