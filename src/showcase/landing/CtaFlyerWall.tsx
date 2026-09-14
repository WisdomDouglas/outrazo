import { EVENTS } from "@/showcase/sample-data";

const COLLAGE_EVENT_INDEXES = [2, 5, 12, 17, 8, 3, 9, 14, 20, 6, 1, 7];

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

function FlyerCollage({ copy }: { copy: number }) {
  return (
    <div className="cta-collage-group relative shrink-0">
      {COLLAGE_EVENT_INDEXES.map((eventIndex, position) => (
        <Flyer
          key={`${copy}-${EVENTS[eventIndex % EVENTS.length].id}`}
          eventIndex={eventIndex}
          position={position}
        />
      ))}
    </div>
  );
}

export function CtaFlyerWall() {
  return (
    <div aria-hidden className="cta-collage-window relative -mx-md h-[390px] overflow-hidden sm:mx-0 sm:h-[460px] lg:h-[580px]">
      <div className="cta-collage-track absolute inset-x-0 top-0 flex flex-col">
        <FlyerCollage copy={0} />
        <FlyerCollage copy={1} />
      </div>
    </div>
  );
}
