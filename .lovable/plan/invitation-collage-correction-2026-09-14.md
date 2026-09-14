# Invitation collage correction

## Scope
- Keep the existing CTA text, button, section placement, and all unrelated page sections unchanged.
- Replace only the collage's conveyor behavior with fixed editorial compositions matching the supplied desktop and mobile references.

## Implementation
- Render one set of individual invitation images rather than duplicated scrolling groups.
- Give each image a fixed responsive position, size, rotation, and layer order so the collage remains intact.
- Use a desktop composition on the right and a separately tuned mobile composition below the centered copy.
- Add subtle, independent transform-only float animations with varied durations and delays.
- Preserve reduced-motion behavior by disabling the individual motion.

## Verification
- Check the section visually at 1440px, 1280px, 390px, and 430px.
- Confirm the copy remains stable, cards overlap and crop naturally, and no card travels across the section.
