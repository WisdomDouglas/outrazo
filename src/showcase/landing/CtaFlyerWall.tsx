import { EVENTS } from "@/showcase/sample-data";

/** Split the demo catalogue into three offset rows of flyer cards. */
const ROWS = [
  EVENTS.slice(0, 8),
  EVENTS.slice(8, 15),
  EVENTS.slice(15, 22),
];

const ROW_SPEEDS = ["46s", "58s", "52s"] as const;

function FlyerCard({
  title,
  imageSrc,
  tilt,
}: {
  title: string;
  imageSrc: string;
  tilt: number;
}) {
  return (
    <article
      className="relative w-[110px] shrink-0 overflow-hidden rounded-md shadow-card sm:w-[130px] lg:w-[140px]"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <img
        src={imageSrc}
        alt={title}
        loading="lazy"
        className="aspect-[3/4] w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 bg-canvas/70 px-sm py-xs backdrop-blur-sm">
        <p className="type-caption truncate font-semibold text-primary-text">{title}</p>
      </div>
    </article>
  );
}

function FlyerRow({
  events,
  speed,
  reverse,
  rowIndex,
}: {
  events: typeof EVENTS;
  speed: string;
  reverse?: boolean;
  rowIndex: number;
}) {
  const doubled = [...events, ...events];
  return (
    <div className="overflow-hidden">
      <div
        className={`cta-wall-row flex w-max gap-md ${reverse ? "cta-wall-row-reverse" : ""}`}
        style={{ animationDuration: speed }}
      >
        {doubled.map((event, index) => (
          <FlyerCard
            key={`${event.id}-${index}`}
            title={event.title}
            imageSrc={event.imageSrc}
            tilt={((index + rowIndex) % 3) * 2 - 2}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Tilted, infinitely scrolling collage of event flyers used behind the
 * pre-footer organizer CTA. Rows drift at slightly different speeds and
 * directions for a scattered, vibrant flyer-board feel.
 */
export function CtaFlyerWall() {
  return (
    <div
      aria-hidden
      className="relative h-[280px] w-full overflow-hidden sm:h-[320px] lg:h-[460px]"
    >
      <div className="absolute left-1/2 top-1/2 flex w-[140%] -translate-x-1/2 -translate-y-1/2 -rotate-[13deg] flex-col gap-lg lg:w-[125%]">
        {ROWS.map((events, index) => (
          <FlyerRow
            key={index}
            events={events}
            speed={ROW_SPEEDS[index]}
            reverse={index === 1}
            rowIndex={index}
          />
        ))}
      </div>
      {/* Soft edge fades keep the collage blending into the card surface */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card via-transparent to-card" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-card/60 via-transparent to-card/60" />
    </div>
  );
}
