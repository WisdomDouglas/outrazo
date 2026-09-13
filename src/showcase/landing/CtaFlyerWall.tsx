import { EVENTS } from "@/showcase/sample-data";

const COLUMN_EVENT_INDEXES = [
  [0, 5, 12, 17],
  [3, 9, 14, 20],
  [1, 7, 11, 18],
];

const TILTS = [-8, 6, -3, 12, 4, -6, 9, -2];

function Flyer({ eventIndex, cardIndex }: { eventIndex: number; cardIndex: number }) {
  const event = EVENTS[eventIndex % EVENTS.length];
  const tilt = TILTS[cardIndex % TILTS.length];
  const compact = cardIndex % 3 === 1;

  return (
    <figure
      className="cta-stream-card group relative shrink-0 overflow-hidden rounded-md shadow-card"
      style={{ ["--card-tilt" as string]: `${tilt}deg` }}
    >
      <img
        src={event.imageSrc}
        alt=""
        loading="lazy"
        className={compact ? "aspect-square w-full object-cover" : "aspect-[3/4] w-full object-cover"}
      />
      <span className="absolute inset-0 bg-gradient-to-t from-canvas/90 via-canvas/10 to-transparent" />
      <figcaption className="absolute inset-x-0 bottom-0 flex flex-col gap-xs p-sm">
        <span className="type-caption font-semibold uppercase text-accent">
          {event.category}
        </span>
        <span className="type-body line-clamp-2 font-semibold text-primary-text">
          {event.title}
        </span>
        <span className="type-caption text-muted-text">{event.date} · {event.city}</span>
      </figcaption>
    </figure>
  );
}

function FlyerGroup({ indexes, group }: { indexes: number[]; group: number }) {
  return (
    <div className="flex flex-col gap-md pb-md">
      {indexes.map((eventIndex, index) => (
        <Flyer
          key={`${group}-${EVENTS[eventIndex % EVENTS.length].id}`}
          eventIndex={eventIndex}
          cardIndex={eventIndex + index}
        />
      ))}
    </div>
  );
}

export function CtaFlyerWall() {
  return (
    <div aria-hidden className="cta-stream-window relative h-[300px] w-full overflow-hidden sm:h-[340px] lg:h-[430px]">
      <div className="cta-stream-grid absolute inset-x-[-12%] top-[-45%] grid grid-cols-3 gap-md sm:gap-lg lg:inset-x-[-6%] lg:top-[-55%]">
        {COLUMN_EVENT_INDEXES.map((indexes, columnIndex) => (
          <div
            key={columnIndex}
            className={`cta-stream-column cta-stream-column-${columnIndex + 1} min-w-0`}
          >
            <FlyerGroup indexes={indexes} group={columnIndex * 2} />
            <FlyerGroup indexes={indexes} group={columnIndex * 2 + 1} />
          </div>
        ))}
      </div>
    </div>
  );
}
