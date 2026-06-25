# Domain Pitfalls

**Domain:** Teacher-linked AI ESL speaking homework for elementary learners  
**Researched:** 2026-06-25  
**Overall confidence:** MEDIUM-HIGH

## Research Basis

The local `gsd-tools` research-plan seam failed in this workspace because `/Users/john/.codex/gsd-core/bin/gsd-tools.cjs` could not load its package metadata. I used live primary and research sources directly instead. Confidence is highest for privacy/compliance and web audio constraints because those come from official FTC, U.S. Department of Education, and MDN sources. Confidence is medium for ASR, AI feedback, and dashboard workload because those depend on recent research papers and will still need validation with the app's target learner population.

## Critical Pitfalls

### Pitfall 1: Treating Child Voice Data Like Ordinary Homework Text

**What goes wrong:** The app stores long recordings, keeps audio indefinitely, sends clips to AI vendors without a clear contract, or later reuses children's voice data for model improvement. For this product, audio is not just a technical artifact; under COPPA, an audio file containing a child's voice is personal information, and in a school workflow it may also become part of an education record.

**Why it happens:** Teams optimize for debugging and AI quality first, then add privacy policy text afterward. Voice clips feel necessary for speaking verification, so retention and deletion get postponed.

**Warning signs:**
- No explicit audio retention field or deletion job in the data model.
- "Save full session recording" appears in plans instead of per-turn clips.
- Privacy language says "may improve our services" without excluding child audio/transcripts from model training.
- Teachers can export or share raw student recordings without audit or permission boundaries.

**Consequences:** Schools may be unable to approve the product, parents may object, and the MVP may require a data model rewrite to support deletion, access, and vendor-use restrictions.

**Prevention strategy:**
- In the MVP data model, store short per-turn clips only: original answer and repeat attempt.
- Default to limited audio retention, such as 30 or 60 days, with transcripts/status retained longer only if needed for teacher records.
- Add `audioExpiresAt`, `deletedAt`, and a scheduled deletion path before classroom pilot.
- Contractually prohibit AI/speech vendors from using student audio or transcripts for training, advertising, profiling, or unrelated commercial purposes.
- Keep a parent/school-facing data summary: what is collected, why, who can access it, how long it is retained, and how deletion works.
- Do not collect student email, phone, home address, or free-form profile data in the MVP.

**Phase should address it:** Phase 0 / foundation, before any real student pilot.

**Confidence:** HIGH.

### Pitfall 2: Relying on Teacher Signup as if It Solves Child Consent and School Approval

**What goes wrong:** Individual teachers start using the app with real children before the school, academy, or parent-consent path is clear. The app assumes that because a teacher created a class, all child data collection is authorized.

**Why it happens:** Teacher-led products often start bottom-up. That is useful for validation, but children's audio, transcripts, and progress records raise a higher bar than ordinary classroom tools.

**Warning signs:**
- Onboarding asks only for teacher email/password, with no school/academy context or data-processing acknowledgement.
- Product copy says "teacher consent" but not "school/parent consent."
- No way for a school/admin/teacher to request student data deletion.
- No separation between demo mode and real child data mode.

**Consequences:** Pilots get blocked by administrators, or worse, proceed informally and create compliance risk after real voice data is collected.

**Prevention strategy:**
- Add a "pilot readiness" checklist before real class use: school/academy approval, parent notification/consent path, data retention accepted, and no secondary commercial data use.
- Provide a demo/sample-class mode that uses synthetic students and does not collect child audio.
- Treat school authorization as limited to educational use only; do not use child data for ads, behavioral profiling, unrelated product analytics, or model training.
- Build deletion/export primitives early enough that support can answer school or parent requests without manual database surgery.

**Phase should address it:** Phase 0 for policy/data boundaries; Phase 1 for onboarding copy and deletion workflows.

**Confidence:** HIGH.

### Pitfall 3: Overtrusting Speech Recognition for Elementary ESL Learners

**What goes wrong:** The product marks students `needs_retry`, `completed`, or `teacher_review` based on a transcript as if the transcript were ground truth. Young ESL speech is exactly where general ASR is most fragile: children's voices differ from adult voices, non-native pronunciation differs from native training data, and many ASR systems "smooth out" learner errors that the app needs to preserve.

**Why it happens:** Demos with adults sound accurate, and cloud ASR APIs make transcription feel solved. The failure only appears with noisy homes, hesitant speech, Korean-accented English, code-switching, and short child utterances.

**Warning signs:**
- Completion logic depends only on exact transcript matching.
- No confidence score, no "could not classify" state, or no teacher review fallback.
- The app fails children for one ASR miss instead of allowing a retry.
- Repeat scoring expects native-like pronunciation rather than recognizable target-form attempt.

**Consequences:** Students are unfairly failed, teachers lose trust, and the dashboard becomes a dispute queue instead of an accountability tool.

**Prevention strategy:**
- Treat ASR as evidence, not authority. Store transcript, audio clip, ASR confidence where available, evaluation output, and reason codes.
- Use tolerant completion rules: understandable meaning first, target-pattern attempt second, repeat attempt third.
- Route low-confidence, off-target, very short, or contradictory attempts to `teacher_review` rather than hard failure.
- Keep audio playback attached to each turn so teachers can verify edge cases.
- Build a small internal evaluation set from consented pilot audio covering Korean ESL children, noisy rooms, short answers, hesitations, and common mispronunciations.
- Avoid numerical pronunciation scores in MVP. Use coarse states and "needs teacher review" until local validation proves reliability.

**Phase should address it:** Phase 2 / AI mission and evaluation, with Phase 3 teacher review fallback.

**Confidence:** MEDIUM-HIGH.

### Pitfall 4: Letting the Buddy Become Open-Ended Child Chat

**What goes wrong:** The supportive classmate character drifts into free chat, asks personal questions, gives unsafe advice, produces age-inappropriate content, or continues conversation beyond the teacher's target language. A friendly character can increase motivation, but it also increases attachment and safety expectations.

**Why it happens:** LLM chat feels engaging, and product teams are tempted to make the buddy more conversational before the guided homework loop is proven.

**Warning signs:**
- Prompts invite "talk about anything."
- The buddy can ask for personal information, secrets, photos, location, family details, or contact information.
- The character has romance, crush, dating, or emotionally dependent language.
- No output moderation, no topic allowlist, and no hard turn limit.
- Student messages are sent directly to the LLM without input filtering or mission context constraints.

**Consequences:** Child-safety risk, school rejection, parent complaints, and AI behavior that undermines the teacher's assignment.

**Prevention strategy:**
- Keep the MVP as a guided mission runner, not a general chatbot.
- Use one classroom-safe buddy with a fixed tone: friendly, simple, brief, no romance, no secrets, no private relationship framing.
- Constrain every turn with mission data: target pattern, allowed topic, expected turn count, allowed follow-ups, and completion criteria.
- Add input threat detection and output moderation for personal data, sexual content, self-harm, bullying, violence, medical advice, and off-topic requests.
- Use fixed templates for correction and encouragement wherever possible; reserve generation for bounded follow-up wording.
- Enforce max turns and provide a graceful end: "Homework is complete."

**Phase should address it:** Phase 2, before enabling generated dialogue with students.

**Confidence:** HIGH.

### Pitfall 5: Turning Teacher Review Into an Audio-Grading Queue

**What goes wrong:** Teachers must listen to every recording to understand completion, pronunciation, or effort. The app technically verifies speaking, but operationally adds more work than paper homework.

**Why it happens:** Audio is the most authentic evidence, so teams over-prioritize playback and under-design scanability.

**Warning signs:**
- Assignment review opens at individual recordings instead of status buckets.
- No class-level scan: completed, not started, missed, needs retry, teacher review.
- Attempt detail lacks transcript-first summaries and reason codes.
- The dashboard shows raw analytics but not the next teacher action.
- Teachers cannot review a full class in a few minutes.

**Consequences:** Teachers stop assigning missions because review does not fit between classes.

**Prevention strategy:**
- Make the dashboard exception-first: buckets, counts, submitted time, attempt count, highest hint level, and review flags.
- In attempt detail, show transcript first, improved sentence second, repeat transcript third, audio only as optional verification.
- Add reason codes: `low_asr_confidence`, `no_repeat_detected`, `off_target`, `too_short`, `possible_background_voice`, `manual_review_requested`.
- Avoid large charts in MVP. Teachers need "who is done, who needs help, who did not do it" more than analytics.
- Measure teacher review time during pilot; target a class scan in under five minutes.

**Phase should address it:** Phase 3 / teacher dashboard and review.

**Confidence:** MEDIUM-HIGH.

### Pitfall 6: AI-Generated Missions Drift Away From Today's Target English

**What goes wrong:** The teacher enters `I'm going to _____.`, but the AI creates a mission that practices unrelated vocabulary, too many grammar points, long explanations, or culturally confusing scenarios. Students complete "speaking practice" without practicing what the teacher taught.

**Why it happens:** General-purpose LLMs optimize for plausible lesson content, not strict alignment to one target pattern and a short homework loop.

**Warning signs:**
- Mission generation has no structured schema.
- Teachers cannot edit before assigning.
- Generated missions include more than one primary pattern.
- Follow-up questions require vocabulary students have not learned.
- Student evaluation rewards fluent off-target answers.

**Consequences:** Teachers lose confidence because homework no longer reinforces class. The product becomes generic AI practice instead of teacher-linked accountability.

**Prevention strategy:**
- Generate missions into a strict schema: target pattern, topic, level, opening question, follow-ups, expected examples, hints, required turns.
- Enforce one primary target pattern per mission in MVP.
- Require teacher preview/edit before assignment.
- Add automated checks that each follow-up can be answered using the target pattern.
- In student evaluation, separate "meaning understandable" from "target attempted" so off-target fluent answers do not count as full completion.

**Phase should address it:** Phase 2 / mission generation and evaluation.

**Confidence:** MEDIUM-HIGH.

## Moderate Pitfalls

### Pitfall 7: Overcorrecting Young Learners Until Practice Feels Punitive

**What goes wrong:** The app fails answers for small grammar/pronunciation errors, gives long explanations, or makes students repeat multiple times. Elementary learners may become anxious and avoid speaking.

**Warning signs:**
- Feedback begins with "wrong" or "incorrect."
- The app explains grammar rules instead of modeling one better sentence.
- Students can get stuck in repeat loops.
- Hint usage is displayed as failure.

**Prevention strategy:**
- Keep the correction sequence from the spec: accept understandable meaning, praise effort, show one better target-form sentence, require one repeat.
- Limit retries per turn, then move to `teacher_review` or `needs_retry` with gentle language.
- Track hint level as context, not a penalty.
- Prefer short model sentences over grammar explanations.

**Phase should address it:** Phase 2.

**Confidence:** MEDIUM.

### Pitfall 8: Audio Capture Fails in Real Homes and Browsers

**What goes wrong:** Students cannot start because microphone permission is denied, the site is not HTTPS, the browser promise hangs, the wrong mic is selected, or background noise makes speech unusable.

**Warning signs:**
- Recording is first tested only on developer laptops.
- No microphone preflight screen.
- No handling for `NotAllowedError`, `NotFoundError`, `NotReadableError`, or ignored permission prompts.
- Students find out after speaking that no usable audio was captured.

**Prevention strategy:**
- Build a microphone preflight before the mission starts: permission, input level meter, short test recording, playback confirmation.
- Require HTTPS for production and document supported browsers/devices.
- Use short per-turn recordings with upload progress and retry.
- Preserve partial attempts locally long enough to retry upload after a connection issue.
- Provide child-friendly error states: ask an adult, check microphone permission, move to a quieter place.

**Phase should address it:** Phase 1 / student access and Phase 2 / speaking flow.

**Confidence:** HIGH.

### Pitfall 9: Weak Student Identity Lets Children Submit as Each Other

**What goes wrong:** A class code or QR link is shared, siblings use the same device, or students select the wrong name. Homework status becomes unreliable.

**Warning signs:**
- Student access is only class code plus roster name.
- PIN reset is unmanaged.
- The app remembers a class/student but cannot switch safely on shared devices.
- Teacher cannot see suspicious attempt metadata.

**Prevention strategy:**
- Use class code/QR plus roster name plus 4-digit PIN as planned.
- Add a clear "not you?" switch path for shared devices.
- Show teacher-visible attempt metadata: submitted time, attempt count, device/session marker if privacy-appropriate.
- Add teacher PIN reset and roster correction flows.
- Avoid collecting stronger identity data unless pilots prove it is necessary.

**Phase should address it:** Phase 1 / access model.

**Confidence:** MEDIUM-HIGH.

### Pitfall 10: Hint and Retry States Become Hidden Grades

**What goes wrong:** Teachers or parents read hint use, retries, and `needs_retry` as student ability scores. Students who need scaffolding are stigmatized, and the product drifts toward grading.

**Warning signs:**
- Dashboard sorts students by "score" or "accuracy."
- Hint use is red or labeled as failure.
- `needs_retry` appears without reason or suggested teacher action.
- Product copy promises assessment accuracy.

**Prevention strategy:**
- Keep MVP states operational: completed, not started, missed, needs retry, teacher review.
- Label hint usage as "support used."
- Add reason codes and teacher actions rather than scores.
- Avoid class rankings, grades, percent pronunciation, or CEFR claims in v1.

**Phase should address it:** Phase 3.

**Confidence:** MEDIUM.

### Pitfall 11: Overbuilding LMS, Story, Character, and Gamification Systems Before the Homework Loop Works

**What goes wrong:** The MVP absorbs parent accounts, SSO, textbook libraries, badges, multi-character storylines, detailed analytics, and marketplace content before proving that teachers repeatedly assign missions and can verify completion quickly.

**Warning signs:**
- Work starts on character inventory, seasonal events, visual novel systems, or school SSO before a teacher can assign one mission and review one class.
- More time is spent on content library breadth than teacher-generated target language.
- The data model optimizes for future story arcs instead of assignment attempts.

**Prevention strategy:**
- Ship one recurring buddy and keep only `characterId` as the extension point.
- Build only the vertical loop: teacher creates class, roster, mission; student speaks; teacher scans results.
- Defer parent accounts, SSO, LMS gradebook sync, visual novel branching, numerical grading, and content marketplace.
- Use roadmap gates: do not add engagement systems until repeat teacher assignment is validated.

**Phase should address it:** Every phase; explicitly guard in roadmap scope.

**Confidence:** HIGH.

### Pitfall 12: Dashboard Analytics Pretend to Be More Precise Than the Data

**What goes wrong:** The app offers pronunciation percentages, fluency scores, or "AI grade" labels that appear objective but are not validated for this learner group.

**Warning signs:**
- Scores have decimals or rankings.
- No confidence intervals, no validation set, and no human review comparison.
- Product copy calls AI evaluation "accurate" without local evidence.

**Prevention strategy:**
- Use coarse workflow states in MVP.
- Show uncertainty explicitly with `teacher_review`.
- Validate any future scoring against teacher-labeled samples from the target learner population.
- Keep analytics tied to teacher action: retry, review, completed, missed.

**Phase should address it:** Phase 3; revisit in a later assessment phase only after pilot data.

**Confidence:** MEDIUM-HIGH.

## Minor Pitfalls

### Pitfall 13: Costs Grow Quietly Through Audio Storage and AI Calls

**What goes wrong:** Every turn triggers ASR, LLM evaluation, generation, storage, and playback. Costs look small in demos but grow with class size and repeated attempts.

**Warning signs:**
- No per-mission cost estimate.
- Unlimited retries.
- Audio retained forever.
- Long free chat is allowed after completion.

**Prevention strategy:**
- Cap required turns and retries.
- Store compressed short clips only.
- End the mission after completion.
- Track per-attempt ASR/LLM/storage cost from the first pilot.

**Phase should address it:** Phase 2 for limits; Phase 3 for operational monitoring.

**Confidence:** MEDIUM.

### Pitfall 14: Free-Form Student Speech Collects Personal Information

**What goes wrong:** A child says their full name, phone number, address, school, family details, or private situation during a speaking answer, and the app stores it in transcript/audio.

**Warning signs:**
- Prompts ask "Tell me anything about yourself."
- No PII detection in transcripts.
- Teachers cannot delete or redact an attempt.

**Prevention strategy:**
- Use bounded classroom-safe topics and avoid prompts that solicit identifying information.
- Add transcript PII detection for names, phone numbers, addresses, and locations.
- Provide teacher/admin deletion for attempts containing personal data.
- Keep the buddy from asking follow-up questions about private life.

**Phase should address it:** Phase 2 for prompt constraints and PII detection; Phase 3 for deletion tools.

**Confidence:** HIGH.

### Pitfall 15: The Product Ignores Classroom Reality Around Noise, Devices, and Adult Help

**What goes wrong:** Elementary students complete homework on old phones, shared tablets, noisy rooms, or devices controlled by parents. A polished desktop flow fails in the real use case.

**Warning signs:**
- No mobile-first testing.
- Instructions rely on reading dense text.
- No recovery path when a parent denies microphone permission.
- No low-bandwidth or interrupted-upload handling.

**Prevention strategy:**
- Test on mobile Safari and Chrome, not only desktop Chrome.
- Use large, simple controls and clear recording states.
- Add resumable/partial attempt handling.
- Provide adult-facing troubleshooting text only when needed.
- Pilot with a real class before adding polish features.

**Phase should address it:** Phase 1 and Phase 2.

**Confidence:** MEDIUM-HIGH.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Phase 0: Privacy/data foundation | Audio and transcripts collected before retention, deletion, and vendor-use rules exist | Define data inventory, retention fields, deletion job, school/parent notice, and AI vendor restrictions first |
| Phase 1: Teacher/class/student access | Students submit as each other or pilots start without school approval | Use class code/QR + roster + PIN; add pilot readiness checklist and demo mode |
| Phase 2: Mission generation and student speaking flow | AI drifts, ASR misclassifies, correction feels punitive | Strict mission schema, bounded prompts, tolerant evaluation, one-repeat correction, teacher-review fallback |
| Phase 3: Teacher dashboard | Review becomes a queue of recordings or fake precision scores | Exception-first buckets, transcript-first attempt detail, optional short audio playback, no numerical grading |
| Later: Engagement/story expansion | Story, characters, badges, and content library bury the homework wedge | Add only after repeated teacher assignment and fast review are validated |

## MVP Guardrails Checklist

- No student email/password accounts.
- No full-session recordings.
- No indefinite audio retention.
- No child audio/transcript model training without explicit separate approval.
- No open-ended buddy chat.
- No romance, dating, secrets, or emotionally dependent character behavior.
- No numerical grades or pronunciation percentages in MVP.
- No completion decision based solely on exact transcript matching.
- No dashboard that requires listening to every clip.
- No LMS replacement, parent portal, SSO, marketplace, or visual novel system until the core homework loop is validated.

## Sources

- FTC, "Complying with COPPA: Frequently Asked Questions" (official guidance). Key points used: child voice audio is personal information; operators must limit collection, protect confidentiality/security, retain only as long as necessary, delete when no longer needed, and school consent is limited to educational use. https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- U.S. Department of Education Student Privacy Policy Office, "Protecting Student Privacy While Using Online Educational Services: Requirements and Best Practices" (official guidance, last updated February 2014). Used for FERPA/online educational service framing. https://studentprivacy.ed.gov/resources/protecting-student-privacy-while-using-online-educational-services-requirements-and-best
- U.S. Department of Education Student Privacy Policy Office, "Protecting Student Privacy While Using Online Educational Services: Model Terms of Service" (official checklist, last updated March 2016). Used for vendor terms, warning signs, and data protection review. https://studentprivacy.ed.gov/resources/protecting-student-privacy-while-using-online-educational-services-model-terms-service
- MDN, "MediaDevices: getUserMedia() method" (technical reference). Used for HTTPS/secure context, permission, and microphone error handling risks. https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- Michot et al., "Error-preserving Automatic Speech Recognition of Young English Learners' Language" (2024). Used for ASR risks with young language learners, error smoothing, and need for child/learner speech adaptation. https://arxiv.org/abs/2406.03235
- Getman et al., "Non-native Children's Automatic Speech Assessment Challenge (NOCASA)" (2025). Used for the limited-data and low-baseline-performance risk in non-native child pronunciation assessment. https://arxiv.org/abs/2504.20678
- Kim et al., "Automatic Pronunciation Assessment using Self-Supervised Speech Representation Learning" (2022). Used for evidence that pronunciation models need adaptation to Korean ESL children and human-rated learner data. https://arxiv.org/abs/2204.03863
- Clark et al., "Building Effective Safety Guardrails in AI Education Tools" (2025). Used for AI education guardrails: pedagogical constraints, threat detection, independent moderation, and human-in-the-loop review. https://arxiv.org/abs/2508.05360
- Viberg et al., "Protecting and Promoting Human Agency in Education in the Age of Artificial Intelligence" (2026). Used for human oversight, transparency, and avoiding cognitive offloading/over-automation in education. https://arxiv.org/abs/2602.20014
- Kaliisa et al., "Have Learning Analytics Dashboards Lived Up to the Hype?" (2023). Used for caution against assuming dashboards improve outcomes and for keeping teacher analytics action-oriented. https://arxiv.org/abs/2312.15042
