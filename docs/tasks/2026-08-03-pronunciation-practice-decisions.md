# Pronunciation Practice Decisions

**Status:** Product and technical decisions complete  
**Implementation:** Approved and implemented locally; migration not applied

## Goal

Let a teacher assign short pronunciation practice to one student. The practice
uses the student's weak sounds and gives feedback for each word.

## Existing foundation

- Coco stores pronunciation results for each scored recording.
- The stored results include scores for the full word and its sounds.
- Coco already builds a weak-sound profile for each student.
- Coco already uses one-star, two-star, and three-star feedback.
- Student audio remains private. Teacher playback uses signed URLs.

## Teacher flow

1. Open a student page.
2. Select **Assign pronunciation practice**.
3. Select one sound.
4. Select `easy`, `medium`, or `hard`.
5. Review five suggested words.
6. Replace individual words when needed.
7. Assign the practice.

Each setup assigns practice to one student only.

The teacher can play every full word before assignment. For a custom word, the
teacher must play the selected pronunciation at least once before assignment.

The student page shows weak sounds first. It also lets the teacher select
another supported sound. If Coco has no score data for the student, it shows
all supported sounds.

This practice does not appear in the reusable mission library. It appears in
the class assignment history with other homework. The teacher can use that
history to see whether the student started or completed the practice.
Pronunciation practice uses the same due date and homework status as other
assignments.

The student homework list shows a **Pronunciation** label. The title follows
the pattern **[sound] Sound Practice**, such as **F Sound Practice**.

Every completed pronunciation practice appears in **Needs review** for the
teacher. The queue shows a short result, such as **3 of 5 words passed**.

## Practice content

- One practice assignment targets one sound.
- The first release always has five words.
- The student does not see a Korean meaning for each word.
- Adjustable word counts are deferred.
- Each verified word has an `easy`, `medium`, or `hard` label.
- `easy` is the default.
- All three levels use elementary-safe words. `hard` means a harder common
  word, not rare or advanced vocabulary.
- Verified words can use different spellings for the same sound. For example,
  the F sound can use `f` in `fish` or `ph` in `phone`.
- Easy words prefer the most common spelling. Medium and hard words can use
  other verified spellings.
- Coco uses fixed selection rules. It does not call AI to select words.
- Coco first suggests words that the student recently said poorly.
- A past weak word is eligible only when it is a verified-bank word in the
  selected difficulty.
- Coco fills the remaining spaces with new verified words for the selected
  sound and difficulty.
- For new words, Coco selects the words that the student practiced least
  recently.
- The newest first-try result decides whether a past word is still weak.
- The verified bank has ten words for each supported sound and difficulty.
- The teacher can replace a suggested word with any single English word.
- Custom words do not return as automatic suggestions in later practice.
- Coco must check that a custom word contains the selected sound.
- The teacher must mark the letters that Coco will highlight.
- If a custom word has multiple valid pronunciations, Coco plays each option.
  The teacher selects one before assignment.
- The selected pronunciation must contain the target sound.
- Each word contains the target sound only once in the first release.
- Coco rejects a custom word that it cannot check.
- Phrases, names, and hyphenated words are not supported.

## Initial sounds

The first release supports:

- Light L
- S
- F
- V
- Z

Dark L is a separate sound and is deferred. Other weak sounds remain visible
in the full student report. The assignment tool marks them **Not available**.

## Reference audio

- The pronunciation standard is General American English.
- All sound clips, word audio, labels, and custom-word checks use that accent.
- The highlighted letters play a licensed human-recorded sound clip.
- The highlighted letters play the speech sound, such as `/f/`. They do not
  play the letter name, such as “eff.”
- The full word plays generated speech.
- Coco plays the full word once when each new word appears.
- The student can replay both clips without a limit.

## Student flow

For each word:

1. The student listens to the sound or the full word.
2. The student records the word.
3. Coco shows one, two, or three stars for the full word.
4. Coco shows the result for the selected sound on the highlighted letters.
5. Coco gives one first try and up to two retries.
6. After the third try, Coco lets the student select **Next word**.

The student does not see the speech-recognition transcript. The teacher sees
the transcript with the recording.

The student does not see IPA or other technical pronunciation symbols. Coco
uses labels such as **F sound** and highlights the matching letters. The
teacher can see the technical sound symbol.

Color is not the only result signal. Text or an icon also identifies a good or
weak target sound.

If the selected sound is good, Coco shows a check mark and says **Good job!**

Coco shows only one message after a scored try:

- **Good job!** when the full word and selected sound pass;
- **Try [sound] again!** when the selected sound is weak; or
- **Try again!** when the selected sound passes but the full word is weak.

If Coco hears no speech, the recording does not use one of the three tries.
Coco asks the student to record again.

If Coco cannot score a recording, the recording does not use a try. Coco says
**Let's try again!**

If Coco clearly hears a different word, the recording uses one try. Coco does
not show stars. Coco says **Try again! Say: [word]** and lets the student
record again.

A word passes when:

- the full word has at least two stars; and
- the selected sound is not weak.

The full-word stars use word pronunciation accuracy only. They do not use
speaking smoothness. The existing star limits remain:

- three stars at 80 or more;
- two stars at 60 to 79; and
- one star below 60.

If the full word is weak but the selected sound is good, Coco shows the
selected letters in green and says **Try again!**

If the full word passes but the selected sound is weak, Coco asks for another
try. The selected letters show the sound error. Coco says **Try [sound]
again!** For example, an F mission says **Try F again!**

If the third try is still weak, Coco says **Good try!** and moves to the next
word. A weak final result does not block mission completion.

If the third try is a different word, Coco also says **Good try!** and lets the
student move to the next word.

After a word passes or reaches its third try, Coco shows a **Next word**
button. Coco does not move to the next word automatically.

After a word passes, the student cannot retry it to get more stars.

Coco saves progress after each valid try. If the student leaves, the practice
opens at the unfinished word when the student returns.

The practice has no skip button.

The screen shows a word count, such as **Word 2 of 5**, and a progress bar.

A small Coco character shows feedback. Pronunciation practice has no
conversation or story. The practice word remains the main focus.

Coco speaks each feedback message. The same message stays visible on the
screen.

All student instructions and feedback use English only.

## Student result

The completion screen uses one result attempt for each word. If an attempt
passes both checks, Coco uses that attempt. If no attempt passes both checks,
Coco uses the final attempt.

For each word, the screen shows:

- the full-word stars from the result attempt;
- a check mark when the target sound passed; or
- **Practice more** when the target sound stayed weak.

If the result attempt is a different word, the screen shows zero filled stars,
**Good try!**, and **Practice more**. Zero filled stars appear as three empty
star outlines. One star remains reserved for a scored word below 60.

The screen does not show a total score.

After completion, the practice is read-only. The student cannot start it
again. The teacher must assign new practice.

## Student practice UI (2026-08-03 grilling)

These decisions refine how the approved student flow is presented. They do not
change any rule in **Student flow** or **Student result** above. Real local
testing showed that stars appeared only on the final screen, the completed
result had no route home, and the practice screen was cluttered.

### Layout

The practice screen uses fixed zones. The header, word, listening controls,
result strip, and action each keep a reserved place. The screen does not grow
downward when feedback arrives. The result strip fills in place and the record
control becomes **Next word** in the same slot.

The word remains the largest element on the screen.

### After a scored try

Stars appear immediately after every scored try, not only on the result screen.

The stars show the try that the student just made. They do not accumulate, do
not show a per-try history, and do not show a best-so-far value.

The result strip holds the stars on the left and the target-sound result on the
right. The target-sound result is an icon: a check when the target sound passed
and a cross when it stayed weak. The strip carries no words, because Coco's
message already states the outcome and speaks it.

A weak target sound colors the strip red and shows the highlighted letters in
red with an underline. A passing target sound uses the green treatment already
approved. Color is never the only signal; the check or cross carries the result
on its own.

A different-word try shows three empty stars and the cross, so the strip keeps
one shape for every outcome. Empty stars mean that Coco could not score the
word. They do not mean a score of zero. One star remains reserved for a scored
word below 60.

### Coco's message

Coco's message appears as a small round Coco portrait beside a speech bubble,
in the manner of a chat row. The replay speaker control sits inside the bubble.
The message text is unchanged and still comes from the approved bounded list.

### Removed clutter

The duplicated sound heading collapses to one line. **Play sound** and **Play
word** use the secondary control style so that they do not compete with the
primary action. The permanent "Say the word clearly." instruction is removed.

### Completion

The completed result offers two routes back to `/student/home`: a back control
in the header and a **Back to homework** button below the five word rows. The
two controls carry different accessible names. The result stays read-only and
still shows no total score.

## Teacher evidence

The teacher sees per-word evidence:

- the first-try result;
- the result attempt shown on the student completion screen;
- the number of attempts;
- the first recording; and
- the recording for the result attempt.

All attempts remain stored even when the page shows only the first and
result-attempt recordings.

## Weak-sound profile

- Pronunciation practice updates the student's weak-sound profile.
- Only the first try counts toward the weak-sound profile.
- The result attempt shows practice progress.
- The current weak-sound limit remains 50.

## Deferred

- Adjustable word counts
- Sound-pair missions
- Dark L
- A student-page shortcut from each individual weak-sound row
- An **Assign more practice** button on the teacher review page
- More supported sounds
- A separate pronunciation page

## Technical research decisions

### Custom-word checks

Coco will use a pinned local copy of CMUdict 0.7b. It will not call a
dictionary service at runtime.

CMUdict is a free North American English pronunciation dictionary. Its license
permits commercial use and redistribution. The repository will keep the
CMUdict license and source notice with the pinned data.

The custom-word check will:

1. reject spaces and hyphens;
2. find every CMUdict pronunciation for the word;
3. keep only pronunciations that contain the selected sound once;
4. play each remaining pronunciation;
5. require the teacher to select one; and
6. reject the word when no pronunciation remains.

Light L needs a stricter rule because CMUdict does not separate light and dark
L. Coco will accept L only when the selected CMUdict `L` starts a syllable
before a vowel. It will reject unclear cases.

CMUdict can contain personal names. The custom-word field will state that
names are not supported. The teacher remains responsible for this content
rule. Coco cannot reliably prove that every spelling is not also a name.

The verified word bank will be a small, versioned TypeScript data file. It
will contain the word, level, target letters, CMUdict pronunciation, and
target sound position. It will not need a database table or AI selection.

Sources:

- [CMUdict repository and license](https://github.com/cmusphinx/cmudict)
- [CMUdict pronunciation lookup](https://www.speech.cs.cmu.edu/cgi-bin/cmudict)

### Generated word audio and cache

Coco will use Azure Speech for full-word audio. Azure is already used for
pronunciation scoring, and its package is already installed.

The server will render the teacher-selected pronunciation with Azure SSML and
the `<phoneme>` element. It will use the standard General American
`en-US-AvaNeural` voice and SAPI phonemes derived from the selected CMUdict
entry.

The delivery format will be 24 kHz, 48 kbps, mono MP3. The server will make
all five word clips before it creates the assignment. A failed render will
block assignment instead of silently changing the pronunciation.

Word audio will reuse the private `tts-audio` bucket and
`tts_audio_cache` table. The server-computed cache key will include:

- a pronunciation-audio schema version;
- the word;
- the selected CMUdict phonemes;
- the Azure voice;
- the locale; and
- the output format.

The assignment snapshot will store this render description and cache hash. It
will not store a signed URL. Student and teacher playback will create short
signed URLs after an ownership check.

The teacher setup page will require a custom pronunciation preview before the
**Assign** button becomes available. This is a trusted teacher content check,
not a student authorization boundary. Coco will not add a preview-receipt
table.

Sources:

- [Azure SSML phoneme element](https://learn.microsoft.com/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation)
- [Azure Speech audio output formats](https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech)

### Licensed sound clips

Coco needs five new human recordings: Light L, S, F, V, and Z. Public IPA
recordings found during research have open licenses, but they do not document
a General American speaker. They do not meet the approved accent rule.

The project owner will record the five sounds. No paid recording service is
needed. The project owner owns the recording rights.

The recording session will contain three clean takes of each sound. It will
not contain letter names or full practice words. The final app will use one
selected take for each sound.

The existing owner-recorded 48 kHz, 16-bit, mono WAV masters are approved for
this feature. Keep the masters outside the app. Create trimmed 24 kHz, mono MP3
files for the web app.

The five final clips will be:

- Light L, as at the start of `light`;
- S, as in `sun`;
- F, as in `fish`;
- V, as in `van`; and
- Z, as in `zoo`.

Each clip will contain the speech sound only. It will include a short silence
before and after the sound.

The repository license note will state that the project owner recorded the
clips and owns the rights. It will record the source hash and conversion
settings. It will not include personal contact details.

### Assignment and evidence data

Coco will keep the existing assignment, student assignment, attempt, turn,
audio, score, status-event, and review records.

The `assignments` table will add an `assignment_kind` value. Existing rows
will default to `mission`. Pronunciation rows will use `pronunciation`.
`mission_id` will become optional, with a database rule that requires it only
for mission assignments.

The existing `mission_snapshot` JSON column will hold one of two snapshot
types:

- the current mission snapshot; or
- a versioned pronunciation snapshot.

The pronunciation snapshot will preserve:

- the selected sound and difficulty;
- the five ordered words;
- the highlighted letter positions;
- the selected CMUdict pronunciation and target sound position;
- whether each word came from the verified bank or teacher input;
- the sound-clip version; and
- the generated word-audio render description and cache hash.

Coco will treat old snapshots without a `kind` field as mission snapshots.
This avoids rewriting existing assignment data.

One `attempt_turns` row will represent one practice word. This keeps every
recording inside the current private audio and ownership chain.

A new `pronunciation_word_tries` table will record each valid try. It will
contain:

- the attempt turn and audio clip;
- try number one, two, or three;
- the hidden transcript and confidence data;
- full-word accuracy and stars;
- target-sound accuracy and pass result; and
- the final outcome used by the UI.

An audio clip with no speech or a scoring failure will remain stored for
audit, but it will not get a valid-try row. Therefore, it will not use one of
the three tries.

The first valid try will use the existing `original_answer` clip kind.
Later valid tries will use `repeat_attempt`. The existing
`pronunciation_scores` row will keep the provider result for every scored
clip.

The result try will be derived. It is the first try that passes both checks,
or try three when no try passes. Coco will not add a duplicate result flag.

A database function will finish the practice only after all five words have
passed or used three valid tries. The same transaction will:

- mark the attempt for teacher review;
- complete the student assignment;
- write the status event; and
- set the review reason to `pronunciation_practice`.

The function will be safe to call more than once. Every service-role read or
write will prove teacher or student ownership through the existing assignment
chain.

The weak-sound profile will include only try number one. It will use the
stored first-try transcript and the current weak-sound limit of 50.

### Teacher pages

The student profile will add one **Assign pronunciation practice** button near
the weak-sound section.

The setup page will use one route and one form:

`/teacher/students/[studentId]/pronunciation-practice/new`

The form will show:

1. supported sound choices, with weak sounds first;
2. an easy, medium, or hard control;
3. five word rows with the highlighted letters, word playback, and
   **Replace**;
4. a custom-word panel only when the teacher replaces a word;
5. the existing due-date control; and
6. one **Assign** button.

The custom-word panel will show valid pronunciation choices with playback. It
will also require the teacher to select the letters to highlight.

The existing assignment history will show the **Pronunciation** label. The
existing review queue will show the completed count, such as
**3 of 5 words passed**.

The existing teacher attempt route will select an evidence component by
assignment kind. The pronunciation component will show the first and result
try for each word and use the current signed-audio controls. It will not show
the existing **Request retry** action because completed pronunciation
practice is read-only.

### Student pages

The student homework query will return assignment kind. Mission cards will
keep their current route. Pronunciation cards will open:

`/student/pronunciation/[assignmentStudentId]`

The page will use a small pronunciation flow instead of adding branches to
the current mission conversation shell. It will reuse the current recorder
control, private upload pattern, Coco feedback display, and homework status.

The practice page will show:

- **Word [number] of 5** and the progress bar;
- the large word with its target letters highlighted;
- **Play sound** and **Play word** controls;
- the current recorder control;
- one visible and spoken feedback message; and
- **Next word** only after a pass or the third valid try.

The same route will show a read-only result after completion. The homework
list will continue to open that result.

### Small scoring rules needed by the implementation

The existing Azure scorer will provide the raw word and phoneme scores. The
new flow will use word accuracy alone with the existing 80 and 60 star limits.
It will not use the scorer's current fluency-based star result.

Coco will call a recording a different word only when transcription returns
one different word with usable confidence. Unclear transcription will not
consume a try.

The new upload service will be separate from the large mission upload
orchestrator. It will reuse the scorer, transcriber, private storage, signed
URL, and ownership helpers without adding pronunciation branches to the
conversation flow.

## Done checks for a future implementation

- Ownership checks protect every student, assignment, attempt, score, and audio
  read or write.
- Mission snapshots preserve the assigned sound, words, highlights, and audio
  references.
- The first try and two-retry limit work for every word.
- Full-word and selected-sound results cannot contradict the displayed message.
- Only first tries update the weak-sound profile.
- Teacher evidence shows the correct first and result-attempt recordings.
- Existing preset and conversation missions keep their current behavior.

## Result presentation, approved 2026-08-04

The owner approved presenting one verdict per try. This resolves the done check
"Full-word and selected-sound results cannot contradict the displayed message",
which the earlier two-strip layout violated: it rendered the star band and the
target-sound pass as two competing pass or fail verdicts, so a strong word with
a weak target sound showed three stars beside a failure mark.

Coco's message is the single verdict. The star band is a labelled detail reading
"whole word", never a second verdict, and carries no pass or fail styling. The
target-sound result is no longer drawn as its own verdict; it reaches the student
through Coco's message, which already names the sound to retry.

Weak tries use warm amber, not red. A child pronouncing a word imperfectly is
not yet finished, not in error. Red stays reserved for genuine failures.

The verdict card sits in a fixed-height zone so the screen does not reflow when
feedback arrives.

## Next step

Review the separate implementation plan. Get user approval before changing
code or the database.
