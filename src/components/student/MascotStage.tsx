"use client";

/**
 * Persistent VN-style mascot stage (MASCOT-01..04, D-01..D-07).
 *
 * Renders Coco as decorative character presence above the mission step card.
 * Expression comes from existing mission-flow state; speaking motion is a
 * lightweight amplitude pulse over the current sprite. Performance fallback is
 * silent: only the animation degrades, never the homework flow.
 */

import Image from "next/image";
import type { ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  deriveExpression,
  type MascotExpression,
} from "@/domain/character/expression";
import {
  updateSpeakingVisual,
  type SpeakingHysteresisState,
} from "@/domain/character/mascot-speaking-state";
import {
  DEGRADE_SAMPLE_SIZE,
  shouldDegrade,
} from "@/domain/character/mascot-perf-degrade";
import {
  mascotBackdropStyle,
  mascotSpriteWrapStyle,
  mascotStageStyle,
} from "@/components/student/styles";
import type { TranslatableCocoLine } from "@/domain/ai/translation-hint";
import { CocoDialogueBox } from "@/components/student/CocoDialogueBox";

type ExpressionInput = Parameters<typeof deriveExpression>[0];

type MascotStageProps = ExpressionInput & {
  assignmentStudentId: string;
  displayName: string;
  dialogueText?: string | null;
  voiceControl?: ReactNode;
  translationLine?: TranslatableCocoLine | null;
  playing: boolean;
  /** Ref updated by MissionFlowShell from CocoSpeechAudio.onAmplitudeFrame. */
  amplitudeRef: RefObject<number>;
  expression?: MascotExpression;
};

const SPRITE_BY_EXPRESSION: Record<MascotExpression, string> = {
  idle: "coco-neutral-alpha.png",
  happy: "coco-happy-alpha.png",
  celebrate: "coco-celebrate-alpha.png",
  encouraging: "coco-encouraging-alpha.png",
  thinking: "coco-thinking-alpha.png",
  sad: "coco-sad-alpha.png",
};

const INITIAL_SPEAKING_STATE: SpeakingHysteresisState = {
  lastAboveThresholdAt: Number.NEGATIVE_INFINITY,
  isSpeakingVisually: false,
};

export function MascotStage({
  assignmentStudentId,
  displayName,
  dialogueText,
  voiceControl,
  translationLine,
  playing,
  amplitudeRef,
  expression,
  step,
  originalFeedbackKind,
  repeatFeedbackKind,
}: MascotStageProps) {
  const [scale, setScale] = useState(1);
  const [degraded, setDegraded] = useState(false);
  const speakingStateRef = useRef<SpeakingHysteresisState>(
    INITIAL_SPEAKING_STATE,
  );
  const frameDeltasRef = useRef<number[]>([]);
  const lastFrameAtRef = useRef<number | null>(null);

  const activeExpression = useMemo(
    () =>
      expression ??
      deriveExpression({ step, originalFeedbackKind, repeatFeedbackKind }),
    [expression, step, originalFeedbackKind, repeatFeedbackKind],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDegraded(true);
    }
  }, []);

  useEffect(() => {
    if (degraded || !playing) {
      setScale(1);
      speakingStateRef.current = INITIAL_SPEAKING_STATE;
      frameDeltasRef.current = [];
      lastFrameAtRef.current = null;
      return;
    }

    let frameId: number | null = null;
    let cancelled = false;

    function tick(now: number) {
      const previousFrameAt = lastFrameAtRef.current;
      if (previousFrameAt !== null) {
        const nextDeltas = [...frameDeltasRef.current, now - previousFrameAt];
        frameDeltasRef.current = nextDeltas.slice(-DEGRADE_SAMPLE_SIZE);
        if (shouldDegrade(frameDeltasRef.current)) {
          setDegraded(true);
          setScale(1);
          return;
        }
      }
      lastFrameAtRef.current = now;

      const amplitude = Math.max(0, Math.min(1, amplitudeRef.current ?? 0));
      const nextSpeakingState = updateSpeakingVisual(
        amplitude,
        now,
        speakingStateRef.current,
      );
      speakingStateRef.current = nextSpeakingState;

      setScale(
        nextSpeakingState.isSpeakingVisually ? 1 + Math.min(amplitude, 0.6) * 0.06 : 1,
      );

      if (!cancelled) {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    frameId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [amplitudeRef, degraded, playing]);

  const spriteFile = SPRITE_BY_EXPRESSION[activeExpression];

  return (
    <div style={mascotStageStyle}>
      <div style={mascotBackdropStyle} />
      <div
        style={{
          ...mascotSpriteWrapStyle,
          transform: `scale(${scale})`,
        }}
      >
        <Image
          src={`/images/${spriteFile}`}
          alt=""
          fill
          priority
          sizes="(max-width: 420px) 100vw, 420px"
          style={{ objectFit: "cover", objectPosition: "center 12%" }}
        />
      </div>
      <CocoDialogueBox
        assignmentStudentId={assignmentStudentId}
        displayName={displayName}
        dialogueText={dialogueText}
        voiceControl={voiceControl}
        translationLine={translationLine}
      />
    </div>
  );
}
