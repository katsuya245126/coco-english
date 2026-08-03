import { redirect } from "next/navigation";
import { readStudentUnlock } from "@/app/join/actions";
import { PRACTICE_SOUNDS } from "@/domain/pronunciation/practice";
import {
  bodyStyle,
  displayTitleStyle,
  missionContentStyle,
  missionPageStyle,
  stepCardStyle,
} from "@/components/student/styles";
import { getPronunciationPracticePage } from "@/server/student-access/pronunciation-flow";

type PronunciationPageProps = {
  params: Promise<{ assignmentStudentId: string }>;
};

export default async function PronunciationPage({ params }: PronunciationPageProps) {
  const unlock = await readStudentUnlock();
  if (!unlock) redirect("/join");

  const { assignmentStudentId } = await params;
  const result = await getPronunciationPracticePage({
    studentId: unlock.studentId,
    assignmentStudentId,
  });
  if (!result.ok) redirect("/student/home");

  const page = result.page;
  const sound = PRACTICE_SOUNDS[page.soundId];
  const progress = Math.round((page.finishedWordCount / page.words.length) * 100);

  return (
    <main style={missionPageStyle}>
      <div style={missionContentStyle}>
        <section style={stepCardStyle}>
          <p style={bodyStyle}>{sound.label} · {page.difficulty}</p>
          <h1 style={displayTitleStyle}>{page.title}</h1>
          <p aria-label={`${page.finishedWordCount} of ${page.words.length} words completed`} style={bodyStyle}>
            Word {page.currentWordOrder ?? page.words.length} of {page.words.length} · {progress}% complete
          </p>
          <ol>
            {page.words.map((word) => (
              <li key={word.order} data-current={word.order === page.currentWordOrder || undefined}>
                <strong>{word.text}</strong>{" "}
                <span>{word.finished ? "Finished" : `${word.remainingTryCount} tries remaining`}</span>
              </li>
            ))}
          </ol>
          <p style={bodyStyle}>
            {page.readOnly ? "Practice complete. Your teacher can review it." : "Record each word when you are ready."}
          </p>
        </section>
      </div>
    </main>
  );
}
