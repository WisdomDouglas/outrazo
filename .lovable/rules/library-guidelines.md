# My Little Library — Guidelines

## Components

The design system exports these components — import them from `@ws-4hutpagaanrcygcldpya/49851e5c-65c1-40ce-a6d3-b9bd74ef975f` and compose them before building anything from scratch:

`AvatarStack`, `Avatar`, `Badge`, `Button`, `CategoryChip`, `EventCard`, `Input`, `SearchField`, `Skeleton`

Per-component details (import stanzas, props, variants, examples) live in `.lovable/rules/libraries/{slug}/components.md` — on disk, not auto-loaded. Read that file or the component source when the name alone isn't enough.

## Theme Files

The design system's theme is delivered through the following files. The author's original source files carry the full wiring the design system needs — variable declarations, framework-specific directives, provider objects, etc. — and are the canonical import target.

- `@ws-4hutpagaanrcygcldpya/49851e5c-65c1-40ce-a6d3-b9bd74ef975f/design-system/styles/theme.css` (source — preferred import)
- `@ws-4hutpagaanrcygcldpya/49851e5c-65c1-40ce-a6d3-b9bd74ef975f/dist/tokens.css` (auto-generated flat list of CSS custom properties — a raw-values fallback only; does NOT carry framework-specific wiring that the source files above provide)

