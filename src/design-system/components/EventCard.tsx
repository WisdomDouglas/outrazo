import { Bookmark, CalendarDays, MapPin } from "lucide-react";
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
  /** Highlight label, e.g. "Trending", "Tonight", "This weekend". */
  tag?: string;
  /** Visual tone of the highlight label. */
  tagVariant?: "accent" | "transactional" | "neutral" | "outline";
  /** Image proportion: 16:9 for grids and rails, 1:1 for poster layouts. */
  aspect?: "16/9" | "1/1";
  /** Whether the event is saved by the current user. */
  saved?: boolean;
  onToggleSave?: () => void;
  /** Opens the event. Wire to router navigation. */
  onSelect?: () => void;
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
      tag,
      tagVariant = "accent",
      aspect = "16/9",
      saved = false,
      onToggleSave,
      onSelect,
      href = "#",
      ...props
    },
    ref,
  ) => (
    <article
      ref={ref}
      onClick={onSelect}
      className={cn(
        "group flex h-full flex-col gap-md rounded-lg border border-line bg-card p-md shadow-card transition-all duration-200 hover:-translate-y-[3px] hover:border-accent/40 hover:shadow-glow",
        onSelect && "cursor-pointer",
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
            "w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.07]",
            aspect === "1/1" ? "aspect-square" : "aspect-video",
          )}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-canvas/55 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
        <span className="type-caption absolute left-sm top-sm inline-flex items-center gap-xs rounded-sm bg-canvas/70 px-sm py-[3px] font-semibold text-primary-text backdrop-blur-md">
          <CalendarDays aria-hidden className="size-3.5 text-accent" />
          {date}
          {time ? ` · ${time}` : ""}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSave?.();
          }}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
          className="focus-ring absolute right-sm top-sm grid size-11 place-items-center rounded-full bg-canvas/70 text-primary-text backdrop-blur-md transition-transform duration-200 hover:scale-110 hover:text-accent active:scale-95"
        >
          <Bookmark aria-hidden className={cn("size-[18px]", saved && "fill-accent text-accent")} />
        </button>
        {tag ? (
          <Badge variant={tagVariant} className="absolute bottom-sm left-sm backdrop-blur-md">
            {tag}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-sm">
        <h3 className="type-h3">
          <a
            href={href}
            onClick={(event) => {
              if (onSelect) {
                event.preventDefault();
                onSelect();
              }
            }}
            className="focus-ring rounded-sm transition-colors hover:text-accent"
          >
            {title}
          </a>
        </h3>
        <p className="type-body flex items-center gap-xs text-muted-text">
          <MapPin aria-hidden className="size-4 shrink-0 text-accent" />
          <span className="truncate">{location}</span>
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-md">
        <span className="type-caption flex min-w-0 items-center gap-sm text-muted-text">
          <Avatar name={host.name} src={host.avatarSrc} size="sm" />
          <span className="truncate">{host.name}</span>
        </span>
        <Badge variant={price ? "transactional" : "accent"}>{price ?? "Free"}</Badge>
      </div>

      {attendees?.length ? <AvatarStack people={attendees} /> : null}
    </article>
  ),
);
EventCard.displayName = "EventCard";
