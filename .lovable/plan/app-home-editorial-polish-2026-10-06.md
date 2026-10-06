# App Home Editorial Polish

## Goal
Turn `/app` into the selected Forest Contrast editorial dashboard while preserving its existing data, routes, search, saves, location controls, and light/dark themes.

## Build
- Refine the shared event card into a more consistent, image-led design with clearer date, venue, host, price, and attendee hierarchy across phone and desktop.
- Recompose the app home welcome area and discovery sections with intentional spacing, responsive rails/grids, and restrained entrance motion.
- Add a smoothly collapsible desktop sidebar with persistent preference and clear icon tooltips in compact mode.
- Polish the mobile bottom navigation into a compact translucent dock with a clear moving active treatment and 44px touch targets.
- Tighten the app header and demo banner so navigation and search feel integrated rather than stacked.

## Technical details
- Keep all current TanStack routes and centralized sample event data.
- Extend existing shared components instead of duplicating event-card or navigation logic.
- Use only existing Forest Tech tokens and Lucide icons; motion will respect reduced-motion preferences.
- Verify `/app` at mobile and desktop sizes in dark and light themes, including sidebar collapse, navigation, search, event links, save controls, and horizontal overflow.
