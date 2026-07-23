import Image from "next/image";
import Link from "next/link";
import type {
  StudentMissionRecap,
  StudentRecapAttempt,
} from "@/server/student-access/student-history";
import { buildImprovedSentenceParts } from "@/domain/student/homework-review";
import { StudentHistoryAudioPlayer } from "./StudentHistoryAudioPlayer";
import styles from "./HomeworkReview.module.css";

function AttemptEvidence({ attempt }: { attempt: StudentRecapAttempt }) {
  return (
    <>
      {attempt.audio?.playback === "available" ? (
        <StudentHistoryAudioPlayer audioClipId={attempt.audio.id} />
      ) : attempt.audio?.playback === "expired" ? (
        <p className={styles.muted}>Recording expired</p>
      ) : attempt.audio ? (
        <p className={styles.muted}>Recording unavailable</p>
      ) : null}
      {attempt.pronunciation ? (
        <div className={styles.pronunciation}>
          <strong>
            {"★".repeat(attempt.pronunciation.starBand)} Pronunciation
          </strong>
          <p>
            {attempt.pronunciation.words.length
              ? `Words to practice: ${attempt.pronunciation.words
                  .map((word) => word.word)
                  .join(" · ")}`
              : "Great job!"}
          </p>
        </div>
      ) : null}
    </>
  );
}

function CocoMessage({ children }: { children: string }) {
  return (
    <div className={styles.cocoMessage}>
      <div className={styles.identity}>
        <Image
          src="/images/coco-happy-alpha.png"
          alt=""
          width={36}
          height={36}
        />
        <strong>Coco</strong>
      </div>
      <div className={styles.cocoBubble}>{children}</div>
    </div>
  );
}

export function HomeworkReview({
  recap,
  studentDisplayName,
}: {
  recap: StudentMissionRecap;
  studentDisplayName: string;
}) {
  const initial =
    studentDisplayName.trim().slice(0, 1).toLocaleUpperCase("en-US") || "S";

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <h1>Homework Review</h1>
        <div className={styles.messages}>
          {recap.turns.map((turn) => {
            const showGoodJob =
              turn.reviewState === "accepted" ||
              turn.reviewState === "accepted_minor" ||
              turn.reviewState === "repeat_accepted";
            return (
              <div className={styles.exchange} key={turn.id}>
                <CocoMessage>{turn.cocoPrompt}</CocoMessage>
                <div className={styles.studentMessage}>
                  <div className={styles.studentIdentity}>
                    <strong>{studentDisplayName}</strong>
                    <span aria-hidden="true">{initial}</span>
                  </div>
                  <div className={styles.attemptRow}>
                    {turn.reviewState === "repeat_accepted" ? (
                      <span className={styles.retryMark} aria-hidden="true">
                        !
                      </span>
                    ) : null}
                    {turn.reviewState === "repeat_accepted" ? (
                      <span className={styles.srOnly}>
                        This answer needed another try.
                      </span>
                    ) : null}
                    <div className={styles.studentBubble}>
                      <p>{turn.original.transcript}</p>
                      <AttemptEvidence attempt={turn.original} />
                    </div>
                  </div>
                  {turn.reviewState === "accepted_minor" &&
                  turn.improvedSentence ? (
                    <p className={styles.improvedSentence}>
                      {buildImprovedSentenceParts(
                        turn.original.transcript,
                        turn.improvedSentence,
                      ).map((part, index) => (
                        <span
                          className={part.changed ? styles.changedWord : undefined}
                          key={`${turn.id}-part-${index}`}
                        >
                          {part.text}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {turn.repeat ? (
                    <div className={styles.studentBubble}>
                      <p>{turn.repeat.transcript}</p>
                      <AttemptEvidence attempt={turn.repeat} />
                    </div>
                  ) : null}
                  {showGoodJob ? (
                    <p className={styles.goodJob}>✓ Good job!</p>
                  ) : null}
                </div>
              </div>
            );
          })}
          {recap.finalCocoLine ? (
            <CocoMessage>{recap.finalCocoLine}</CocoMessage>
          ) : null}
        </div>
        <Link className={styles.backButton} href="/student/home">
          Back to homework
        </Link>
      </section>
    </main>
  );
}
