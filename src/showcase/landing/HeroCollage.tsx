import { Sparkles, Users } from "lucide-react";

import { AvatarStack } from "@/design-system/components/AvatarStack";
import { cn } from "@/design-system/lib/utils";
import { ATTENDEES } from "../sample-data";

type Photo = {
  src: string;
  alt: string;
  className: string;
  style: React.CSSProperties;
};

const PHOTOS: Photo[] = [
  {
    src: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=70",
    alt: "Crowd dancing at a night concert",
    className: "left-[6%] top-[8%] w-[42%] outrazo-float",
    style: { ["--tilt" as string]: "-6deg", animationDelay: "0s" },
  },
  {
    src: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=600&q=70",
    alt: "Friends laughing together outdoors",
    className: "right-[4%] top-0 w-[38%] outrazo-float",
    style: { ["--tilt" as string]: "7deg", animationDelay: "-2.4s" },
  },
  {
    src: "https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=600&q=70",
    alt: "Audience at an outdoor festival",
    className: "left-[18%] bottom-[6%] w-[40%] outrazo-float",
    style: { ["--tilt" as string]: "5deg", animationDelay: "-1.2s" },
  },
  {
    src: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=600&q=70",
    alt: "Speaker presenting at a tech meetup",
    className: "right-[8%] bottom-[10%] w-[34%] outrazo-float",
    style: { ["--tilt" as string]: "-8deg", animationDelay: "-3.6s" },
  },
];

/** Animated hero collage: photos drift in a slow loop with orbiting stickers. */
export function HeroCollage() {
  return (
    <div className="relative aspect-square w-full max-w-[560px]">
      {/* mint halo */}
      <div className="absolute inset-[12%] rounded-full bg-accent/20 blur-[80px]" aria-hidden />

      {PHOTOS.map((photo) => (
        <figure
          key={photo.src}
          className={cn(
            "absolute overflow-hidden rounded-lg border border-line-strong shadow-floating",
            photo.className,
          )}
          style={photo.style}
        >
          <img
            src={photo.src}
            alt={photo.alt}
            loading="lazy"
            className="aspect-[4/5] w-full object-cover"
          />
        </figure>
      ))}

      {/* Orbiting sticker cluster */}
      <div
        className="outrazo-orbit absolute left-1/2 top-1/2 -ml-[24px] -mt-[24px]"
        style={{ ["--orbit" as string]: "190px" }}
        aria-hidden
      >
        <span className="type-caption inline-flex items-center gap-xs rounded-full bg-accent px-md py-sm font-semibold text-on-accent shadow-glow">
          <Sparkles className="size-4" strokeWidth={2.5} />
          Live tonight
        </span>
      </div>

      {/* Social proof pill */}
      <div className="outrazo-pop absolute -bottom-[2%] left-1/2 -translate-x-1/2 rounded-lg bg-card/95 p-md shadow-floating backdrop-blur-md">
        <div className="flex items-center gap-md">
          <AvatarStack people={ATTENDEES.slice(0, 4)} />
          <span className="type-caption text-muted-text">
            <span className="type-h3 block text-primary-text">128+</span>
            going with friends
          </span>
        </div>
      </div>

      {/* Pulsing live dot */}
      <span
        className="absolute right-[2%] top-[46%] grid size-11 place-items-center"
        aria-hidden
      >
        <span className="outrazo-pulse-ring absolute inset-0 rounded-full bg-transactional/50" />
        <span className="relative inline-flex items-center gap-xs rounded-full bg-transactional px-sm py-[3px] type-caption font-semibold text-on-transactional">
          <Users className="size-3" strokeWidth={2.5} />
        </span>
      </span>
    </div>
  );
}
