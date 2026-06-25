# Requirements: English Speaking Practice App

**Defined:** 2026-06-25
**Core Value:** Students must complete useful spoken English practice outside class, and teachers must be able to verify that it happened.

## v1 Requirements

Requirements for the first usable teacher-linked speaking homework MVP.

### Data And Privacy

- [ ] **DATA-01**: System stores teacher, class, student, mission, assignment, attempt, turn, transcript, and audio metadata in a relational schema.
- [ ] **DATA-02**: System keeps assignment status transitions server-owned and auditable.
- [ ] **DATA-03**: System stores only short per-turn audio clips, not full-session recordings.
- [ ] **DATA-04**: System records audio retention fields so clips can expire or be deleted later.
- [ ] **DATA-05**: System separates demo/sample data from real student data.

### Teacher Account

- [ ] **AUTH-01**: Teacher can create an account with email and password.
- [ ] **AUTH-02**: Teacher can log in and stay logged in across browser refresh.
- [ ] **AUTH-03**: Teacher can log out.
- [ ] **AUTH-04**: Teacher can access only their own classes, missions, assignments, and student attempts.

### Classes And Roster

- [ ] **CLASS-01**: Teacher can create and edit a class.
- [ ] **CLASS-02**: Teacher can add, edit, archive, and remove students from a class roster.
- [ ] **CLASS-03**: Teacher can create or reset each student's 4-digit PIN.
- [ ] **CLASS-04**: Class has a join code and QR/link form for student access.

### Student Access

- [ ] **STUD-01**: Student can join a class by entering a class code or opening a QR/link.
- [ ] **STUD-02**: Student device remembers the selected class after first access.
- [ ] **STUD-03**: Student can select their name from the class roster.
- [ ] **STUD-04**: Student can enter a 4-digit PIN to access their homework.
- [ ] **STUD-05**: Student sees clear wrong-PIN, no-homework, and expired/closed-homework states.

### Mission Authoring

- [ ] **MISS-01**: Teacher can manually create a mission with target pattern, topic, level, required turns, due date, questions, expected target-form examples, and hints.
- [ ] **MISS-02**: Teacher can generate a draft mission from target pattern, topic, level, required turns, and due date.
- [ ] **MISS-03**: Teacher can preview and edit a generated mission before assigning it.
- [ ] **MISS-04**: Mission stores a `characterId` even though v1 has one default buddy character.
- [ ] **MISS-05**: Mission generation output is validated against a strict mission schema before it can be assigned.

### Assignment

- [ ] **ASGN-01**: Teacher can assign a mission to a class.
- [ ] **ASGN-02**: Assigned mission is snapshotted so later mission edits do not change existing homework unexpectedly.
- [ ] **ASGN-03**: System creates per-student assignment records when homework is assigned.
- [ ] **ASGN-04**: Assignment statuses include assigned, started, completed, missed, needs retry, and teacher review.
- [ ] **ASGN-05**: System can mark homework missed when the due date passes without completion.

### Student Speaking Mission

- [ ] **FLOW-01**: Student can see assigned homework and start a mission.
- [ ] **FLOW-02**: Buddy asks short classroom-safe questions tied to the assigned mission.
- [ ] **FLOW-03**: Student answers each mission turn by voice.
- [ ] **FLOW-04**: System shows a better target-form sentence after the original answer.
- [ ] **FLOW-05**: Student must repeat the improved target-form sentence by voice.
- [ ] **FLOW-06**: Mission completes after the required number of speaking turns and repeat attempts are satisfied.
- [ ] **FLOW-07**: Student can reveal progressive hints: target pattern, word bank, then full example.

### Audio And Transcription

- [ ] **AUDIO-01**: System records short audio clips for original answers.
- [ ] **AUDIO-02**: System records short audio clips for repeat attempts.
- [ ] **AUDIO-03**: System uploads audio with retry and failure states understandable to elementary learners.
- [ ] **AUDIO-04**: System transcribes original answers and repeat attempts.
- [ ] **AUDIO-05**: System stores transcript text, audio reference, clip metadata, and processing status for each turn.

### AI Evaluation

- [ ] **AI-01**: System evaluates whether the student's meaning is understandable.
- [ ] **AI-02**: System evaluates whether the student attempted the target pattern.
- [ ] **AI-03**: System produces a better target-form sentence for understandable answers.
- [ ] **AI-04**: System evaluates whether the repeat attempt is close enough for the mission level.
- [ ] **AI-05**: System routes low-confidence, failed-schema, or ambiguous evaluations to teacher review instead of pretending certainty.
- [ ] **AI-06**: System keeps AI responses bounded to the assigned mission and blocks open-ended private chat.

### Teacher Review

- [ ] **REV-01**: Teacher dashboard shows homework buckets: completed, not started, missed, needs retry, and teacher review.
- [ ] **REV-02**: Teacher can scan each student's status, attempt count, submitted time, and highest hint level used.
- [ ] **REV-03**: Teacher can open an attempt detail view.
- [ ] **REV-04**: Attempt detail shows original transcript, improved sentence, repeat transcript, target-pattern result, hint usage, and attempt count.
- [ ] **REV-05**: Teacher can play short audio clips on demand from the attempt detail view.
- [ ] **REV-06**: Teacher can manually mark an attempt complete, needs retry, or teacher review.

### Character And Safety

- [ ] **CHAR-01**: MVP uses one recurring supportive classmate buddy.
- [ ] **CHAR-02**: Buddy tone is friendly, simple, encouraging, and classroom-safe.
- [ ] **CHAR-03**: Buddy does not use romance, dating mechanics, harsh correction, complex jokes, or long off-topic chatting.
- [ ] **CHAR-04**: Character profile is separated from mission logic so the app can support more characters later.

### Pilot Readiness

- [ ] **PILOT-01**: System has a mobile-responsive student flow for common phone/tablet browser sizes.
- [ ] **PILOT-02**: System includes basic microphone permission and recording failure handling.
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

Roadmap mapping is created in `ROADMAP.md`.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 through DATA-05 | TBD | Pending |
| AUTH-01 through AUTH-04 | TBD | Pending |
| CLASS-01 through CLASS-04 | TBD | Pending |
| STUD-01 through STUD-05 | TBD | Pending |
| MISS-01 through MISS-05 | TBD | Pending |
| ASGN-01 through ASGN-05 | TBD | Pending |
| FLOW-01 through FLOW-07 | TBD | Pending |
| AUDIO-01 through AUDIO-05 | TBD | Pending |
| AI-01 through AI-06 | TBD | Pending |
| REV-01 through REV-06 | TBD | Pending |
| CHAR-01 through CHAR-04 | TBD | Pending |
| PILOT-01 through PILOT-04 | TBD | Pending |

**Coverage:**
- v1 requirements: 60 total
- Mapped to phases: 0
- Unmapped: 60 pending roadmap

---
*Requirements defined: 2026-06-25*
*Last updated: 2026-06-25 after initial definition*
