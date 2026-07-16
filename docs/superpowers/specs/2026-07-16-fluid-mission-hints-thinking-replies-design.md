# Fluid Mission Layout, Immediate Hints, Thinking Sprite, and Natural Vague Replies

**Date:** 2026-07-16
**Scope:** Phase 11 post-UAT repair
**Status:** Approved design; awaiting written-spec review

## Problem

The latest phone UAT exposed four related experience gaps.

First, the mission page wraps all content in the shared white `panelStyle`. That wrapper adds a border, a second 24px inset, and a 420px width cap. `MascotStage` separately inherits the same cap. On a phone, these nested constraints make Coco and the dialogue box substantially narrower than the available screen.

Second, the attached Coco nameplate uses the same 48px outer height as the interactive Hint/replay group and has a 104px minimum width. It visually dominates the dialogue border even though it is only a label.

Third, Hint currently requires two interactions. Pressing Hint fetches translations and converts selected English phrases into highlighted buttons; Korean appears only after the learner presses one of those phrases. The first interaction has no sufficiently obvious result and reads as broken.

Fourth, the existing thinking sprite is not selected during the `cocoThinking` flow step. The expression mapper falls through to `idle`. Conversation prompting also has no rule for vague answers such as “anything,” allowing mechanically echoed replies such as “Talking about anything is fun.”

## Goals

- Give the mission page responsive breathing room without creating an excessively wide desktop reading column.
- Keep meaningful cards while removing the redundant outer white frame.
- Make the Coco nameplate visually subordinate to the interactive controls.
- Make the first Hint activation reveal useful Korean immediately.
- Show the thinking sprite for the entire provider-wait step.
- Make Coco respond naturally to vague or minimally informative answers.
- Preserve the current mascot size/crop, recorder flow, translation request security, conversation-history grounding, moderation, and preset-mission behavior.

## Non-Goals

- Redesigning student home, teacher pages, or shared panels outside the mission route.
- Resizing or repositioning Coco’s sprite.
- Changing the scene-card visual treatment.
- Adding a new translation endpoint, persistence model, provider call, or visible control.
- Adding a second conversation-generation or quality-review request.
- Making the mission full-width on large desktops.

## Approved Responsive Layout

The mission route will stop rendering the shared `panelStyle` wrapper. It will use mission-specific page and content styles:

- Responsive page gutters: `clamp(16px, 3vw, 32px)`.
- Content width: `100%` of the available space.
- Desktop cap: 640px.
- Outer content background: transparent.
- Outer border, radius, and panel padding: none.

The scene card, mascot stage, dialogue box, recorder, and feedback cards remain meaningful bounded surfaces. They expand with the fluid mission column. `MascotStage` must no longer inherit `panelStyle.maxWidth`; its width follows the mission content up to 640px.

The mascot sprite wrapper values remain unchanged, including its 226px framing, bottom offset, height, object fit, crop, and speaking scale. The extra width belongs to the scene and dialogue composition, not to a larger character.

## Approved Nameplate and Controls

The upper-right Hint/replay group retains its 48px outer height so both actions preserve at least 44px touch targets.

The non-interactive Coco nameplate becomes smaller:

- 76px minimum width.
- 38px height.
- 14px bold label.
- 12px horizontal padding.
- Bottom-aligned with the action group so both remain attached to the same 2px chatbox border.

The shared-border behavior remains unchanged: attached groups overlap the chatbox by exactly 2px, use transparent bottom borders, and do not introduce gaps or doubled lines.

## Approved Hint Behavior

The existing owned translation request and phrase validation remain unchanged.

On first Hint activation:

1. Fetch and validate the contextual Korean phrases as today.
2. Highlight every returned English phrase.
3. Automatically open the first returned phrase’s Korean bubble.

This gives immediate visible value from one press while preserving the ability to select other highlighted phrases. After translations are ready, pressing Hint hides the currently open bubble; pressing Hint again reopens the first phrase. These ready-state activations do not make another network request. A failed request keeps the same visible Hint action with the accessible label `Retry hint`; its next activation retries.

If the provider returns no valid phrases, the interaction follows the existing retryable error state rather than pretending Hint succeeded.

## Approved Thinking Expression

`deriveExpression` maps `step === "cocoThinking"` directly to `thinking`. The existing explicit action-error, recorder-failure, correction, retry, celebration, and speaking behavior remains unchanged.

The `StepCocoThinking` status copy remains visible and accessible. This repair changes the sprite selection only.

## Approved Vague-Answer Conversation Rule

The domain prompt and server system message will express the same additional rule:

- Do not repeat a vague word such as “anything,” “something,” or “stuff” as though it were meaningful new information.
- Acknowledge lightly, then ask one short scene-relevant narrowing question.
- Prefer two concrete, child-friendly choices when they make the question easier to answer.
- Do not shame the learner or demand a more specific answer.

Normative example:

> Coco: What do you and Minju talk about?
>
> Student: Anything.
>
> Coco: Lots of things! Do you talk about games or school?

The existing rules still apply: under 12 words, exactly one question, elementary vocabulary, established-history awareness, soft target-pattern context, hard turn cap, moderation, and stateless provider calls.

## Data Flow and Error Handling

- Layout changes are mission-route and style-token changes only.
- Hint continues to send only the bounded line descriptor to the student-gated route.
- Korean text remains validated server output and never enters HTML unsafely.
- Stale hint requests remain aborted and token-guarded.
- Conversation history remains app-owned structured data in the user payload.
- Translation/provider failures do not block recording or replay.
- Conversation provider failures retain the existing canned-fallback path.

## Verification

### Automated

- Source/layout test proves the mission route no longer uses `panelStyle` and owns a fluid 640px-capped wrapper.
- Style tests prove 16px phone gutters, the smaller nameplate, unchanged 44px action targets, and unchanged mascot geometry.
- Hint component tests prove the first successful activation automatically expands the first phrase and a ready Hint press does not refetch.
- Expression tests prove `cocoThinking` selects the thinking sprite without changing other mappings.
- Conversation prompt tests include the “Anything” regression and the concrete-choice narrowing rule in both domain and server instructions.
- Existing translation, TTS, mission-flow, conversation-history, moderation, preset-mission, type, lint, full-suite, and production-build gates remain green.

### Manual UAT

At 375px phone width and standard desktop width:

1. The redundant outer white frame is absent.
2. Mission content uses the available width with comfortable gutters and never exceeds the 640px cap.
3. Scene, Coco, dialogue, and recorder surfaces align to the same column.
4. The Coco nameplate is clearly smaller than the Hint/replay group and remains attached to the border.
5. One Hint press immediately displays Korean for the first phrase; other highlighted phrases remain selectable.
6. Failed Hint requests retry through the same action.
7. “Coco is thinking…” uses the thinking sprite.
8. The vague-answer sequence produces a natural narrowing question rather than echoing “anything.”
9. Coco’s sprite size, crop, position, and speaking pulse match the pre-change page.
