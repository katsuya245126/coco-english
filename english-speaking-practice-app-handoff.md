# Handoff: Teacher-Linked AI Speaking Practice App

## Context
The user teaches an English speaking class for elementary-level ESL learners, especially Korean/general ESL students. The core problem is that students speak English only during class and almost never practice outside class, so they do not get enough speaking reps to improve.

The original idea was a visual-novel/anime-classroom style app where learners speak English with characters and characters respond based on what the student says. Through discussion, the stronger product wedge became teacher-linked speaking homework: after class, the teacher assigns a short AI speaking mission based on what students learned that day.

## Product Direction
Recommended framing:

> A teacher-linked AI speaking homework app where students practice today’s target English in a short, low-pressure conversation, and the teacher can check completion and transcripts.

The visual novel/class character layer is still valuable, but should be treated as an engagement layer rather than the first core product. The MVP should focus on teacher-created or AI-generated speaking missions tied to class content.

## Key Decisions So Far
- Target users: elementary-level ESL learners, initially Korean ESL but applicable to general ESL.
- Core problem: lack of spoken English practice outside class.
- Preferred mission creation priority:
  1. Teacher enters today’s target sentence and AI generates the mission.
  2. Teacher can manually edit or create practice.
  3. Later, provide prebuilt textbook/unit missions.
- Student experience:
  - Student completes a 2-3 minute speaking mission after class.
  - Bot asks a question using today’s target language.
  - Student answers by speaking.
  - Bot responds positively if meaning is understandable.
  - App shows a better target-form version.
  - Student repeats the improved sentence.
  - Bot asks follow-up questions.
  - Student earns a completion check.
- Correction style:
  - Balanced, not strict.
  - Accept meaning first.
  - Then show the better version and make the student say it too.
  - Avoid harsh failure language.
- Hints:
  - Hidden by default.
  - Student can click to reveal.
  - Progressive hint ladder:
    1. Target pattern, e.g. `I’m going to _____.`
    2. Word bank.
    3. Full example sentence.
  - Teacher can see hint usage quietly.
- Default mission length:
  - Start with 2-3 minutes.
  - Around 3 speaking turns, with correction/repeat included.
  - Length and difficulty should be separate controls.
- Bot persona:
  - User chose “class character”: anime/classmate style, more fun and story-like.
  - No romance/dating mechanics.
  - Motivation should come from friendship, classroom missions, story progress, and completion.

## Example Mission
Teacher input:
- Target: `I’m going to ___`
- Topic: weekend plans
- Level: elementary beginner
- Required turns: 3

Student flow:
1. Bot: “What are you going to do this weekend?”
2. Student: “I go soccer.”
3. Bot: “Good, soccer sounds fun!”
4. App: “Try today’s English: I’m going to play soccer.”
5. Student repeats: “I’m going to play soccer.”
6. Bot: “Nice! Who are you going with?”
7. Student answers.
8. Bot asks one more simple follow-up.
9. Mission complete.

## Teacher View
Teacher should see:
- Completed / not completed.
- Attempt count.
- Transcript.
- Original answer.
- Improved target sentence.
- Repeat attempt.
- Whether target pattern was used.
- Hint level used.
- Review status such as Complete, Needs retry, Teacher review.

Avoid numerical scoring initially. Use completion and simple review states.

## Product Thesis
This is a good idea because it addresses a real classroom behavior gap: students need more spoken output outside class. A teacher-linked speaking mission is easier to validate than a full visual novel and has a clearer buyer/user loop. The story/character layer can later make the practice more motivating.

The main risk is open-ended AI conversation. The recommended mitigation is guided freedom: students can speak naturally, but missions are structured around teacher-provided target language, small follow-up sets, and concrete pass rules.

## Next Discussion Point
Continue after the user selected bot persona option 2: class character.

Suggested next question:

> For the class-character style, should students talk to one recurring character, a small cast of classmates, or a mission-specific character each time?

Options:
1. One recurring buddy character: easier emotional attachment and simpler MVP.
2. Small classroom cast: more variety and closer to visual novel feel.
3. Mission-specific characters: flexible, but less memorable.

## Suggested Skills
- `superpowers:brainstorming`: continue product/design discussion before implementation.
- `gsd-sketch`: later, create throwaway HTML sketches comparing teacher mission creation, student speaking flow, and teacher dashboard.
- `handoff`: use again if the conversation needs to be summarized for another session.
