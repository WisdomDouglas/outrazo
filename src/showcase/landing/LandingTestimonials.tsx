import { ArrowLeft, ArrowRight, Quote } from "lucide-react";
import { useEffect, useState } from "react";

import amaraPortrait from "@/assets/testimonial-amara.jpg";
import tobiPortrait from "@/assets/testimonial-tobi.jpg";
import zainabPortrait from "@/assets/testimonial-zainab.jpg";
import { Avatar } from "@/design-system/components/Avatar";
import { Button } from "@/design-system/components/Button";

const STORIES = [
  {
    quote: "I want Friday plans without the group-chat detective work. Show me the mood, the venue and the price, then let me decide.",
    name: "Amara",
    city: "Lagos",
    context: "The spontaneous night out",
    image: amaraPortrait,
    mark: "01",
  },
  {
    quote: "Live music is how I find my people in a new city. The right event page should make turning up feel easy, not uncertain.",
    name: "Tobi",
    city: "Abuja",
    context: "Finding a familiar rhythm",
    image: tobiPortrait,
    mark: "02",
  },
  {
    quote: "I look for the details first: who is hosting, where it is, and what the evening feels like. That is what makes a plan worth saving.",
    name: "Zainab",
    city: "Lagos",
    context: "Choosing with confidence",
    image: zainabPortrait,
    mark: "03",
  },
] as const;

export function LandingTestimonials() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const story = STORIES[active];

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % STORIES.length), 7000);
    return () => window.clearInterval(timer);
  }, [paused]);

  const chooseStory = (index: number) => setActive(index);

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
        <header className="landing-stories-header grid gap-lg lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="type-caption mb-sm font-semibold text-accent">PEOPLE, PLANS, POSSIBILITIES</p>
            <h2 id="stories-title" className="type-h2 max-w-[18ch] text-balance">The kinds of nights Outrazo is made for.</h2>
          </div>
          <p className="type-caption max-w-[42ch] text-muted-text">
            Representative stories created to reflect common event-going moments. These are not verified customer reviews.
          </p>
        </header>

        <div className="landing-stories-layout mt-2xl grid gap-lg lg:grid-cols-[minmax(0,1.5fr)_minmax(17rem,0.75fr)]">
          <article className="landing-story-feature relative grid min-w-0 overflow-hidden rounded-lg border border-line bg-canvas md:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)]">
            <div key={`${story.mark}-portrait`} className="landing-story-portrait relative min-h-[20rem] overflow-hidden md:min-h-[32rem]">
              <img src={story.image} alt={`Illustrated portrait for ${story.name}'s representative story`} className="size-full object-cover" loading="lazy" width={768} height={768} />
              <span className="landing-story-number type-caption absolute left-md top-md rounded-full border border-line bg-canvas/80 px-sm py-xs font-semibold text-primary-text backdrop-blur-md">STORY {story.mark}</span>
            </div>

            <div key={`${story.mark}-copy`} className="landing-story-content flex min-w-0 flex-col justify-between gap-xl p-lg sm:p-xl">
              <div>
                <Quote aria-hidden className="mb-lg size-8 text-accent" strokeWidth={1.5} />
                <blockquote className="type-h2 text-balance text-primary-text">“{story.quote}”</blockquote>
              </div>
              <div className="flex items-center gap-md border-t border-line pt-lg">
                <Avatar name={story.name} src={story.image} size="lg" />
                <div className="min-w-0">
                  <p className="type-body font-semibold text-primary-text">{story.name} · {story.city}</p>
                  <p className="type-caption truncate text-muted-text">{story.context} · representative voice</p>
                </div>
              </div>
            </div>
          </article>

          <div className="landing-story-index flex min-w-0 flex-col gap-sm" aria-label="Choose a representative story">
            {STORIES.map((item, index) => {
              const selected = active === index;
              return (
                <Button
                  key={item.mark}
                  type="button"
                  variant="ghost"
                  aria-label={`Show ${item.name}'s representative story`}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => chooseStory(index)}
                  className={`landing-story-selector h-auto min-h-24 w-full justify-start rounded-md border p-md text-left ${selected ? "border-accent bg-accent/10" : "border-line bg-canvas/40"}`}
                >
                  <Avatar name={item.name} src={item.image} size="lg" className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="type-caption block font-semibold text-primary-text">{item.name} · {item.city}</span>
                    <span className="type-caption mt-xs block whitespace-normal text-muted-text">{item.context}</span>
                  </span>
                  <span className={`type-caption shrink-0 font-semibold ${selected ? "text-accent" : "text-subtle-text"}`}>{item.mark}</span>
                </Button>
              );
            })}

            <div className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-md pt-md">
              <div className="landing-story-progress h-1 overflow-hidden rounded-full bg-line" aria-hidden>
                <span key={active} className="block h-full bg-accent" />
              </div>
              <div className="flex gap-sm">
                <Button type="button" variant="outline" size="sm" className="size-11 shrink-0 rounded-full px-0!" aria-label="Previous story" onClick={() => setActive((current) => (current + STORIES.length - 1) % STORIES.length)}><ArrowLeft aria-hidden className="size-4 shrink-0" /></Button>
                <Button type="button" variant="outline" size="sm" className="size-11 shrink-0 rounded-full px-0!" aria-label="Next story" onClick={() => setActive((current) => (current + 1) % STORIES.length)}><ArrowRight aria-hidden className="size-4 shrink-0" /></Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}