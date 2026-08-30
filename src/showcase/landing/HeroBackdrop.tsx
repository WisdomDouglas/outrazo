import heroLines from "@/assets/hero-lines.jpg.asset.json";

/**
 * Atmospheric hero backdrop: the OUTRAZO line-art illustration blended into the
 * canvas, plus a few lightweight animated accents (drifting particles, travelling
 * dots, rotating dashed orbits, breathing glows). Purely decorative and never
 * interactive — hero content sits above it.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Illustration layer — mirrored halves keep strong linework at the edges */}
      <div className="outrazo-hero-bg absolute inset-0">
        <img
          src={heroLines.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="outrazo-drift absolute inset-0 size-full object-cover object-center opacity-90 mix-blend-screen"
        />
        <img
          src={heroLines.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="outrazo-drift absolute inset-0 hidden size-full scale-x-[-1] object-cover opacity-40 mix-blend-screen lg:block"
          style={{ animationDelay: "-9s" }}
        />
        {/* Keep the centre quiet behind the headline */}
        <div className="absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_45%,var(--outrazo-bg-canvas)_0%,color-mix(in_srgb,var(--outrazo-bg-canvas)_85%,transparent)_45%,transparent_78%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[28%] bg-gradient-to-b from-transparent to-canvas" />
      </div>

      {/* Animated accents */}
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 1200 760"
        preserveAspectRatio="xMidYMid slice"
      >
        <g className="outrazo-sway" style={{ animationDuration: "18s" }}>
          <path
            id="outrazo-line-a"
            d="M-40 600C160 520 300 660 520 610S900 470 1240 560"
            fill="none"
            stroke="var(--color-accent)"
            strokeOpacity="0.22"
            strokeWidth="1.5"
          />
        </g>
        <g className="outrazo-sway" style={{ animationDuration: "24s", animationDelay: "-6s" }}>
          <path
            d="M-40 680C220 640 340 730 620 690S980 600 1240 650"
            fill="none"
            stroke="var(--color-accent)"
            strokeOpacity="0.14"
            strokeWidth="1"
            strokeDasharray="4 12"
          />
        </g>

        {/* Rotating dashed orbits */}
        <g className="outrazo-spin-slow" style={{ transformOrigin: "110px 120px" }}>
          <circle
            cx="110"
            cy="120"
            r="86"
            fill="none"
            stroke="var(--color-accent)"
            strokeOpacity="0.25"
            strokeWidth="1"
            strokeDasharray="3 10"
          />
        </g>
        <g
          className="outrazo-spin-slow"
          style={{ transformOrigin: "1080px 620px", animationDuration: "34s" }}
        >
          <circle
            cx="1080"
            cy="620"
            r="58"
            fill="none"
            stroke="var(--color-accent)"
            strokeOpacity="0.2"
            strokeWidth="1"
            strokeDasharray="2 9"
          />
        </g>

        {/* Breathing glow nodes */}
        {[
          { cx: 96, cy: 206, r: 6, d: "0s" },
          { cx: 240, cy: 78, r: 4, d: "-2.5s" },
          { cx: 940, cy: 96, r: 4.5, d: "-4s" },
          { cx: 1150, cy: 300, r: 3.5, d: "-1.2s" },
          { cx: 180, cy: 660, r: 4, d: "-5.5s" },
          { cx: 700, cy: 706, r: 3.5, d: "-3.3s" },
        ].map((n) => (
          <circle
            key={`${n.cx}-${n.cy}`}
            className="outrazo-breathe"
            cx={n.cx}
            cy={n.cy}
            r={n.r}
            fill="var(--color-accent)"
            style={{ animationDelay: n.d, transformOrigin: `${n.cx}px ${n.cy}px` }}
          />
        ))}
        <circle
          className="outrazo-breathe"
          cx="1060"
          cy="180"
          r="3"
          fill="var(--color-transactional)"
          style={{ animationDelay: "-3.8s", transformOrigin: "1060px 180px" }}
        />
      </svg>

      {/* Dots travelling along the neon curves */}
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 1200 760"
        preserveAspectRatio="xMidYMid slice"
      >
        {[
          { dur: "9s", delay: "0s" },
          { dur: "12s", delay: "-4s" },
          { dur: "7s", delay: "-2.5s" },
        ].map((t) => (
          <circle
            key={t.dur + t.delay}
            className="outrazo-trace"
            r="3"
            fill="var(--color-accent)"
            style={{
              ["--path" as string]:
                'path("M-40 600C160 520 300 660 520 610S900 470 1240 560")',
              ["--dur" as string]: t.dur,
              animationDelay: t.delay,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
