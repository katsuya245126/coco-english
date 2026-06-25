# Feature Landscape

**Domain:** Teacher-linked AI ESL speaking homework for elementary learners  
**Researched:** 2026-06-25  
**Research focus:** Table-stakes, differentiators, anti-features, complexity, dependencies, teacher workload, and child/student friction  
**Overall confidence:** MEDIUM-HIGH  

## Executive Recommendation

The v1 product should be a narrow speaking-homework workflow, not a general ESL app, LMS, chatbot, or visual novel. The strongest wedge is: teachers assign a short mission from today's target English; students complete it by voice with a friendly buddy; teachers see completion and review transcripts first, with audio available only when needed.

V1 should prioritize assignment accountability and low-friction completion over rich content, grading, analytics, avatars, or parent workflows. The core user promise is not "learn English with AI"; it is "every student did spoken output after class, and the teacher can verify it quickly."

## Table Stakes

Features users expect. Missing = product feels incomplete for classroom homework or ESL speaking practice.

| Feature | Why Expected | V1? | Complexity | Dependencies | Teacher Workload Impact | Student Friction Impact | Notes |
|---------|--------------|-----|------------|--------------|--------------------------|-------------------------|-------|
| Teacher email/password login | Teachers need persistent classes, rosters, assignments, and review history. | Yes | Low | Auth, teacher profile | Low once set up | None | Use standard teacher account model; avoid school SSO in v1. |
| Class creation and roster management | Classroom tools depend on class containers and student lists. | Yes | Medium | Teacher auth, student identity model | Medium setup, then saves time | Low if roster drives name selection | Must support add/edit/remove students and simple PIN reset. |
| Student access by class code or QR link | Elementary learners struggle with email/password flows; classroom tools commonly use codes. | Yes | Medium | Class roster, device memory, student PIN | Reduces teacher support burden | Very low | First run: code/QR -> name -> 4-digit PIN. Return: remembered class -> name -> PIN. |
| Device-remembered class | Re-entering class code every homework session is avoidable friction. | Yes | Low | Local storage/cookie, class membership | Fewer support questions | Very low | Include "change class" escape hatch. |
| 4-digit student PIN | Needed to prevent classmates from submitting as each other without creating real accounts. | Yes | Low-Med | Roster, PIN hashing/reset | Some setup/reset burden | Low | PIN is enough for MVP; do not overbuild child account security. |
| AI-assisted mission generation from target English | Teachers need fast post-class assignment creation tied to today's sentence pattern. | Yes | Medium-High | LLM prompt, mission schema, moderation | Major workload reducer | None | Input fields: target pattern, topic, level, required turns, due date. |
| Teacher edit-before-assign | Teachers will not trust generated content blindly, especially for children. | Yes | Medium | Mission editor, generated draft state | Adds control without heavy work | None | Must be quick inline editing, not a complex authoring suite. |
| Manual mission creation fallback | Some teachers will want exact wording or distrust generation. | Yes, basic | Medium | Mission schema/editor | Useful for edge cases | None | Keep secondary; AI generation remains primary path. |
| Due dates and assignment status | Homework products need due-date accountability and "who did it" visibility. | Yes | Medium | Assignment model, time zones, status jobs | Core time-saver | Clear expectations | Statuses should include assigned/not started, started, completed, missed, needs retry, teacher review. |
| Voice-first mission flow | Speaking practice must require spoken output, not typed answers. | Yes | High | Browser/mobile mic permissions, recording, STT | Produces verifiable homework | Medium; mic permission can block | Provide clear mic-permission recovery and retry. |
| Short guided missions | Elementary homework must be finishable and tied to class target language. | Yes | Medium | Mission script, turn counter, completion rules | Review volume stays manageable | Low | Default 2-3 minutes, about 3 speaking turns. |
| Buddy asks simple follow-up questions | AI speaking tools are expected to feel conversational, but classroom homework needs bounds. | Yes | Medium | Character/tone policy, mission script | None | Improves motivation | One recurring supportive classmate buddy is enough. |
| Speech transcription per turn | Teachers need readable evidence before listening to audio. | Yes | High | STT, turn storage, confidence handling | Major review time-saver | Invisible unless shown to student | Store original answer and repeat attempt transcripts. |
| Per-turn short audio clips | Speaking verification requires audio, but long recordings are costly to review and store. | Yes | High | Recording upload, storage, retention policy | Audio only when needed | Invisible after recording | Store clips for original answer and repeat, not full session audio. |
| Meaning-first acceptance | ESL learners should not be punished for understandable output before form correction. | Yes | High | AI evaluation rubric | Reduces teacher disputes | Lowers anxiety | Mark meaning, target-pattern attempt, and repeat separately. |
| Target-form recast and required repeat | The product's learning loop depends on turning imperfect speech into practiced target English. | Yes | High | AI rewrite, TTS/text display, repeat STT | Better evidence for teacher | Medium; adds one extra step | This is the key pedagogical loop: accept meaning -> show better sentence -> student repeats. |
| Progressive hints | Children need scaffolding without teacher intervention. | Yes | Medium | Mission hints, hint state | Reduces blocked attempts | Lowers frustration | Ladder: target pattern -> word bank -> full example sentence. |
| Hint usage visible to teacher | Hint data helps teachers interpret completion without treating hints as failure. | Yes | Low-Med | Attempt metadata | Saves review time | None | Show highest hint level used. |
| Completion rules | Teachers need a reliable definition of "done." | Yes | Medium-High | Evaluation state machine | Reduces manual judgment | Clear finish line | Complete only after required turns and repeat attempts meet minimum criteria. |
| Needs-retry and teacher-review buckets | AI evaluation will be imperfect; teachers need exception queues. | Yes | Medium | Confidence thresholds, review states | Focuses teacher attention | Some students may retry | Do not force teachers to inspect every attempt. |
| Assignment dashboard with buckets | Classroom tools are scan-first; teachers need class-level status at a glance. | Yes | Medium | Assignment/status queries | Core workload reducer | None | Buckets: completed, not started, missed, needs retry, teacher review. |
| Transcript-first attempt detail | Teachers lack time to listen to every clip. | Yes | Medium | Attempt data model, audio player | Major workload reducer | None | Show transcript, improved sentence, repeat transcript, hint usage, attempts, submitted time. |
| Audio playback only on demand | Audio is evidence, not the default review mode. | Yes | Medium | Stored clips, signed URLs/player | Keeps review fast | None | Include per-turn play buttons, not autoplay. |
| Student retry flow | Children will hit mic/STT/evaluation mistakes; homework needs recovery. | Yes | Medium | Attempt versioning, status updates | Reduces teacher intervention | Medium but necessary | Allow retry from needs_retry and failed repeat. |
| Friendly child-safe tone | Elementary ESL learners need encouragement and simple language. | Yes | Medium | Character prompt, content policy | Reduces complaints | Lowers anxiety | Avoid sarcasm, complex jokes, romance, shame, adult themes. |
| Basic teacher settings for required turns and due date | Teachers need control over homework length and timing. | Yes | Low-Med | Mission assignment form | Aligns to class needs | None | Keep controls minimal: turns, due date, class. |
| Basic privacy and retention defaults | Child voice recordings are sensitive. | Yes | Medium | Storage lifecycle, deletion policy | Reduces institutional risk | None | Default 30 or 60 day audio retention; keep transcripts/status longer if policy allows. |
| Mobile-responsive student flow | Many students will complete homework on family phones/tablets. | Yes | Medium | Responsive UI, audio browser support | Fewer support issues | Critical | Test iOS Safari, Android Chrome, desktop Chrome. |
| Clear empty/error states | Kids need obvious recovery when no homework, wrong PIN, mic denied, or upload fails. | Yes | Low-Med | UI states, retry handling | Fewer teacher messages | Lower frustration | Use simple wording and one next action. |

## Differentiators

Features that support the product wedge. Not all are v1, but they create separation from generic homework platforms and consumer AI chat apps.

| Feature | Value Proposition | V1? | Complexity | Dependencies | Teacher Workload Impact | Student Friction Impact | Notes |
|---------|-------------------|-----|------------|--------------|--------------------------|-------------------------|-------|
| Mission generation from "today's English" | Makes the tool fit real academy/classroom routines where teachers teach a pattern and need immediate homework. | Yes | Medium-High | AI generator, editable mission schema | High reduction | None | Strongest teacher-facing differentiator. |
| Meaning-first then target-form repeat loop | Combines communicative practice with form-focused repetition; better fit for ESL than generic chat. | Yes | High | AI evaluation, recast generation, STT | Medium | Medium | This should be the signature student learning mechanic. |
| Transcript-first teacher review with audio evidence | Speaking platforms often produce recordings; this makes review realistic for a whole class. | Yes | Medium-High | Turn storage, transcript/audio UI | Very high reduction | None | Essential product wedge for teacher adoption. |
| AI confidence routed to teacher-review bucket | Avoids pretending AI grading is perfect; focuses human review on uncertain attempts. | Yes | High | Evaluation confidence, thresholds | High reduction | None | More trustworthy than automatic scores. |
| Homework status buckets optimized for action | Teachers want "who needs action?" not analytics dashboards. | Yes | Medium | Status model, assignment dashboard | High reduction | None | Completed, not started, missed, needs retry, teacher review. |
| Low-friction child identity without email | Distinct from LMS/consumer apps; designed for elementary classes. | Yes | Medium | Class code/QR, roster, PIN | Medium reduction | Very low | This is table-stakes for this product, but differentiating against consumer speaking apps. |
| One recurring supportive classmate buddy | Adds continuity and motivation without building a large game/story system. | Yes | Medium | Character policy, avatar/name assets | None | Positive | Keep character as tone layer, not system complexity. |
| Attempt-level evidence bundle | Teachers can see what the student said, what the AI suggested, what was repeated, and whether hints were used. | Yes | Medium | Attempt data model | High reduction | None | More useful than a single "score." |
| Assignment-level retry targeting | Teacher can quickly ask only certain students to retry. | Maybe v1 if cheap | Medium | Status buckets, notification/link generation | High | Medium | Could be manual in v1: status visible, student can retry. Automated retry assignment can wait. |
| Target-pattern mastery view | Shows which students attempted/repeated today's pattern, not generic fluency. | Later | Medium-High | Aggregated evaluation metadata | Medium | None | Useful after core loop proves repeat use. |
| Teacher-created reusable mission templates | Speeds repeated patterns across classes. | Later | Medium | Mission library, duplication | Medium | None | Defer until teachers create enough missions to justify it. |
| Class-level export/report | Academies may need progress records or parent/admin proof. | Later | Medium | Data export, privacy review | Medium | None | CSV/PDF later; avoid in MVP unless pilot buyer requires it. |
| Controlled small character cast | Keeps motivation fresh while remaining classroom-safe. | Later | Medium-High | `characterId`, assets, policies | None | Positive | Only after one-buddy loop validates. |
| Seasonal/story mission wrapper | Increases engagement for repeat use. | Later | High | Character/campaign system | None | Positive but can distract | Avoid until assignment and completion behavior are proven. |
| Teacher review shortcuts | Bulk mark reviewed, filter by hint level, filter by low confidence. | Later, soon after v1 | Medium | Review workflow, audit trail | High | None | Add once real teacher review patterns are observed. |
| Pronunciation/intelligibility cues | Can support speaking quality beyond grammar. | Later | High | Pronunciation assessment, rubric | Medium | Could increase anxiety | Keep qualitative and teacher-facing first; avoid numeric pronunciation scores in v1. |
| Parent proof link or summary | Helps academies demonstrate homework value to parents. | Later | Medium-High | Parent sharing, privacy consent | Medium | None | Defer; parent accounts are out of scope. |
| LMS import/export | Helpful for schools already using Google Classroom or Teams. | Later | High | Integrations, institutional auth | Medium | None | Not needed to validate the wedge. |

## Anti-Features

Features to explicitly not build, because they dilute the wedge, raise child-safety/privacy risk, or create teacher workload.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Long-form open-ended AI chat | Higher AI drift, unsafe content risk, harder completion criteria, less tied to class target language. | Use bounded missions with scripted goals, short follow-ups, and clear completion rules. |
| Numerical AI grades or fluency scores in v1 | Teachers may over-trust noisy AI assessment; scores create parent/student disputes and require validation. | Use completion/review states plus evidence: transcript, repeat result, hint usage, audio. |
| Full LMS replacement | Attendance, gradebook, files, parent messaging, and school admin workflows would bury the speaking-homework wedge. | Integrate later if needed; v1 focuses on classes, missions, completion, review. |
| Student email/password accounts | Too much friction for elementary learners; increases support burden. | Class code/QR, roster name selection, 4-digit PIN, remembered class. |
| School SSO in MVP | Useful for institutional sales but slow to implement and not needed for first validation. | Teacher email/password; design auth boundaries so SSO can be added later. |
| Parent accounts in MVP | Adds consent, messaging, privacy, and support complexity before teacher value is proven. | Provide teacher-facing evidence first; parent summaries later if pilots demand it. |
| Large character cast | Expensive content/design surface; risks turning the product into entertainment-first software. | One recurring supportive buddy with `characterId` in the data model. |
| Visual novel/story system in MVP | High production complexity and not necessary to prove speaking homework adoption. | Keep missions lightly characterful and classroom-safe. |
| Romance, dating, parasocial companion mechanics | Inappropriate for elementary classroom use and increases child-safety concerns. | Buddy behaves like a supportive classmate, not a private companion. |
| Always-on AI companion | Privacy and attachment risk for children; not aligned to teacher-assigned homework. | AI interaction only during assigned missions. |
| Long session recordings | Expensive storage, harder review, higher privacy exposure. | Store short per-turn clips with retention limits. |
| Autoplaying or mandatory teacher audio review | Makes review impossible at class scale. | Transcript-first review; audio playback on demand. |
| Large prebuilt content marketplace | Content is not the initial bottleneck; teacher target-language alignment is. | Generate missions from today's English and let teachers edit. |
| Overly rich analytics dashboards | Premature and may distract from actionability. | Status buckets and exception queues first. |
| Social feeds, comments, likes, leaderboards | Adds moderation risk and social pressure; speaking anxiety is already high for ESL learners. | Private homework attempts visible to teacher only. |
| Competitive streaks as the core motivator | Consumer language apps use gamification, but classroom homework needs reliability and low shame. | Use gentle completion feedback and optional lightweight progress later. |
| Free-form student text input as main mode | Lets students avoid speaking and undermines the product promise. | Voice-first, with text only for accessibility/recovery if explicitly designed. |
| Automatic failure for grammar mistakes | Bad fit for elementary ESL; discourages output and conflicts with communicative practice. | Accept understandable meaning, then recast and repeat target form. |
| Complex teacher rubric builder in v1 | Adds authoring workload and pushes toward grading rather than practice/accountability. | Fixed simple rubric: meaning understandable, target attempted, repeat close enough, review confidence. |
| Permanent storage of child voice data | Raises privacy, cost, and institutional objections. | Limited audio retention with clear deletion policy. |

## Feature Dependencies

```text
Teacher auth -> class creation -> roster -> student code/QR access -> student PIN login

Teacher auth + class roster -> mission generation/editing -> assignment -> due dates/status buckets

Mission schema -> student guided voice flow -> per-turn recording -> STT transcripts -> AI evaluation -> completion/needs_retry/teacher_review

AI evaluation -> target-form recast -> required repeat -> repeat transcript/audio -> attempt evidence bundle

Attempt evidence bundle -> assignment dashboard -> transcript-first teacher review -> audio-on-demand verification

Hint ladder -> hint usage tracking -> teacher attempt detail context

Audio clips -> retention policy -> privacy posture -> school/academy trust

characterId in mission -> one default buddy now -> small cast/story wrappers later
```

## MVP Recommendation

Prioritize v1:

1. Teacher login, class creation, roster management, and simple student PIN reset.
2. Student access through class code/QR, remembered class, name selection, and 4-digit PIN.
3. AI-assisted mission generation from target pattern, topic, level, required turns, and due date.
4. Teacher edit-before-assign and basic manual mission creation fallback.
5. Voice-first 2-3 minute guided mission with one recurring supportive buddy.
6. Meaning-first acceptance, target-form recast, and required repeat.
7. Progressive hints with highest hint level recorded.
8. Per-turn transcripts and short audio clips for original answer and repeat.
9. Status buckets: completed, not started/assigned, started, missed, needs retry, teacher review.
10. Transcript-first attempt review with optional audio playback.
11. Limited audio retention and basic child-safe AI interaction boundaries.

Defer:

| Feature | Reason to Defer |
|---------|-----------------|
| Large character cast | Not necessary to validate homework loop; adds design/content overhead. |
| Story/visual novel system | Risks building entertainment infrastructure before proving teacher repeat assignment. |
| Numerical grading | Requires validation and creates trust/dispute risk. |
| Pronunciation scoring | Technically complex and can increase anxiety; first validate transcript/repeat loop. |
| Parent accounts | Adds privacy/support complexity before teacher value is proven. |
| School SSO | Useful later for institutions; not needed for MVP pilots. |
| LMS integrations | Valuable only after teachers confirm the standalone loop is worth repeating. |
| Rich analytics | Premature before knowing what teachers actually inspect. |
| Content marketplace | Teacher-generated target-language missions are the wedge. |

## Phase Guidance for Requirements

### Phase 1: Core Classroom Shell

Build teacher auth, class roster, student access, and assignment containers. This phase proves the classroom identity model and removes the biggest child-friction risk.

Must include:

- Teacher login.
- Create/edit class.
- Add/edit/remove students.
- Student class code/QR access.
- Name selection and 4-digit PIN.
- Remembered class on device.

### Phase 2: Mission Authoring and Assignment

Build mission generation, editing, manual fallback, due date, and assignment-to-class. This phase proves teachers can create useful homework quickly enough after class.

Must include:

- Target pattern/topic/level/turns/due-date inputs.
- Generated mission draft.
- Edit-before-assign.
- Assignment status initialization.
- Basic mission preview.

### Phase 3: Student Speaking Mission

Build the voice-first guided mission and completion state machine. This phase proves students can complete the assignment without teacher help.

Must include:

- Mic permission flow.
- Buddy prompt.
- Student recording.
- STT transcript.
- Meaning/target-pattern check.
- Better target-form sentence.
- Required repeat.
- Progressive hints.
- Complete/needs_retry/teacher_review result.

### Phase 4: Teacher Review and Accountability

Build class assignment dashboard and attempt detail review. This phase proves the teacher can verify homework at class scale.

Must include:

- Status buckets.
- Submitted time and attempt count.
- Highest hint level.
- Transcript-first attempt detail.
- Optional per-turn audio playback.
- Retry/review state handling.

### Phase 5: Hardening for Pilots

Build privacy, retention, mobile reliability, review shortcuts, and operational polish. This phase prepares real classroom pilots.

Must include:

- Audio retention/deletion.
- Mobile browser testing and fallbacks.
- Teacher-facing error/review filters.
- Basic auditability for attempt changes.
- Child-safe AI guardrails and content logging sufficient for debugging.

## Complexity Notes

High-complexity areas:

- Browser/mobile audio capture and upload reliability.
- Speech-to-text accuracy for young ESL learners.
- AI evaluation that separates meaning, target-form attempt, and repeat quality.
- Child-safe LLM behavior under unexpected student speech.
- Teacher review UX that remains fast with 10-30 students per class.
- Privacy and retention for child voice recordings.

Medium-complexity areas:

- Student access without email/password while preventing mistaken identity.
- Mission generation constrained to a schema teachers can edit.
- Status bucket transitions and due-date handling.
- Retry attempts and attempt history.

Low-complexity areas:

- Teacher email/password login.
- Basic class and roster CRUD.
- Due date input.
- Fixed one-buddy character metadata.
- Simple hint ladder state tracking.

## Teacher Workload Principles

- Every teacher-facing screen should answer an action question: "Who is done?", "Who missed it?", "Who needs retry?", "What did this student say?"
- Do not require teachers to listen to every submission.
- Do not make teachers grade by rubric in v1.
- Let teachers edit generated missions, but do not make authoring feel like curriculum design.
- Prefer exception queues over dashboards: needs retry and teacher review matter more than charts.
- Use evidence bundles instead of scores to build trust.

## Child/Student Friction Principles

- No email/password for students.
- No long onboarding.
- No social posting, public performance, or peer comparison.
- Keep missions short enough to finish before frustration.
- Show one clear next action after every recording.
- Accept understandable meaning before correction.
- Use hints without shame.
- Make retry feel normal, not punitive.
- Keep buddy language simple, supportive, and classroom-safe.

## Sources

Source confidence could not be tagged through the GSD `classify-confidence` seam because the local `gsd-tools.cjs` install failed to load `../../../package.json`. Confidence below is assigned from source type: official/product docs and stable project docs are higher; market summaries and research papers are supporting evidence.

- Local project source, HIGH: `.planning/PROJECT.md`
- Local project source, HIGH: `english-speaking-practice-app-spec.md`
- Classroom assignment norms, MEDIUM: Google Classroom overview and assignment model, https://en.wikipedia.org/wiki/Google_Classroom
- Child classroom access and portfolio norms, MEDIUM: ClassDojo overview, https://en.wikipedia.org/wiki/ClassDojo
- Student video/audio submission precedent, MEDIUM: Flip/Flipgrid overview and retirement context, https://en.wikipedia.org/wiki/Flip_%28software%29
- Collaborative classroom submission precedent, MEDIUM: Padlet overview, https://en.wikipedia.org/wiki/Padlet
- AI speaking-practice market norms, MEDIUM: Praktika overview, https://en.wikipedia.org/wiki/Praktika_%28software%29
- AI language tutor market norms, MEDIUM: Talkpal AI overview, https://en.wikipedia.org/wiki/Talkpal_AI
- Guided AI speaking feedback trend, MEDIUM: Babbel Speak overview, https://en.wikipedia.org/wiki/Babbel
- ESL/task-based speaking pedagogy, MEDIUM: Task-based language teaching overview, https://en.wikipedia.org/wiki/Task-based_language_teaching
- Corrective-feedback and communicative-use rationale, MEDIUM: Second-language acquisition classroom research, https://en.wikipedia.org/wiki/Second-language_acquisition_classroom_research
- Automatic pronunciation assessment scope and limits, MEDIUM: Pronunciation assessment overview, https://en.wikipedia.org/wiki/Pronunciation_assessment
- Supportive recast/rephrasing direction, MEDIUM: AI Twin ESL speaking practice paper, https://arxiv.org/abs/2601.11103
- Spoken language assessment/feedback technical context, MEDIUM: Speak & Improve Challenge 2025, https://arxiv.org/abs/2412.11985
- Child AI privacy-by-design risk framing, MEDIUM: Privacy by Design Framework for LLM-Based Applications for Children, https://arxiv.org/abs/2602.17418
- Current classroom AI concern signals, LOW-MEDIUM: Guardian report on AI in classrooms, https://www.theguardian.com/education/2026/jun/23/ai-us-schools-students
- Current student privacy concern signals, LOW-MEDIUM: Axios education AI privacy report, https://www.axios.com/2025/08/14/ai-education-privacy
