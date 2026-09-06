# Personalized pronunciation practice

Teachers assign one student five words targeting Light L, S, F, V, or Z. They
choose easy, medium, or hard words and can replace suggestions with a checked
single English word. Custom words require a selected pronunciation, highlighted
letters, and teacher audio preview. The verified bank and CMUdict determine
eligible words; AI does not select them.

The assignment snapshots the sound, ordered words, pronunciation, highlights,
and private word-audio cache references. Generated word audio must be available
before assignment. Preview and assignment requests use the existing teacher
provider budget before rendering or cache access. Pronunciation homework uses the existing assignment history,
student homework list, and teacher review queue rather than the mission library.

## Student experience

Each word appears prominently with its target letters highlighted, a speaker
button beside it, and a separate short sound button. Coco gives one visible and
spoken verdict. The recorder and next-word action remain in a stable action area.
Students may replay either sound and resume saved progress after reloading.

A word finishes when both the whole-word result and target sound pass, or after
three valid tries. Whole-word accuracy uses the existing star thresholds; two
stars pass. The selected phoneme passes at 50. A confidently different word
consumes a try; unclear speech, provider failures, and missing target-phoneme
evidence do not. After the third
unsuccessful try, Coco encourages the student to move on.

The completion view shows concise results for all five words. Whole-word stars
are labelled details, while target-sound feedback remains the practice focus.
A different-word result must not claim that the target sound was assessed.

## Evidence and boundaries

Each valid try preserves its transcript, provider evidence, whole-word score,
target-sound result, and private recording. The result try is the first passing
try, or the third try when none passes. Teacher evidence shows the first and
result recordings. Only first tries contribute to the weak-sound profile.

Finishing all five words sends the attempt to teacher review. Repeated completion
requests are safe, and completion serializes with assignment cancellation. Completed practice
is read-only and does not offer the mission retry action. Every server operation
must prove student or teacher ownership through the assignment chain. Playback
URLs are signed on demand. Existing preset and conversation missions retain
their separate behavior.

See [verification](../testing/pronunciation-practice.md) and
[sound recording provenance](../licenses/pronunciation-sound-clips.md).
