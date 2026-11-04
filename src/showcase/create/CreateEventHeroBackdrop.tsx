// src/showcase/create/CreateEventHeroBackdrop.tsx
import createHero from "@/assets/create-hero.jpg";

/**
 * Hero backdrop for the Create Event page.
 * Mirrors the design of ExploreHeroBackdrop and TicketsHeroBackdrop:
 * - Uses a compact ticket‑themed image (create-hero.jpg).
 * - Provides dark and light variants that blend into the canvas background.
 * - No decorative glow, pinging dots or emojis.
 */
export function CreateEventHeroBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Dark theme artwork */}
      <img
        src={createHero}
        alt=""
        className="create-hero-image-dark absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* Light theme artwork with soft multiply blend into mint‑white canvas */}
      <img
        src={createHero}
        alt=""
        className="create-hero-image-light absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* Subtle ambient radial gradient */}
      <div
        className="absolute inset-x-0 -top-24 mx-auto h-[400px] w-full max-w-[1000px] rounded-full opacity-30 blur-3xl pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--outrazo-accent-primary) 0%, transparent 70%)",
        }}
      />

      {/* Atmospheric veil for contrast */}
      <div className="absolute inset-0 bg-canvas/40 backdrop-blur-[0.5px]" />

      {/* Top scrim for navigation readability */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-canvas via-canvas/60 to-transparent" />

      {/* Bottom fade into page background */}
      <div className="absolute inset-x-0 bottom-0 h-44 sm:h-56 bg-gradient-to-b from-transparent via-canvas/80 to-canvas" />
    </div>
  );
}

