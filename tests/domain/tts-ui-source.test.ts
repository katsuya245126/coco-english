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

  it("reports playback stopped on pause, buffering, descriptor changes, and unmount", () => {
    const source = readSource("src/components/student/CocoSpeechAudio.tsx");

    expect(source).toContain("autoplayedUrlRef.current = null");
    expect(source).toContain("onPause={() =>");
    expect(source).toMatch(/onWaiting=\{\(\) => \{[\s\S]*onPlayingChange\?\.\(false\)/);
    expect(source).toMatch(/return \(\) => \{[\s\S]*controller\.abort\(\);[\s\S]*onPlayingChange\?\.\(false\)/);
  });
});

describe("Coco voice line integration in mission step cards (D-06..D-11)", () => {
  it("speaks only the short completion heading", () => {
    const routeSource = readSource(
      "src/app/student/missions/[assignmentStudentId]/tts/route.ts",
    );

    expect(routeSource).toContain('case "completion_celebration"');
    expect(routeSource).toContain("return profile.completionHeading;");
    expect(routeSource).not.toContain(
      "`${profile.completionHeading} ${profile.completionBody(turnCount)}`",
    );
  });

  it("uses matched Coco, Hint, and TTS tabs while preserving the mascot stage", () => {
    const stageSource = readSource("src/components/student/MascotStage.tsx");
    const dialogueSource = readSource(
      "src/components/student/CocoDialogueBox.tsx",
    );
    const stylesSource = readSource("src/components/student/styles.ts");

    expect(stageSource).toContain("<CocoDialogueBox");
    expect(stageSource).toContain("SPRITE_BY_EXPRESSION");
    expect(stageSource).toContain("updateSpeakingVisual");
    expect(dialogueSource).toContain("displayName");
    expect(dialogueSource).toMatch(/>\s*Hint\s*</);
    expect(dialogueSource).toContain("voiceControl");
    expect(stylesSource).toContain('color: "#2563EB"');
    expect(stylesSource).toContain("minHeight: 44");
  });

  it("keeps English inline and shows Korean only in an anchored phrase bubble", () => {
    const dialogueSource = readSource(
      "src/components/student/CocoDialogueBox.tsx",
    );

    expect(dialogueSource).toContain("buildTranslationSegments");
    expect(dialogueSource).toContain("aria-expanded={isExpanded}");
    expect(dialogueSource).toContain("phrase.translation");
    expect(dialogueSource).not.toContain("dangerouslySetInnerHTML");
    expect(dialogueSource).not.toContain("onPointerDown");
    expect(dialogueSource).not.toContain("onTouchStart");
  });

  it("keeps translation failure retryable and recording-independent", () => {
    const dialogueSource = readSource(
      "src/components/student/CocoDialogueBox.tsx",
    );
    const shellSource = readSource(
      "src/components/student/MissionFlowShell.tsx",
    );

    expect(dialogueSource).toContain("Translation unavailable");
    expect(dialogueSource).toContain("loadTranslationHint");
    expect(dialogueSource).toContain("Retry translation");
    expect(shellSource).not.toMatch(
      /VoiceRecorderControl[\s\S]*disabled=\{.*translation/,
    );
  });

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

  it("renders Coco's short spoken lines from the persistent mascot dialogue instead of duplicating them in step cards", () => {
    const shellSource = readSource(
      "src/components/student/MissionFlowShell.tsx",
    );
    const routeSource = readSource(
      "src/app/student/missions/[assignmentStudentId]/tts/route.ts",
    );

    expect(shellSource).toContain("getMascotDialogue");
    expect(shellSource).toContain("dialogueText={mascotDialogue.text}");
    expect(shellSource).toContain("voiceControl={");
    // Feedback step cards keep their redundant short-message headings
    // suppressed; those lines are spoken only by the mascot bubble.
    expect(shellSource).toContain("showCocoLine={false}");
    expect(shellSource).toContain('feedbackVariant: "accepted_original"');
    expect(shellSource).toContain('feedbackVariant: "needs_correction"');
    expect(shellSource).toContain('feedbackVariant: "retry_original"');
    expect(shellSource).toContain('feedbackVariant: "teacher_check"');
    expect(shellSource).toContain('feedbackVariant: "repeat_accepted"');
    expect(shellSource).toContain('feedbackVariant: "retry_repeat"');
    expect(shellSource).toContain('feedbackVariant: "repeat_check"');
    expect(shellSource).toContain("if (actionError)");
    expect(routeSource).toContain('case "needs_correction"');
    expect(routeSource).toContain('return "Hmm... let\'s try again"');
    expect(routeSource).toContain('case "retry_repeat"');
    expect(routeSource).toContain('return "Try again!"');
  });

  it("resolves improved/dynamic line lookups from the latest attempt only (multi-attempt voice regression)", () => {
    const routeSource = readSource(
      "src/app/student/missions/[assignmentStudentId]/tts/route.ts",
    );

    // A restarted/retried mission produces a second attempt whose attempt_turns
    // reuse the same turn_order values. Filtering only on the assignment-level
    // join makes .maybeSingle() error on the duplicate rows, resolving the line
    // to null → 404 → "Voice unavailable". The lookups must pin to the current
    // attempt via assignment_students.latest_attempt_id.
    expect(routeSource).toContain("latest_attempt_id");
    expect(routeSource).toMatch(/\.eq\("attempt_id", latestAttemptId\)/);
  });

  it("keeps the target sentence in the step card, not embedded in Coco's dialogue text", () => {
    const shellSource = readSource(
      "src/components/student/MissionFlowShell.tsx",
    );

    // The improved/target sentence must render in the "Try this:" step card
    // (showSentenceCard), never inlined into the mascot bubble text — otherwise
    // Coco "says the answer in the chatbox" and it appears twice.
    expect(shellSource).toContain("showSentenceCard={true}");
    // The retry-recorder card uses a terse student-facing label; the fuller
    // characterProfile.improvedSentenceIntro phrasing is spoken-only (TTS).
    expect(shellSource).toContain('improvedSentenceLabel="Say"');
    expect(shellSource).not.toContain(
      "improvedSentenceIntro={characterProfile.improvedSentenceIntro}",
    );
    expect(shellSource).not.toContain("`Try this: ${sentence}`");
    expect(shellSource).not.toContain(
      "`Try this: ${flow.originalFeedback.improvedSentence}`",
    );
    expect(shellSource).not.toContain("`Try again: ${sentence}`");
  });

  it("uses the terse blue Say label and hides the first transcript while recording again", () => {
    const repeatSource = readSource(
      "src/components/student/StepImprovedRepeat.tsx",
    );

    expect(repeatSource).toContain("fontSize: 16");
    expect(repeatSource).toContain('color: "#2563EB"');
    expect(repeatSource).not.toContain("originalTranscript");
    expect(repeatSource).not.toContain("We heard:");
  });

  it("keeps the mascot dialogue box at a stable height", () => {
    const stylesSource = readSource("src/components/student/styles.ts");

    expect(stylesSource).toContain("height: 104");
    expect(stylesSource).toContain("bottom: 32");
    expect(stylesSource).toContain('overflowY: "auto"');
    expect(stylesSource).not.toContain("minHeight: 64");
  });

  it("uses upper-body mascot framing and state-specific thinking/sad sprites", () => {
    const stageSource = readSource("src/components/student/MascotStage.tsx");
    const stylesSource = readSource("src/components/student/styles.ts");

    expect(stageSource).toContain('thinking: "coco-thinking-alpha.png"');
    expect(stageSource).toContain('sad: "coco-sad-alpha.png"');
    expect(stageSource).toContain('objectFit: "cover"');
    expect(stageSource).toContain('objectPosition: "center 12%"');
    expect(stylesSource).toContain(
      'left: "clamp(24px, calc((100% - 226px) / 2), 72px)"',
    );
    expect(stylesSource).toContain(
      'right: "clamp(24px, calc((100% - 226px) / 2), 72px)"',
    );
    // Sprite box must clear the dialogue box (top at y=172 of the 300-tall
    // stage) so close-up sprites' faces aren't hidden behind it.
    expect(stylesSource).toContain("bottom: 120");
    expect(stylesSource).toContain("height: 180");
  });

  it("never routes the <audio> element into a Web Audio graph (replay must stay audible)", () => {
    const source = readSource("src/components/student/CocoSpeechAudio.tsx");

    // createMediaElementSource is a one-way capture: it permanently reroutes
    // the element's output into whichever AudioContext grabbed it first, and
    // any later graph/context loss (HMR re-eval, remount) leaves the element
    // advancing currentTime while emitting silence — the replay-silent-on-
    // reclick bug. Playback must stay native; the mascot mouth pulse comes
    // from a synthetic level instead of an analyser tap. Comments are allowed
    // to explain the ban, so only scan comment-stripped code.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("createMediaElementSource");
    expect(code).not.toContain("new AudioContext");
    expect(code).not.toContain("createAnalyser");
    expect(code).toContain("syntheticSpeechLevel");
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
