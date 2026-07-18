# Responsive Coco Mascot Layout

**Status:** Approved for implementation

## Goal

Keep Coco's full head visible in the dynamic talking mission and make the visible bottom of the sprite meet the attached chat-box tabs without a gap on desktop and mobile.

## Root cause

The sprite frame has a fixed 180px height, but its horizontal insets stop growing at 72px. On the 640px desktop stage, the frame therefore expands to 496px wide. Because the portrait sprite uses `object-fit: cover`, it scales by width and most of its height is cropped. On mobile the frame is the intended 226px wide, but transparent pixels at the image's lower edge remain visible above the tabs.

## Design

- Keep the sprite frame centered and cap its width at 226px while retaining a 24px minimum viewport inset on very narrow screens.
- Preserve the current 180px frame height and upper-body `cover` crop.
- Lower the frame slightly so its rendered image overlaps the tab boundary enough to hide the transparent lower edge.
- Change only the mascot layout tokens and their focused geometry tests. Do not modify sprite assets, mission behavior, or unrelated student UI.

## Verification

- Add a failing regression test proving the frame resolves to 226px on the 640px desktop stage.
- Add a failing regression test proving the frame overlaps the top of the dialogue tabs by the required amount.
- Run the focused mascot layout tests, then proportionate typecheck/lint checks.
- Inspect screenshots at 1440x693 desktop and 390x844 mobile viewports. Coco's full head must be visible and no background gap may appear between the sprite and tabs.
