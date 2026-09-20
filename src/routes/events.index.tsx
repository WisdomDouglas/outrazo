import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MapPin, SearchX, SlidersHorizontal } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { CategoryChip } from "@/design-system/components/CategoryChip";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { EventCardSkeleton } from "@/design-system/components/EventCardSkeleton";
import { CityCard } from "@/design-system/components/CityCard";
import { EventCard } from "@/design-system/components/EventCard";
import { Reveal } from "@/design-system/components/Reveal";
import { SearchField } from "@/design-system/components/SearchField";
import { CATEGORIES } from "@/showcase/discovery/categories";
import {
  DEFAULT_EVENT_FILTERS,
  EventFiltersPanel,
  type EventFilters,
} from "@/showcase/discovery/EventFiltersPanel";
import { useDiscovery } from "@/showcase/discovery/use-discovery";
import {
  CITIES,
  getOrganizer,
  toEventCardProps,
  type OutrazoEvent,
} from "@/showcase/sample-data";

const DEMO_LOCATION = "Lagos";
const DEMO_TODAY = new Date("2026-09-20T12:00:00Z");
const INITIAL_FILTERS: EventFilters = { ...DEFAULT_EVENT_FILTERS, location: "near" };

function matchesDate(event: OutrazoEvent, dateFilter: EventFilters["date"]) {
  if (dateFilter === "any") return true;
  const eventDate = new Date(event.startsAt);
  const dayStart = new Date(DEMO_TODAY);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  if (dateFilter === "today") return eventDate >= dayStart && eventDate < dayEnd;

  const weekStart = new Date(dayStart);
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  if (dateFilter === "week") return eventDate >= weekStart && eventDate < weekEnd;

  const weekendStart = new Date(weekStart);
  weekendStart.setUTCDate(weekendStart.getUTCDate() + 5);
  return eventDate >= weekendStart && eventDate < weekEnd;
}

function filterEvents(events: OutrazoEvent[], filters: EventFilters, city: string | null) {
  return events.filter((event) => {
    const matchesLocation = city
      ? event.city === city
      : filters.location === "any"
        ? true
        : filters.location === "other"
          ? event.city !== DEMO_LOCATION
          : event.city === DEMO_LOCATION;
    const matchesPrice =
      filters.price === "any" ||
      (filters.price === "free" ? !event.price : Boolean(event.price));
    return matchesLocation && matchesPrice && matchesDate(event, filters.date);
  });
}

export const Route = createFileRoute("/events/")({
  validateSearch: (search: Record<string, unknown>): { q?: string; category?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Explore events near you — Outrazo" },
      {
        name: "description",
        content:
          "Browse parties, concerts, tech meetups and food experiences happening in Lagos, Abuja, Port Harcourt and Ibadan.",
      },
      { property: "og:title", content: "Explore events near you — Outrazo" },
      {
        property: "og:description",
        content: "Filter live events by category, city and vibe on Outrazo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExploreEvents,
});

function ExploreEvents() {
  const { q, category: categoryParam } = Route.useSearch();
  const navigate = useNavigate();
  const [query, setQuery] = useState(q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<EventFilters>(INITIAL_FILTERS);
  const [draftFilters, setDraftFilters] = useState<EventFilters>(INITIAL_FILTERS);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const discovery = useDiscovery();

  const filteredEvents = useMemo(
    () => filterEvents(discovery.events, appliedFilters, discovery.city),
    [appliedFilters, discovery.city, discovery.events],
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return filteredEvents;
    return filteredEvents.filter((event) =>
      `${event.title} ${event.location} ${event.city} ${getOrganizer(event.organizerId).name}`
        .toLowerCase()
        .includes(needle),
    );
  }, [filteredEvents, query]);

  const draftResultCount = useMemo(
    () => filterEvents(discovery.events, draftFilters, discovery.city).length,
    [discovery.city, discovery.events, draftFilters],
  );

  const activeFilterCount = [appliedFilters.date, appliedFilters.price].filter(
    (value) => value !== "any",
  ).length + (appliedFilters.location === "near" ? 0 : 1);

  const displayedLocation = discovery.city
    ?? (appliedFilters.location === "other"
      ? "Other locations"
      : appliedFilters.location === "any"
        ? "All locations"
        : DEMO_LOCATION);

  const closeFilters = useCallback(() => {
    setFiltersOpen(false);
    window.setTimeout(() => filterTriggerRef.current?.focus(), 0);
  }, []);

  const openFilters = useCallback(() => {
    setDraftFilters(appliedFilters);
    setFiltersOpen(true);
  }, [appliedFilters]);

  const resetAll = useCallback(() => {
    setQuery("");
    setAppliedFilters(INITIAL_FILTERS);
    setDraftFilters(INITIAL_FILTERS);
    discovery.reset();
    navigate({ to: "/events", search: {} });
  }, [discovery, navigate]);

  const emptyState = query.trim()
    ? {
        title: "Nothing matches your search.",
        description: "Try a different keyword or explore another category.",
        label: "Clear search",
        action: () => {
          setQuery("");
          navigate({ to: "/events", search: {} });
        },
      }
    : discovery.category !== "all"
      ? {
          title: "Nothing happening here yet.",
          description: "Try another category or explore all events.",
          label: "Explore all events",
          action: resetAll,
        }
      : discovery.city || appliedFilters.location !== "any"
        ? {
            title: "No events found in this location yet.",
            description: "Try another location or explore events across Nigeria.",
            label: "Explore other locations",
            action: () => {
              discovery.setCity(null);
              setAppliedFilters({ ...appliedFilters, location: "any" });
            },
          }
        : {
            title: "Nothing happening here yet.",
            description: "Try another category or explore all events.",
            label: "Explore all events",
            action: resetAll,
          };

  return (
    <div className="min-h-screen bg-canvas text-primary-text">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-lg px-md py-xl lg:px-xl">
          <div className="flex items-center justify-between gap-md">
            <Link
              to="/"
              className="focus-ring type-body inline-flex items-center gap-xs rounded-full text-muted-text hover:text-primary-text"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Back home
            </Link>
            <Link
              to="/create"
              className="focus-ring rounded-full"
              aria-label="Post your event"
            >
              <Button size="sm">Post Your Event</Button>
            </Link>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-md sm:flex sm:flex-wrap sm:justify-between">
            <div className="min-w-0">
              <h1 className="type-h1">Explore events</h1>
              <p className="type-body mt-xs text-muted-text">Discover what's happening near you.</p>
            </div>
            <div className="flex shrink-0 items-center gap-sm">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leadingIcon={<MapPin aria-hidden className="size-4 text-accent" />}
                className="border border-line bg-card px-md"
                onClick={openFilters}
              >
                {displayedLocation}
              </Button>
              <button
                type="button"
                onClick={openFilters}
                className="focus-ring type-caption hidden rounded-full text-accent hover:text-accent-hover sm:inline-flex"
              >
                Change
              </button>
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              navigate({ to: "/events", search: { q: query || undefined } });
            }}
            className="max-w-[520px]"
          >
            <SearchField
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onClear={() => setQuery("")}
              placeholder="Search events, places, or communities..."
            />
          </form>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-sm">
            <div className="ds-rail -ml-md flex min-w-0 gap-sm overflow-x-auto px-md pb-xs lg:ml-0 lg:px-0">
              {CATEGORIES.map(({ id, label, icon: Icon }) => (
                <CategoryChip
                  key={id}
                  icon={<Icon aria-hidden className="size-4" />}
                  active={discovery.category === id}
                  onClick={() => discovery.setCategory(id)}
                  className="shrink-0"
                >
                  {label}
                </CategoryChip>
              ))}
            </div>
            <Button
              ref={filterTriggerRef}
              type="button"
              variant="outline"
              size="sm"
              leadingIcon={<SlidersHorizontal aria-hidden className="size-4" />}
              className="shrink-0 px-md"
              aria-expanded={filtersOpen}
              onClick={openFilters}
            >
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-md py-xl lg:px-xl">
        {discovery.city ? (
          <div className="mb-lg flex items-center gap-sm">
            <Badge variant="accent">
              <MapPin aria-hidden className="size-3.5" />
              {discovery.city}
            </Badge>
            <button
              type="button"
              onClick={() => discovery.setCity(null)}
              className="focus-ring type-caption rounded-full text-muted-text hover:text-primary-text"
            >
              Clear city
            </button>
          </div>
        ) : null}

        {discovery.status === "loading" ? (
          <div className="grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <EventCardSkeleton key={index} />
            ))}
          </div>
        ) : discovery.status === "error" ? (
          <ErrorState onRetry={discovery.retry} />
        ) : results.length ? (
          <div className="grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
            {results.map((event, index) => (
              <Reveal key={event.id} delay={index * 40}>
                <EventCard
                  {...toEventCardProps(event)}
                  saved={discovery.isSaved(event.id)}
                  onToggleSave={() => discovery.toggleSave(event.id)}
                />
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<SearchX aria-hidden className="size-5" strokeWidth={2} />}
            title={emptyState.title}
            description={emptyState.description}
            action={
              <Button variant="outline" onClick={emptyState.action}>
                {emptyState.label}
              </Button>
            }
          />
        )}

        <section className="pt-section">
          <h2 className="type-h2 mb-lg">Browse by city</h2>
          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
            {CITIES.map((city) => (
              <CityCard
                key={city.name}
                name={city.name}
                imageSrc={city.src}
                meta={city.count}
                distance={city.distance}
                active={discovery.city === city.name}
                onClick={() => {
                  discovery.setCity(discovery.city === city.name ? null : city.name);
                  setAppliedFilters({ ...appliedFilters, location: "any" });
                }}
              />
            ))}
          </div>
        </section>
      </main>

      <EventFiltersPanel
        open={filtersOpen}
        value={draftFilters}
        resultCount={draftResultCount}
        onChange={setDraftFilters}
        onClear={() => setDraftFilters(DEFAULT_EVENT_FILTERS)}
        onClose={closeFilters}
        onApply={() => {
          discovery.setCity(null);
          setAppliedFilters(draftFilters);
          closeFilters();
        }}
      />
    </div>
  );
}
