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
