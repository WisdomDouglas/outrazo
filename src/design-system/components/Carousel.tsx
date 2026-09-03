import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { cn } from "../lib/utils";

export interface CarouselProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Slides. Each child is snapped into place. */
  children: ReactNode;
  /** Accessible name for the scrollable rail. */
  label: string;
  /** Show prev/next controls (desktop). */
  controls?: boolean;
  /** Classes applied to each slide wrapper, e.g. widths per breakpoint. */
  slideClassName?: string;
  /** Classes applied to the scrolling track. */
  trackClassName?: string;
}

/**
 * Scroll-snap rail with pointer drag, keyboard scrolling and optional
 * prev/next controls. Used for category, event and city rails.
 */
export function Carousel({
  children,
  label,
  controls = true,
  className,
  slideClassName,
  trackClassName,
  ...props
}: CarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    const onResize = () => sync();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sync]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.8), behavior: "smooth" });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return; // native touch scrolling is better
    const el = trackRef.current;
    if (!el) return;
    drag.current = {
      active: true,
      startX: event.clientX,
      startScroll: el.scrollLeft,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el || !drag.current.active) return;
    const delta = event.clientX - drag.current.startX;
    if (Math.abs(delta) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - delta;
  };

  const endDrag = () => {
    drag.current.active = false;
  };

  return (
    <div className={cn("relative", className)} {...props}>
      <div
        ref={trackRef}
        role="group"
        aria-label={label}
        tabIndex={0}
        onScroll={sync}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={(event) => {
          if (drag.current.moved) {
            event.preventDefault();
            event.stopPropagation();
            drag.current.moved = false;
          }
        }}
        className={cn(
          "ds-rail flex snap-x snap-mandatory gap-md overflow-x-auto scroll-smooth pb-sm",
          trackClassName,
        )}
      >
        {Array.isArray(children)
          ? children.map((child, index) => (
              <div
                key={index}
                className={cn("shrink-0 snap-start", slideClassName)}
              >
                {child}
              </div>
            ))
          : children}
      </div>

      {controls ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden items-center justify-between lg:flex">
          <RailButton
            direction="prev"
            disabled={atStart}
            onClick={() => scrollByPage(-1)}
          />
          <RailButton direction="next" disabled={atEnd} onClick={() => scrollByPage(1)} />
        </div>
      ) : null}
    </div>
  );
}

function RailButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "prev" ? "Scroll backwards" : "Scroll forwards"}
      className={cn(
        "focus-ring pointer-events-auto grid size-11 place-items-center rounded-full border border-line bg-card/85 text-primary-text shadow-card backdrop-blur-md transition-all duration-200 hover:border-accent/50 hover:text-accent",
        direction === "prev" ? "-translate-x-1/2" : "translate-x-1/2",
        disabled && "pointer-events-none opacity-0",
      )}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
