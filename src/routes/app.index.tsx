import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, Compass, MapPin, Music2, Sparkles, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import greetingArt from "@/assets/home-community.png";
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
    <div className="mb-lg grid grid-cols-[minmax(0,1fr)_auto] items-end gap-md">
      <div className="flex flex-col gap-xs">
        <h2 className="type-h2 flex min-w-0 items-center gap-sm">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><Icon aria-hidden className="size-4" strokeWidth={2} /></span>
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
    <div className="app-home mx-auto flex w-full max-w-[1320px] flex-col gap-3xl px-md py-lg lg:px-xl lg:py-xl">
      <section className="app-home-welcome relative isolate grid items-center gap-lg overflow-hidden rounded-md border border-line bg-card sm:grid-cols-2">
        <div className="relative z-10 flex max-w-[42rem] flex-col items-start gap-xs">
          <p className="type-caption font-semibold text-accent">
            {greeting}, {displayName}
          </p>
          <h1 className="type-h1 max-w-[12ch] text-balance">Your city has plans for you.</h1>
          <p className="type-body-lg mt-sm max-w-[34ch] text-muted-text">Find your next great night, new connection, or favourite spot.</p>
          <LocationPicker location={location} onChange={changeLocation} className="mt-md" />
        </div>
        <div className="app-home-art pointer-events-none relative isolate self-end" aria-hidden="true">
          <span className="app-home-art-place grid place-items-center rounded-full border border-accent/20 bg-elevated text-accent"><MapPin className="size-6" strokeWidth={2} /></span>
          <span className="app-home-art-label app-home-art-label--music type-caption inline-flex items-center gap-sm rounded-full border border-line bg-card px-md py-sm text-accent"><Music2 className="size-4" />Good vibes</span>
          <span className="app-home-art-label app-home-art-label--people type-caption inline-flex items-center gap-sm rounded-full border border-line bg-card px-md py-sm text-primary-text"><Users className="size-4 text-accent" />Your kind of people</span>
          <img src={greetingArt} alt="" fetchPriority="high" width={1024} height={768} className="relative z-10 block h-auto w-full select-none" />
        </div>
      </section>

      <section className="app-home-section">
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

      <section className="app-home-section">
        <SectionHeader title="Happening soon" icon={CalendarClock} />
        <EventRail events={soon} label="Events happening soon" />
      </section>

      <section className="app-home-section">
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

      <section className="app-home-section">
        <SectionHeader
          title="People are going to"
          icon={Users}
           meta={<p className="type-caption text-muted-text">Popular with the Outrazo community.</p>}
        />
        <AppEventGrid events={popular} />
      </section>
    </div>
  );
}
