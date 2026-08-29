import { Music, Sparkles, Ticket } from "lucide-react";

import { AvatarStack } from "@/design-system/components/AvatarStack";
import { Badge } from "@/design-system/components/Badge";
import { cn } from "@/design-system/lib/utils";
import { ATTENDEES } from "../sample-data";

type FloatCard = {
  id: string;
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
}: {
  src: string;
  alt: string;
  label: string;
  meta: string;
  badge?: React.ReactNode;
}) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line-strong bg-card shadow-floating">
      <div className="relative">
        <img src={src} alt={alt} loading="lazy" className="aspect-[4/3] w-full object-cover" />
        {badge ? <div className="absolute left-sm top-sm">{badge}</div> : null}
      </div>
      <figcaption className="p-md">
        <p className="type-h3 truncate text-primary-text">{label}</p>
        <p className="type-caption truncate text-muted-text">{meta}</p>
      </figcaption>
    </figure>
  );
}

const CARDS: FloatCard[] = [
  {
    id: "concert",
    className: "left-[1%] top-[6%] w-[210px] xl:w-[240px] outrazo-float",
    style: { ["--tilt" as string]: "-7deg", animationDelay: "0s" },
    node: (
      <PhotoCard
        src={photo("photo-1514525253161-7a46d19cd819")}
        alt="Crowd dancing at a night concert"
        label="Night Market"
        meta="Fri · Freedom Park"
        badge={<Badge variant="transactional">Live</Badge>}
      />
    ),
  },
  {
    id: "friends",
    className: "right-[1%] top-[2%] w-[200px] xl:w-[230px] outrazo-float",
    style: { ["--tilt" as string]: "8deg", animationDelay: "-2.4s" },
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
    className: "left-[3%] bottom-[8%] w-[195px] xl:w-[225px] outrazo-float",
    style: { ["--tilt" as string]: "6deg", animationDelay: "-1.2s" },
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
    className: "right-[2%] bottom-[10%] w-[190px] xl:w-[220px] outrazo-float",
    style: { ["--tilt" as string]: "-9deg", animationDelay: "-3.6s" },
    node: (
      <PhotoCard
        src={photo("photo-1531058020387-3be344556be6")}
        alt="Audience at an outdoor festival"
        label="Afro House"
        meta="Fri · Victoria Island"
      />
    ),
  },
  {
    id: "proof",
    className: "left-[8%] top-[47%] w-[200px] outrazo-pop",
    style: { ["--tilt" as string]: "-3deg", animationDelay: "-1.8s" },
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
    className: "right-[6%] top-[44%] w-[190px] outrazo-pop",
    style: { ["--tilt" as string]: "4deg", animationDelay: "-3s" },
    node: (
      <div className="flex items-center gap-md rounded-lg border border-line bg-card/95 p-md shadow-floating backdrop-blur-md">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
          <Ticket aria-hidden className="size-5" strokeWidth={2} />
        </span>
        <span className="type-caption text-muted-text">
          <span className="type-h3 block text-primary-text">₦12,000</span>
          secure ticket
        </span>
      </div>
    ),
  },
];

/** Desktop-only layered collage of tilted, drifting event cards framing the hero copy. */
export function HeroFloatingCards() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      {CARDS.map((card) => (
        <div key={card.id} className={cn("absolute", card.className)} style={card.style}>
          {card.node}
        </div>
      ))}

      {/* Orbiting sticker */}
      <div
        className="outrazo-orbit absolute left-1/2 top-[18%] -ml-[60px]"
        style={{ ["--orbit" as string]: "120px" }}
      >
        <span className="type-caption inline-flex items-center gap-xs rounded-full bg-accent px-md py-sm font-semibold text-on-accent shadow-glow">
          <Sparkles className="size-4" strokeWidth={2.5} />
          Live tonight
        </span>
      </div>

      {/* Pulsing music sticker */}
      <span className="absolute bottom-[22%] left-1/2 ml-[150px] grid size-12 place-items-center">
        <span className="outrazo-pulse-ring absolute inset-0 rounded-full bg-transactional/50" />
        <span className="relative grid size-10 place-items-center rounded-full bg-transactional text-on-transactional shadow-floating">
          <Music className="size-4" strokeWidth={2.5} />
        </span>
      </span>
    </div>
  );
}

/** Mobile/tablet strip: same cards, tilted and drifting, in a compact scroll-free row. */
export function HeroCardStrip() {
  return (
    <div className="flex items-center justify-center gap-md lg:hidden">
      <div
        className="outrazo-float w-[42%] max-w-[190px]"
        style={{ ["--tilt" as string]: "-6deg" }}
      >
        <PhotoCard
          src={photo("photo-1514525253161-7a46d19cd819", 400)}
          alt="Crowd dancing at a night concert"
          label="Night Market"
          meta="Fri · Lagos"
          badge={<Badge variant="transactional">Live</Badge>}
        />
      </div>
      <div
        className="outrazo-float w-[42%] max-w-[190px]"
        style={{ ["--tilt" as string]: "7deg", animationDelay: "-2.2s" }}
      >
        <PhotoCard
          src={photo("photo-1505373877841-8d25f7d46678", 400)}
          alt="Speaker presenting at a tech meetup"
          label="Build Week"
          meta="Sun · Ikeja"
        />
      </div>
    </div>
  );
}
