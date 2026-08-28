import { Bookmark, MapPin } from "lucide-react";
import { forwardRef, type HTMLAttributes } from "react";

import { Avatar } from "./Avatar";
import { AvatarStack, type AvatarStackPerson } from "./AvatarStack";
import { Badge } from "./Badge";
import { cn } from "../lib/utils";

export interface EventCardProps extends HTMLAttributes<HTMLElement> {
  title: string;
  imageSrc: string;
  /** Short date label, e.g. "Fri 12 Sep". */
  date: string;
  /** Optional time label, e.g. "8:00 PM". */
  time?: string;
  location: string;
  /** Display price, e.g. "₦12,000". Omit for a free event. */
  price?: string;
  host: { name: string; avatarSrc?: string };
  /** Attendees shown as social proof. */
  attendees?: AvatarStackPerson[];
  /** Image proportion: 16:9 for grids and rails, 1:1 for poster layouts. */
  aspect?: "16/9" | "1/1";
  /** Whether the event is saved by the current user. */
  saved?: boolean;
  onToggleSave?: () => void;
  /** Destination for the card's title link. */
  href?: string;
}

/** Core discovery unit: scannable summary of one event. */
export const EventCard = forwardRef<HTMLElement, EventCardProps>(
  (
    {
      className,
      title,
      imageSrc,
      date,
      time,
      location,
      price,
      host,
      attendees,
      aspect = "16/9",
      saved = false,
      onToggleSave,
      href = "#",
      ...props
    },
    ref,
  ) => (
    <article
      ref={ref}
      className={cn(
        "group flex flex-col gap-md rounded-lg bg-card p-md shadow-card transition-transform duration-200 hover:-translate-y-[2px]",
        className,
      )}
      {...props}
    >
      <div className="relative overflow-hidden rounded-md">
        <img
          src={imageSrc}
          alt={`${title} cover`}
          loading="lazy"
          className={cn(
            "w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]",
            aspect === "1/1" ? "aspect-square" : "aspect-video",
          )}
        />
        <span className="type-caption absolute left-sm top-sm rounded-sm bg-canvas/70 px-sm py-[3px] font-semibold text-primary-text backdrop-blur-md">
          {date}
          {time ? ` · ${time}` : ""}
        </span>
        <button
          type="button"
          onClick={onToggleSave}
          aria-pressed={saved}
          aria-label={saved ? `Unsave ${title}` : `Save ${title}`}
          className="focus-ring absolute right-sm top-sm grid size-11 place-items-center rounded-full bg-canvas/70 text-primary-text backdrop-blur-md hover:text-accent"
        >
          <Bookmark aria-hidden className={cn("size-[18px]", saved && "fill-accent text-accent")} />
        </button>
      </div>

      <div className="flex flex-col gap-sm">
        <h3 className="type-h3">
          <a href={href} className="focus-ring rounded-sm hover:text-accent">
            {title}
          </a>
        </h3>
        <p className="type-body flex items-center gap-xs text-muted-text">
          <MapPin aria-hidden className="size-4 shrink-0" />
          {location}
        </p>
      </div>

      <div className="flex items-center justify-between gap-md">
        <span className="type-caption flex items-center gap-sm text-muted-text">
          <Avatar name={host.name} src={host.avatarSrc} size="sm" />
          {host.name}
        </span>
        <Badge variant={price ? "transactional" : "accent"}>{price ?? "Free"}</Badge>
      </div>

      {attendees?.length ? <AvatarStack people={attendees} /> : null}
    </article>
  ),
);
EventCard.displayName = "EventCard";
