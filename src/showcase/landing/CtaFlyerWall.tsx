import { ArrowUpRight, MapPin } from "lucide-react";
import { EVENTS } from "@/showcase/sample-data";

const COLLAGE_EVENT_INDEXES = [1, 20, 16, 4, 13, 12];

function Flyer({ eventIndex, position }: { eventIndex: number; position: number }) {
  const event = EVENTS[eventIndex % EVENTS.length];

  return (
    <figure className={`cta-flow-card cta-flow-card-${position + 1}`}>
      <div className="cta-flow-card-art overflow-hidden rounded-md bg-card shadow-card">
        <img
          src={event.imageSrc}
          alt=""
          className="cta-flow-card-image size-full object-cover"
        />
        <figcaption className="cta-flow-card-caption">
          <span className="cta-flow-card-title">{event.title}</span>
          <span className="cta-flow-card-footer">
            <span className="cta-flow-card-meta">
              <MapPin aria-hidden />
              {event.city} · {event.attendeeCount.toLocaleString()} going
            </span>
            <span className="cta-flow-card-arrow"><ArrowUpRight aria-hidden /></span>
          </span>
        </figcaption>
      </div>
    </figure>
  );
}

function FlyerGroup() {
  return (
    <div className="cta-flow-group">
      {COLLAGE_EVENT_INDEXES.map((eventIndex, position) => (
        <Flyer
          key={EVENTS[eventIndex % EVENTS.length].id}
          eventIndex={eventIndex}
          position={position}
        />
      ))}
    </div>
  );
}

export function CtaFlyerWall() {
  return (
    <div
      aria-hidden
      className="cta-flow-window relative -mx-md h-[calc(var(--spacing-section)*3.25)] overflow-visible sm:mx-0 sm:h-[calc(var(--spacing-section)*3.75)] lg:h-[calc(var(--spacing-section)*5.25)]"
    >
      <div className="cta-flow-guide" />
      <div className="cta-flow-track">
        <FlyerGroup />
      </div>
    </div>
  );
}
