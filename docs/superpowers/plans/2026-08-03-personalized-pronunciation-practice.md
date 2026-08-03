# Personalized Pronunciation Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher assign five personalized pronunciation words to one
student and review the student's first and result tries.

**Architecture:** Keep the existing assignment and evidence chain. Add a
pronunciation assignment kind, a versioned snapshot, and one valid-try table.
Use separate teacher and student pronunciation services. Reuse the current
scorer, transcriber, private audio buckets, status audit, ownership rules, and
review queue.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Zod, Supabase
Postgres and Storage, Azure Speech SDK, OpenAI transcription, Vitest, and
Playwright.

**Decision record:**
`docs/tasks/2026-08-03-pronunciation-practice-decisions.md`

## Global Constraints

- Do not change the approved decisions during implementation.
- Do not add an npm dependency.
- Do not add pronunciation branches to `MissionFlowShell`.
- Do not add pronunciation branches to the mission audio upload service.
- Keep all student recordings in the private `student-audio` bucket.
- Keep generated word audio in the private `tts-audio` bucket.
- Create signed URLs only after an ownership check.
- Every service-role operation must prove student or teacher ownership.
- Keep mission snapshots and pronunciation snapshots immutable after assignment.
- Keep existing preset and conversation behavior unchanged.
- Use word accuracy alone for pronunciation-practice stars.
- Use the existing 80 and 60 star limits.
- Store only valid tries in `pronunciation_word_tries`.
- A different-word try uses a try but has no provider score.
- The UI derives zero filled stars for a different-word result.
- Only try number one contributes to the weak-sound profile.
- Do not apply a migration to any environment without separate approval.
- Do not deploy, push, or publish without separate approval.
- Do not use generated or mock sound clips as application evidence.

## Required Inputs Before Task 2

The project owner supplies these five source files:

```text
/private/tmp/coco-pronunciation-masters/light-l.wav
/private/tmp/coco-pronunciation-masters/s.wav
/private/tmp/coco-pronunciation-masters/f.wav
/private/tmp/coco-pronunciation-masters/v.wav
/private/tmp/coco-pronunciation-masters/z.wav
```

Each source file must be 48 kHz, 24-bit, mono WAV. Each file contains one
selected phoneme take with short silence at both ends.

If a source file is absent, stop Task 2. Do not create a synthetic substitute.

---

## File Structure

### Domain and dictionary

- Create `src/domain/pronunciation/practice.ts` for snapshot schemas, grading,
  feedback, result selection, and progress rules.
- Create `src/domain/pronunciation/word-bank-seed.ts` for the 150 approved word
  seeds.
- Create `src/domain/pronunciation/word-bank.generated.ts` for generated CMUdict
  pronunciations.
- Create `scripts/build-pronunciation-word-bank.mjs` to produce the generated
  bank from the pinned dictionary.
- Create `src/server/pronunciation/cmudict.ts` for custom-word lookup.
- Add `vendor/cmudict/cmudict-0.7b.dict` and `vendor/cmudict/LICENSE`.
- Modify `next.config.ts` so the teacher setup route includes the dictionary.

### Audio

- Create `src/server/audio/pronunciation-word-audio.ts` for Azure SSML,
  generation, cache writes, and signed URLs.
- Create `public/audio/pronunciation/sounds/v1/*.mp3` for the five owner-recorded
  clips.
- Create `docs/licenses/pronunciation-sound-clips.md` for source and rights
  records.
- Modify `src/server/student-access/audio-upload.ts` only to export shared
  storage helpers into a focused module.
- Create `src/server/student-access/audio-storage.ts` for the shared bucket,
  extension, and object-key functions.

### Database

- Create `supabase/migrations/202608030001_pronunciation_practice.sql`.
- Modify `src/lib/db/types.ts` for the new enum, columns, table, and RPC types.
- Create `tests/schema/pronunciation-practice-schema.test.ts`.

### Teacher flow

- Create `src/server/pronunciation/teacher-service.ts`.
- Create
  `src/app/teacher/students/[id]/pronunciation-practice/new/actions.ts`.
- Create
  `src/app/teacher/students/[id]/pronunciation-practice/new/page.tsx`.
- Create `src/components/teacher/PronunciationPracticeForm.tsx`.
- Modify `src/app/teacher/students/[id]/page.tsx`.
- Modify
  `src/app/teacher/classes/[id]/(workspace)/assignments/page.tsx`.

### Student flow

- Create `src/server/student-access/pronunciation-flow.ts`.
- Create
  `src/app/student/pronunciation/[assignmentStudentId]/actions.ts`.
- Create
  `src/app/student/pronunciation/[assignmentStudentId]/audio/route.ts`.
- Create
  `src/app/student/pronunciation/[assignmentStudentId]/word-audio/route.ts`.
- Create `src/app/student/pronunciation/[assignmentStudentId]/page.tsx`.
- Create `src/components/student/PronunciationPracticeShell.tsx`.
- Modify `src/components/student/VoiceRecorderControl.tsx`.
- Modify `src/server/student-access/assignment-list.ts`.
- Modify `src/components/student/AssignmentListItem.tsx`.

### Teacher evidence

- Create `src/server/teacher/pronunciation-evidence.ts`.
- Create `src/components/teacher/PronunciationEvidence.tsx`.
- Modify `src/server/teacher/audio-evidence.ts`.
- Modify `src/server/teacher/assignment-operations.ts`.
- Modify `src/components/teacher/TeacherQueueViews.tsx`.
- Modify `src/components/teacher/SubmissionReviewControls.tsx`.
- Modify `src/app/teacher/evidence/[attemptId]/page.tsx`.
- Modify `src/server/teacher/student-profile.ts`.

---

### Task 1: Pronunciation domain, dictionary, and verified bank

**Files:**

- Create: `src/domain/pronunciation/practice.ts`
- Create: `src/domain/pronunciation/word-bank-seed.ts`
- Create: `src/domain/pronunciation/word-bank.generated.ts`
- Create: `src/server/pronunciation/cmudict.ts`
- Create: `scripts/build-pronunciation-word-bank.mjs`
- Create: `vendor/cmudict/cmudict-0.7b.dict`
- Create: `vendor/cmudict/LICENSE`
- Modify: `next.config.ts`
- Modify: `package.json`
- Test: `tests/domain/pronunciation-practice.test.ts`
- Test: `tests/server/cmudict.test.ts`
- Test: `tests/domain/pronunciation-word-bank.test.ts`

**Interfaces:**

- Produces:
  `PracticeSoundId`,
  `PracticeDifficulty`,
  `PronunciationPracticeSnapshot`,
  `gradePronunciationTry`,
  `selectResultTry`,
  `nextPracticeWordOrder`,
  `findCustomPronunciations`,
  and `PRONUNCIATION_WORD_BANK`.

- [ ] **Step 1: Write the failing domain tests**

Create tests for these exact rules:

```ts
expect(gradePronunciationTry({
  expectedWord: "fish",
  targetPhoneIndex: 0,
  transcript: "fish",
  transcriptConfidence: null,
  wordAccuracy: 81,
  phonemes: [{ phoneme: "f", accuracyScore: 70 }],
})).toMatchObject({
  outcome: "passed",
  starBand: 3,
  fullWordPassed: true,
  targetSoundPassed: true,
});

expect(gradePronunciationTry({
  expectedWord: "fish",
  targetPhoneIndex: 0,
  transcript: "dish",
  transcriptConfidence: { minLogprob: -0.01, tokenCount: 1 },
  wordAccuracy: null,
  phonemes: null,
})).toMatchObject({
  outcome: "different_word",
  starBand: null,
});

expect(selectResultTry([
  { tryNumber: 1, outcome: "word_weak" },
  { tryNumber: 2, outcome: "passed" },
])).toMatchObject({ tryNumber: 2 });

expect(selectResultTry([
  { tryNumber: 1, outcome: "different_word" },
  { tryNumber: 2, outcome: "target_weak" },
  { tryNumber: 3, outcome: "different_word" },
])).toMatchObject({ tryNumber: 3 });
```

Run:

```bash
npx vitest run tests/domain/pronunciation-practice.test.ts
```

Expected: FAIL because the domain module does not exist.

- [ ] **Step 2: Define the bounded domain types**

Use these exact values:

```ts
export const PRACTICE_SOUND_IDS = ["light_l", "s", "f", "v", "z"] as const;
export const PRACTICE_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const PRACTICE_TRY_OUTCOMES = [
  "passed",
  "target_weak",
  "word_weak",
  "different_word",
] as const;

export const PRACTICE_SOUNDS = {
  light_l: { label: "Light L", ipa: "l", arpabet: "L", clip: "/audio/pronunciation/sounds/v1/light-l.mp3" },
  s: { label: "S", ipa: "s", arpabet: "S", clip: "/audio/pronunciation/sounds/v1/s.mp3" },
  f: { label: "F", ipa: "f", arpabet: "F", clip: "/audio/pronunciation/sounds/v1/f.mp3" },
  v: { label: "V", ipa: "v", arpabet: "V", clip: "/audio/pronunciation/sounds/v1/v.mp3" },
  z: { label: "Z", ipa: "z", arpabet: "Z", clip: "/audio/pronunciation/sounds/v1/z.mp3" },
} as const;
```

The snapshot schema must require:

```ts
{
  kind: "pronunciation";
  version: 1;
  soundId: PracticeSoundId;
  difficulty: PracticeDifficulty;
  requiredWords: 5;
  soundClipVersion: "v1";
  words: Array<{
    order: 1 | 2 | 3 | 4 | 5;
    text: string;
    highlightStart: number;
    highlightLength: number;
    source: "verified" | "custom";
    pronunciation: {
      phones: string[];
      targetPhoneIndex: number;
      cmuVariant: number;
    };
    wordAudio: {
      schemaVersion: 1;
      contentHash: string;
      voice: "en-US-AvaNeural";
      format: "audio-24khz-48kbitrate-mono-mp3";
    };
  }>;
}
```

`gradePronunciationTry` must use `scoreToStarBand(wordAccuracy)`. It must not
use `computeBandScore`.

`targetSoundPassed` is true at 50 or more. The feedback priority is:

```text
passed -> Good job!
target_weak -> Try [sound] again!
word_weak -> Try again!
different_word, tries 1-2 -> Try again! Say: [word]
any non-pass try 3 -> Good try!
```

- [ ] **Step 3: Add the exact word-bank seeds**

Create one seed for each `word|highlight` pair:

```ts
export const PRONUNCIATION_WORD_BANK_SEEDS = {
  light_l: {
    easy: ["lake|l", "lamp|l", "leaf|l", "leg|l", "lemon|l", "light|l", "lion|l", "lip|l", "log|l", "love|l"],
    medium: ["black|l", "blue|l", "clean|l", "clock|l", "flag|l", "fly|l", "glass|l", "glue|l", "plane|l", "play|l"],
    hard: ["alive|l", "balloon|ll", "believe|l", "below|l", "collect|ll", "color|l", "delicious|l", "electric|l", "polite|l", "select|l"],
  },
  s: {
    easy: ["bus|s", "face|c", "ice|c", "mouse|s", "pencil|c", "rice|c", "sit|s", "sock|s", "soup|s", "sun|s"],
    medium: ["cent|c", "circle|c", "city|c", "dance|c", "place|c", "school|s", "simple|s", "smile|s", "snake|s", "star|s"],
    hard: ["answer|s", "bicycle|c", "decide|c", "lesson|ss", "listen|s", "medicine|c", "message|ss", "possible|ss", "recent|c", "receive|c"],
  },
  f: {
    easy: ["face|f", "fan|f", "fish|f", "five|f", "food|f", "foot|f", "fork|f", "four|f", "leaf|f", "roof|f"],
    medium: ["after|f", "before|f", "coffee|ff", "dolphin|ph", "elephant|ph", "enough|gh", "laugh|gh", "phone|ph", "photo|ph", "safe|f"],
    hard: ["alphabet|ph", "breakfast|f", "different|ff", "favorite|f", "finish|f", "flower|f", "office|ff", "perfect|f", "traffic|ff", "trophy|ph"],
  },
  v: {
    easy: ["five|v", "love|v", "save|v", "seven|v", "van|v", "vase|v", "very|v", "vest|v", "vet|v", "wave|v"],
    medium: ["drive|v", "even|v", "glove|v", "heavy|v", "movie|v", "never|v", "over|v", "river|v", "visit|v", "voice|v"],
    hard: ["arrive|v", "avoid|v", "clever|v", "cover|v", "every|v", "favorite|v", "invite|v", "leave|v", "private|v", "travel|v"],
  },
  z: {
    easy: ["cheese|s", "eyes|s", "lazy|z", "music|s", "nose|s", "rose|s", "zebra|z", "zero|z", "zip|z", "zoo|z"],
    medium: ["busy|s", "cousin|s", "dozen|z", "easy|s", "frozen|z", "puzzle|zz", "reason|s", "season|s", "visit|s", "wizard|z"],
    hard: ["amazing|z", "because|s", "dessert|ss", "design|s", "dizzy|zz", "magazine|z", "organize|z", "realize|z", "result|s", "Tuesday|s"],
  },
} as const;
```

The build script must fail unless every group has ten words. It must fail
unless each selected CMUdict pronunciation has one target phone.

For Light L, accept `L` only when the next CMUdict phone is a vowel. This rule
accepts clear onsets and rejects final or unclear L.

Merge this file trace into `next.config.ts` so the server can read the vendored
dictionary:

```ts
outputFileTracingIncludes: {
  "/student/missions/*/audio": ["./node_modules/ffmpeg-static/ffmpeg"],
  "/teacher/students/*/pronunciation-practice/new": [
    "./vendor/cmudict/cmudict-0.7b.dict",
  ],
},
```

- [ ] **Step 4: Vendor CMUdict with approval**

Immediately before the download, obtain user approval for the exact GitHub
download. Then use the pinned CMUdict 0.7b dictionary and license.

Run the build script:

```bash
npm run build:pronunciation-bank
```

Expected: `word-bank.generated.ts` contains 150 entries and no rejected seed.

- [ ] **Step 5: Implement custom-word lookup**

`findCustomPronunciations` must have this signature:

```ts
export async function findCustomPronunciations(input: {
  word: string;
  soundId: PracticeSoundId;
}): Promise<Array<{
  word: string;
  cmuVariant: number;
  phones: string[];
  targetPhoneIndex: number;
}>>;
```

Reject spaces and hyphens before dictionary access. Return an empty array when
no safe pronunciation remains. Do not classify names automatically.

- [ ] **Step 6: Run the narrow tests**

```bash
npx vitest run \
  tests/domain/pronunciation-practice.test.ts \
  tests/server/cmudict.test.ts \
  tests/domain/pronunciation-word-bank.test.ts
npm run typecheck
```

Expected: all tests pass and TypeScript reports no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json next.config.ts scripts/build-pronunciation-word-bank.mjs \
  src/domain/pronunciation src/server/pronunciation/cmudict.ts \
  tests/domain tests/server/cmudict.test.ts vendor/cmudict
git commit -m "feat: add pronunciation practice domain and word bank"
```

---

### Task 2: Owner-recorded sound clips and generated word audio

**Files:**

- Create: `src/server/audio/pronunciation-word-audio.ts`
- Create: `public/audio/pronunciation/sounds/v1/light-l.mp3`
- Create: `public/audio/pronunciation/sounds/v1/s.mp3`
- Create: `public/audio/pronunciation/sounds/v1/f.mp3`
- Create: `public/audio/pronunciation/sounds/v1/v.mp3`
- Create: `public/audio/pronunciation/sounds/v1/z.mp3`
- Create: `docs/licenses/pronunciation-sound-clips.md`
- Test: `tests/server/pronunciation-word-audio.test.ts`
- Test: `tests/domain/pronunciation-sound-assets.test.ts`

**Interfaces:**

- Produces:
  `buildPronunciationWordAudioSpec`,
  `getOrCreatePronunciationWordAudio`,
  `warmPronunciationWordAudio`,
  and `signPronunciationWordAudio`.

- [ ] **Step 1: Make sure that the five WAV masters exist**

Run:

```bash
for sound in light-l s f v z; do
  test -f "/private/tmp/coco-pronunciation-masters/${sound}.wav"
done
```

Expected: exit code 0. If this command fails, stop this task.

- [ ] **Step 2: Convert the five delivery clips**

Use the repository `ffmpeg-static` binary. Do not change pitch.

```bash
mkdir -p public/audio/pronunciation/sounds/v1

for sound in light-l s f v z; do
  ./node_modules/ffmpeg-static/ffmpeg \
    -i "/private/tmp/coco-pronunciation-masters/${sound}.wav" \
    -ac 1 -ar 24000 -b:a 48k \
    "public/audio/pronunciation/sounds/v1/${sound}.mp3"
done
```

Listen to all five localhost files. Record the source SHA-256 values and
conversion command in `docs/licenses/pronunciation-sound-clips.md`.

- [ ] **Step 3: Write the failing word-audio tests**

The tests must make sure that:

- the cache hash changes when phones, voice, format, or schema version changes;
- identical input gives a cache hit;
- Azure receives bounded SSML with `en-US-AvaNeural`;
- the output format is 24 kHz, 48 kbps, mono MP3;
- a failed Azure render does not write a cache row;
- signing uses a server-resolved cache hash.

- [ ] **Step 4: Implement Azure SSML generation**

Use the installed Azure SDK. Use `SpeechSynthesizer.speakSsmlAsync`.

Convert CMUdict phones to Azure SAPI phonemes with one fixed map. Preserve the
CMUdict stress values. Escape the display word before SSML insertion.

Use this render specification:

```ts
export const PRONUNCIATION_WORD_AUDIO = {
  schemaVersion: 1,
  provider: "azure_speech",
  model: "neural-tts",
  voice: "en-US-AvaNeural",
  locale: "en-US",
  format: "audio-24khz-48kbitrate-mono-mp3",
  characterId: "pronunciation-word-v1",
} as const;
```

Write the audio to the existing `tts-audio` bucket. Write its metadata to the
existing `tts_audio_cache` table.

- [ ] **Step 5: Run tests and inspect assets**

```bash
npx vitest run \
  tests/server/pronunciation-word-audio.test.ts \
  tests/domain/pronunciation-sound-assets.test.ts
file public/audio/pronunciation/sounds/v1/*.mp3
```

Expected: tests pass. Each file is mono MP3 at 24 kHz.

- [ ] **Step 6: Commit**

```bash
git add src/server/audio/pronunciation-word-audio.ts \
  public/audio/pronunciation/sounds/v1 \
  docs/licenses/pronunciation-sound-clips.md \
  tests/server/pronunciation-word-audio.test.ts \
  tests/domain/pronunciation-sound-assets.test.ts
git commit -m "feat: add pronunciation reference audio"
```

---

### Task 3: Assignment, attempt, valid-try, and completion schema

**Files:**

- Create: `supabase/migrations/202608030001_pronunciation_practice.sql`
- Modify: `src/lib/db/types.ts`
- Test: `tests/schema/pronunciation-practice-schema.test.ts`

**Interfaces:**

- Produces the `assignment_kind` enum.
- Produces the `pronunciation_word_tries` table.
- Produces `assign_pronunciation_practice`.
- Produces `start_pronunciation_attempt`.
- Produces `complete_pronunciation_attempt`.

- [ ] **Step 1: Write the failing schema tests**

The test must read the migration and make sure that it contains:

```text
create type public.assignment_kind as enum ('mission', 'pronunciation')
assignment_kind public.assignment_kind not null default 'mission'
pronunciation_word_tries
unique (attempt_turn_id, try_number)
unique (audio_clip_id)
check (try_number between 1 and 3)
function public.assign_pronunciation_practice
function public.start_pronunciation_attempt
function public.complete_pronunciation_attempt
security definer
for update
is_attempt_turn_owner
to service_role
```

It must also make sure that the migration does not change mission snapshots or
mission completion logic.

- [ ] **Step 2: Add the assignment kind**

Make `assignments.mission_id` nullable. Add this database rule:

```sql
check (
  (assignment_kind = 'mission' and mission_id is not null)
  or
  (assignment_kind = 'pronunciation' and mission_id is null)
)
```

Existing rows keep `assignment_kind = 'mission'`.

- [ ] **Step 3: Add the valid-try table**

Use these columns:

```sql
id uuid primary key default gen_random_uuid(),
attempt_turn_id uuid not null references public.attempt_turns(id) on delete cascade,
audio_clip_id uuid not null unique references public.audio_clips(id) on delete cascade,
try_number smallint not null check (try_number between 1 and 3),
transcript text not null,
transcription_evidence jsonb,
outcome text not null check (outcome in ('passed', 'target_weak', 'word_weak', 'different_word')),
word_accuracy numeric check (word_accuracy between 0 and 100),
star_band smallint check (star_band in (1, 2, 3)),
full_word_passed boolean,
target_sound_accuracy numeric check (target_sound_accuracy between 0 and 100),
target_sound_passed boolean,
created_at timestamptz not null default now(),
unique (attempt_turn_id, try_number)
```

Add a table rule that requires null score fields only for
`different_word`. Scored outcomes require all score fields.

- [ ] **Step 4: Add ownership and grants**

Use `public.is_attempt_turn_owner(attempt_turn_id)` for authenticated teacher
RLS. Grant table access to `authenticated` and `service_role`.

Every service-role caller still performs its own ownership query.

- [ ] **Step 5: Add the three atomic RPCs**

`assign_pronunciation_practice` must:

- use `current_teacher_id()`;
- lock and load the owned active student and class;
- require a pronunciation snapshot with five words;
- insert one assignment, one student assignment, and one status event;
- return the assignment and student-assignment IDs.

`start_pronunciation_attempt` must:

- require `p_student_id` and `p_assignment_student_id`;
- lock the owned student-assignment row;
- return the current in-progress attempt when it exists;
- create one attempt and five `attempt_turns` rows otherwise;
- update status, latest attempt, attempt count, and the status event;
- reject mission assignments.

`complete_pronunciation_attempt` must:

- lock the owned student assignment and attempt;
- require five word turns;
- require a pass or three valid tries for each word;
- set both terminal statuses to `teacher_review`;
- set `needs_review_reason = 'pronunciation_practice'`;
- write one `pronunciation_practice_completed` status event;
- return `ok` again after an identical completed call.

- [ ] **Step 6: Run schema tests**

```bash
npx vitest run tests/schema/pronunciation-practice-schema.test.ts
npm run typecheck
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202608030001_pronunciation_practice.sql \
  src/lib/db/types.ts tests/schema/pronunciation-practice-schema.test.ts
git commit -m "feat: add pronunciation practice persistence"
```

Do not apply the migration to a local or remote database in this task.

---

### Task 4: Teacher suggestions, custom words, preview, and assignment

**Files:**

- Create: `src/server/pronunciation/teacher-service.ts`
- Create:
  `src/app/teacher/students/[id]/pronunciation-practice/new/actions.ts`
- Create:
  `src/app/teacher/students/[id]/pronunciation-practice/new/page.tsx`
- Create: `src/components/teacher/PronunciationPracticeForm.tsx`
- Modify: `src/app/teacher/students/[id]/page.tsx`
- Test: `tests/server/pronunciation-teacher-service.test.ts`
- Test: `src/components/teacher/PronunciationPracticeForm.test.tsx`

**Interfaces:**

- Produces `getPronunciationSetup`.
- Produces `suggestPronunciationWords`.
- Produces `lookupCustomWordAction`.
- Produces `previewPronunciationWordAction`.
- Produces `assignPronunciationPracticeAction`.

- [ ] **Step 1: Write suggestion and ownership tests**

Cover these cases:

- weak supported sounds appear before other supported sounds;
- unsupported weak sounds appear as `Not available`;
- recent weak verified words appear first;
- the newest first try decides whether a practiced word is still weak;
- remaining words use least-recently-practiced order;
- stable word text breaks ties;
- custom words never become automatic suggestions;
- a foreign student ID returns `not_found`;
- assignment rechecks every word and pronunciation on the server;
- assignment stops when one word audio render fails.

- [ ] **Step 2: Implement the teacher service**

Use these inputs:

```ts
export type AssignPronunciationPracticeInput = {
  studentId: string;
  soundId: PracticeSoundId;
  difficulty: PracticeDifficulty;
  dueAt: string | null;
  words: Array<{
    text: string;
    source: "verified" | "custom";
    cmuVariant: number;
    highlightStart: number;
    highlightLength: number;
  }>;
};
```

The service must:

1. load the student through an owned class;
2. rebuild each selected pronunciation from server data;
3. make all five word audio objects;
4. build and parse the immutable snapshot;
5. call `assign_pronunciation_practice`.

Do not trust client phones, target indexes, hashes, titles, or sound clips.

- [ ] **Step 3: Implement bounded server actions**

Every action calls `requireTeacherProfile`.

`lookupCustomWordAction` returns only safe pronunciation choices.

`previewPronunciationWordAction` first proves that the teacher owns the target
student. It then signs the server-generated word audio.

`assignPronunciationPracticeAction` revalidates all fields with Zod.

- [ ] **Step 4: Implement the one-page teacher form**

The route is:

```text
/teacher/students/[studentId]/pronunciation-practice/new
```

The form has:

- supported sound choices;
- difficulty choices;
- five ordered word rows;
- word playback;
- one Replace action per row;
- a custom-word panel;
- pronunciation playback choices;
- letter highlighting;
- a native `input type="date"`;
- one Assign button.

Keep a client-only set of previewed custom pronunciation keys. Disable Assign
until every selected custom pronunciation appears in this set.

The custom-word panel must state that names, phrases, and hyphenated words are
not supported.

- [ ] **Step 5: Add the student-profile entry**

Add one **Assign pronunciation practice** link near **Sounds to work on**.

Do not add a button to each weak-sound row.

- [ ] **Step 6: Run tests**

```bash
npx vitest run \
  tests/server/pronunciation-teacher-service.test.ts \
  src/components/teacher/PronunciationPracticeForm.test.tsx
npm run typecheck
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/server/pronunciation/teacher-service.ts \
  src/app/teacher/students \
  src/components/teacher/PronunciationPracticeForm.tsx \
  src/components/teacher/PronunciationPracticeForm.test.tsx \
  tests/server/pronunciation-teacher-service.test.ts
git commit -m "feat: add teacher pronunciation assignment flow"
```

---

### Task 5: Student assignment routing and resumable practice state

**Files:**

- Create: `src/server/student-access/pronunciation-flow.ts`
- Create:
  `src/app/student/pronunciation/[assignmentStudentId]/actions.ts`
- Create: `src/app/student/pronunciation/[assignmentStudentId]/page.tsx`
- Modify: `src/server/student-access/assignment-list.ts`
- Modify: `src/components/student/AssignmentListItem.tsx`
- Modify:
  `src/app/teacher/classes/[id]/(workspace)/assignments/page.tsx`
- Test: `tests/server/pronunciation-flow.test.ts`
- Test: `tests/server/assignment-list.test.ts`

**Interfaces:**

- Produces `getPronunciationPracticePage`.
- Produces `startOrResumePronunciationAttempt`.
- Produces `completePronunciationAttempt`.

- [ ] **Step 1: Write failing route and resume tests**

Cover:

- a foreign student assignment returns `not_found`;
- a mission assignment never enters the pronunciation route;
- a fresh assignment creates one attempt with five turns;
- a second start returns the same in-progress attempt;
- resume opens the first word without a pass or three tries;
- terminal practice returns the read-only result;
- overdue and canceled work obeys current homework rules.

- [ ] **Step 2: Add assignment kind to homework items**

Add:

```ts
assignmentKind: "mission" | "pronunciation";
label: "Mission" | "Pronunciation";
```

Parse `missionSnapshotSchema` only for mission rows. Parse
`pronunciationPracticeSnapshotSchema` only for pronunciation rows.

For pronunciation progress, count finished word turns. Use “words” instead of
“turns” in the card.

Route mission cards to the current mission and history routes. Route all
pronunciation cards to:

```text
/student/pronunciation/[assignmentStudentId]
```

- [ ] **Step 3: Implement the student flow loader**

The loader must query `assignment_students.id` and `student_id` together. It
must also require `assignments.assignment_kind = 'pronunciation'`.

Group `pronunciation_word_tries` by turn order. Derive:

- current word;
- remaining valid tries;
- first try;
- result try;
- passed word count;
- completion state.

- [ ] **Step 4: Add bounded student actions**

Each action reads `readStudentUnlock`. The browser never submits a student ID.

Use these action inputs:

```ts
{ assignmentStudentId: string }
{ assignmentStudentId: string; attemptId: string }
```

- [ ] **Step 5: Show the Pronunciation label in teacher history**

Select `assignment_kind` in the class assignment page. Show a small
**Pronunciation** label on pronunciation cards.

- [ ] **Step 6: Run tests and commit**

```bash
npx vitest run \
  tests/server/pronunciation-flow.test.ts \
  tests/server/assignment-list.test.ts
npm run typecheck

git add src/server/student-access/pronunciation-flow.ts \
  src/app/student/pronunciation \
  src/server/student-access/assignment-list.ts \
  src/components/student/AssignmentListItem.tsx \
  src/app/teacher/classes
git commit -m "feat: add resumable pronunciation assignments"
```

---

### Task 6: Private upload, transcription, scoring, and valid tries

**Files:**

- Create: `src/server/student-access/audio-storage.ts`
- Create: `src/server/student-access/pronunciation-upload.ts`
- Create:
  `src/app/student/pronunciation/[assignmentStudentId]/audio/route.ts`
- Modify: `src/server/student-access/audio-upload.ts`
- Test: `tests/server/pronunciation-upload.test.ts`
- Test: `tests/server/audio-upload.test.ts`

**Interfaces:**

- Produces `uploadPronunciationTry`.
- Reuses `transcribeAudioFile`.
- Reuses `scorePronunciation`.
- Reuses the private `student-audio` object-key format.

- [ ] **Step 1: Extract only the shared storage helpers**

Move these functions without changing behavior:

```ts
getStudentAudioBucketId()
extensionForMimeType(mimeType)
buildStudentAudioObjectKey(input)
```

Import them back into the mission upload service. Run the existing audio tests
before writing the new service.

```bash
npx vitest run tests/server/audio-upload.test.ts
```

Expected: all existing tests pass.

- [ ] **Step 2: Write failing pronunciation upload tests**

Cover:

- every query uses assignment, student, attempt, and turn ownership filters;
- the server derives clip kind and try number;
- the server rejects out-of-order word uploads;
- no speech stores a failed clip and consumes no try;
- scoring failure stores the clip and consumes no try;
- a confident different word consumes one try and stores no score row;
- an unclear different transcript consumes no try;
- score 80 with target 49 produces `target_weak`;
- score 59 with target 80 produces `word_weak`;
- score 60 with target 50 produces `passed`;
- a fourth valid try is impossible;
- a passed word cannot receive another upload.

- [ ] **Step 3: Implement the upload service**

The service input is:

```ts
export type UploadPronunciationTryInput = {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  turnOrder: number;
  file: Blob;
  mimeType: string;
  durationMs: number;
  byteSize: number;
};
```

Use `student_audio` request budget admission before provider work.

The service performs this order:

1. make sure that the input is bounded;
2. load the owned pronunciation assignment and snapshot;
3. load the owned in-progress attempt and current turn;
4. derive the next try number and clip kind;
5. insert the pending audio clip;
6. upload and transcribe concurrently;
7. classify a confident different word;
8. score the expected word;
9. store `pronunciation_scores` with accuracy-only stars;
10. store one valid-try row;
11. return the server-derived feedback.

Do not call mission evaluation or Coco conversation generation.

- [ ] **Step 4: Implement the route**

The route accepts only:

```text
file
attemptId
turnOrder
mimeType
durationMs
```

It does not accept `studentId`, `clipKind`, `tryNumber`, `word`, `phones`, or
scores.

Use the existing MIME and byte limits. Use a 10-second duration limit.

- [ ] **Step 5: Run tests and commit**

```bash
npx vitest run \
  tests/server/pronunciation-upload.test.ts \
  tests/server/audio-upload.test.ts
npm run typecheck

git add src/server/student-access/audio-storage.ts \
  src/server/student-access/audio-upload.ts \
  src/server/student-access/pronunciation-upload.ts \
  src/app/student/pronunciation \
  tests/server/pronunciation-upload.test.ts \
  tests/server/audio-upload.test.ts
git commit -m "feat: add pronunciation try scoring pipeline"
```

---

### Task 7: Student practice, feedback audio, and completion result

**Files:**

- Create: `src/components/student/PronunciationPracticeShell.tsx`
- Create:
  `src/app/student/pronunciation/[assignmentStudentId]/word-audio/route.ts`
- Modify: `src/components/student/VoiceRecorderControl.tsx`
- Modify:
  `src/app/student/missions/[assignmentStudentId]/tts/route.ts`
- Test: `src/components/student/PronunciationPracticeShell.test.tsx`
- Test: `src/components/student/VoiceRecorderControl.test.tsx`

**Interfaces:**

- Consumes the Task 5 page state and Task 6 upload route.
- Reuses `VoiceRecorderControl`.
- Reuses `CocoSpeechAudio` with bounded feedback variants.

- [ ] **Step 1: Write failing student UI tests**

Cover:

- word audio requests start once when a new word appears;
- Play sound and Play word remain available;
- sound and word replay are unlimited;
- there is no Skip button;
- all instructions and feedback are in English;
- the transcript never appears;
- zero filled stars appear as `☆☆☆` for a result different word;
- one star appears only for a scored result below 60;
- color is not the only target-sound signal;
- Next word is absent before pass or try three;
- Next word does not advance automatically;
- a passed word cannot record again;
- the completion page has no total score;
- a resumed practice opens the unfinished word.

- [ ] **Step 2: Add practice mode to the recorder**

Extend the recorder mode:

```ts
type RecorderMode = "original" | "repeat" | "practice";
```

For practice mode, the success label is **Recorded**. Keep the current mission
labels unchanged.

- [ ] **Step 3: Implement owned word-audio signing**

The browser submits a word order only. The route:

1. reads the unlock cookie;
2. loads the owned pronunciation snapshot;
3. resolves the cache hash for that word;
4. signs the matching private `tts-audio` object.

Do not accept a hash, word, voice, or object key from the browser.

- [ ] **Step 4: Implement the shell**

Show:

- `Word N of 5`;
- the progress bar;
- a small Coco character;
- one highlighted word;
- Play sound;
- Play word;
- the practice recorder;
- one feedback message;
- the target sound result;
- Next word at the correct time.

Use these bounded feedback variants in the existing Coco TTS route:

```text
pronunciation_good
pronunciation_target_weak
pronunciation_word_weak
pronunciation_different_word
pronunciation_good_try
```

Map them to the approved visible messages. Do not synthesize transcripts or
custom client text.

- [ ] **Step 5: Implement the result view**

For each result word:

- show 1–3 filled stars for a scored result;
- show three empty stars for a different word;
- show **Good try!** for a different word;
- show a target-sound check or **Practice more**.

Do not show a total score or a record button.

- [ ] **Step 6: Run tests and commit**

```bash
npx vitest run \
  src/components/student/PronunciationPracticeShell.test.tsx \
  src/components/student/VoiceRecorderControl.test.tsx \
  src/components/student/CocoSpeechAudio.test.tsx
npm run typecheck

git add src/components/student \
  src/app/student/pronunciation \
  src/app/student/missions
git commit -m "feat: add student pronunciation practice UI"
```

---

### Task 8: Weak profile, review queue, and teacher evidence

**Files:**

- Create: `src/server/teacher/pronunciation-evidence.ts`
- Create: `src/components/teacher/PronunciationEvidence.tsx`
- Modify: `src/server/teacher/student-profile.ts`
- Modify: `src/server/teacher/audio-evidence.ts`
- Modify: `src/server/teacher/assignment-operations.ts`
- Modify: `src/components/teacher/TeacherQueueViews.tsx`
- Modify: `src/components/teacher/SubmissionReviewControls.tsx`
- Modify: `src/app/teacher/evidence/[attemptId]/page.tsx`
- Test: `tests/server/pronunciation-evidence.test.ts`
- Test: `tests/server/student-profile.test.ts`
- Test: `tests/server/teacher-assignment-operations.test.ts`

**Interfaces:**

- Produces `getPronunciationEvidenceForTeacher`.
- Extends `TeacherReviewRow` with `assignmentKind` and `resultSummary`.
- Extends `SubmissionReviewControls` with `allowRetry`.

- [ ] **Step 1: Write failing evidence and profile tests**

Cover:

- a foreign teacher receives no pronunciation evidence;
- evidence returns all stored tries to the loader;
- the UI model selects only first and result try;
- first and result recordings use their exact audio clip IDs;
- result try is the first pass or try three;
- the queue summary is `N of 5 words passed`;
- `allowRetry={false}` hides Request retry;
- only pronunciation try number one enters the weak profile;
- mission original answers remain in the weak profile;
- pronunciation retries never enter the weak profile.

- [ ] **Step 2: Extend weak-profile loading**

Keep the current mission-score query. Add a second owned query through:

```text
pronunciation_word_tries
-> attempt_turns
-> attempts
-> assignment_students
-> assignments
-> classes
```

Require `try_number = 1`. Map each row to the existing `StudentClipScore`.

- [ ] **Step 3: Add pronunciation evidence**

The loader must select:

- assignment kind and snapshot;
- student, class, and status;
- five word turns;
- all valid tries;
- audio processing status;
- pronunciation scores.

The UI model returns:

```ts
type PronunciationWordEvidence = {
  order: number;
  word: string;
  attemptCount: number;
  firstTry: PronunciationTryEvidence;
  resultTry: PronunciationTryEvidence;
};
```

Use the existing `AudioClipPlayer`. It already creates signed URLs through the
owned teacher action.

- [ ] **Step 4: Dispatch the evidence page by assignment kind**

Add `assignmentKind` to `AttemptEvidence`.

Render `PronunciationEvidence` for pronunciation attempts. Render the current
mission evidence unchanged for mission attempts.

Pass `allowRetry={false}` for pronunciation practice. Keep Mark reviewed.

- [ ] **Step 5: Add the queue summary**

For pronunciation rows, show:

```text
3 of 5 words passed
```

For mission rows, keep the current queue copy.

- [ ] **Step 6: Run tests and commit**

```bash
npx vitest run \
  tests/server/pronunciation-evidence.test.ts \
  tests/server/student-profile.test.ts \
  tests/server/teacher-assignment-operations.test.ts
npm run typecheck

git add src/server/teacher src/components/teacher \
  src/app/teacher/evidence tests/server
git commit -m "feat: add pronunciation review evidence"
```

---

### Task 9: Full verification and manual acceptance

**Files:**

- Create: `tests/e2e/pronunciation-practice.spec.ts`
- Create: `docs/testing/pronunciation-practice.md`
- Modify: `TASK.md` only after the feature is implemented and verified.

- [ ] **Step 1: Add one end-to-end path**

The test covers:

1. teacher opens one student;
2. teacher creates an F practice;
3. teacher assigns five words;
4. student sees the Pronunciation card;
5. student resumes after one valid try;
6. student completes all five words;
7. student sees the read-only result;
8. teacher sees `N of 5 words passed`;
9. teacher opens the first and result recordings.

Use test doubles for Azure and OpenAI. Do not call paid providers.

- [ ] **Step 2: Run the narrow feature suite**

```bash
npx vitest run \
  tests/domain/pronunciation-practice.test.ts \
  tests/domain/pronunciation-word-bank.test.ts \
  tests/server/cmudict.test.ts \
  tests/server/pronunciation-word-audio.test.ts \
  tests/schema/pronunciation-practice-schema.test.ts \
  tests/server/pronunciation-teacher-service.test.ts \
  tests/server/pronunciation-flow.test.ts \
  tests/server/pronunciation-upload.test.ts \
  tests/server/pronunciation-evidence.test.ts \
  src/components/teacher/PronunciationPracticeForm.test.tsx \
  src/components/student/PronunciationPracticeShell.test.tsx
```

Expected: all feature tests pass.

- [ ] **Step 3: Run regression checks**

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

Expected: all commands exit with code 0.

- [ ] **Step 4: Run the local browser acceptance**

Apply the migration only to an approved local Supabase environment.

Start the app at `http://localhost:3000`. Complete the teacher and student path
with non-production data.

Label screenshots as **localhost evidence**. Do not describe them as production
evidence.

- [ ] **Step 5: Make sure that security and behavior remain correct**

Make sure that:

- a foreign teacher cannot open setup, assignment, evidence, or audio;
- a foreign student cannot open practice, upload, or word audio;
- no Storage object key appears in a browser response;
- no student recording has a public URL;
- a fourth valid try is impossible;
- no-speech and scoring failures do not use a try;
- only first tries update the weak profile;
- mission preset behavior is unchanged;
- mission conversation behavior is unchanged.

- [ ] **Step 6: Commit verification docs**

```bash
git add tests/e2e/pronunciation-practice.spec.ts \
  docs/testing/pronunciation-practice.md TASK.md
git commit -m "test: verify personalized pronunciation practice"
```

Do not push, deploy, publish, or apply a production migration.

---

## Approval Gate

This plan is not implementation approval by itself.

Implementation can start only after the user approves this plan. External
downloads, database migration application, deployment, and publication still
need their own approvals at the time of action.
