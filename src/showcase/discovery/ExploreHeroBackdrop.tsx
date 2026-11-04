import exploreHero from "@/assets/explore-hero.jpg";

/**
 * Editorial hero backdrop for the Explore page.
 *
 * Utilizes the custom generated Lagos festival 'Forest Tech' artwork,
 * calibrated to blend softly and seamlessly into the canvas background
 * across both dark (#07140e) and light (#eef4f0) themes without any
 * hard edges, glow effects, or visual noise.
 */
export function ExploreHeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Dark theme artwork */}
      <img
        src={exploreHero}
        alt=""
        className="explore-hero-image-dark absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* Light theme artwork with soft multiply blend into mint-white canvas */}
      <img
        src={exploreHero}
        alt=""
        className="explore-hero-image-light absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* Subtle ambient radial gradient (calm, restrained) */}
      <div
        className="absolute inset-x-0 -top-24 mx-auto h-[400px] w-full max-w-[1000px] rounded-full opacity-30 blur-3xl pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--outrazo-accent-primary) 0%, transparent 70%)",
        }}
      />

      {/* Atmospheric veil ensuring high text contrast across themes */}
      <div className="absolute inset-0 bg-canvas/40 backdrop-blur-[0.5px]" />

      {/* Top gentle scrim for top navigation readability */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-canvas via-canvas/60 to-transparent" />

      {/* Deep bottom fade that dissolves seamlessly into the page background */}
      <div className="absolute inset-x-0 bottom-0 h-44 sm:h-56 bg-gradient-to-b from-transparent via-canvas/80 to-canvas" />
    </div>
  );
}
