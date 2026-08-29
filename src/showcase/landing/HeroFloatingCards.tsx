import { Music, Sparkles, Ticket, TrendingUp } from "lucide-react";

import { AvatarStack } from "@/design-system/components/AvatarStack";
import { Badge } from "@/design-system/components/Badge";
import { cn } from "@/design-system/lib/utils";
import { ATTENDEES } from "../sample-data";

type FloatCard = {
  id: string;
  /** back = furthest from the reader (blurred, smaller), front = closest. */
  depth: "back" | "mid" | "front";
  className: string;
  style: React.CSSProperties;
  node: React.ReactNode;
};

const photo = (id: string, w = 500) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

function PhotoCard({
  src,
  alt,
  label,
  meta,
  badge,
  sheen = false,
}: {
  src: string;
  alt: string;
  label: string;
  meta: string;
  badge?: React.ReactNode;
  sheen?: boolean;
}) {
  return (
    <figure className="relative overflow-hidden rounded-lg border border-line-strong bg-card shadow-floating">
      <div className="relative">
        <img src={src} alt={alt} loading="lazy" className="aspect-[4/3] w-full object-cover" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-canvas/55 via-transparent to-transparent"
        />
        {badge ? <div className="absolute left-sm top-sm">{badge}</div> : null}
      </div>
      <figcaption className="p-md">
        <p className="type-h3 truncate text-primary-text">{label}</p>
        <p className="type-caption truncate text-muted-text">{meta}</p>
      </figcaption>
      {sheen ? <span aria-hidden className="outrazo-sheen absolute inset-0 rounded-lg" /> : null}
    </figure>
  );
}

function StatPill({
  icon,
  value,
  label,
  tone = "accent",
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone?: "accent" | "transactional";
}) {
  return (
    <div className="flex items-center gap-md rounded-lg border border-line bg-card/95 p-md shadow-floating backdrop-blur-md">
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full",
          tone === "accent" ? "bg-accent/15 text-accent" : "bg-transactional/15 text-transactional",
        )}
      >
        {icon}
      </span>
      <span className="type-caption text-muted-text">
        <span className="type-h3 block text-primary-text">{value}</span>
        {label}
      </span>
    </div>
  );
}

/**
 * Desktop collage. Cards sit in three depth tiers so the composition reads as
 * layered space rather than a crowded ring: back cards are smaller, blurred
 * and slower; front cards are sharp and lead the entrance.
 */
const CARDS: FloatCard[] = [
  {
    id: "concert",
    depth: "front",
    className: "left-[0%] top-[10%] w-[220px] xl:w-[248px]",
    style: {
      ["--tilt" as string]: "-7deg",
      ["--driftY" as string]: "-16px",
      ["--driftX" as string]: "6px",
      ["--dur" as string]: "8s",
      ["--reveal-delay" as string]: "0.05s",
      animationDelay: "0s",
    },
    node: (
      <PhotoCard
        src={photo("photo-1514525253161-7a46d19cd819")}
        alt="Crowd dancing at a night concert"
        label="Night Market"
        meta="Fri · Freedom Park"
        badge={<Badge variant="transactional">Live</Badge>}
        sheen
      />
    ),
  },
  {
    id: "friends",
    depth: "mid",
    className: "right-[1%] top-[4%] w-[196px] xl:w-[220px]",
    style: {
      ["--tilt" as string]: "8deg",
      ["--driftY" as string]: "-12px",
      ["--driftX" as string]: "-8px",
      ["--dur" as string]: "9.5s",
      ["--reveal-delay" as string]: "0.18s",
      animationDelay: "-2.4s",
    },
    node: (
      <PhotoCard
        src={photo("photo-1533174072545-7a4b6ad7a6c3")}
        alt="Friends laughing together outdoors"
        label="Rooftop Sundown"
        meta="Sat · Lekki"
      />
    ),
  },
  {
    id: "meetup",
    depth: "back",
    className: "left-[6%] bottom-[6%] w-[176px] xl:w-[196px]",
    style: {
      ["--tilt" as string]: "6deg",
      ["--driftY" as string]: "-9px",
      ["--dur" as string]: "11s",
      ["--reveal-delay" as string]: "0.32s",
      animationDelay: "-1.2s",
    },
    node: (
      <PhotoCard
        src={photo("photo-1505373877841-8d25f7d46678")}
        alt="Speaker presenting at a tech meetup"
        label="Build Week"
        meta="Sun · Ikeja Hub"
      />
    ),
  },
  {
    id: "festival",
    depth: "front",
    className: "right-[2%] bottom-[8%] w-[206px] xl:w-[232px]",
    style: {
      ["--tilt" as string]: "-9deg",
      ["--driftY" as string]: "-18px",
      ["--driftX" as string]: "-6px",
      ["--dur" as string]: "8.5s",
      ["--reveal-delay" as string]: "0.24s",
      animationDelay: "-3.6s",
    },
    node: (
      <PhotoCard
        src={photo("photo-1531058020387-3be344556be6")}
        alt="Audience at an outdoor festival"
        label="Afro House"
        meta="Fri · Victoria Island"
        sheen
      />
    ),
  },
  {
    id: "proof",
    depth: "front",
    className: "left-[10%] top-[52%] w-[196px] outrazo-pop",
    style: { ["--reveal-delay" as string]: "0.42s", animationDelay: "-1.8s" },
    node: (
      <div className="flex items-center gap-md rounded-lg border border-line bg-card/95 p-md shadow-floating backdrop-blur-md">
        <AvatarStack people={ATTENDEES.slice(0, 4)} />
        <span className="type-caption text-muted-text">
          <span className="type-h3 block text-primary-text">128+</span>
          going tonight
        </span>
      </div>
    ),
  },
  {
    id: "ticket",
    depth: "front",
    className: "right-[8%] top-[50%] w-[186px] outrazo-pop",
    style: { ["--reveal-delay" as string]: "0.5s", animationDelay: "-3s" },
    node: (
      <StatPill
        icon={<Ticket aria-hidden className="size-5" strokeWidth={2} />}
        value="₦12,000"
        label="secure ticket"
      />
    ),
  },
];

const DEPTH_CLASS: Record<FloatCard["depth"], string> = {
  back: "outrazo-depth-back z-0",
  mid: "outrazo-depth-mid z-10",
  front: "z-20",
};

/** Desktop-only layered collage of tilted, drifting event cards framing the hero copy. */
export function HeroFloatingCards() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      {/* Soft aurora wash behind the collage to give the layers atmosphere. */}
      <div className="outrazo-aurora pointer-events-none absolute left-[12%] top-[18%] size-[420px] rounded-full bg-accent/12 blur-[110px]" />

      {CARDS.map((card) => (
        <div
          key={card.id}
          className={cn("absolute outrazo-reveal", DEPTH_CLASS[card.depth])}
          style={{ ["--reveal-delay" as string]: card.style["--reveal-delay" as never] }}
        >
          <div
            className={cn(card.id.length ? "" : "", card.className.replace(/^|\s/g, " "), "")}
            style={{ display: "none" }}
          />
          <div className={cn("absolute", card.className)} style={card.style} />
        </div>
      ))}

      {/* Cards are rendered in a second pass so reveal + float animations can be
          composed on separate elements without fighting over `transform`. */}
      {CARDS.map((card) => (
        <div
          key={`${card.id}-layer`}
          className={cn("outrazo-reveal absolute", DEPTH_CLASS[card.depth], card.className)}
          style={{ ["--reveal-delay" as string]: card.style["--reveal-delay" as never] }}
        >
          <div
            className={cn(card.className.includes("outrazo-pop") ? "" : "outrazo-float")}
            style={card.style}
          >
            {card.node}
          </div>
        </div>
      ))}

      {/* Orbiting sticker */}
      <div
        className="outrazo-orbit absolute left-[26%] top-[4%] z-20 -ml-[60px]"
        style={{ ["--orbit" as string]: "34px" }}
      >
        <span className="type-caption inline-flex items-center gap-xs rounded-full bg-accent px-md py-sm font-semibold text-on-accent shadow-glow">
          <Sparkles className="size-4" strokeWidth={2.5} />
          Live tonight
        </span>
      </div>

      {/* Pulsing music sticker */}
      <span className="absolute right-[24%] top-[20%] z-20 grid size-12 place-items-center">
        <span className="outrazo-pulse-ring absolute inset-0 rounded-full bg-transactional/50" />
        <span className="relative grid size-10 place-items-center rounded-full bg-transactional text-on-transactional shadow-floating">
          <Music className="size-4" strokeWidth={2.5} />
        </span>
      </span>
    </div>
  );
}

/**
 * Mobile / tablet hero stage: a fanned three-card cluster with drifting motion,
 * a floating social-proof pill and a trending pill — the same choreography as
 * desktop, compressed into one tap-sized composition.
 */
export function HeroCardStrip() {
  return (
    <div className="relative w-full lg:hidden">
      <div
        aria-hidden
        className="outrazo-aurora pointer-events-none absolute left-1/2 top-1/2 size-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[90px]"
      />

      <div className="relative mx-auto flex h-[290px] w-full max-w-[380px] items-center justify-center">
        {/* Back-left card */}
        <div
          className="outrazo-reveal outrazo-depth-back absolute left-0 top-[16%] w-[46%] max-w-[168px]"
          style={{ ["--reveal-delay" as string]: "0.3s" }}
        >
          <div
            className="outrazo-float"
            style={{
              ["--tilt" as string]: "-9deg",
              ["--driftY" as string]: "-10px",
              ["--dur" as string]: "10s",
            }}
          >
            <PhotoCard
              src={photo("photo-1531058020387-3be344556be6", 400)}
              alt="Audience at an outdoor festival"
              label="Afro House"
              meta="Fri · VI"
            />
          </div>
        </div>

        {/* Back-right card */}
        <div
          className="outrazo-reveal outrazo-depth-mid absolute right-0 top-[8%] w-[46%] max-w-[168px]"
          style={{ ["--reveal-delay" as string]: "0.22s" }}
        >
          <div
            className="outrazo-float"
            style={{
              ["--tilt" as string]: "10deg",
              ["--driftY" as string]: "-14px",
              ["--dur" as string]: "8.5s",
              animationDelay: "-2.2s",
            }}
          >
            <PhotoCard
              src={photo("photo-1505373877841-8d25f7d46678", 400)}
              alt="Speaker presenting at a tech meetup"
              label="Build Week"
              meta="Sun · Ikeja"
            />
          </div>
        </div>

        {/* Hero card, front and centre */}
        <div
          className="outrazo-reveal relative z-20 w-[54%] max-w-[196px]"
          style={{ ["--reveal-delay" as string]: "0.1s" }}
        >
          <div
            className="outrazo-float"
            style={{
              ["--tilt" as string]: "-2deg",
              ["--driftY" as string]: "-12px",
              ["--dur" as string]: "7s",
            }}
          >
            <PhotoCard
              src={photo("photo-1514525253161-7a46d19cd819", 500)}
              alt="Crowd dancing at a night concert"
              label="Night Market"
              meta="Fri · Lagos"
              badge={<Badge variant="transactional">Live</Badge>}
              sheen
            />
          </div>
        </div>

        {/* Floating proof pill */}
        <div
          className="outrazo-reveal absolute -bottom-[2%] left-[2%] z-30"
          style={{ ["--reveal-delay" as string]: "0.5s" }}
        >
          <div className="outrazo-pop flex items-center gap-sm rounded-full border border-line bg-card/95 py-sm pl-sm pr-md shadow-floating backdrop-blur-md">
            <AvatarStack people={ATTENDEES.slice(0, 3)} />
            <span className="type-caption font-semibold text-primary-text">128 going</span>
          </div>
        </div>

        {/* Trending pill */}
        <div
          className="outrazo-reveal absolute right-[2%] top-[2%] z-30"
          style={{ ["--reveal-delay" as string]: "0.6s" }}
        >
          <span
            className="outrazo-pop type-caption inline-flex items-center gap-xs rounded-full bg-accent px-md py-sm font-semibold text-on-accent shadow-glow"
            style={{ animationDelay: "-2s" }}
          >
            <TrendingUp aria-hidden className="size-4" strokeWidth={2.5} />
            42 tonight
          </span>
        </div>
      </div>
    </div>
  );
}
