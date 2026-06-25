# English Speaking Practice App MVP Spec

## Product Summary

This app is a teacher-linked AI speaking homework tool for elementary-level ESL learners.

Teachers assign short speaking missions based on the English target language taught in class. Students complete the mission after class by speaking with a recurring supportive classmate character. Teachers can then check who completed the homework, who missed it, and what each student said.

The MVP should prove the core homework loop before investing heavily in visual novel systems or large character casts.

## Core Users

### Teacher

The teacher creates classes, adds students, assigns speaking homework, and reviews completion.

Teacher goals:

- Assign practice quickly after class.
- Tie homework to today's target English.
- See who completed, missed, or needs retry.
- Review transcripts and audio only when needed.

### Student

The student completes a short speaking mission after class.

Student goals:

- Start homework with minimal login friction.
- Practice the target English by speaking.
- Receive friendly correction.
- Complete the task without feeling punished for imperfect English.

## Access Model

### Teacher Login

Teachers use email and password login.

Teacher accounts can:

- Create classes.
- Manage class rosters.
- Create or generate missions.
- Assign missions to classes.
- Review student completion and attempts.

### Student Login

Students should not need email/password accounts in the MVP.

First-time flow:

1. Student opens a class QR link or enters a class code.
2. App remembers the class on that device.
3. Student selects their name from the roster.
4. Student enters a 4-digit PIN.
5. Student sees assigned homework.

Returning flow:

1. App shows the remembered class.
2. Student selects their name.
3. Student enters their 4-digit PIN.
4. Student sees assigned homework.

This keeps setup simple for elementary learners while still tracking individual homework.

## Mission Creation

The primary mission creation flow is teacher-assisted AI generation.

Teacher inputs:

- Target sentence or pattern, such as `I'm going to _____.`
- Topic, such as weekend plans.
- Level, such as elementary beginner.
- Required speaking turns, defaulting to 3.
- Due date.

AI generates:

- Opening question.
- Follow-up questions.
- Expected target-form examples.
- Optional hints.

Teachers should be able to edit the generated mission before assigning it.

Manual mission creation can exist as a secondary path, but the MVP should prioritize fast mission generation from a target sentence.

## Student Mission Flow

Default mission length is 2-3 minutes with about 3 speaking turns.

Flow:

1. Student starts assigned mission.
2. The recurring buddy asks a simple question.
3. Student answers by voice.
4. App transcribes the answer.
5. AI checks whether the meaning is understandable and whether the target pattern was attempted.
6. Buddy responds positively first.
7. App shows a better target-form sentence.
8. Student repeats the improved sentence by voice.
9. App transcribes and checks the repeat attempt.
10. Buddy asks the next follow-up.
11. After the required turns are complete, the mission is marked complete.

Correction rule:

- Accept understandable meaning first.
- Then show a better target-form version.
- Require the student to repeat the improved sentence.
- Avoid harsh failure language.

Example:

- Target: `I'm going to _____.`
- Bot: "What are you going to do this weekend?"
- Student: "I go soccer."
- Buddy: "Good, soccer sounds fun!"
- App: "Try today's English: I'm going to play soccer."
- Student repeats: "I'm going to play soccer."

## Hint System

Hints are hidden by default and revealed only when the student asks.

Progressive hint ladder:

1. Target pattern, such as `I'm going to _____.`
2. Word bank.
3. Full example sentence.

Teacher review should show the highest hint level used, but hints should not be treated as a failure. Hint usage is context for the teacher.

## Character Layer

The MVP uses one recurring supportive classmate buddy.

The character is a tone and engagement layer, not the core mission logic.

Character behavior:

- Friendly.
- Simple.
- Encouraging.
- Classroom-safe.
- No romance or dating mechanics.
- No harsh correction.
- No complex jokes.
- No long off-topic chatting.

Missions should store a `characterId` even though the MVP has only one default character. This keeps the design open to later changes without building a full character system now.

Possible future character expansions:

- Small classroom cast.
- Seasonal characters.
- Story missions.
- Mission-specific characters.

## Homework Tracking

Each assigned mission should track status per student.

Statuses:

- `assigned`: homework is available but not started.
- `started`: student began but has not completed.
- `completed`: mission finished.
- `missed`: due date passed without completion.
- `needs_retry`: student attempted but did not complete required repeat or target-pattern work.
- `teacher_review`: app could not confidently classify the attempt.

Teacher dashboard buckets:

- Completed.
- Not started.
- Missed.
- Needs retry.
- Teacher review.

Missed homework is determined by due date plus incomplete status.

## Teacher Review

Teacher review should be fast to scan.

Class assignment view:

- Student name.
- Status.
- Attempt count.
- Submitted time.
- Highest hint level used.
- Review flag if needed.

Attempt detail view:

- Original student answer transcript.
- Improved target-form sentence.
- Repeat attempt transcript.
- Whether the target pattern was used.
- Hint usage.
- Attempt count.
- Short audio clips per speaking turn.

The review experience is transcript-first and audio-available. Teachers should not need to listen to every recording, but they can play short clips to verify speaking, pronunciation, or effort.

## Audio Handling

The MVP should store short audio clips per speaking turn rather than one long session recording.

Audio should be attached to:

- Original answer.
- Repeat attempt.

Audio is useful because this is a speaking-oriented product, but it should not become the main teacher workload.

Recommended retention:

- Keep audio for a limited window, such as 30 or 60 days.
- Keep transcripts and completion records longer.

The exact retention period can be configured later based on privacy, cost, and school requirements.

## AI Evaluation Rules

The AI should evaluate student speech using guided freedom.

It should check:

- Is the answer understandable?
- Did the student attempt the target pattern?
- Can the answer be improved into the target form?
- Did the student repeat the improved sentence closely enough?

It should not:

- Fail students for small grammar errors when meaning is clear.
- Produce long explanations.
- Drift into open-ended chatting.
- Replace the teacher's target language with unrelated goals.

## MVP Success Criteria

The MVP succeeds if:

- A teacher can create a class and roster.
- A teacher can generate and assign a speaking mission from a target sentence.
- A student can access homework without email/password login.
- A student can complete a 2-3 minute speaking mission by voice.
- The app captures transcript and short audio clips.
- The teacher can see completed, missed, needs retry, and review states.
- The teacher can open an attempt and review transcript-first details.

## Explicit Non-Goals For MVP

The MVP should not include:

- Full visual novel story system.
- Large character cast.
- Romance or dating mechanics.
- Student email/password account management.
- Numerical grading.
- Long-form free chat.
- Parent accounts.

These can be considered after the teacher-linked speaking homework loop is validated.
