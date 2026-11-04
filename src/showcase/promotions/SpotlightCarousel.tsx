// Homepage Spotlight carousel: one featured promotion at a time with
// autoplay, dots, previous/next controls, touch swipe, and keyboard support.
// Autoplay pauses on hover, on focus, and via the explicit toggle — and never
// runs under prefers-reduced-motion. A single promotion renders as a plain
// card with no carousel chrome.
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSavedItems } from "@/design-system/lib/use-saved-items";
import type { OutrazoEvent } from "@/showcase/sample-data";
import { nextSlideIndex, shouldAutoplay } from "./active-promotions";
import { SpotlightCard } from "./SpotlightCard";

const AUTOPLAY_MS = 7000;
const SWIPE_PX = 40;

export interface SpotlightSlide {
  promotionId: string;
  event: OutrazoEvent;
}

export function SpotlightCarousel({ items }: { items: SpotlightSlide[] }) {
  const { isSaved, toggle } = useSavedItems();
  const [index, setIndex] = useState(0);
  const [exitIndex, setExitIndex] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchX = useRef<number | null>(null);
  const transitionTimer = useRef<number | null>(null);
  const count = items.length;

  useEffect(() => {
    setIndex((current) => (count === 0 ? 0 : current % count));
    setExitIndex(null);
    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current);
      transitionTimer.current = null;
    }
  }, [count]);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const playing = shouldAutoplay(count, {
    reducedMotion,
    paused: paused || hoverPaused,
  });

  const showSlide = useCallback((nextIndex: number) => {
    if (nextIndex === index) return;
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    setExitIndex(index);
    setIndex(nextIndex);
    transitionTimer.current = window.setTimeout(() => {
      setExitIndex(null);
      transitionTimer.current = null;
    }, 480);
  }, [index]);

  const go = useCallback((step: 1 | -1) => {
    showSlide(nextSlideIndex(index, count, step));
  }, [count, index, showSlide]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => go(1),
      AUTOPLAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, index, count, go]);

  const current = items[index] ?? items[0];
  if (!current) return null;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Promoted events"
      className={reducedMotion ? "spotlight spotlight--static" : "spotlight"}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setHoverPaused(true)}
      onBlur={() => setHoverPaused(false)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") go(-1);
        if (event.key === "ArrowRight") go(1);
      }}
      onTouchStart={(event) => {
        touchX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchX.current;
        const end = event.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start === null || end === undefined) return;
        const delta = end - start;
        if (delta <= -SWIPE_PX) go(1);
        else if (delta >= SWIPE_PX) go(-1);
      }}
    >
      <p className="sr-only" role="status">
        {count > 1
          ? `Showing promotion ${index + 1} of ${count}: ${current.event.title}`
          : `Promoted event: ${current.event.title}`}
      </p>
      <div className="spotlight-stage">
        {exitIndex !== null && items[exitIndex] ? (
          <div
            key={`exit-${items[exitIndex].promotionId}`}
            className="spotlight-slide spotlight-slide--exit"
            aria-hidden="true"
            inert
          >
            <SpotlightCard
              event={items[exitIndex].event}
              saved={isSaved(items[exitIndex].event.id)}
              onToggleSave={() => toggle(items[exitIndex].event.id)}
            />
          </div>
        ) : null}
        <div key={current.promotionId} className="spotlight-slide spotlight-slide--enter">
        <SpotlightCard
          event={current.event}
          saved={isSaved(current.event.id)}
          onToggleSave={() => toggle(current.event.id)}
        />
        </div>
      </div>

      {count > 1 ? (
        <div className="spotlight-controls">
          <button
            type="button"
            className="spotlight-nav focus-ring"
            onClick={() => go(-1)}
            aria-label="Previous promotion"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <div className="spotlight-dots" role="group" aria-label="Choose promotion">
            {items.map((slide, dotIndex) => (
              <button
                key={slide.promotionId}
                type="button"
                className="spotlight-dot focus-ring"
                onClick={() => showSlide(dotIndex)}
                aria-label={`Show promotion ${dotIndex + 1}: ${slide.event.title}`}
                aria-current={dotIndex === index}
              />
            ))}
          </div>
          <span className="spotlight-count" aria-hidden="true">
            {index + 1} / {count}
          </span>
          <button
            type="button"
            className="spotlight-nav focus-ring"
            onClick={() => go(1)}
            aria-label="Next promotion"
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            className="spotlight-nav focus-ring"
            onClick={() => setPaused((value) => !value)}
            aria-label={playing ? "Pause automatic rotation" : "Resume automatic rotation"}
            aria-pressed={!playing}
          >
            {playing ? (
              <Pause aria-hidden className="size-5" />
            ) : (
              <Play aria-hidden className="size-5" />
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
