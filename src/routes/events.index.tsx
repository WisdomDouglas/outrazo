import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  Compass,
  MapPin,
  Plus,
  RotateCcw,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { CategoryChip } from "@/design-system/components/CategoryChip";
import { CityCard } from "@/design-system/components/CityCard";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { EventCard } from "@/design-system/components/EventCard";
import { Reveal } from "@/design-system/components/Reveal";
import { CATEGORIES } from "@/showcase/discovery/categories";
import {
  DEFAULT_EVENT_FILTERS,
  EventFiltersPanel,
  type EventFilters,
} from "@/showcase/discovery/EventFiltersPanel";
import { ExploreSearchBar } from "@/showcase/discovery/ExploreSearchBar";
import { ExploreHeroBackdrop } from "@/showcase/discovery/ExploreHeroBackdrop";
import { interpretDiscoveryQuery } from "@/showcase/discovery/interpretDiscoveryQuery";
import {
  displayLocationLabel,
  matchLocationSelection,
  NIGERIAN_STATES,
} from "@/showcase/discovery/locations";
import {
  describeNLFilters,
  matchNLQuery,
  nlLocationLabel,
  type NLDiscoveryFilters,
} from "@/showcase/discovery/nl-matching";
import { useDiscovery } from "@/showcase/discovery/use-discovery";
import { boostPromotedPlacement } from "@/showcase/promotions/active-promotions";
import { useActivePromotions } from "@/showcase/promotions/use-active-promotions";
import {
  CITIES,
  getOrganizer,
  toEventCardProps,
  type CategoryId,
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
      ? matchLocationSelection(city, event.city)
      : filters.location === "any"
        ? true
        : filters.location === "other"
          ? !matchLocationSelection(DEMO_LOCATION, event.city)
          : matchLocationSelection(DEMO_LOCATION, event.city);
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
  const [nlInput, setNlInput] = useState("");
  const [nlFilters, setNlFilters] = useState<NLDiscoveryFilters | null>(null);
  const [nlLoading, setNlLoading] = useState(false);
  const [nlError, setNlError] = useState<string | null>(null);
  const nlRequestId = useRef(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showAllStates, setShowAllStates] = useState(false);
  const [stateSearch, setStateSearch] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<EventFilters>(INITIAL_FILTERS);
  const [draftFilters, setDraftFilters] = useState<EventFilters>(INITIAL_FILTERS);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const discovery = useDiscovery();
  const setCategory = discovery.setCategory;
  const { promotions } = useActivePromotions();

  useEffect(() => {
    if (categoryParam && CATEGORIES.some((item) => item.id === categoryParam)) {
      setCategory(categoryParam as CategoryId);
    }
  }, [categoryParam, setCategory]);

  const filteredEvents = useMemo(
    () => filterEvents(discovery.events, appliedFilters, discovery.city),
    [appliedFilters, discovery.city, discovery.events],
  );

  const nlLocationOverride = Boolean(nlFilters?.location);
  const nlBaseEvents = useMemo(() => {
    if (!nlLocationOverride) return filteredEvents;
    const byCategory =
      discovery.category === "all"
        ? discovery.allEvents
        : discovery.allEvents.filter((event) => event.category === discovery.category);
    return filterEvents(byCategory, { ...appliedFilters, location: "any" }, null);
  }, [nlLocationOverride, filteredEvents, discovery.allEvents, discovery.category, appliedFilters]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const keyworded = !needle
      ? nlBaseEvents
      : nlBaseEvents.filter((event) =>
          `${event.title} ${event.location} ${event.city} ${getOrganizer(event.organizerId).name}`
            .toLowerCase()
            .includes(needle),
        );
    if (!nlFilters) return keyworded;
    return keyworded.filter((event) => matchNLQuery(event, nlFilters));
  }, [nlBaseEvents, query, nlFilters]);

  const promotedIds = useMemo(
    () => new Set(promotions.map((promotion) => promotion.eventId)),
    [promotions],
  );
  const feed = useMemo(
    () => boostPromotedPlacement(results, (event) => promotedIds.has(event.id)),
    [results, promotedIds],
  );

  const draftResultCount = useMemo(
    () => filterEvents(discovery.events, draftFilters, discovery.city).length,
    [discovery.city, discovery.events, draftFilters],
  );

  const activeFilterCount =
    [appliedFilters.date, appliedFilters.price].filter((value) => value !== "any").length +
    (appliedFilters.location === "near" ? 0 : 1);

  const displayedLocation = discovery.city
    ? displayLocationLabel(discovery.city)
    : appliedFilters.location === "other"
      ? "Other locations"
      : appliedFilters.location === "any"
        ? "All locations"
        : DEMO_LOCATION;

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: discovery.allEvents.length };
    for (const event of discovery.allEvents) {
      counts[event.category] = (counts[event.category] ?? 0) + 1;
    }
    return counts;
  }, [discovery.allEvents]);

  const closeFilters = useCallback(() => {
    setFiltersOpen(false);
    window.setTimeout(() => filterTriggerRef.current?.focus(), 0);
  }, []);

  const openFilters = useCallback(() => {
    setDraftFilters(appliedFilters);
    setFiltersOpen(true);
  }, [appliedFilters]);

  const clearNL = useCallback(() => {
    nlRequestId.current += 1;
    setNlInput("");
    setNlFilters(null);
    setNlError(null);
  }, []);

  const submitNL = useCallback(() => {
    const text = nlInput.trim();
    if (!text || nlLoading) return;
    const mine = nlRequestId.current + 1;
    nlRequestId.current = mine;
    setNlLoading(true);
    setNlError(null);
    interpretDiscoveryQuery({ data: { query: text } }).then(
      (filters) => {
        if (nlRequestId.current !== mine) return;
        setNlFilters(filters);
        setNlLoading(false);
      },
      (caught: unknown) => {
        if (nlRequestId.current !== mine) return;
        setNlFilters(null);
        setNlLoading(false);
        const message = caught instanceof Error ? caught.message : "";
        setNlError(
          /failed to fetch|network|load failed/i.test(message)
            ? "Could not reach the server. Check your connection and try again."
            : message || "Something went wrong. Please try again.",
        );
      },
    );
  }, [nlInput, nlLoading]);

  const resetAll = useCallback(() => {
    setQuery("");
    clearNL();
    setAppliedFilters(INITIAL_FILTERS);
    setDraftFilters(INITIAL_FILTERS);
    discovery.reset();
    navigate({ to: "/events", search: {} });
  }, [clearNL, discovery, navigate]);

  const handleKeywordSubmit = (event: FormEvent) => {
    event.preventDefault();
    navigate({ to: "/events", search: { q: query.trim() || undefined } });
  };

  const handleKeywordClear = () => {
    setQuery("");
    navigate({ to: "/events", search: {} });
  };

  const toggleWeekend = () => {
    setAppliedFilters((prev) => ({
      ...prev,
      date: prev.date === "weekend" ? "any" : "weekend",
    }));
  };

  const toggleFree = () => {
    setAppliedFilters((prev) => ({
      ...prev,
      price: prev.price === "free" ? "any" : "free",
    }));
  };

  const nlPlaceLabel = nlFilters ? nlLocationLabel(nlFilters) : null;
  const emptyState = nlFilters
    ? {
        title: nlPlaceLabel
          ? `No events found in ${nlPlaceLabel}.`
          : "No events match that description.",
        description: "Try fewer details, clear the AI search, or browse everything instead.",
        label: "Clear AI search",
        action: clearNL,
      }
    : query.trim()
      ? {
          title: "Nothing matches your search.",
          description: "Try a different keyword or explore another category.",
          label: "Clear search",
          action: handleKeywordClear,
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

  const hasActiveFilters =
    Boolean(query.trim()) ||
    Boolean(nlFilters) ||
    discovery.category !== "all" ||
    Boolean(discovery.city) ||
    appliedFilters.location !== "near" ||
    appliedFilters.date !== "any" ||
    appliedFilters.price !== "any";

  const filteredStates = useMemo(() => {
    if (!stateSearch.trim()) return NIGERIAN_STATES;
    const q = stateSearch.toLowerCase();
    return NIGERIAN_STATES.filter(
      (s) => s.name.toLowerCase().includes(q) || s.capital.toLowerCase().includes(q),
    );
  }, [stateSearch]);

  return (
    <div className="min-h-screen bg-canvas text-primary-text">
      {/* =========================================================================
          HERO SECTION: Balanced for both Mobile & Desktop, blends in both themes
          ========================================================================= */}
      <section className="relative isolate overflow-hidden pt-4 pb-8 sm:pt-8 sm:pb-14 lg:pt-10 lg:pb-16">
        <ExploreHeroBackdrop />

        <div className="mx-auto flex max-w-[1240px] flex-col px-3.5 sm:px-6 lg:px-8">
          {/* Top Navigation Row: compact & non-wrapping on mobile */}
          <div className="flex items-center justify-between gap-2 mb-6 sm:mb-10">
            <Link
              to="/app"
              className="focus-ring group inline-flex items-center gap-1.5 rounded-full border border-line bg-card/70 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-muted-text hover:text-primary-text hover:border-line-strong transition-colors shrink-0"
              aria-label="Back to home"
            >
              <ArrowLeft
                aria-hidden="true"
                className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5"
              />
              <span>Back home</span>
            </Link>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leadingIcon={<MapPin aria-hidden="true" className="size-3.5 text-accent" />}
                className="rounded-full border border-line bg-card/70 backdrop-blur-md px-2.5 sm:px-3 text-xs font-semibold h-8"
                onClick={openFilters}
                aria-label={`Change location: Currently set to ${displayedLocation}`}
              >
                <span className="max-w-[85px] sm:max-w-none truncate">{displayedLocation}</span>
                <ChevronDown aria-hidden="true" className="size-3 text-muted-text" />
              </Button>

              <Link
                to="/app/create-event"
                className="focus-ring rounded-full shrink-0"
                aria-label="Post your event"
              >
                <Button
                  size="sm"
                  variant="primary"
                  leadingIcon={<Plus aria-hidden="true" className="size-3.5" />}
                  className="rounded-full h-8 px-3 text-xs font-semibold"
                >
                  <span className="hidden sm:inline">Post Your Event</span>
                  <span className="sm:hidden">Post</span>
                </Button>
              </Link>
            </div>
          </div>

          {/* Calm, Proportional Hero Narrative */}
          <div className="text-center max-w-[620px] mx-auto mb-5 sm:mb-8 px-2">
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-primary-text leading-tight">
              Explore events
            </h1>
            <p className="type-body text-muted-text mt-1.5 sm:mt-2 text-xs sm:text-base">
              Discover concerts, exhibitions, tech gatherings, and experiences happening near you.
            </p>
          </div>

          {/* Balanced Search Bar with Repositioned AI Search Switcher */}
          <ExploreSearchBar
            keywordValue={query}
            onKeywordChange={setQuery}
            onKeywordSubmit={handleKeywordSubmit}
            onKeywordClear={handleKeywordClear}
            nlValue={nlInput}
            onNlChange={setNlInput}
            onNlSubmit={submitNL}
            nlLoading={nlLoading}
            nlError={nlError}
            nlActiveSummary={nlFilters ? describeNLFilters(nlFilters) : null}
            onNlClear={clearNL}
          />
        </div>
      </section>

      {/* =========================================================================
          STICKY CATEGORY & FILTER RAIL
          ========================================================================= */}
      <nav
        aria-label="Category and filter navigation"
        className="sticky top-0 z-30 border-y border-line/60 bg-canvas/90 backdrop-blur-md py-2 transition-colors"
      >
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-2 px-3.5 sm:px-6 lg:px-8">
          {/* Scrollable Categories Rail with smooth padding on mobile */}
          <div
            role="tablist"
            aria-label="Event categories"
            className="ds-rail -ml-3.5 sm:ml-0 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-3.5 sm:px-0 py-0.5"
          >
            {CATEGORIES.map(({ id, label, icon: Icon }) => {
              const active = discovery.category === id;
              const count = categoryCounts[id];
              return (
                <CategoryChip
                  key={id}
                  icon={<Icon aria-hidden="true" className="size-3.5" />}
                  active={active}
                  onClick={() => discovery.setCategory(id)}
                  className="shrink-0 text-xs font-semibold py-1 px-3"
                >
                  <span>{label}</span>
                  {typeof count === "number" && count > 0 ? (
                    <span
                      className={`ml-1 text-[10px] rounded-full px-1.5 py-0.2 ${
                        active
                          ? "bg-on-accent/20 text-on-accent"
                          : "bg-elevated text-subtle-text"
                      }`}
                    >
                      {count}
                    </span>
                  ) : null}
                </CategoryChip>
              );
            })}
          </div>

          {/* Quick Filter Actions */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={toggleWeekend}
              aria-pressed={appliedFilters.date === "weekend"}
              className={`focus-ring hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                appliedFilters.date === "weekend"
                  ? "bg-accent/15 border-accent text-accent"
                  : "bg-card/60 border-line text-muted-text hover:text-primary-text"
              }`}
            >
              <Calendar aria-hidden="true" className="size-3" />
              <span>Weekend</span>
            </button>

            <button
              type="button"
              onClick={toggleFree}
              aria-pressed={appliedFilters.price === "free"}
              className={`focus-ring hidden md:inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                appliedFilters.price === "free"
                  ? "bg-accent/15 border-accent text-accent"
                  : "bg-card/60 border-line text-muted-text hover:text-primary-text"
              }`}
            >
              <Ticket aria-hidden="true" className="size-3" />
              <span>Free</span>
            </button>

            <Button
              ref={filterTriggerRef}
              type="button"
              variant="outline"
              size="sm"
              leadingIcon={<SlidersHorizontal aria-hidden="true" className="size-3.5" />}
              className="shrink-0 rounded-full px-2.5 sm:px-3 text-xs font-semibold h-8"
              aria-expanded={filtersOpen}
              onClick={openFilters}
            >
              <span>Filters</span>
              {activeFilterCount > 0 ? (
                <span className="ml-1 grid size-4 place-items-center rounded-full bg-accent text-[10px] font-bold text-on-accent">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </div>
        </div>
      </nav>

      {/* =========================================================================
          MAIN CONTENT FEED
          ========================================================================= */}
      <main className="mx-auto max-w-[1240px] px-3.5 sm:px-6 py-6 sm:py-8 lg:px-8 lg:py-10">
        {discovery.error ? (
          <ErrorState
            className="mb-6 sm:mb-8"
            title="Some events may be missing."
            description={discovery.error}
            onRetry={discovery.refreshEvents}
          />
        ) : null}

        {/* Active Filter Pills Bar */}
        {hasActiveFilters ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card/40 p-2.5 sm:p-3">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-text mr-1">
                Active filters:
              </span>

              {discovery.city ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-xs font-medium text-primary-text">
                  <MapPin aria-hidden="true" className="size-3 text-accent" />
                  <span>{displayLocationLabel(discovery.city)}</span>
                  <button
                    type="button"
                    onClick={() => discovery.setCity(null)}
                    className="focus-ring ml-0.5 rounded-full hover:text-transactional"
                    aria-label={`Remove location filter for ${displayLocationLabel(discovery.city)}`}
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ) : null}

              {query.trim() ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-xs font-medium text-primary-text">
                  <span>Search: &ldquo;{query.trim()}&rdquo;</span>
                  <button
                    type="button"
                    onClick={handleKeywordClear}
                    className="focus-ring ml-0.5 rounded-full hover:text-transactional"
                    aria-label="Remove search query filter"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ) : null}

              {nlFilters ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-xs font-medium text-primary-text">
                  <Sparkles aria-hidden="true" className="size-3 text-accent" />
                  <span>AI: {describeNLFilters(nlFilters)}</span>
                  <button
                    type="button"
                    onClick={clearNL}
                    className="focus-ring ml-0.5 rounded-full hover:text-transactional"
                    aria-label="Remove AI filter"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ) : null}

              {discovery.category !== "all" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-xs font-medium text-primary-text">
                  <span className="capitalize">{discovery.category}</span>
                  <button
                    type="button"
                    onClick={() => discovery.setCategory("all")}
                    className="focus-ring ml-0.5 rounded-full hover:text-transactional"
                    aria-label="Remove category filter"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ) : null}

              {appliedFilters.date !== "any" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-xs font-medium text-primary-text">
                  <Calendar aria-hidden="true" className="size-3" />
                  <span className="capitalize">{appliedFilters.date}</span>
                  <button
                    type="button"
                    onClick={() => setAppliedFilters((p) => ({ ...p, date: "any" }))}
                    className="focus-ring ml-0.5 rounded-full hover:text-transactional"
                    aria-label="Remove date filter"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ) : null}

              {appliedFilters.price !== "any" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-xs font-medium text-primary-text">
                  <Ticket aria-hidden="true" className="size-3" />
                  <span className="capitalize">{appliedFilters.price}</span>
                  <button
                    type="button"
                    onClick={() => setAppliedFilters((p) => ({ ...p, price: "any" }))}
                    className="focus-ring ml-0.5 rounded-full hover:text-transactional"
                    aria-label="Remove price filter"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={resetAll}
              className="focus-ring inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
            >
              <RotateCcw aria-hidden="true" className="size-3" />
              <span>Reset all</span>
            </button>
          </div>
        ) : null}

        {/* Feed Header */}
        <div className="mb-4 sm:mb-6 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold tracking-tight text-primary-text">
              {discovery.category === "all"
                ? "All Experiences"
                : `${CATEGORIES.find((c) => c.id === discovery.category)?.label ?? discovery.category}`}
            </h2>
            <p className="type-caption text-muted-text mt-0.5 text-xs">
              Showing {feed.length} {feed.length === 1 ? "event" : "events"} in {displayedLocation}
            </p>
          </div>
        </div>

        {/* Event Cards Grid: 1 column on mobile, 2 on tablet, 3 on desktop */}
        {feed.length > 0 ? (
          <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {feed.map(({ item: event, promoted }, index) => (
              <Reveal key={event.id} delay={index * 30}>
                <EventCard
                  {...toEventCardProps(event)}
                  tag={promoted ? "Promoted" : event.tag}
                  tagVariant={promoted ? "accent" : event.tagVariant}
                  className={
                    promoted
                      ? "event-card--promoted transition-transform hover:scale-[1.01]"
                      : "transition-transform hover:scale-[1.01]"
                  }
                  saved={discovery.isSaved(event.id)}
                  onToggleSave={() => discovery.toggleSave(event.id)}
                />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="space-y-8 sm:space-y-12">
            <EmptyState
              icon={<SearchX aria-hidden="true" className="size-5" strokeWidth={2} />}
              title={emptyState.title}
              description={emptyState.description}
              action={
                <Button variant="outline" onClick={emptyState.action}>
                  {emptyState.label}
                </Button>
              }
            />

            {discovery.allEvents.length > 0 ? (
              <section className="pt-6 border-t border-line/50">
                <div className="mb-4 sm:mb-6">
                  <h3 className="type-h3 text-base sm:text-lg">Popular events you might like</h3>
                  <p className="type-caption text-muted-text mt-0.5 text-xs">
                    Check out top picks happening across Nigeria
                  </p>
                </div>
                <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {discovery.allEvents.slice(0, 3).map((event) => (
                    <EventCard
                      key={event.id}
                      {...toEventCardProps(event)}
                      saved={discovery.isSaved(event.id)}
                      onToggleSave={() => discovery.toggleSave(event.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}

        {/* =========================================================================
            BROWSE BY LOCATION SECTION: 2 columns on mobile for balanced grid
            ========================================================================= */}
        <section className="pt-12 sm:pt-16 mt-8 sm:mt-12 border-t border-line/60">
          <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-2xl font-bold tracking-tight text-primary-text">
                Browse by location
              </h2>
              <p className="type-body text-muted-text mt-0.5 text-xs sm:text-sm">
                Discover what&apos;s happening in your city or plan your next trip.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAllStates((value) => !value)}
              aria-expanded={showAllStates}
              leadingIcon={
                <ChevronDown
                  aria-hidden="true"
                  className={`size-3.5 transition-transform duration-200 ${
                    showAllStates ? "rotate-180" : ""
                  }`}
                />
              }
              className="self-start sm:self-auto h-8 text-xs font-semibold"
            >
              {showAllStates ? "Hide all states" : "Browse all 36 states"}
            </Button>
          </div>

          {/* Primary City Cards Grid: 2 columns on mobile */}
          <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
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

          {/* Collapsible Nigerian States Grid */}
          {showAllStates ? (
            <div className="mt-6 rounded-2xl border border-line bg-card/60 backdrop-blur-md p-4 sm:p-6">
              <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <h3 className="type-h3 text-sm sm:text-base">All 36 Nigerian States + FCT</h3>
                <input
                  type="text"
                  value={stateSearch}
                  onChange={(e) => setStateSearch(e.target.value)}
                  placeholder="Filter state by name or capital..."
                  aria-label="Filter states"
                  className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-primary-text placeholder:text-subtle-text focus:outline-none focus:border-accent w-full sm:w-auto"
                />
              </div>

              <div
                className="flex flex-wrap gap-1.5 sm:gap-2 max-h-[320px] overflow-y-auto pr-1"
                role="group"
                aria-label="All Nigerian states"
              >
                {filteredStates.map((state) => {
                  const active = discovery.city === state.name;
                  return (
                    <CategoryChip
                      key={state.name}
                      active={active}
                      onClick={() => {
                        discovery.setCity(active ? null : state.name);
                        setAppliedFilters({ ...appliedFilters, location: "any" });
                      }}
                      className="text-xs py-0.5 px-2.5"
                    >
                      {displayLocationLabel(state.name)}
                    </CategoryChip>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      </main>

      {/* =========================================================================
          ADVANCED FILTER MODAL PANEL
          ========================================================================= */}
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
