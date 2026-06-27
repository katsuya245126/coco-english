# Requirements: English Speaking Practice App

**Defined:** 2026-06-25
**Core Value:** Students must complete useful spoken English practice outside class, and teachers must be able to verify that it happened.

## v1 Requirements

Requirements for the first usable teacher-linked speaking homework MVP.

### Data And Privacy

- [x] **DATA-01**: System stores teacher, class, student, mission, assignment, attempt, turn, transcript, and audio metadata in a relational schema.
- [x] **DATA-02**: System keeps assignment status transitions server-owned and auditable.
- [x] **DATA-03**: System stores only short per-turn audio clips, not full-session recordings.
- [x] **DATA-04**: System records audio retention fields so clips can expire or be deleted later.
- [x] **DATA-05**: System separates demo/sample data from real student data.

### Teacher Account

- [x] **AUTH-01**: Teacher can create an account with email and password.
- [x] **AUTH-02**: Teacher can log in and stay logged in across browser refresh.
- [x] **AUTH-03**: Teacher can log out.
- [x] **AUTH-04**: Teacher can access only their own classes, missions, assignments, and student attempts.

### Classes And Roster

- [x] **CLASS-01**: Teacher can create and edit a class.
- [x] **CLASS-02**: Teacher can add, edit, archive, and remove students from a class roster.
- [x] **CLASS-03**: Teacher can create or reset each student's 4-digit PIN.
- [x] **CLASS-04**: Class has a join code and QR/link form for student access.

### Student Access

- [x] **STUD-01**: Student can join a class by entering a class code or opening a QR/link.
- [x] **STUD-02**: Student device remembers the selected class after first access.
- [x] **STUD-03**: Student can select their name from the class roster.
- [x] **STUD-04**: Student can enter a 4-digit PIN to access their homework.
- [x] **STUD-05**: Student sees clear wrong-PIN, no-homework, and expired/closed-homework states.

### Mission Authoring

- [x] **MISS-01**: Teacher can manually create a mission with target pattern, topic, level, required turns, due date, questions, expected target-form examples, and hints.
- [ ] **MISS-02**: Teacher can generate a draft mission from target pattern, topic, level, required turns, and due date.
- [ ] **MISS-03**: Teacher can preview and edit a generated mission before assigning it.
- [x] **MISS-04**: Mission stores a `characterId` even though v1 has one default buddy character.
- [ ] **MISS-05**: Mission generation output is validated against a strict mission schema before it can be assigned.

### Assignment

- [x] **ASGN-01**: Teacher can assign a mission to a class.
- [x] **ASGN-02**: Assigned mission is snapshotted so later mission edits do not change existing homework unexpectedly.
- [x] **ASGN-03**: System creates per-student assignment records when homework is assigned.
- [x] **ASGN-04**: Assignment statuses include assigned, started, completed, missed, needs retry, and teacher review.
- [ ] **ASGN-05**: System can mark homework missed when the due date passes without completion.

### Student Speaking Mission

- [x] **FLOW-01**: Student can see assigned homework and start a mission.
- [x] **FLOW-02**: Buddy asks short classroom-safe questions tied to the assigned mission.
- [x] **FLOW-03**: Student answers each mission turn by voice.
- [x] **FLOW-04**: System shows a better target-form sentence after the original answer.
- [x] **FLOW-05**: Student must repeat the improved target-form sentence by voice.
- [x] **FLOW-06**: Mission completes after the required number of speaking turns and repeat attempts are satisfied.
- [x] **FLOW-07**: Student can reveal progressive hints: target pattern, word bank, then full example.

### Audio And Transcription

- [x] **AUDIO-01**: System records short audio clips for original answers.
- [x] **AUDIO-02**: System records short audio clips for repeat attempts.
- [x] **AUDIO-03**: System uploads audio with retry and failure states understandable to elementary learners.
- [x] **AUDIO-04**: System transcribes original answers and repeat attempts.
- [x] **AUDIO-05**: System stores transcript text, audio reference, clip metadata, and processing status for each turn.

### AI Evaluation

- [ ] **AI-01**: System evaluates whether the student's meaning is understandable.
- [ ] **AI-02**: System evaluates whether the student attempted the target pattern.
- [ ] **AI-03**: System produces a better target-form sentence for understandable answers.
- [ ] **AI-04**: System evaluates whether the repeat attempt is close enough for the mission level.
- [ ] **AI-05**: System routes low-confidence, failed-schema, or ambiguous evaluations to teacher review instead of pretending certainty.
- [x] **AI-06**: System keeps AI responses bounded to the assigned mission and blocks open-ended private chat.

### Teacher Review

- [ ] **REV-01**: Teacher dashboard shows homework buckets: completed, not started, missed, needs retry, and teacher review.
- [ ] **REV-02**: Teacher can scan each student's status, attempt count, submitted time, and highest hint level used.
- [ ] **REV-03**: Teacher can open an attempt detail view.
- [ ] **REV-04**: Attempt detail shows original transcript, improved sentence, repeat transcript, target-pattern result, hint usage, and attempt count.
- [x] **REV-05**: Teacher can play short audio clips on demand from the attempt detail view.
- [ ] **REV-06**: Teacher can manually mark an attempt complete, needs retry, or teacher review.

### Character And Safety

- [x] **CHAR-01**: MVP uses one recurring supportive classmate buddy.
- [x] **CHAR-02**: Buddy tone is friendly, simple, encouraging, and classroom-safe.
- [x] **CHAR-03**: Buddy does not use romance, dating mechanics, harsh correction, complex jokes, or long off-topic chatting.
- [x] **CHAR-04**: Character profile is separated from mission logic so the app can support more characters later.

### Pilot Readiness

- [x] **PILOT-01**: System has a mobile-responsive student flow for common phone/tablet browser sizes.
- [x] **PILOT-02**: System includes basic microphone permission and recording failure handling.
- [ ] **PILOT-03**: System includes basic logging for assignment completion, audio processing, transcription, and AI evaluation failures.
- [ ] **PILOT-04**: System includes a basic retention/deletion path for stored audio clips.

## v2 Requirements

Deferred until the teacher-linked speaking homework loop is validated.

### Character Expansion

- **CHARV2-01**: App can support a small classroom cast of recurring classmates.
- **CHARV2-02**: App can support seasonal or story-linked missions.

### Content Expansion

- **CONTV2-01**: Teacher can reuse and duplicate previous missions.
- **CONTV2-02**: Teacher can save private mission templates for common class patterns.

### Review Improvements

- **REVV2-01**: Teacher can filter review by target pattern, hint usage, or retry reason.
- **REVV2-02**: Teacher can see lightweight class-level trends after enough real usage exists.

### Optional Integrations And Libraries

- **INTV2-01**: App can support school SSO if a future school customer requires it.
- **INTV2-02**: App can support LMS or Google Classroom-style assignment sync if teacher pilots show that it reduces setup work.
- **INTV2-03**: App can support textbook/unit-aligned mission libraries if teachers repeatedly ask for reusable curriculum-linked content.

## Out of Scope

Explicitly excluded from current planning to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Full visual novel system | The first product must validate teacher-linked speaking homework before story systems. |
| Large character cast | One recurring buddy is enough for v1 continuity. |
| Romance or dating mechanics | Inappropriate for classroom use with elementary learners. |
| Student email/password accounts | Adds avoidable friction for young learners. |
| Numerical grades, pronunciation percentages, or class rankings | Early value is practice accountability and teacher review, not precision scoring. |
| Long-form free chat | Increases AI drift and safety risk while weakening the homework mission structure. |
| Parent accounts | Not required to validate teacher assignment and completion workflow. |
| Leaderboards or social features | Adds motivation mechanics before the core practice loop is proven. |
| Live autonomous voice agent | Short turn-based recording is simpler, safer, and enough for the MVP. |
| School SSO, LMS sync, and textbook/unit libraries | Possible later, but not required for the first classroom homework loop. |

## Traceability

Roadmap mapping is created in `ROADMAP.md`. Each v1 requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| DATA-05 | Phase 1 | Complete |
| AUTH-01 | Phase 2 | Complete |
| AUTH-02 | Phase 2 | Complete |
| AUTH-03 | Phase 2 | Complete |
| AUTH-04 | Phase 2 | Complete |
| CLASS-01 | Phase 2 | Complete |
| CLASS-02 | Phase 2 | Complete |
| CLASS-03 | Phase 2 | Complete |
| CLASS-04 | Phase 2 | Complete |
| STUD-01 | Phase 2 | Complete |
| STUD-02 | Phase 2 | Complete |
| STUD-03 | Phase 2 | Complete |
| STUD-04 | Phase 2 | Complete |
| STUD-05 | Phase 2 | Complete |
| MISS-01 | Phase 3 | Complete |
| MISS-02 | Phase 6 | Pending |
| MISS-03 | Phase 6 | Pending |
| MISS-04 | Phase 3 | Complete |
| MISS-05 | Phase 6 | Pending |
| ASGN-01 | Phase 3 | Complete |
| ASGN-02 | Phase 3 | Complete |
| ASGN-03 | Phase 3 | Complete |
| ASGN-04 | Phase 1 | Complete |
| ASGN-05 | Phase 7 | Pending |
| FLOW-01 | Phase 4 | Complete |
| FLOW-02 | Phase 4 | Complete |
| FLOW-03 | Phase 5 | Complete |
| FLOW-04 | Phase 4 | Complete |
| FLOW-05 | Phase 4 | Complete |
| FLOW-06 | Phase 4 | Complete |
| FLOW-07 | Phase 4 | Complete |
| AUDIO-01 | Phase 5 | Complete |
| AUDIO-02 | Phase 5 | Complete |
| AUDIO-03 | Phase 5 | Complete |
| AUDIO-04 | Phase 5 | Complete |
| AUDIO-05 | Phase 5 | Complete |
| AI-01 | Phase 6 | Pending |
| AI-02 | Phase 6 | Pending |
| AI-03 | Phase 6 | Pending |
| AI-04 | Phase 6 | Pending |
| AI-05 | Phase 6 | Pending |
| AI-06 | Phase 4 | Complete |
| REV-01 | Phase 7 | Pending |
| REV-02 | Phase 7 | Pending |
| REV-03 | Phase 7 | Pending |
| REV-04 | Phase 7 | Pending |
| REV-05 | Phase 5 | Complete |
| REV-06 | Phase 7 | Pending |
| CHAR-01 | Phase 4 | Complete |
| CHAR-02 | Phase 4 | Complete |
| CHAR-03 | Phase 4 | Complete |
| CHAR-04 | Phase 4 | Complete |
| PILOT-01 | Phase 4 | Complete |
| PILOT-02 | Phase 5 | Complete |
| PILOT-03 | Phase 7 | Pending |
| PILOT-04 | Phase 7 | Pending |

**Coverage:**

- v1 requirements: 60 total
- Mapped to phases: 60
- Unmapped: 0

---
*Requirements defined: 2026-06-25*
*Last updated: 2026-06-25 after Phase 1 execution*
