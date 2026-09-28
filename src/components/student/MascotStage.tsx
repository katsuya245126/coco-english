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
  mascotPictureBackButtonStyle,
  mascotPictureFailureActionsStyle,
  mascotPictureFailureStyle,
  mascotPictureFailureTextStyle,
  mascotPictureImageStyle,
  mascotPictureRetryButtonStyle,
  mascotPictureSceneStyle,
  mascotPictureVisualStyle,
  mascotSceneStyle,
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
  isThinking?: boolean;
  playing: boolean;
  /** Ref updated by MissionFlowShell from CocoSpeechAudio.onAmplitudeFrame. */
  amplitudeRef: RefObject<number>;
  expression?: MascotExpression;
  picture?: { src: string; alt: string } | null;
  onPictureReady?: (ready: boolean) => void;
  onBackToHomework?: () => void;
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

type PictureLoadState = {
  src: string;
  status: "loading" | "ready" | "error";
  requestKey: number;
};

function pictureRequestSrc(src: string, requestKey: number): string {
  return `${src}${src.includes("?") ? "&" : "?"}retry=${requestKey}`;
}

export function MascotStage({
  assignmentStudentId,
  displayName,
  dialogueText,
  voiceControl,
  translationLine,
  isThinking,
  playing,
  amplitudeRef,
  expression,
  picture = null,
  onPictureReady,
  onBackToHomework,
  step,
  originalFeedbackKind,
  repeatFeedbackKind,
}: MascotStageProps) {
  const [scale, setScale] = useState(1);
  const [degraded, setDegraded] = useState(false);
  const [pictureLoadState, setPictureLoadState] = useState<PictureLoadState | null>(
    picture
      ? { src: picture.src, status: "loading", requestKey: 0 }
      : null,
  );
  const speakingStateRef = useRef<SpeakingHysteresisState>(
    INITIAL_SPEAKING_STATE,
  );
  const frameDeltasRef = useRef<number[]>([]);
  const lastFrameAtRef = useRef<number | null>(null);
  const pictureImageRef = useRef<HTMLImageElement | null>(null);

  const activeExpression = useMemo(
    () =>
      expression ??
      deriveExpression({ step, originalFeedbackKind, repeatFeedbackKind }),
    [expression, step, originalFeedbackKind, repeatFeedbackKind],
  );

  const pictureSrc = picture?.src ?? null;
  const currentPictureState =
    picture && pictureLoadState?.src === picture.src
      ? pictureLoadState
      : picture
        ? { src: picture.src, status: "loading" as const, requestKey: 0 }
        : null;
  const pictureRequestKey = currentPictureState?.requestKey ?? 0;
  const pictureFailed = currentPictureState?.status === "error";

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

  useEffect(() => {
    if (!pictureSrc) {
      setPictureLoadState(null);
      onPictureReady?.(true);
      return;
    }

    setPictureLoadState((current) => ({
      src: pictureSrc,
      status: "loading",
      requestKey: current?.src === pictureSrc ? current.requestKey : 0,
    }));
    onPictureReady?.(false);
  }, [onPictureReady, pictureSrc]);

  useEffect(() => {
    if (!pictureSrc || pictureFailed) return;

    const image = pictureImageRef.current;
    if (!image?.complete) return;

    if (image.naturalWidth > 0) {
      setPictureLoadState((current) =>
        current?.src === pictureSrc
          ? { ...current, status: "ready" }
          : { src: pictureSrc, status: "ready", requestKey: pictureRequestKey },
      );
      onPictureReady?.(true);
      return;
    }

    setPictureLoadState((current) =>
      current?.src === pictureSrc
        ? { ...current, status: "error" }
        : { src: pictureSrc, status: "error", requestKey: pictureRequestKey },
    );
    onPictureReady?.(false);
  }, [onPictureReady, pictureFailed, pictureRequestKey, pictureSrc]);

  const pictureActiveExpression = pictureFailed
    ? "thinking"
    : picture && step === "question" && expression === undefined
      ? "encouraging"
      : activeExpression;
  const spriteFile = SPRITE_BY_EXPRESSION[pictureActiveExpression];

  function handlePictureLoad() {
    if (!picture) return;
    setPictureLoadState((current) =>
      current?.src === picture.src
        ? { ...current, status: "ready" }
        : current,
    );
    onPictureReady?.(true);
  }

  function handlePictureError() {
    if (!picture) return;
    setPictureLoadState((current) =>
      current?.src === picture.src
        ? { ...current, status: "error" }
        : { src: picture.src, status: "error", requestKey: 0 },
    );
    onPictureReady?.(false);
  }

  function retryPicture() {
    if (!picture) return;
    setPictureLoadState((current) => ({
      src: picture.src,
      status: "loading",
      requestKey: (current?.requestKey ?? 0) + 1,
    }));
    onPictureReady?.(false);
  }

  return (
    <div style={mascotStageStyle} data-picture-stage={picture ? "true" : "false"}>
      <div style={picture ? mascotPictureSceneStyle : mascotSceneStyle}>
        {picture ? (
          <div style={mascotPictureVisualStyle} data-picture-region="true">
            {pictureFailed ? (
              <div style={mascotPictureFailureStyle} role="alert">
                <div>
                  <p style={mascotPictureFailureTextStyle}>
                    The picture couldn&apos;t load.
                  </p>
                  <div style={mascotPictureFailureActionsStyle}>
                    <button
                      type="button"
                      aria-label="Retry picture"
                      style={mascotPictureRetryButtonStyle}
                      onClick={retryPicture}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      style={mascotPictureBackButtonStyle}
                      onClick={onBackToHomework}
                    >
                      Back to homework
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <img
                key={`${picture.src}-${currentPictureState?.requestKey ?? 0}`}
                ref={pictureImageRef}
                src={pictureRequestSrc(
                  picture.src,
                  currentPictureState?.requestKey ?? 0,
                )}
                alt={picture.alt}
                data-picture-image="true"
                onLoad={handlePictureLoad}
                onError={handlePictureError}
                style={mascotPictureImageStyle}
              />
            )}
          </div>
        ) : (
          <>
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
                sizes="330px"
                style={{ objectFit: "contain", objectPosition: "center bottom" }}
              />
            </div>
          </>
        )}
      </div>
      <CocoDialogueBox
        assignmentStudentId={assignmentStudentId}
        displayName={displayName}
        dialogueText={dialogueText}
        voiceControl={voiceControl}
        translationLine={translationLine}
        isThinking={isThinking}
        compactSpriteSrc={picture ? `/images/${spriteFile}` : null}
      />
    </div>
  );
}
