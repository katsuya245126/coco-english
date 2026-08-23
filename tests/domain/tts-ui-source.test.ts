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
    // Visible label is a constant Korean glyph; the state-dependent English
    // wording lives on aria-label/title instead.
    expect(dialogueSource).toContain("<span>한</span>");
    expect(dialogueSource).toContain("aria-label={hintLabel}");
    expect(dialogueSource).toContain("voiceControl");
    expect(stylesSource).toContain('color: "#2563EB"');
    expect(stylesSource).toContain("minHeight: 44");
  });

  it("shows the dynamic-reply wait state inside Coco's dialogue box", () => {
    const shellSource = readSource(
      "src/components/student/MissionFlowShell.tsx",
    );
    const dialogueSource = readSource(
      "src/components/student/CocoDialogueBox.tsx",
    );

    expect(shellSource).toMatch(
      /flow\.step === "cocoThinking"[\s\S]{0,180}text: "Coco is thinking…"[\s\S]{0,80}line: null/,
    );
    expect(shellSource).not.toContain("StepCocoThinking");
    expect(dialogueSource).toContain('aria-live="polite"');
    expect(dialogueSource).toContain('aria-atomic="true"');
  });

  it("keeps English inline and shows Korean only in an anchored phrase bubble", () => {
    const dialogueSource = readSource(
      "src/components/student/CocoDialogueBox.tsx",
    );
    const stylesSource = readSource("src/components/student/styles.ts");

    expect(dialogueSource).toContain("buildTranslationSegments");
    expect(dialogueSource).toContain("aria-expanded={isExpanded}");
    expect(dialogueSource).toContain("phrase.translation");
    expect(dialogueSource).not.toContain("dangerouslySetInnerHTML");
    expect(dialogueSource).not.toContain("onPointerDown");
    expect(dialogueSource).not.toContain("onTouchStart");
    expect(stylesSource).toMatch(
      /mascotPhraseButtonStyle[\s\S]*minHeight: "auto"[\s\S]*padding: "2px 3px"[\s\S]*margin: 0/,
    );
  });

  it("lets a wide hint phrase wrap inline without orphaning trailing punctuation", () => {
    const dialogueSource = readSource(
      "src/components/student/CocoDialogueBox.tsx",
    );
    const stylesSource = readSource("src/components/student/styles.ts");

    expect(dialogueSource).toContain(
      'style={{ position: "relative", display: "inline" }}',
    );
    expect(stylesSource).toMatch(
      /mascotPhraseButtonStyle[\s\S]*display: "inline"[\s\S]*whiteSpace: "normal"/,
    );
    expect(dialogueSource).not.toContain(
      'style={{ position: "relative", display: "inline-block" }}',
    );
  });

  it("sizes the anchored Korean translation bubble to its text, not the phrase width", () => {
    const stylesSource = readSource("src/components/student/styles.ts");

    // width: max-content stops the absolutely-positioned bubble from
    // shrinking to the phrase button's width, which rendered Korean one
    // character per line; the min() cap keeps it phone-safe.
    expect(stylesSource).toMatch(
      /export const mascotTranslationBubbleStyle: CSSProperties = \{[^}]*width: "max-content"[^}]*maxWidth: "min\(260px, calc\(100vw - 32px\)\)"[^}]*whiteSpace: "normal"[^}]*overflowWrap: "anywhere"[^}]*\};/,
    );
  });

  it("retries translation through the same visible Hint action", () => {
    const dialogueSource = readSource(
      "src/components/student/CocoDialogueBox.tsx",
    );
    const shellSource = readSource(
      "src/components/student/MissionFlowShell.tsx",
    );

    expect(dialogueSource).toContain("const hintLabel =");
    expect(dialogueSource).toContain('translationState.kind === "error"');
    expect(dialogueSource).toContain('"Retry hint"');
    expect(dialogueSource).toContain('translationState.kind === "loading"');
    expect(dialogueSource).toContain('"Loading hint"');
    expect(dialogueSource).toContain("<HintSpinner />");
    expect(dialogueSource).toContain("aria-busy={isHintLoading}");
    expect(dialogueSource).not.toContain('"Hint…"');
    expect(dialogueSource).toContain("aria-label={hintLabel}");
    // The visible label is always 한 so the tab never resizes; the error and
    // loading wording is carried by the accessible label only.
    expect(dialogueSource).toContain("<span>한</span>");
    expect(dialogueSource).toContain("hintAccessibleLabel");
    expect(dialogueSource).not.toMatch(/>\s*Hint\s*</);
    expect(dialogueSource).not.toContain("Translation unavailable");
    expect(shellSource).not.toMatch(
      /VoiceRecorderControl[\s\S]*disabled=\{.*translation/,
    );
  });

  it("paginates only the current Coco line with accessible fixed controls", () => {
    const dialogueSource = readSource(
      "src/components/student/CocoDialogueBox.tsx",
    );
    const stylesSource = readSource("src/components/student/styles.ts");

    expect(dialogueSource).toContain("paginateDialogueText");
    expect(dialogueSource).toContain('paginateDialogueText(dialogueText ?? "")');
    expect(dialogueSource).not.toContain("protectedPages");
    expect(dialogueSource).toContain("clampPhrasesToPage");
    expect(dialogueSource).toContain('aria-label="Previous dialogue page"');
    expect(dialogueSource).toContain('aria-label="Next dialogue page"');
    expect(dialogueSource).toContain("safePageIndex + 1");
    expect(dialogueSource).not.toContain("conversationHistory");
    expect(stylesSource).toContain("mascotDialoguePagerStyle");
    expect(stylesSource).not.toMatch(
      /mascotDialogueBoxStyle[\s\S]*overflowY: "auto"/,
    );
  });

  it("opens the first Korean phrase on the current page without refetching or changing pages", () => {
    const dialogueSource = readSource(
      "src/components/student/CocoDialogueBox.tsx",
    );

    expect(dialogueSource).toContain("translationVisible");
    expect(dialogueSource).toContain("setTranslationVisible(nextVisible)");
    expect(dialogueSource).toContain("firstPhraseIndexOnPage");
    expect(dialogueSource).toContain("currentPage");
    expect(dialogueSource).not.toContain("findDialoguePageIndex");
    expect(dialogueSource).not.toContain("firstPhrase.start");
    expect(dialogueSource).toContain("currentPage.start + segment.phrase.start");
    expect(dialogueSource).toMatch(
      /translationState\.kind === "ready"[\s\S]*setExpandedPhraseIndex\(nextVisible \? phraseIndex : null\)[\s\S]*return/,
    );
    const readyBranchIndex = dialogueSource.indexOf(
      'if (translationState.kind === "ready")',
    );
    const fetchIndex = dialogueSource.indexOf("await fetch(");
    expect(readyBranchIndex).toBeGreaterThan(-1);
    expect(fetchIndex).toBeGreaterThan(readyBranchIndex);
    expect(dialogueSource).toContain(
      "aria-pressed={translationVisible}",
    );
    expect(dialogueSource).not.toContain(
      "getFirstTranslationPhraseSegmentIndex",
    );
  });

  it("uses an icon-only dialogue-tab replay without changing standalone TTS", () => {
    const audioSource = readSource("src/components/student/CocoSpeechAudio.tsx");
    const shellSource = readSource("src/components/student/MissionFlowShell.tsx");

    expect(audioSource).toContain('presentation?: "standalone" | "dialogue-tab"');
    expect(audioSource).toContain('presentation = "standalone"');
    expect(audioSource).toContain('presentation !== "dialogue-tab"');
    expect(shellSource).toContain('presentation="dialogue-tab"');
  });

  it("cancels stale translation requests when the active prompt changes", () => {
    const dialogueSource = readSource(
      "src/components/student/CocoDialogueBox.tsx",
    );

    expect(dialogueSource).toContain("new AbortController()");
    expect(dialogueSource).toContain("activeRequestRef.current?.abort()");
    expect(dialogueSource).toContain("signal: controller.signal");
    expect(dialogueSource).toContain("AbortError");
  });

  it("attaches Coco and grouped actions to one shared chatbox border", () => {
    const dialogueSource = readSource(
      "src/components/student/CocoDialogueBox.tsx",
    );
    const stylesSource = readSource("src/components/student/styles.ts");

    expect(dialogueSource).toContain("mascotDialogueShellStyle");
    expect(dialogueSource).toContain("mascotDialogueActionsStyle");
    expect(stylesSource).toContain("top: -46");
    expect(stylesSource).toContain("height: 48");
    expect(stylesSource).toContain('border: "2px solid #2563EB"');
    expect(stylesSource).toContain('borderBottomColor: "transparent"');
    expect(stylesSource).toContain('backgroundClip: "padding-box"');
    expect(stylesSource).not.toContain('padding: "52px 16px 8px"');
  });

  it("fluidly compacts attached dialogue controls while preserving desktop caps", () => {
    const stylesSource = readSource("src/components/student/styles.ts");
    const audioSource = readSource(
      "src/components/student/CocoSpeechAudio.tsx",
    );

    expect(stylesSource).toMatch(
      /mascotDialogueTabsStyle[\s\S]*alignItems: "flex-end"/,
    );
    expect(stylesSource).toContain(
      'height: "clamp(40px, 10vw, 48px)"',
    );
    expect(stylesSource).toContain(
      'height: "clamp(32px, 8.5vw, 38px)"',
    );
    expect(stylesSource).toContain(
      'minWidth: "clamp(64px, 17vw, 76px)"',
    );
    expect(stylesSource).toContain(
      'padding: "0 clamp(8px, 2.5vw, 12px)"',
    );
    expect(stylesSource).toContain(
      'fontSize: "clamp(13px, 3.3vw, 14px)"',
    );
    expect(stylesSource).toContain(
      'minHeight: "clamp(38px, 10vw, 44px)"',
    );
    expect(stylesSource).toContain(
      'minWidth: "clamp(38px, 10vw, 44px)"',
    );
    expect(audioSource).toMatch(
      /const buttonStyle:[\s\S]*minWidth: 44,[\s\S]*minHeight: 44/,
    );
    expect(audioSource).toMatch(
      /const dialogueTabButtonStyle:[\s\S]*minWidth: "clamp\(38px, 10vw, 44px\)"[\s\S]*minHeight: "clamp\(38px, 10vw, 44px\)"/,
    );
  });

  it("caps Coco's frame while giving the chatbox face clearance", () => {
    const stageSource = readSource("src/components/student/MascotStage.tsx");
    const stylesSource = readSource("src/components/student/styles.ts");

    expect(stageSource).toContain("SPRITE_BY_EXPRESSION");
    expect(stageSource).toContain("mascotSpriteWrapStyle");
    expect(stylesSource).toContain("height: 400");
    expect(stylesSource).toContain(
      'bottom: "calc(var(--coco-dialogue-height) - 10px)"',
    );
    expect(stylesSource).toContain("height: 180");
    expect(stylesSource).toContain(
      'left: "max(24px, calc((100% - 226px) / 2))"',
    );
    expect(stylesSource).toContain(
      'width: "min(226px, calc(100% - 48px))"',
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

  it("keeps lower conversation reply hints separate from Coco translation hints", () => {
    const questionSource = readSource(
      "src/components/student/StepBuddyQuestion.tsx",
    );
    const shellSource = readSource(
      "src/components/student/MissionFlowShell.tsx",
    );
    const dialogueSource = readSource(
      "src/components/student/CocoDialogueBox.tsx",
    );

    expect(dialogueSource).toContain("<span>한</span>");
    expect(questionSource).toContain("replyHintFrame");
    expect(questionSource).toContain('"Show hint"');
    expect(questionSource).toContain('"Hide hint"');
    expect(questionSource).toContain("Try:");
    expect(shellSource).toContain("replyHintFrame={activeQuestion.replyHintFrame}");
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

  it("uses distinct server-owned retry lines for minimal-effort answers", () => {
    const shellSource = readSource(
      "src/components/student/MissionFlowShell.tsx",
    );
    const routeSource = readSource(
      "src/app/student/missions/[assignmentStudentId]/tts/route.ts",
    );

    expect(shellSource).toContain('feedbackVariant: "retry_minimal_example"');
    expect(shellSource).toContain('feedbackVariant: "retry_minimal_detail"');
    expect(shellSource).toContain('feedbackVariant: "retry_minimal_unsure"');
    expect(shellSource).toContain(
      'text: "It\'s okay to guess. Try one answer!"',
    );
    expect(routeSource).toContain('case "retry_minimal_example":');
    expect(routeSource).toContain('case "retry_minimal_detail":');
    expect(routeSource).toContain('case "retry_minimal_unsure":');
    expect(routeSource).toContain(
      'return "It\'s okay to guess. Try one answer!"',
    );
    expect(shellSource).toContain("retryExample={flow.originalFeedback.retryExample}");
    expect(shellSource).toContain(
      "minimalEffortKind={flow.originalFeedback.minimalEffortKind}",
    );
    expect(shellSource).not.toContain("Can you say it in a full sentence?");
  });

  it("resolves improved/dynamic line lookups from the latest attempt only (multi-attempt voice regression)", () => {
    const routeSource = readSource(
      "src/app/student/missions/[assignmentStudentId]/tts/route.ts",
    );

    // A restarted/retried mission produces a second attempt whose attempt_turns
    // reuse the same turn_order values. Filtering only on the assignment-level
    // join makes .maybeSingle() error on the duplicate rows, resolving the line
    // to null → 404 → "Voice unavailable". The lookups must pin to the current
    // attempt via assignment_students.latest_attempt_id, surfaced by the
    // owned-assignment seam as latestAttemptId.
    expect(routeSource).toContain("owned.owned.latestAttemptId");
    expect(routeSource).toContain("requireOwnedAssignmentStudent");
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

  it("keeps the mascot dialogue box at a stable height without scrolling", () => {
    const stylesSource = readSource("src/components/student/styles.ts");

    // The height is responsive since 6d54e7b6 — clamp(144px, 44vw, 168px) via
    // --coco-dialogue-height — and the shell now sits flush at bottom: 0.
    // Stability means "no scrolling", not "one fixed pixel count".
    expect(stylesSource).toContain(
      '"--coco-dialogue-height": "clamp(144px, 44vw, 168px)"',
    );
    expect(stylesSource).toContain('height: "var(--coco-dialogue-height)"');
    expect(stylesSource).not.toContain('overflowY: "auto"');
    expect(stylesSource).not.toContain("minHeight: 64");
  });

  it("contains normalized mascot art and attaches it to the dialogue box", () => {
    const stageSource = readSource("src/components/student/MascotStage.tsx");
    const stylesSource = readSource("src/components/student/styles.ts");

    expect(stageSource).toContain('thinking: "coco-thinking-alpha.png"');
    expect(stageSource).toContain('sad: "coco-sad-alpha.png"');
    expect(stageSource).toContain('objectFit: "contain"');
    expect(stageSource).toContain('objectPosition: "center bottom"');
    expect(stylesSource).toContain(
      'left: "max(24px, calc((100% - 226px) / 2))"',
    );
    expect(stylesSource).toContain(
      'width: "min(226px, calc(100% - 48px))"',
    );
    // The normalized visible boundary is bottom-aligned and overlaps the
    // chatbox by 10px, so every expression meets it without a gap.
    expect(stylesSource).toContain("height: 400");
    expect(stylesSource).toContain(
      'bottom: "calc(var(--coco-dialogue-height) - 10px)"',
    );
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

  it("voices the final closing through the persisted dynamic-line descriptor", () => {
    const shellSource = readSource(
      "src/components/student/MissionFlowShell.tsx",
    );
    expect(shellSource).toMatch(
      /flow\.step === "closing"[\s\S]*lineKind: "coco_dynamic_line"[\s\S]*turnOrder: flow\.turnIndex \+ 1/,
    );
  });

  it("offers translation hints for the final closing through the persisted dynamic-line descriptor", () => {
    const shellSource = readSource(
      "src/components/student/MissionFlowShell.tsx",
    );
    expect(shellSource).toContain("getTranslationLine");
    expect(shellSource).toMatch(
      /flow\.step === "closing"[\s\S]*lineKind: "coco_dynamic_line"[\s\S]*turnOrder: flow\.turnIndex \+ 1/,
    );
    expect(shellSource).toContain("translationLine={getTranslationLine");
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
