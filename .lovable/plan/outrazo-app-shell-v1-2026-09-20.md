# Outrazo App Shell V1

## Goal
Create a reusable, responsive app structure under `/app` for future signed-in experiences, while leaving all approved public pages unchanged.

## Build
- Add a nested `/app` layout with shared `AppSidebar`, `AppHeader`, `MobileBottomNav`, and `NotificationPanel` components.
- Add `/app`, `/app/explore`, `/app/saved`, `/app/tickets`, `/app/profile`, and `/app/create-event` route files with unique metadata.
- Build the app home from centralized event data, using saved onboarding interests and location for simple recommendation ordering.
- Reuse the existing `EventCard` and saved-event storage for recommended, upcoming, popular, and saved views.
- Connect app search to the approved public Explore search through its existing `q` parameter rather than creating new search logic.
- Add demo-only notifications, a profile placeholder, tickets placeholder, and event-creation placeholder.
- Update onboarding completion to enter `/app`.

## Responsive behavior
- Desktop: persistent left navigation and independently scrolling main content with a spacious header.
- Tablet: compact icon-led sidebar and adaptive event grids.
- Mobile: top brand/actions, single-column content, and fixed five-item bottom navigation with safe page spacing.
- Keep all controls at least 44px and prevent horizontal overflow.

## Test
- Verify every app route, active navigation states, notification panel, profile/avatar navigation, search handoff, EventCard detail navigation, and saved-event behavior.
- Verify onboarding completion opens `/app`.
- Recheck Landing → Explore → Event Details → Organizer on the unchanged public routes.
- Inspect desktop, tablet, and mobile in both themes for overflow, overlap, and independent scrolling.
