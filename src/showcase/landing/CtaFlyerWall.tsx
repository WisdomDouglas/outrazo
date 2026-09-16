import { EVENTS } from "@/showcase/sample-data";

const COLLAGE_EVENT_INDEXES = [13, 1, 5, 18, 10, 6, 3, 12, 8, 20];

function Flyer({ eventIndex, position }: { eventIndex: number; position: number }) {
  const event = EVENTS[eventIndex % EVENTS.length];

  return (
    <figure
      className={`cta-flow-card cta-flow-card-${position + 1}`}
    >
      <div className="cta-flow-card-art overflow-hidden rounded-sm shadow-card">
        <img
          src={event.imageSrc}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
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
      className="cta-flow-window relative -mx-md h-[360px] overflow-visible sm:mx-0 sm:h-[420px] lg:h-[580px]"
    >
      <div className="cta-flow-track">
        <FlyerGroup />
      </div>
    </div>
  );
}
