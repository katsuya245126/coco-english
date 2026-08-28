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
