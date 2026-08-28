# Outrazo Design System — Starter Tokens & Components

Scaffold the Outrazo "Forest Tech" design system library from the uploaded spec: tokens, theming, a first wave of primitives, and a showcase page to review them.

## Foundation

- `src/design-system/styles/theme.css` — the single import consumers use. CSS custom properties for both themes plus a Tailwind v4 `@theme` mapping.
  - Color: `bg-canvas`, `bg-card`, `text-primary`, `accent-primary`, `accent-secondary` for dark (#07140E / #0E2219 / #E2ECE9 / #10B981 / #FB7185) and light (#F4F7F5 / #FFFFFF / #0B1E16 / #059669 / #E11D48), with derived muted-text and border tokens.
  - Spacing: 4 / 8 / 16 / 24 / 32 / 48 / 64 / 96.
  - Radius: sm 8, md 12, lg 20, full 9999.
  - Shadows: dark card + mint glow, light card + floating.
  - Typography: Plus Jakarta Sans (display) and Inter (body) loaded via a `<link>` in the root route; type scale tokens for hero/h1/h2/h3/body-lg/body/caption with responsive desktop steps.
- Dark is the default theme; light applies via a `.light` class on `<html>`, with a small theme-toggle hook.
- `src/lib/utils.ts` with `cn()`; Tailwind v4 + `lucide-react` installed.

## First wave of components

Token-driven, CVA variants, forwarded refs, merged `className`, semantic elements, visible focus rings, 44px minimum touch targets:

- **Button** — variants: primary (mint pill), transactional (coral pill), outline, ghost; sizes sm/md/lg; loading + disabled states.
- **Input** — 48px height, 12px radius, focus accent border, label/error/hint slots.
- **SearchField** — input + search icon, clear action, loading state.
- **Badge** — neutral / accent / transactional / outline.
- **CategoryChip** — pill, selectable/active state.
- **Avatar** and **AvatarStack** — image + initials fallback, overflow count.
- **Skeleton** — token-based shimmer.
- **EventCard** — image (16:9 or 1:1), date badge, title, location, time, price/Free, host identity, social proof, save toggle; hover lift + 1.02 scale.

Later waves (after your feedback): Select, Modal, Drawer, Toast, EventRail, EmptyState, ErrorState, TicketCard, OrganizerCard, Navigation.

## Library wiring

- `src/index.ts` barrel re-exporting every component plus the theme entry.
- `.lovable/meta.yaml` — react / tailwind / local / `custom_design_system`.
- `.lovable/sources.yaml` — tokens from `theme.css`, components from the barrel.
- `.lovable/system.md` — Outrazo philosophy, hard constraints (tokens only, no arbitrary spacing/radii, reuse before creating, sparing glow, accessibility baseline), copy voice.
- `lovable.toml` with `tech_stack = "custom_design_system_tanstack"`.

## Showcase

`src/routes/index.tsx` becomes a preview-only showcase: token swatches (color, spacing, radius, shadow), the type scale, and every component in all variants and states, with a dark/light toggle. Preview-only — excluded from consumers.

## Notes

Icons use Lucide. No backend, no product screens (Landing, Explore, Event Details) in this pass — this is the library layer those screens will later consume.
