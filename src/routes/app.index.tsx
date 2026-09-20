import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, Compass, Sparkles, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import greetingArt from "@/assets/home-greeting.png";
import emptyArt from "@/assets/home-empty.png";
import { AppEventGrid } from "@/showcase/app-shell/AppEventGrid";
import { EventRail } from "@/showcase/app-shell/EventRail";
import { LocationPicker } from "@/showcase/app-shell/LocationPicker";
import { useAuth } from "@/showcase/auth/auth-context";
import {
  loadOnboardingRecord,
  saveOnboardingLocation,
  type OnboardingRecord,
} from "@/showcase/onboarding-storage";
import { EVENTS, type CategoryId, type OutrazoEvent } from "@/showcase/sample-data";

/** Maps onboarding interests onto the event categories in the dataset. */
const INTEREST_TO_CATEGORY: Record<string, Exclude<CategoryId, "all">> = {
  music: "music",
  parties: "parties",
  tech: "tech",
  business: "business",
  sports: "sports",
  arts: "culture",
  food: "food",
  gaming: "tech",
  networking: "business",
  workshops: "tech",
  community: "culture",
};

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Home — Outrazo" },
      {
        name: "description",
        content: "Your personalized Outrazo home: events picked for you, happening soon and near you.",
      },
      { property: "og:title", content: "Home — Outrazo" },
      {
        property: "og:description",
        content: "Discover events picked around your interests and your city.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppHome,
});

function SectionHeader({
  title,
  icon: Icon,
  meta,
  action,
}: {
  title: string;
  icon: typeof Sparkles;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-lg flex flex-wrap items-center justify-between gap-sm">
      <div className="flex flex-col gap-xs">
        <h2 className="type-h2 flex items-center gap-sm">
          <Icon aria-hidden className="size-5 text-accent" strokeWidth={2} />
          {title}
        </h2>
        {meta}
      </div>
      {action}
    </div>
  );
}

function AppHome() {
  const { displayName, profile } = useAuth();
  const [record, setRecord] = useState<OnboardingRecord | null>(null);
  const [greeting, setGreeting] = useState("Good evening");

  useEffect(() => {
    setRecord(loadOnboardingRecord());
    setGreeting(greetingFor(new Date()));
  }, []);

  const location = record?.location ?? profile?.location ?? "Lagos";

  const changeLocation = useCallback((next: string) => {
    setRecord(saveOnboardingLocation(next));
  }, []);

  const interestCategories = useMemo(() => {
    const categories = (record?.interests ?? [])
      .map((interest) => INTEREST_TO_CATEGORY[interest])
      .filter(Boolean) as Exclude<CategoryId, "all">[];
    return Array.from(new Set(categories));
  }, [record]);

  const picked = useMemo<OutrazoEvent[]>(() => {
    if (!interestCategories.length) return [];
    const matches = EVENTS.filter((event) => interestCategories.includes(event.category));
    return [...matches]
      .sort(
        (a, b) =>
          Number(b.city === location) - Number(a.city === location) ||
          b.attendeeCount - a.attendeeCount,
      )
      .slice(0, 4);
  }, [interestCategories, location]);

  const soon = useMemo(
    () => [...EVENTS].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 6),
    [],
  );

  const nearYou = useMemo(
    () => EVENTS.filter((event) => event.city === location).slice(0, 3),
    [location],
  );

  const popular = useMemo(
    () => [...EVENTS].sort((a, b) => b.attendeeCount - a.attendeeCount).slice(0, 3),
    [],
  );

  const seeAllSearch = interestCategories.length
    ? { category: interestCategories[0] }
    : { category: undefined };

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-section px-md py-xl lg:px-xl lg:py-2xl">
      <section className="flex flex-col-reverse items-start gap-lg md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-xs">
          <p className="type-body text-accent">
            {greeting}, {displayName}
          </p>
          <h1 className="type-h1">Discover something worth showing up for.</h1>
          <LocationPicker location={location} onChange={changeLocation} className="mt-xs" />
        </div>
        <img
          src={greetingArt}
          alt=""
          loading="lazy"
          width={1024}
          height={768}
          className="h-auto w-40 shrink-0 select-none md:w-56 lg:w-64"
        />
      </section>

      <section>
        <SectionHeader
          title="Picked for you"
          icon={Sparkles}
          meta={
            <p className="type-caption text-muted-text">
              {interestCategories.length
                ? "Based on the interests you chose."
                : "Finish onboarding to personalize this."}
            </p>
          }
          action={
            picked.length ? (
              <Link
                to="/events"
                search={seeAllSearch}
                className="focus-ring type-body inline-flex min-h-11 items-center gap-xs rounded-full text-accent"
              >
                See all
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            ) : null
          }
        />
        {picked.length ? (
          <AppEventGrid events={picked} />
        ) : (
          <EmptyState
            title="Nothing matches your interests yet."
            description="Explore all events to find something new."
            icon={<Compass aria-hidden className="size-5" strokeWidth={2} />}
            action={
              <Link to="/events">
                <Button variant="primary">Explore events</Button>
              </Link>
            }
          />
        )}
      </section>

      <section>
        <SectionHeader title="Happening soon" icon={CalendarClock} />
        <EventRail events={soon} />
      </section>

      <section>
        <SectionHeader
          title="Near you"
          icon={Compass}
          meta={<LocationPicker location={location} onChange={changeLocation} />}
        />
        {nearYou.length ? (
          <AppEventGrid events={nearYou} />
        ) : (
          <EmptyState
            title="Nothing happening nearby yet."
            icon={
              <img src={emptyArt} alt="" loading="lazy" width={816} height={816} className="size-10" />
            }
            action={
              <Link to="/events">
                <Button variant="outline">Explore other locations</Button>
              </Link>
            }
          />
        )}
      </section>

      <section>
        <SectionHeader
          title="People are going to"
          icon={Users}
          meta={<p className="type-caption text-muted-text">Most attended events in the dataset.</p>}
        />
        <AppEventGrid events={popular} />
      </section>
    </div>
  );
}
