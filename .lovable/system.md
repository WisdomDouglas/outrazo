# Outrazo — Forest Tech Design System

Outrazo is a visual, social event-discovery platform. The UI exists to answer three
questions fast: what's happening, where is it happening, and why should I care.
Surfaces should feel vibrant, structured, inclusive, and high-energy — never
corporate-stiff, never generic SaaS, never sci-fi.

## Hard constraints

1. **Tokens only.** Never write a raw hex, rgb, or px value for something the system
   tokenizes. Use the color utilities (`bg-canvas`, `bg-card`, `text-primary-text`,
   `text-muted-text`, `bg-accent`, `bg-transactional`, `border-line`), the spacing
   scale (`xs` 4, `sm` 8, `md` 16, `lg` 24, `xl` 32, `2xl` 48, `3xl` 64,
   `section` 96), and the radius scale (`rounded-sm` 8, `rounded-md` 12,
   `rounded-lg` 20, `rounded-full`). No 13px, 19px, or 27px spacing. No new corner radii.
2. **No new brand colors.** Dark: canvas `#07140E`, card `#0E2219`, text `#E2ECE9`,
   accent `#10B981`, transactional `#FB7185`. Light: canvas `#F4F7F5`, card `#FFFFFF`,
   text `#0B1E16`, accent `#059669`, transactional `#E11D48`. Adding a color requires a
   documented reason and a token.
3. **Typography.** Plus Jakarta Sans for display (`type-hero`, `type-h1`, `type-h2`,
   `type-h3`), Inter for body and UI (`type-body-lg`, `type-body`, `type-caption`).
   Never set font sizes by hand.
4. **Two accents, two meanings.** `accent` (mint/emerald) is brand and navigation
   action. `transactional` (coral/rose) is ticketing, price, urgency, sold-out. Do not
   swap them for visual variety.
5. **Reuse before creating.** Compose the exported components before writing a new one.
   No second visual version of an existing component without a genuine use case.
6. **Restraint.** Do not make every section a card. Prefer spacing, grouping, alignment,
   and typography over borders and shadows. The mint glow (`shadow-glow`) marks an
   interactive or highlighted state — it is not decoration.

## Accessibility baseline

Semantic HTML (`<button>` for actions, `<a>` for navigation, labels wired to inputs),
visible focus via the `focus-ring` utility (2px accent outline, 2px offset), touch
targets at least 44×44px, WCAG AA contrast minimum on all essential text, never
color-only communication, and respect `prefers-reduced-motion`.

## Interaction

Hover lifts by 2px with subtle accent illumination; pressed scales to 0.98; transitions
stay short. Every asynchronous component considers loading, empty, error, validation,
success, and disabled states — they are part of the product, not afterthoughts.

## Copy voice

Friendly, concise, energetic, human, confident. Action-oriented labels: "Explore
Events", "RSVP", "Book Tickets", "Save Event", "Post Your Event". No corporate jargon,
no empty marketing claims, no exclamation-mark spam. Error messages say what happened
and what to do next.

## Theming

Dark is the default. Light mode applies via a `light` class on `<html>`; use the
exported `useTheme` hook. Every component must be verified in both themes.

Icons come from `lucide-react` at 2px stroke (2.5px when emphasized), and only where
they carry meaning.
