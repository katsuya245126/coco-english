# Fluid Mobile Dialogue Controls

**Status:** Approved for implementation

## Goal

Make Coco's name tab, Hint control, and dialogue replay control feel lighter on phones while preserving their current desktop appearance and keeping them comfortably tappable.

## Design

- Keep the existing attached-tab structure, borders, colors, labels, and behavior.
- Replace only the fixed size values with CSS `clamp()` expressions:
  - attached action shell height: `clamp(40px, 10vw, 48px)`;
  - name tab height: `clamp(32px, 8.5vw, 38px)`;
  - name tab minimum width: `clamp(64px, 17vw, 76px)`;
  - tab label size: `clamp(13px, 3.3vw, 14px)`;
  - Hint and dialogue replay target size: `clamp(38px, 10vw, 44px)`;
  - Hint horizontal padding: `clamp(8px, 2.5vw, 12px)`.
- Apply the replay sizing only to the `dialogue-tab` presentation. Standalone replay buttons remain 44px.
- Do not add a breakpoint hook, media query, new component state, or unrelated layout changes.

At a 390px viewport the action targets resolve to 39px, the action shell to 40px, and the name tab to about 33px. At desktop widths every value reaches its existing maximum.

## Verification

- Add focused source/style assertions for the fluid size contracts and unchanged standalone 44px replay control.
- Run the focused dialogue-layout tests, typecheck, lint, and `git diff --check`.
- Compare localhost screenshots at 390x844 and 1440x693. Mobile controls should look visibly more compact; desktop controls and the approved mascot placement should remain unchanged.
