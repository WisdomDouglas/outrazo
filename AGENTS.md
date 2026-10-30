# Project architecture

- Share the generated `auth-explorer.png` character between authentication and onboarding; one art direction keeps the entry journey visually consistent without duplicating media.
- Require a signed-in account with completed profile onboarding to enter /app; signed-out visitors go to /login. There is no demo mode, demo banner, or guest access.
- Keep landing-only scroll observation and motion scoped to the landing page; shared design-system reveals should not force other routes into the same choreography.
- Keep landing FAQ and illustrative story content in landing-only modules; their presentation should not imply unverified customer reviews or live booking capabilities.
- Keep app-shell collapse state local and persistent; shared routes must render through the same shell so navigation width never changes per page.
- Keep dashboard character artwork in normal document flow with reduced-motion-safe animation so it never hides event content or controls.
- Use the shared Button icon size for icon-only actions so semantic spacing utilities cannot shrink their icons to zero.
