import { EVENTS } from "@/showcase/sample-data";

/**
 * Overlapping fan/collage of event invitation cards used beside the organizer
 * CTA. Cards drift in a slow floating loop and lift on hover.
 */

type FanCard = {
  /** Horizontal position, percentage of the container width. */
  left: number;
  /** Vertical position, percentage of the container height. */
  top: number;
  rotate: number;
  /** Card width in px at the desktop breakpoint. */
  width: number;
  z: number;
  delay: number;
};

/** Desktop fan: a loose arc of tilted posters. */
const DESKTOP: FanCard[] = [
  { left: 2, top: 22, rotate: -14, width: 150, z: 1, delay: 0 },
  { left: 17, top: 48, rotate: -8, width: 160, z: 2, delay: 0.8 },
  { left: 32, top: 12, rotate: 7, width: 165, z: 3, delay: 1.6 },
  { left: 46, top: 44, rotate: -5, width: 155, z: 4, delay: 0.4 },
  { left: 60, top: 8, rotate: 12, width: 150, z: 3, delay: 2.2 },
  { left: 66, top: 46, rotate: 16, width: 145, z: 2, delay: 1.2 },
];

/** Mobile fan: fewer, tighter cards under the copy. */
const MOBILE: FanCard[] = [
  { left: 1, top: 30, rotate: -13, width: 108, z: 1, delay: 0.6 },
  { left: 22, top: 10, rotate: -4, width: 116, z: 3, delay: 0 },
  { left: 46, top: 26, rotate: 8, width: 112, z: 2, delay: 1.4 },
  { left: 69, top: 6, rotate: 15, width: 104, z: 1, delay: 2 },
];

function Fan({ cards, className }: { cards: FanCard[]; className?: string }) {
  return (
    <div className={className}>
      {cards.map((card, index) => {
        const event = EVENTS[(index * 3 + 1) % EVENTS.length];
        return (
          <figure
            key={`${event.id}-${index}`}
            className="cta-fan-card absolute origin-center overflow-hidden rounded-md shadow-card transition-transform duration-300 ease-out hover:z-50 hover:scale-[1.06]"
            style={{
              left: `${card.left}%`,
              top: `${card.top}%`,
              width: card.width,
              zIndex: card.z,
              // Consumed by the floating keyframes so each card keeps its tilt.
              ["--tilt" as string]: `${card.rotate}deg`,
              animationDelay: `${card.delay}s`,
            }}
          >
            <img
              src={event.imageSrc}
              alt={event.title}
              loading="lazy"
              className="aspect-[3/4] w-full object-cover"
            />
          </figure>
        );
      })}
    </div>
  );
}

export function CtaFlyerWall() {
  return (
    <div aria-hidden className="relative w-full">
      <Fan
        cards={MOBILE}
        className="relative h-[230px] w-full sm:h-[280px] lg:hidden"
      />
      <Fan
        cards={DESKTOP}
        className="relative hidden h-[400px] w-full lg:block"
      />
    </div>
  );
}
