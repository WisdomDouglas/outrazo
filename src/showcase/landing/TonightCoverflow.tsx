import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { usePrefersReducedMotion } from "@/design-system/lib/use-reveal";
import { cn } from "@/design-system/lib/utils";

export interface CoverflowItem {
  title: string;
  imageSrc: string;
  city: string;
  attendeeCount: number;
}

/** 3D curved coverflow: centre card lifted, side cards turn away along an arc. */
export function TonightCoverflow({ items }: { items: CoverflowItem[] }) {
  const count = items.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const dragStart = useRef<number | null>(null);

  const go = (step: number) => setActive((value) => (value + step + count) % count);

  useEffect(() => {
    if (paused || reduced || count < 2) return;
    const id = window.setInterval(() => setActive((v) => (v + 1) % count), 3200);
    return () => window.clearInterval(id);
  }, [paused, reduced, count]);

  const onPointerDown = (e: ReactPointerEvent) => {
    dragStart.current = e.clientX;
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (dragStart.current === null) return;
    const delta = e.clientX - dragStart.current;
    dragStart.current = null;
    if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
  };

  return (
    <>
    <div className="tonight-flow" aria-label="Happening tonight" role="region">
      <div className="tonight-flow-track">
        {[...items, ...items].map((item, index) => (
          <div key={`${item.title}-${index}`} className="tonight-flow-card" aria-hidden={index >= count}>
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
    </div>
    <div
      className="tonight-coverflow relative"
      role="region"
      aria-roledescription="carousel"
      aria-label="Happening tonight"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <div
        className="tonight-coverflow-stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (dragStart.current = null)}
      >
        {items.map((item, index) => {
          let offset = index - active;
          if (offset > count / 2) offset -= count;
          if (offset < -count / 2) offset += count;
          const abs = Math.abs(offset);
          const hidden = abs > 2;
          return (
            <button
              key={item.title}
              type="button"
              tabIndex={offset === 0 ? 0 : -1}
              aria-hidden={offset !== 0}
              aria-label={offset === 0 ? `${item.title}, ${item.city}` : undefined}
              onClick={() => offset !== 0 && setActive(index)}
              className={cn("tonight-coverflow-card focus-ring", offset === 0 && "is-active")}
              style={{
                ["--x" as string]: offset,
                ["--abs" as string]: abs,
                ["--dir" as string]: Math.sign(offset),
                zIndex: 10 - abs,
                opacity: hidden ? 0 : 1 - abs * 0.22,
                pointerEvents: hidden ? "none" : undefined,
              }}
            >
              <img src={item.imageSrc} alt="" loading="lazy" draggable={false} />
              <span className="tonight-coverflow-meta">
                <span className="type-h3 block truncate text-primary-text">{item.title}</span>
                <span className="type-caption block text-muted-text">
                  {item.city} · {item.attendeeCount.toLocaleString("en-NG")} going
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-lg flex items-center justify-center gap-md">
        <button type="button" onClick={() => go(-1)} aria-label="Previous event" className="tonight-coverflow-nav focus-ring">
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <div className="flex items-center gap-xs" aria-hidden>
          {items.map((item, index) => (
            <span key={item.title} className={cn("tonight-coverflow-dot", index === active && "is-active")} />
          ))}
        </div>
        <button type="button" onClick={() => go(1)} aria-label="Next event" className="tonight-coverflow-nav focus-ring">
          <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>
    </div>
    </>
  );
}
