# Project architecture

- Share the generated `auth-explorer.png` character between authentication and onboarding; one art direction keeps the entry journey visually consistent without duplicating media.
- Allow completed local onboarding to enter the clearly labeled demo app without an account, while signed-in users still require completed profile onboarding; the entry flow must not redirect completed visitors back.
- Keep landing-only scroll observation and motion scoped to the landing page; shared design-system reveals should not force other routes into the same choreography.
- Keep landing FAQ and illustrative story content in landing-only modules; their presentation should not imply unverified customer reviews or live booking capabilities.
- Keep app-shell collapse state local and persistent; shared routes must render through the same shell so navigation width never changes per page.
- Keep dashboard character artwork in normal document flow with reduced-motion-safe animation so it never hides event content or controls.
