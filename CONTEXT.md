# Coco English

Coco English gives teacher-linked speaking homework to elementary-level English learners.

## Language

**Mission snapshot**:
A copy of a mission that the application saves when the teacher assigns homework. Later mission changes do not change this copy.

**Legacy mission snapshot**:
A copy of a sample assignment that an old internal setup tool saved. It has questions and examples, but it lacks data for live homework.
_Avoid_: Legacy, old snapshot, partial snapshot, old saved copy

**Mission flow**:
The live student process from the start or resume of homework to its completion. The student recap and teacher evidence are separate.

**Preset mission**:
A mission with an authored sequence of questions, examples, and hints.

**Multi-pattern mission**:
A preset mission whose authored turns collectively practice more than one target pattern.

**Target pattern**:
The English sentence frame a student is expected to use when answering one authored turn.
_Avoid_: Mission pattern, lesson pattern

**Conversation context pattern**:
The English lesson frame that softly grounds a conversation mission without becoming a per-turn requirement.
_Avoid_: Target pattern

**Conversation mission**:
A bounded free conversation with an authored opening question and generated follow-up questions.

**Active question**:
The question that a student answers in the current speaking try. A preset mission uses an authored turn; a conversation mission uses its opening, a generated follow-up question, or a recovery question.
_Avoid_: Current prompt

**Student recap**:
The student page that follows completed homework. It shows the latest homework attempt and provides the Back Home action.
_Avoid_: Mission flow, teacher evidence

**Teacher evidence**:
The teacher view of a homework attempt, including transcripts and available audio.
_Avoid_: Submission review, attempt evidence

**Assigned homework**:
One student's obligation created by an assignment. It has an overall lifecycle and may contain one or more homework attempts.
_Avoid_: Assignment student

**Homework attempt**:
One student run of assigned homework, from its start to its completion.

**Speaking try**:
One original or repeated spoken answer to a question in a homework attempt.
_Avoid_: Homework attempt

**Pronunciation reprocessing**:
A teacher-triggered operation that creates a missing pronunciation assessment for an existing audio clip without replacing an existing score. Only one operation can be active for a clip, and a teacher can retry after a failure.
_Avoid_: Rescore, rescoring

**Teacher-added pronunciation sample**:
A recording of one existing student that their teacher adds outside assigned homework as evidence for the student's pronunciation profile.
_Avoid_: Legacy audio, imported recording, uploaded audio

**Student pronunciation profile**:
A teacher-facing summary of sounds an existing student repeatedly struggles with, based on confirmed pronunciation evidence from speaking tries and teacher-added pronunciation samples.
_Avoid_: Weak sounds part

**Sound confusion candidate**:
A provider-ranked sound that a weak expected sound may have resembled. It is supporting evidence for a student's pronunciation profile, not a definitive statement of what the student said.
_Avoid_: Sound substitution, pronunciation diagnosis

**Automatic transcript**:
The text speech recognition originally produces for a speaking try or teacher-added pronunciation sample. It remains the original speech evidence even when a teacher later clarifies the intended wording.
_Avoid_: AI transcript, editable transcript

**Teacher-confirmed wording**:
A teacher's optional clarification of what a student was trying to say, used as the pronunciation reference without replacing the automatic transcript or changing mission evaluation.
_Avoid_: Edited transcript, corrected transcript
