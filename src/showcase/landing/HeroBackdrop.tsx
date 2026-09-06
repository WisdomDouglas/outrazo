import desktopDark from "@/assets/hero-desktop-dark.png.asset.json";
import desktopLight from "@/assets/hero-desktop-light.png.asset.json";
import mobileDark from "@/assets/hero-mobile-dark.png.asset.json";
import mobileLight from "@/assets/hero-mobile-light.png.asset.json";

/**
 * Hero background: the four supplied artworks, swapped by theme (dark/light)
 * and viewport (desktop/mobile).
 *
 * Rendered as CSS background images so each artwork scales/crops with
 * `background-size: cover` and `background-position: center`. A dedicated
 * inner frame keeps the focal area centered and prevents awkward truncation
 * on narrow mobile screens.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Desktop dark */}
      <div
        className="hero-bg hero-bg-desktop-dark absolute inset-0 bg-cover bg-bottom bg-no-repeat"
        style={{ backgroundImage: `url(${desktopDark.url})` }}
      />
      {/* Desktop light */}
      <div
        className="hero-bg hero-bg-desktop-light absolute inset-0 bg-cover bg-bottom bg-no-repeat"
        style={{ backgroundImage: `url(${desktopLight.url})` }}
      />
      {/* Mobile dark — centered crop with a safe aspect frame */}
      <div
        className="hero-bg hero-bg-mobile-dark absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${mobileDark.url})` }}
      />
      {/* Mobile light */}
      <div
        className="hero-bg hero-bg-mobile-light absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${mobileLight.url})` }}
      />

      {/* Lightly calms the artwork so hero copy stays legible while it shows through */}
      <div className="absolute inset-0 bg-canvas/35 lg:bg-canvas/10" />

      {/* Blend the artwork edges into the page canvas; the deeper bottom fade
          gives a smooth scroll transition into the Discover section */}
      <div className="absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-canvas to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[32%] bg-gradient-to-b from-transparent via-canvas/70 to-canvas" />
    </div>
  );
}

