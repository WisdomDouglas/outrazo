import { EVENTS } from "@/showcase/sample-data";

const COLUMN_EVENT_INDEXES = [
  [2, 5, 12, 17, 8],
  [3, 9, 14, 20, 6],
  [1, 7, 11, 18, 13],
];

const TILTS = [-8, 6, -3, 12, 4, -6, 9, -2];

function Flyer({ eventIndex, cardIndex }: { eventIndex: number; cardIndex: number }) {
  const event = EVENTS[eventIndex % EVENTS.length];
  const tilt = TILTS[cardIndex % TILTS.length];
  const compact = cardIndex % 4 === 1;

  return (
    <figure
      className="cta-stream-card group relative shrink-0 overflow-hidden rounded-md shadow-card"
      style={{ ["--card-tilt" as string]: `${tilt}deg` }}
    >
      <img
        src={event.imageSrc}
        alt=""
        loading="lazy"
        className={compact ? "aspect-square w-full object-cover" : "aspect-[4/5] w-full object-cover"}
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
    <div aria-hidden className="cta-stream-window relative -mx-md h-[370px] w-[calc(100%+2rem)] overflow-hidden sm:mx-0 sm:h-[420px] sm:w-full lg:h-[520px] lg:overflow-visible">
      <div className="cta-stream-grid absolute inset-x-[-10%] top-[-18%] grid grid-cols-3 gap-sm sm:inset-x-[-5%] sm:gap-md lg:inset-x-[-8%] lg:top-[-28%] lg:gap-lg">
        {COLUMN_EVENT_INDEXES.map((indexes, columnIndex) => (
          <div
            key={columnIndex}
            className={`cta-stream-lane cta-stream-lane-${columnIndex + 1} min-w-0`}
          >
            <div className={`cta-stream-column cta-stream-column-${columnIndex + 1}`}>
              <FlyerGroup indexes={indexes} group={columnIndex * 2} />
              <FlyerGroup indexes={indexes} group={columnIndex * 2 + 1} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
