# Mobile home redesign QA

## Comparison target

- Source visual truth: user-supplied mobile Outrazo home reference in the chat attachment.
- Implementation route: `/app`.
- Intended viewport: 420 × 936 CSS pixels, light and dark themes.
- Intended state: default home screen with the mobile navigation visible.

## Evidence status

The current tool environment does not expose a browser or screenshot capture surface. A browser-rendered implementation image and a same-canvas comparison could not be produced.

The production build completed successfully with `npm.cmd run build`. Vite reported existing configuration and bundle-size warnings; neither is caused by this mobile redesign.

## Implemented fidelity targets

- Typography and hierarchy: oversized two-line hero headline, compact supporting copy, prominent search, and an editorial featured-events heading.
- Spacing and layout: full-width mobile canvas, four compact filter chips, three-part metrics rail, one lead event card and two supporting event cards.
- Colour and tokens: Outrazo emerald and mint surfaces in light mode, with equivalent dark-mode surfaces and readable text.
- Images: existing Outrazo hero and event imagery are retained; no placeholder imagery was introduced.
- Copy and behaviour: existing search, quick filters, event links, save actions, profile navigation, and theme controls remain connected.

## Required follow-up

- Capture `/app` in a browser at 420 × 936 in both light and dark modes.
- Compare the capture beside the supplied reference, then adjust hero crop, card density, and bottom dock spacing if needed.

final result: blocked
