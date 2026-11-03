// Premium promoted-event card for the homepage Spotlight. Image-forward with
// a gradient shade, a clear Promoted marker, and the event's real details —
// every field comes from the published catalog row, never invented.
import { Link } from "@tanstack/react-router";
import { CalendarDays, Heart, MapPin, Megaphone } from "lucide-react";

import { Button } from "@/design-system/components/Button";
import type { OutrazoEvent } from "@/showcase/sample-data";

export function SpotlightCard({
  event,
  saved,
  onToggleSave,
}: {
  event: OutrazoEvent;
  saved: boolean;
  onToggleSave: () => void;
}) {
  return (
    <article className="spotlight-card">
      <div className="spotlight-media">
        <Link
          to="/events/$eventId"
          params={{ eventId: event.id }}
          className="focus-ring spotlight-media-link"
          aria-label={`View ${event.title}`}
          tabIndex={-1}
        >
          <img
            src={event.imageSrc}
            alt=""
            loading="lazy"
            className="spotlight-image"
          />
        </Link>
        <span className="spotlight-shade" aria-hidden="true" />
        <span className="spotlight-promoted">
          <Megaphone aria-hidden className="size-3" />
          Promoted
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="home-feature-save"
          onClick={onToggleSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${event.title} from saved` : `Save ${event.title}`}
        >
          <Heart aria-hidden className={`size-[18px] ${saved ? "fill-transactional text-transactional" : ""}`} />
        </Button>
      </div>
      <div className="spotlight-body">
        <p className="spotlight-kicker">Featured event</p>
        <Link
          to="/events/$eventId"
          params={{ eventId: event.id }}
          className="focus-ring spotlight-title-link"
        >
          <h3 className="spotlight-title">{event.title}</h3>
        </Link>
        <p className="spotlight-meta">
          <MapPin aria-hidden className="size-3.5 shrink-0 text-accent" />
          <span className="truncate">{event.location}</span>
        </p>
        <p className="spotlight-meta">
          <CalendarDays aria-hidden className="size-3.5 shrink-0" />
          <span>{event.date}{event.time ? ` · ${event.time}` : ""}</span>
        </p>
        <div className="spotlight-foot">
          <span className={`home-feature-price ${event.price ? "home-feature-price--paid" : ""}`}>
            {event.price ?? "Free"}
          </span>
          <Link
            to="/events/$eventId"
            params={{ eventId: event.id }}
            className="focus-ring rounded-full"
          >
            <Button type="button" variant="primary" size="sm">
              View event
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}
