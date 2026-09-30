import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/design-system/lib/use-reveal";

export interface CoverflowItem {
  title: string;
  imageSrc: string;
  city: string;
  attendeeCount: number;
}

/** A non-interactive, seamless ribbon of tonight's existing event cards. */
export function TonightCoverflow({ items }: { items: CoverflowItem[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track || reduced || items.length < 2) return;

    const groups = Array.from(track.querySelectorAll<HTMLElement>(".tonight-flow-group"));
    const cards = Array.from(track.querySelectorAll<HTMLElement>(".tonight-flow-card"));
    let groupWidth = 0;
    let cardWidth = 0;
    let viewportWidth = 0;
    let distance = 0;
    let lastTime = 0;
    let frame = 0;
    let visible = true;

    const measure = () => {
      groupWidth = groups[0]?.getBoundingClientRect().width ?? 0;
      cardWidth = cards[0]?.getBoundingClientRect().width ?? 0;
      viewportWidth = viewport.getBoundingClientRect().width;
      distance = groupWidth ? distance % groupWidth : 0;
    };

    const tick = (time: number) => {
      // A constant travel speed is required at the invisible seam; the gentle
      // scale/opacity envelope supplies the reference's eased, organic feeling.
      if (lastTime && visible && groupWidth) {
        distance = (distance + Math.min(time - lastTime, 64) * 0.029) % groupWidth;
      }
      lastTime = time;
      track.style.transform = `translate3d(${-distance}px, 0, 0)`;

      if (visible && groupWidth) {
        const center = viewportWidth / 2;
        const influence = Math.max(viewportWidth * 0.53, cardWidth * 1.6);
        cards.forEach((card, index) => {
          const position = Math.floor(index / items.length) * groupWidth
            + (index % items.length) * (groupWidth / items.length)
            + cardWidth / 2 - distance;
          const proximity = Math.max(0, 1 - Math.abs(position - center) / influence);
          const eased = proximity * proximity * (3 - 2 * proximity);
          card.style.setProperty("--flow-scale", (0.88 + 0.12 * eased).toFixed(3));
          card.style.setProperty("--flow-opacity", (0.66 + 0.34 * eased).toFixed(3));
        });
      }
      frame = requestAnimationFrame(tick);
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewport);
    resizeObserver.observe(groups[0]);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      lastTime = 0;
    });
    visibilityObserver.observe(viewport);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      track.style.transform = "";
      cards.forEach((card) => {
        card.style.removeProperty("--flow-scale");
        card.style.removeProperty("--flow-opacity");
      });
    };
  }, [items, reduced]);

  if (!items.length) return null;

  return (
    <div className="tonight-flow" ref={viewportRef} role="region" aria-label="Happening tonight">
      <div className="tonight-flow-track" ref={trackRef}>
        {Array.from({ length: 4 }, (_, copy) => (
          <div className="tonight-flow-group" key={copy} aria-hidden={copy > 0 ? true : undefined}>
            {items.map((item, index) => (
              <div className="tonight-flow-card" key={`${item.title}-${index}`}>
                <img src={item.imageSrc} alt="" loading="lazy" draggable={false} />
                <span className="tonight-coverflow-meta">
                  <span className="type-h3 block truncate text-primary-text">{item.title}</span>
                  <span className="type-caption block text-muted-text">
                    {item.city} · {item.attendeeCount.toLocaleString("en-NG")} going
                  </span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
