import Image from "next/image";
import Link from "next/link";
import type { StudentMissionRecap } from "@/server/student-access/student-history";
import { buildImprovedSentenceParts } from "@/domain/student/homework-review";
import { HomeworkReviewAttempt } from "./HomeworkReviewAttempt";
import styles from "./HomeworkReview.module.css";

function CocoMessage({ children }: { children: string }) {
  return (
    <div className={styles.cocoMessage}>
      <div className={styles.cocoPortrait}>
        <Image
          src="/images/coco-happy-alpha.png"
          alt=""
          width={42}
          height={42}
        />
      </div>
      <div className={styles.cocoContent}>
        <strong className={styles.cocoName}>Coco</strong>
        <div className={styles.cocoBubble}>{children}</div>
      </div>
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
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <header className={styles.header}>
          <h1>Homework Review</h1>
          <p>Look back at your conversation with Coco.</p>
        </header>
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
                  <strong className={styles.studentName}>
                    {studentDisplayName}
                  </strong>
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
                    <HomeworkReviewAttempt attempt={turn.original} />
                  </div>
                  {turn.reviewState === "accepted_minor" &&
                  turn.improvedSentence ? (
                    <p className={styles.improvedSentence}>
                      {/*
                        A withheld transcript gives no safe basis for a word
                        diff, so the correction still shows — just unhighlighted.
                      */}
                      {buildImprovedSentenceParts(
                        turn.original.transcript ?? turn.improvedSentence,
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
                    <div className={styles.repeatAttempt}>
                      <HomeworkReviewAttempt attempt={turn.repeat} />
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
