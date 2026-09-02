import desktopDark from "@/assets/hero-desktop-dark.png.asset.json";
import desktopLight from "@/assets/hero-desktop-light.png.asset.json";
import mobileDark from "@/assets/hero-mobile-dark.png.asset.json";
import mobileLight from "@/assets/hero-mobile-light.png.asset.json";

/**
 * Hero background: the four supplied artworks, swapped by theme (dark/light)
 * and viewport (desktop/mobile). Artwork is used as-is — only cover-cropping
 * and positioning are applied, never stretching. Purely decorative.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <img
        src={desktopDark.url}
        alt=""
        decoding="async"
        className="hero-bg hero-bg-desktop-dark absolute inset-0 size-full object-cover object-bottom"
      />
      <img
        src={desktopLight.url}
        alt=""
        decoding="async"
        className="hero-bg hero-bg-desktop-light absolute inset-0 size-full object-cover object-bottom"
      />
      <img
        src={mobileDark.url}
        alt=""
        decoding="async"
        className="hero-bg hero-bg-mobile-dark absolute inset-0 size-full object-cover object-[center_top]"
      />
      <img
        src={mobileLight.url}
        alt=""
        decoding="async"
        className="hero-bg hero-bg-mobile-light absolute inset-0 size-full object-cover object-[center_top]"
      />

      {/* Calms the artwork on small screens so hero copy and controls stay legible */}
      <div className="absolute inset-0 bg-canvas/45 lg:bg-canvas/15" />

      {/* Blend the artwork edges into the page canvas */}
      <div className="absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-canvas to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-b from-transparent to-canvas" />
    </div>
  );
}

