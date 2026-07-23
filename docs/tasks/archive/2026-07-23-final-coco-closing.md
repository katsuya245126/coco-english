# Final Coco closing for dynamic conversation missions

**Status:** Complete

## Goal

End a successful dynamic conversation mission with a relevant spoken Coco
closing and an explicit **Finish mission** button before the existing completion
screen.

## Scope

- Derive final closing behavior from the mission's `requiredTurns`.
- Generate and persist a response-specific, no-question Coco farewell.
- Record completion, then show a closing step with **Finish mission**.
- Preserve safe completed-assignment re-entry behavior.
- Keep internal teacher review auditable while allowing the conversation to continue.

## Implementation and automated verification

The implementation and remediation commits are complete:

- `82b6dd25` — generate final Coco closing.
- `d4e5d185` — show final Coco closing.
- `15849dcc` — configure complete-sentence answers.
- `bf33a090` — apply answer and review context.
- `5055d07f` — defer conversation teacher review.
- `b268f999` — count repeat-path teacher-review turns as finished.

Recorded verification:

- Focused regression matrix: 19 files, 252 tests passed.
- Full suite: 91 files, 939 tests passed, 4 skipped.
- Typecheck passed.
- Lint passed with only the known unrelated `label` warning.
- Build passed for the controlling checkout.

## Local UAT evidence — 2026-07-23

Environment: local Supabase and localhost app at `http://localhost:3200`,
class `UATCODE1`, local-only synthetic speech fixtures. No production or
external database was changed.

The approved reset/reseed was performed through the private reset tool and the
ownership-checked teacher assignment RPC. The final run confirmed:

1. `A latte.` received the meaning-preserving correction `I would like a latte.` and the repeat advanced.
2. A deliberately ambiguous `Blah blah.` turn advanced internally with no student-facing teacher-review message or extra Continue button.
3. Later turns had working Hint and Play Coco/TTS controls; all persisted clips were transcribed and pronunciation-scored.
4. The final persisted Coco line was relevant and had no question: `You like coffee a lot! Thank you for talking with me today. See you next time!`
5. **Finish mission** revealed the existing `Mission complete!` screen.
6. The student saw the mission in Past as Completed, and the read-only recap showed five turns and playable recordings.
7. Reopening the completed mission redirected away from the recorder.
8. Teacher-owned verification showed assignment and attempt status `teacher_review`, review reason `ambiguous`, five turns, ten processed audio clips, and ten pronunciation scores.
9. Local Storage issued an on-demand signed teacher audio URL; playback returned HTTP 200.

Final database verification was scoped to teacher `da569839-24f5-416c-8977-38453fb1a0ff` and class `UATCODE1`:

```text
assignment status: teacher_review
attempt status: teacher_review
review reason: ambiguous
turns: 5
transcribed audio clips: 10
pronunciation scores: 10
```

No push, deploy, merge, publish, or production mutation was performed.
