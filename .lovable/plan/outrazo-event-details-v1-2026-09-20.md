# Outrazo Event Details V1

## Goal
Create a polished, data-driven event details journey that starts from the approved Explore cards, supports ticket/RSVP demo interactions, and extends to organizer and related-event views without redesigning Explore.

## Build
- Extend the centralized mock event and organizer records with descriptions, summaries, structured venue/address/coordinates, organizer bios, and reusable ticket tiers.
- Add the dynamic `/events/$eventId` route with route-specific metadata, not-found handling, a responsive desktop split layout, a deliberate mobile layout, and matching loading/error skeleton states.
- Make existing Explore EventCards navigate to the dynamic event route while preserving save behavior and the approved card visuals.
- Reuse the existing saved-items hook for persistent Save/Saved state across cards and details.
- Add an accessible share menu with copy feedback and social links, using native sharing on supported mobile devices.
- Add an accessible RSVP/ticket drawer: free RSVP, ticket tier and quantity selection, computed demo total, success state, and reusable demo ticket view.
- Add the dynamic `/organizers/$organizerId` route using centralized organizer data and reusable EventCards.
- Add related events selected by matching category and city, excluding the current event.

## Responsive experience
- Desktop: spacious image/content split, supporting sections below, related-event grid.
- Mobile: compact top actions, large image, single-column content, centered social proof, horizontal related-event rail, and a sticky ticket action with safe bottom spacing.
- Keep controls at least 44px, prevent horizontal overflow, preserve meaningful focus states, and honor reduced-motion preferences.

## Test
- Verify direct and invalid event URLs, saved-state refresh persistence, share/copy feedback, free RSVP, ticket selection/quantity/total, success ticket view, organizer navigation, and related-event navigation.
- Verify the full flow at desktop, tablet, and mobile sizes in dark and light themes.
- Recheck Explore search and category filtering to confirm the approved page remains intact.
