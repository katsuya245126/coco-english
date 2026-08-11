# Deepen Mission Snapshot Interpretation

## Problem Statement

The application saves a mission snapshot when a teacher assigns homework. Different features currently read that snapshot in different ways.

Some features require every current field. Some past-work features accept incomplete data. Live homework resume reads only one field and uses a fallback value.

As a result, the same saved assignment can have different meanings in different features. Broken data can also reach live state changes or paid speech work.

The repository also contains one exact sample format from a removed internal setup tool. This format has useful past-work data, but it lacks data for live homework.

## Solution

Add one shared mission snapshot interpreter. It classifies each saved snapshot as `complete`, `legacy`, or `invalid`.

A complete snapshot can run live homework and supply past-work data. A legacy mission snapshot can supply past-work data only. Invalid data cannot run live homework or start paid work.

Student and teacher features use only the interpreter result that applies to their work. Teacher evidence keeps available transcripts and recordings when snapshot data is invalid.

## User Stories

1. As a teacher, I want assigned homework to keep its original mission content, so that later mission changes do not change student work.
2. As a teacher, I want to see the questions from a valid legacy mission snapshot, so that known sample records remain understandable.
3. As a teacher, I want to see example answers from a valid legacy mission snapshot, so that I can understand the assigned work.
4. As a teacher, I want a missing target pattern to stay absent, so that the application does not create false mission data.
5. As a teacher, I want stored transcripts to remain available when a snapshot is invalid, so that snapshot damage does not erase student evidence.
6. As a teacher, I want stored recordings to remain available when a snapshot is invalid, so that I can still review the student speech.
7. As a teacher, I want missing mission questions to stay absent from invalid evidence, so that the application does not display invented context.
8. As a student, I want live homework to use a complete mission snapshot, so that every question, hint, and rule is available.
9. As a student, I want invalid homework to stop before an attempt starts, so that the application does not create unusable work.
10. As a student, I want invalid homework to stop before an attempt resumes, so that the application does not continue with the wrong turn count.
11. As a student, I want completed sample homework to appear in the Past list, so that I can open its available recap.
12. As a student, I want unfinished sample homework to stay out of the current list, so that I cannot start unsupported homework.
13. As a student, I want a sample recap to show known questions and speaking tries, so that I can review available work.
14. As a student, I want the sample recap to omit a missing target pattern, so that the recap shows known data only.
15. As a student, I want the recap to show my latest homework attempt, so that I see the work that I completed most recently.
16. As a student, I want the recap to show original and repeated speaking tries, so that I can compare my answers.
17. As a student, I want the current not-found behavior for invalid recaps, so that I do not see an incomplete or confusing recap.
18. As a student, I want complete older snapshots to keep their historical defaults, so that valid assigned homework remains usable.
19. As a student, I want a preset mission to keep its authored questions, examples, and hints, so that preset behavior does not change.
20. As a student, I want a conversation mission to keep its opening and generated follow-up behavior, so that conversation behavior does not change.
21. As a student, I want speech requests to stop when the snapshot is invalid, so that the application does not speak unsupported mission content.
22. As a student, I want translation requests to stop when the snapshot is invalid, so that the application does not translate unsupported mission content.
23. As a system owner, I want one snapshot meaning across all features, so that a caller does not create its own compatibility rules.
24. As a system owner, I want paid work to require a complete snapshot, so that invalid assignments do not consume provider budget.
25. As a system owner, I want unknown incomplete formats to be invalid, so that narrow compatibility does not become permissive parsing.
26. As a system owner, I want broken legacy questions to invalidate the legacy result, so that partial sample data does not appear valid.
27. As a system owner, I want complete older snapshots to use recorded historical defaults, so that the interpreter does not invent new behavior.
28. As a developer, I want one tagged interpreter result, so that each feature must select `complete`, `legacy`, or `invalid` explicitly.
29. As a developer, I want tests at the shared interpreter seam, so that all supported snapshot formats have one contract.
30. As a developer, I want feature-boundary tests for state changes and paid work, so that a parser test cannot hide an unsafe caller.

## Implementation Decisions

- The mission domain owns one shared snapshot interpreter.
- The interpreter returns one tagged result: `complete`, `legacy`, or `invalid`.
- A complete result contains all data that live homework needs.
- A complete older snapshot uses the historical schema defaults for absent newer settings.
- An absent conversation setting means a preset mission.
- An absent complete-sentence setting keeps the historical requirement for complete sentences.
- An absent answer-shape setting keeps the historical open-answer behavior.
- Old retired fields can be ignored because they do not change current mission meaning.
- A legacy result accepts only the exact format from the removed internal setup tool.
- The legacy format contains the mission title, character, required turn count, ordered questions, and example answers.
- The legacy format uses the old question-order field. The interpreter converts that field to the current turn-order meaning.
- The legacy format does not receive a target pattern, level, hint ladder, or other invented mission content.
- A legacy question must contain its order, prompt, and example answer. A broken question makes the snapshot invalid.
- Unknown partial data is invalid, even when one feature can read some fields.
- Only a complete result can load, start, resume, evaluate, speak, or translate live homework.
- Live state changes must stop before attempt or assignment data changes when the result is not complete.
- Paid, cached, or provider speech and translation work must stop when the result is not complete.
- The audio evaluation path keeps its current complete-snapshot requirement and budget order.
- The student current-homework list accepts complete results only.
- The student Past list accepts complete and legacy results.
- A completed legacy item stays visible in the Past list and opens its available student recap.
- An unfinished legacy item stays hidden from the current-homework list.
- The student recap remains the page after completed homework. It shows the latest homework attempt.
- The student recap can show the original and repeated speaking tries for each question.
- A legacy recap shows known questions and speaking tries. It omits the missing target pattern.
- Invalid data keeps the current student-recap not-found behavior.
- Teacher evidence for a completed attempt accepts complete and legacy questions.
- Teacher evidence keeps transcripts, evaluations, pronunciation data, and recordings when snapshot data is invalid.
- Invalid teacher evidence does not use an untrusted conversation setting or create missing questions.
- The teacher view for an assignment without an attempt accepts complete and legacy assigned-work data.
- A valid legacy teacher view shows its title, questions, and example answers. It omits unavailable fields.
- The assignment operation remains the only normal creator of mission snapshots.
- A later mission edit does not change a stored assignment snapshot. A later assignment receives a new snapshot.
- No database migration is planned.
- No new dependency is planned.
- The implementation uses existing feature entry points. It does not add a test-only interface.

## Testing Decisions

- Tests observe interpreter results and feature behavior. They do not assert private helper order or internal implementation details.
- The primary seam is the shared mission snapshot interpreter.
- Interpreter tests cover a current preset mission, a current conversation mission, and complete older snapshots with historical defaults.
- Interpreter tests cover the exact legacy format and conversion of its question-order field.
- Interpreter tests cover missing legacy question data, unknown partial data, and malformed data as invalid.
- Existing mission-domain schema tests provide prior art for complete preset, conversation, default, and retired-field behavior.
- Existing student mission service tests provide prior art for start, resume, completion, and state-transition behavior.
- Boundary tests prove that invalid data cannot start or resume a homework attempt.
- Existing audio service tests provide prior art for checks that occur before storage, provider budget, transcription, evaluation, and generation.
- Boundary tests prove that invalid data cannot start paid or cached speech and translation work.
- Existing assignment-list tests provide prior art for current and Past list behavior.
- Boundary tests prove that completed legacy homework appears in the Past list and unfinished legacy homework stays out of the current list.
- Existing student-history tests provide prior art for the latest homework attempt, question mapping, original speaking tries, and repeated speaking tries.
- Boundary tests prove that a legacy recap omits the missing target pattern and that invalid data keeps the not-found behavior.
- Existing teacher-evidence tests provide prior art for question mapping and transcript-first evidence.
- Boundary tests prove that invalid snapshot data does not remove teacher transcripts or recordings.
- Boundary tests prove that valid legacy assigned work shows known questions and examples to the teacher.
- Run the narrow interpreter and feature tests first.
- Then run the full test suite, type checking, lint, and the production build.
- Do not report a check as passed unless that check ran successfully.

## Out of Scope

- No change to mission creation or teacher authoring fields.
- No change to the time when the application saves a mission snapshot.
- No change to stored snapshot immutability.
- No rewrite of stored mission snapshots.
- No database migration.
- No new legacy format beyond the exact known sample format.
- No permissive support for arbitrary partial JSON.
- No change to preset evaluation, progression, hints, speech, or transition behavior.
- No change to conversation evaluation, progression, follow-up generation, or recovery behavior.
- No new student error page or disabled homework card.
- No change from the latest homework attempt to a history of all homework attempts.
- No change to teacher authorization, audio storage, signed playback, or student-data ownership.
- No deployment, production mutation, provider request, push, or publication as part of implementation.

## Further Notes

- The domain glossary defines mission snapshot, legacy mission snapshot, mission flow, student recap, homework attempt, and speaking try.
- ADR 0002 records the accepted compatibility boundary.
- Repository history proves that the removed internal setup tool stored the legacy format.
- Repository evidence does not prove that a deployed database currently contains a legacy record.
- Narrow legacy read support remains because deployed data is unknown and past-work data can remain useful.
- The complete caller trace includes live mission loading, resume, audio evaluation, speech, translation, homework lists, student recap, and teacher evidence.
- The database completion operation still reads the required turn count from the snapshot. The server must require a complete result before terminal state changes.
- Implementation remains blocked until the owner approves the written implementation plan.
