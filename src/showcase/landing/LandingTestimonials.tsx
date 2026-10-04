import { ArrowLeft, ArrowRight, Quote } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/design-system/components/Button";

const STORIES = [
  {
    quote: "A Friday night doesn’t have to start with ten open tabs. Find a scene, see the details, and make a plan.",
    label: "The spontaneous night out",
    context: "Discovering what’s on",
    mark: "01",
  },
  {
    quote: "From live music to new communities, a city feels different when you know where to show up.",
    label: "The new-in-town feeling",
    context: "Finding your people",
    mark: "02",
  },
  {
    quote: "The little details matter: the time, the place, the price. Everything you need to decide if it’s your kind of thing.",
    label: "The considered plan",
    context: "Choosing an event",
    mark: "03",
  },
] as const;

export function LandingTestimonials() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % STORIES.length), 6500);
    return () => window.clearInterval(timer);
  }, [paused]);

  const story = STORIES[active];

  return (
    <section
      aria-labelledby="stories-title"
      className="landing-stories overflow-hidden border-y border-line bg-card"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <div className="mx-auto max-w-[1200px] px-md py-section lg:px-xl">
        <div className="flex flex-wrap items-end justify-between gap-lg">
          <div>
            <p className="type-caption mb-sm font-semibold text-accent">THE REASONS WE SHOW UP</p>
            <h2 id="stories-title" className="type-h2">Every outing starts somewhere.</h2>
          </div>
          <p className="type-caption max-w-[34ch] text-muted-text">Illustrative stories, not customer reviews. Real voices will go here when we have them.</p>
        </div>

        <div className="landing-stories-layout mt-2xl grid gap-xl lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
          <div className="landing-story-stage relative min-w-0 border-l-2 border-accent pl-lg sm:pl-xl" aria-live="off">
            <Quote aria-hidden className="mb-lg size-8 text-accent" strokeWidth={1.5} />
            <div key={active} className="landing-story-content">
              <blockquote className="type-h2 max-w-[28ch] text-balance text-primary-text">{story.quote}</blockquote>
              <div className="mt-xl flex flex-wrap items-center gap-sm">
                <span className="type-body font-semibold text-primary-text">{story.label}</span>
                <span aria-hidden className="text-subtle-text">/</span>
                <span className="type-body text-muted-text">{story.context}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-lg border-t border-line pt-lg lg:border-l lg:border-t-0 lg:pl-lg lg:pt-0">
            <div className="flex items-baseline gap-sm">
              <span className="type-h2 text-accent">{story.mark}</span>
              <span className="type-body text-muted-text">/ 03</span>
            </div>
            <div className="flex gap-sm" aria-label="Story selection">
              {STORIES.map((item, index) => (
                <Button
                  key={item.mark}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Show story ${index + 1}: ${item.label}`}
                  aria-current={active === index ? "true" : undefined}
                  onClick={() => setActive(index)}
                  className={`landing-story-step h-11 flex-1 rounded-sm border-b-2 px-0 ${active === index ? "border-accent text-accent" : "border-line text-muted-text"}`}
                >
                  {item.mark}
                </Button>
              ))}
            </div>
            <div className="flex gap-sm">
              <Button type="button" variant="outline" size="sm" className="size-11 shrink-0 rounded-full px-0!" aria-label="Previous story" onClick={() => setActive((current) => (current + STORIES.length - 1) % STORIES.length)}><ArrowLeft aria-hidden className="size-4 shrink-0" /></Button>
              <Button type="button" variant="outline" size="sm" className="size-11 shrink-0 rounded-full px-0!" aria-label="Next story" onClick={() => setActive((current) => (current + 1) % STORIES.length)}><ArrowRight aria-hidden className="size-4 shrink-0" /></Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}