import { EVENTS } from "@/showcase/sample-data";

const COLLAGE_EVENT_INDEXES = [13, 1, 5, 18, 10, 6, 3, 12, 8, 20];

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
          <span className="cta-flow-card-meta">{event.date} · {event.city}</span>
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
      className="cta-flow-window relative -mx-md h-[390px] overflow-visible sm:mx-0 sm:h-[440px] lg:h-[600px]"
    >
      <div className="cta-flow-track">
        <FlyerGroup />
      </div>
    </div>
  );
}
