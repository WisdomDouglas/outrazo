import { Radio, Ticket, Users } from "lucide-react";

import { AvatarStack } from "@/design-system/components/AvatarStack";
import { Badge } from "@/design-system/components/Badge";
import { cn } from "@/design-system/lib/utils";
import { ATTENDEES, TONIGHT_ATTENDING } from "../sample-data";

/** Demo attendance across tonight's sample events. */
const tonightCount = `${TONIGHT_ATTENDING.toLocaleString("en-NG")}+`;

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
    <figure className="overflow-hidden rounded-lg border border-line-strong bg-card/95 shadow-floating backdrop-blur-md">
      <div className="relative">
        <img src={src} alt={alt} loading="lazy" className="aspect-[4/3] w-full object-cover" />
        {badge ? <div className="absolute left-sm top-sm">{badge}</div> : null}
      </div>
      <figcaption className="p-sm lg:p-md">
        <p className="type-h3 truncate text-primary-text">{label}</p>
        <p className="type-caption truncate text-muted-text">{meta}</p>
      </figcaption>
    </figure>
  );
}

function StatCard({
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
          "grid size-10 shrink-0 place-items-center rounded-full",
          tone === "accent"
            ? "bg-accent/15 text-accent"
            : "bg-transactional/15 text-transactional",
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
 * Desktop-only side rails of tilted, drifting cards.
 * Cards are pinned to the outer columns so the hero copy stays fully legible.
 */
export function HeroFloatingCards() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      {/* Left rail */}
      <div className="absolute inset-y-0 left-0 w-[230px] xl:w-[250px]">
        <div
          className="outrazo-float absolute left-0 top-[8%] w-full"
          style={{ ["--tilt" as string]: "-5deg" }}
        >
          <PhotoCard
            src={photo("photo-1514525253161-7a46d19cd819")}
            alt="Crowd dancing at a night concert"
            label="Night Market"
            meta="Fri · Freedom Park"
            badge={<Badge variant="transactional">Live</Badge>}
          />
        </div>
        <div
          className="outrazo-pop absolute left-[6%] top-[45%] w-[88%]"
          style={{ ["--tilt" as string]: "-3deg", animationDelay: "-1.8s" }}
        >
          <StatCard
            icon={<Users aria-hidden className="size-5" strokeWidth={2} />}
            value={tonightCount}
            label="going tonight"
          />
        </div>
        <div
          className="outrazo-float absolute left-0 bottom-[3%] w-[92%]"
          style={{ ["--tilt" as string]: "4deg", animationDelay: "-2.6s" }}
        >
          <PhotoCard
            src={photo("photo-1505373877841-8d25f7d46678")}
            alt="Speaker presenting at a tech meetup"
            label="Build Week"
            meta="Sun · Ikeja Hub"
          />
        </div>
      </div>

      {/* Right rail */}
      <div className="absolute inset-y-0 right-0 w-[230px] xl:w-[250px]">
        <div
          className="outrazo-float absolute right-0 top-[6%] w-full"
          style={{ ["--tilt" as string]: "6deg", animationDelay: "-1.4s" }}
        >
          <PhotoCard
            src={photo("photo-1533174072545-7a4b6ad7a6c3")}
            alt="Friends laughing together outdoors"
            label="Rooftop Sundown"
            meta="Sat · Lekki"
          />
        </div>
        <div
          className="outrazo-pop absolute right-[6%] top-[45%] w-[88%]"
          style={{ ["--tilt" as string]: "3deg", animationDelay: "-3s" }}
        >
          <StatCard
            icon={<Ticket aria-hidden className="size-5" strokeWidth={2} />}
            value="₦12,000"
            label="secure ticket"
            tone="transactional"
          />
        </div>
        <div
          className="outrazo-float absolute right-0 bottom-[3%] w-[92%]"
          style={{ ["--tilt" as string]: "-6deg", animationDelay: "-3.6s" }}
        >
          <PhotoCard
            src={photo("photo-1531058020387-3be344556be6")}
            alt="Audience at an outdoor festival"
            label="Afro House"
            meta="Fri · Victoria Island"
          />
        </div>
      </div>

      {/* Drifting status sticker, kept clear of the headline column */}
      <div
        className="outrazo-orbit absolute left-[20%] top-[13%]"
        style={{ ["--orbit" as string]: "22px" }}
      >
        <span className="type-caption inline-flex items-center gap-xs rounded-full bg-accent px-md py-sm font-semibold text-on-accent shadow-glow">
          <Radio className="size-4" strokeWidth={2.5} />
          Doors open 8PM
        </span>
      </div>
    </div>
  );
}

/** Decorative vector artwork that gives the mobile hero depth behind the card strip. */
export function HeroVectorArt() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 360 240"
      className="pointer-events-none absolute inset-x-0 top-[12%] -z-0 h-[320px] w-full opacity-70 lg:hidden"
    >
      <defs>
        <linearGradient id="outrazo-arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--color-transactional)" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <circle
        cx="180"
        cy="120"
        r="104"
        fill="none"
        stroke="url(#outrazo-arc)"
        strokeWidth="1.5"
        strokeDasharray="6 10"
      />
      <circle
        cx="180"
        cy="120"
        r="70"
        fill="none"
        stroke="var(--color-accent)"
        strokeOpacity="0.22"
        strokeWidth="1.5"
      />
      <path
        d="M28 176c44-28 74-30 116-8s72 20 116-14"
        fill="none"
        stroke="var(--color-accent)"
        strokeOpacity="0.3"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <g fill="var(--color-accent)" fillOpacity="0.5">
        <circle cx="52" cy="70" r="4" />
        <circle cx="312" cy="92" r="3" />
        <circle cx="286" cy="42" r="5" />
        <circle cx="86" cy="196" r="3" />
      </g>
      <g fill="var(--color-transactional)" fillOpacity="0.45">
        <rect x="300" y="164" width="10" height="10" rx="3" transform="rotate(18 305 169)" />
        <rect x="42" y="120" width="8" height="8" rx="2.5" transform="rotate(-22 46 124)" />
      </g>
    </svg>
  );
}

/** Two tilted, drifting event cards shown beneath the hero copy on all viewports. */
export function HeroCardStrip() {
  return (
    <div className="relative z-10 mt-xs flex w-full items-end justify-center pb-lg pt-sm sm:mt-sm sm:pb-xl lg:mt-0 lg:pt-md">
      <div aria-hidden className="absolute inset-x-[12%] top-1/2 border-t border-dashed border-accent/35 sm:inset-x-[18%]" />
      <div className="relative z-10 flex w-full items-end justify-center -space-x-md sm:-space-x-sm lg:space-x-md">
        <div
          className="outrazo-float w-[42%] max-w-[146px] -translate-y-xs sm:w-[38%] sm:max-w-[168px] lg:w-[32%] lg:max-w-[190px]"
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
          className="outrazo-float w-[42%] max-w-[146px] translate-y-xs sm:w-[38%] sm:max-w-[168px] lg:w-[32%] lg:max-w-[190px]"
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

      <div className="outrazo-pop absolute bottom-0 z-20 flex items-center gap-sm rounded-full border border-line bg-card/95 px-md py-sm shadow-floating backdrop-blur-md">
        <AvatarStack people={ATTENDEES.slice(0, 4)} />
        <span className="type-caption text-muted-text">
          <span className="font-semibold text-primary-text">{tonightCount}</span> going tonight
        </span>
      </div>
    </div>
  );
}
