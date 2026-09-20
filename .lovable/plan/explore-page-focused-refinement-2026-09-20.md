# Explore page focused refinement

## Scope
Refine the existing `/events` experience without changing its approved structure, typography, palette, event content, or overall visual identity.

## Build
- Strengthen the heading with the approved local-discovery message and a selectable demo location control, ready for a future real location source.
- Keep the category pills in one hidden-scrollbar horizontal rail and add a compact Filters control.
- Add a responsive filter panel: a bottom sheet on mobile and compact modal on larger screens, covering date, location, and price with Clear all and Show results actions.
- Apply date, location, and price filters to the centralized mock catalogue while preserving existing search and category behavior.
- Distinguish empty search, empty category, and empty location results with the requested copy and actions; retain matching card skeleton and error states.
- Make small hierarchy and truncation adjustments inside the shared EventCard only, so every current and future event surface benefits without duplication.

## Interaction details
- Keep filters as draft choices until Show results is selected; Clear all resets them.
- Treat “Near me” as the current demo location (Lagos) without requesting browser location permission.
- Keep category and location controls at accessible touch sizes, return focus when the panel closes, and support Escape/backdrop dismissal.
- Prevent page-level horizontal overflow while retaining swipeable category navigation.

## Validation
- Inspect desktop, tablet, and mobile layouts in both themes.
- Verify search, category selection, location selection, date/price filtering, clear/reset actions, modal/sheet behavior, card alignment, and horizontal overflow.
- Exercise loading, empty-search, empty-category/location, and error presentations using the existing reusable states.
