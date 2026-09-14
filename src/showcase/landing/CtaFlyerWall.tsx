import { EVENTS } from "@/showcase/sample-data";

const COLLAGE_EVENT_INDEXES = [13, 1, 5, 18, 10, 6, 3, 12, 8, 20, 17, 14];

function Flyer({ eventIndex, position }: { eventIndex: number; position: number }) {
  const event = EVENTS[eventIndex % EVENTS.length];

  return (
    <figure
      className={`cta-collage-card cta-collage-card-${position + 1} absolute overflow-hidden rounded-sm shadow-card`}
    >
      <img
        src={event.imageSrc}
        alt=""
        loading="lazy"
        className="size-full object-cover"
      />
    </figure>
  );
}

export function CtaFlyerWall() {
  return (
    <div
      aria-hidden
      className="cta-collage-window relative -mx-md h-[390px] overflow-hidden sm:mx-0 sm:h-[460px] lg:h-[580px]"
    >
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
