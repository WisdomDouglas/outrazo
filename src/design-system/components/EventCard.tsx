import { Bookmark, CalendarDays, MapPin } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
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
  /** Community or collective the host belongs to. */
  community?: string;
  /** Attendees shown as social proof. */
  attendees?: AvatarStackPerson[];
  /** Total number of people going, when larger than the avatars provided. */
  attendeeCount?: number;
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
  /** Event identifier used for type-safe detail navigation. */
  eventId?: string;
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
      community,
      attendees,
      attendeeCount,
      tag,
      tagVariant = "accent",
      aspect = "16/9",
      saved = false,
      onToggleSave,
      onSelect,
      href = "#",
      eventId,
      ...props
    },
    ref,
  ) => {
    const navigate = useNavigate();
    const selectEvent = onSelect ?? (eventId ? () => navigate({ to: "/events/$eventId", params: { eventId } }) : undefined);

    return (
    <article
      ref={ref}
      onClick={selectEvent}
      className={cn(
        "group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-card shadow-card transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-glow",
        selectEvent && "cursor-pointer",
        className,
      )}
      {...props}
    >
      <div className="relative overflow-hidden bg-elevated">
        <img
          src={imageSrc}
          alt={`${title} cover`}
          loading="lazy"
          className={cn(
            "w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.035]",
            aspect === "1/1" ? "aspect-square" : "aspect-video",
          )}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-canvas/55 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
        <span className="type-caption absolute left-md top-md inline-flex min-h-8 items-center gap-xs rounded-full border border-line bg-canvas/80 px-sm font-semibold text-primary-text backdrop-blur-md">
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
          className="focus-ring absolute right-md top-md grid size-11 place-items-center rounded-full border border-line bg-canvas/80 text-primary-text backdrop-blur-md transition-[transform,color,border-color] duration-200 hover:scale-105 hover:border-accent/50 hover:text-accent active:scale-95"
        >
          <Bookmark aria-hidden className={cn("size-[18px]", saved && "fill-accent text-accent")} />
        </button>
        {tag ? (
          <Badge variant={tagVariant} className="absolute bottom-md left-md backdrop-blur-md">
            {tag}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-sm px-md pt-md">
        <h3 className="type-h3 min-h-2xl">
          {eventId ? (
            <Link
              to="/events/$eventId"
              params={{ eventId }}
              onClick={(event) => event.stopPropagation()}
              className="focus-ring line-clamp-2 rounded-sm transition-colors hover:text-accent"
            >
              {title}
            </Link>
          ) : (
            <a href={href} className="focus-ring line-clamp-2 rounded-sm transition-colors hover:text-accent">{title}</a>
          )}
        </h3>
        <p className="type-body flex items-center gap-sm text-muted-text">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><MapPin aria-hidden className="size-3.5" /></span>
          <span className="truncate">{location}</span>
        </p>
      </div>

      <div className="mx-md mt-md flex items-center justify-between gap-md border-t border-line py-md">
        <span className="type-caption flex min-w-0 items-center gap-sm text-muted-text">
          <Avatar name={host.name} src={host.avatarSrc} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-primary-text">{host.name}</span>
            {community ? <span className="block truncate">{community}</span> : null}
          </span>
        </span>
        <Badge className="shrink-0" variant={price ? "transactional" : "accent"}>
          {price ?? "Free"}
        </Badge>
      </div>

      {attendees?.length ? (
        <AvatarStack people={attendees} totalCount={attendeeCount} className="mx-md mb-md text-subtle-text" />
      ) : null}
    </article>
    );
  },
);
EventCard.displayName = "EventCard";
