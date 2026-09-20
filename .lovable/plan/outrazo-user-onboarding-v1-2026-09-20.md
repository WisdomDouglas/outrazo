# Outrazo User Onboarding V1

## Goal
Add a focused, first-time onboarding journey that feels native to Outrazo, preserves choices between steps, and sends completed users into Explore.

## Build
- Add `/onboarding` with three accessible steps for interests, mock location, and discovery preferences.
- Reuse Outrazo buttons and selectable chips, with clear selected states, inline validation, Back controls, and a subtle `1 / 3` progress indicator.
- Keep all step data in one stateful flow so moving backward never loses selections.
- Save a versioned onboarding preference record in local storage behind a small replaceable storage helper, ready for a future cloud-backed save.
- On completion, navigate to `/events` and prefill the existing Explore search with the selected location context where applicable.
- Add restrained event imagery using existing event artwork, without changing any existing page or design-system component.
- Add route-specific title, description, and social metadata.

## Responsive experience
- Desktop: centered, spacious two-column composition with the form as the primary focus and a subtle event-image panel.
- Mobile: intentional single-column flow, comfortable 44px controls, and a sticky bottom action area that does not cover content.
- Prevent horizontal overflow and keep progress, validation, and selection states readable in both themes.

## Test
- Verify required-interest validation, multi-select behavior, location selection, preferences, Back navigation, and selection preservation.
- Verify completion writes the expected local record and opens Explore.
- Check direct loading, refresh behavior, keyboard focus, mobile sticky actions, desktop layout, both themes, and horizontal overflow.
