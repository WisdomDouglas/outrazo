import { MapPin, Music, Ticket, Users } from "lucide-react";

/**
 * Hero scene: orbital paths, drifting particles, a city skyline, a lit event
 * stage and a crowd silhouette — composed entirely in SVG so it themes with the
 * design tokens and scales cleanly from small phones to wide desktops.
 * Purely decorative; it always sits behind the hero content.
 */

/** Deterministic pseudo-random helper so the crowd/skyline stay stable across renders. */
function rand(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 1000) / 1000;
}

const BUILDINGS = Array.from({ length: 34 }, (_, i) => {
  const w = Math.round(26 + rand(i + 1) * 44);
  const x = Math.round(i * 37 - 20 + rand(i + 9) * 10);
  const h = Math.round(70 + rand(i + 3) * 210);
  return { x, w, h, i };
});

const CROWD = Array.from({ length: 46 }, (_, i) => {
  const x = Math.round(i * 27 - 15 + rand(i + 21) * 12);
  const y = Math.round(748 + rand(i + 5) * 18);
  const r = Math.round(9 + rand(i + 7) * 5);
  return { x, y, r, i };
});

const PARTICLES = [
  { cx: 190, cy: 250, r: 2.5, d: "0s" },
  { cx: 132, cy: 330, r: 2, d: "-2.2s" },
  { cx: 226, cy: 520, r: 2.2, d: "-4.1s" },
  { cx: 300, cy: 175, r: 1.8, d: "-1.4s" },
  { cx: 980, cy: 210, r: 2.4, d: "-3.2s" },
  { cx: 1064, cy: 300, r: 2, d: "-5s" },
  { cx: 1120, cy: 452, r: 2.6, d: "-2.7s" },
  { cx: 880, cy: 140, r: 1.8, d: "-4.6s" },
  { cx: 620, cy: 118, r: 2, d: "-1.1s" },
  { cx: 430, cy: 96, r: 1.6, d: "-3.9s" },
];

function Skyline() {
  return (
    <g className="outrazo-city">
      {BUILDINGS.map(({ x, w, h, i }) => (
        <g key={i}>
          <rect x={x} y={800 - h} width={w} height={h} rx="2" fill="var(--scene-city)" />
          {Array.from({ length: Math.floor(h / 34) }, (_, r) => (
            <rect
              key={r}
              x={x + 6}
              y={800 - h + 14 + r * 30}
              width={Math.max(4, w - 12)}
              height="5"
              rx="2"
              fill="var(--scene-window)"
              opacity={Math.round((0.25 + rand(i * 7 + r) * 0.6) * 100) / 100}
            />
          ))}
        </g>
      ))}
    </g>
  );
}

function Stage() {
  return (
    <g className="outrazo-stage">
      {/* truss */}
      <rect x="500" y="672" width="200" height="10" rx="3" fill="var(--scene-stage)" />
      <rect x="506" y="682" width="6" height="46" rx="2" fill="var(--scene-stage)" />
      <rect x="688" y="682" width="6" height="46" rx="2" fill="var(--scene-stage)" />
      <rect x="500" y="726" width="200" height="8" rx="3" fill="var(--scene-stage)" />
      {/* lights */}
      {Array.from({ length: 9 }, (_, i) => (
        <circle
          key={i}
          className="outrazo-breathe"
          cx={520 + i * 20}
          cy={690}
          r="3.4"
          fill="var(--color-accent)"
          style={{ animationDelay: `${-i * 0.35}s`, transformOrigin: `${520 + i * 20}px 690px` }}
        />
      ))}
      {/* stage glow */}
      <ellipse cx="600" cy="742" rx="170" ry="54" fill="url(#outrazo-stage-glow)" />
    </g>
  );
}

function Crowd() {
  return (
    <g className="outrazo-crowd">
      {CROWD.map(({ x, y, r, i }) => (
        <g key={i} className="outrazo-sway" style={{ animationDuration: `${(8 + rand(i) * 8).toFixed(2)}s`, animationDelay: `${(-rand(i + 2) * 8).toFixed(2)}s` }}>
          <circle cx={x} cy={y} r={r} fill="var(--scene-crowd)" />
          <path
            d={`M${x - r * 1.7} 800 q${r * 1.7} -${r * 2.6} ${r * 3.4} 0 Z`}
            fill="var(--scene-crowd)"
          />
        </g>
      ))}
    </g>
  );
}

const ORBIT_ICONS = [
  { Icon: Music, radius: "clamp(120px, 30vw, 380px)", squash: 0.62, duration: "72s", delay: "0s", label: "music" },
  { Icon: Users, radius: "clamp(140px, 36vw, 450px)", squash: 0.5, duration: "96s", delay: "-38s", label: "people" },
  { Icon: MapPin, radius: "clamp(130px, 33vw, 415px)", squash: 0.58, duration: "84s", delay: "-56s", label: "location" },
  { Icon: Ticket, radius: "clamp(150px, 38vw, 470px)", squash: 0.46, duration: "110s", delay: "-18s", label: "ticket" },
];

function OrbitIcons() {
  return (
    <div aria-hidden className="absolute inset-0">
      {ORBIT_ICONS.map(({ Icon, radius, squash, duration, delay, label }) => (
        <div
          key={label}
          className="pointer-events-none absolute left-1/2 top-[46%]"
          style={{ transform: `scaleY(${squash})` }}
        >
          <div
            className="outrazo-orbit"
            style={{ ["--orbit" as string]: radius, animationDuration: duration, animationDelay: delay }}
          >
            <span
              className="outrazo-orbit-icon pointer-events-auto grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-accent/30 bg-card/70 text-accent shadow-glow backdrop-blur-sm transition-transform duration-300 hover:scale-110 lg:size-14"
              style={{ transform: `scaleY(${1 / squash})` }}
            >
              <Icon aria-hidden className="size-5 lg:size-6" strokeWidth={1.8} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <svg
        className="outrazo-hero-bg absolute inset-0 size-full"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <radialGradient id="outrazo-halo" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
            <stop offset="55%" stopColor="var(--color-accent)" stopOpacity="0.07" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="outrazo-stage-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="outrazo-city-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--outrazo-bg-canvas)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--outrazo-bg-canvas)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* atmospheric halo */}
        <rect x="0" y="0" width="1200" height="800" fill="url(#outrazo-halo)" />

        {/* orbital paths */}
        <g className="outrazo-orbit-paths" stroke="var(--color-accent)" fill="none">
          <ellipse cx="600" cy="368" rx="470" ry="292" strokeOpacity="0.22" strokeWidth="1.2" />
          <ellipse cx="600" cy="368" rx="392" ry="240" strokeOpacity="0.16" strokeWidth="1" />
          <ellipse
            cx="600"
            cy="368"
            rx="524"
            ry="330"
            strokeOpacity="0.12"
            strokeWidth="1"
            strokeDasharray="3 12"
          />
          <ellipse
            cx="600"
            cy="368"
            rx="300"
            ry="182"
            strokeOpacity="0.1"
            strokeWidth="1"
            strokeDasharray="2 10"
          />
        </g>

        {/* particles */}
        {PARTICLES.map((p) => (
          <circle
            key={`${p.cx}-${p.cy}`}
            className="outrazo-breathe"
            cx={p.cx}
            cy={p.cy}
            r={p.r}
            fill="var(--color-accent)"
            style={{ animationDelay: p.d, transformOrigin: `${p.cx}px ${p.cy}px` }}
          />
        ))}

        {/* city / stage / crowd */}
        <Skyline />
        <Stage />
        <Crowd />

        {/* keep the top of the skyline soft */}
        <rect x="0" y="470" width="1200" height="150" fill="url(#outrazo-city-fade)" />
      </svg>

      <OrbitIcons />
    </div>
  );
}
