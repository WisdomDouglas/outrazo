import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Calendar,
  Compass,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Ticket,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { CategoryChip } from "@/design-system/components/CategoryChip";
import { ErrorState } from "@/design-system/components/ErrorState";
import { AppEventGrid } from "@/showcase/app-shell/AppEventGrid";
import { CompactFooter } from "@/showcase/app-shell/CompactFooter";
import { CATEGORIES } from "@/showcase/discovery/categories";
import { ExploreHeroBackdrop } from "@/showcase/discovery/ExploreHeroBackdrop";
import { useEventCatalog } from "@/showcase/use-event-catalog";
import { type CategoryId } from "@/showcase/sample-data";

export const Route = createFileRoute("/app/explore")({
  head: () => ({
    meta: [
      { title: "Explore — Outrazo" },
      { name: "description", content: "Explore events across Outrazo." },
      { property: "og:title", content: "Explore — Outrazo" },
      { property: "og:description", content: "Discover events across Nigeria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppExplore,
});

function AppExplore() {
  const catalog = useEventCatalog();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>("all");
  const [freeOnly, setFreeOnly] = useState(false);

  const filteredEvents = useMemo(() => {
    return catalog.events.filter((event) => {
      if (selectedCategory !== "all" && event.category !== selectedCategory) {
        return false;
      }
      if (freeOnly && Boolean(event.price)) {
        return false;
      }
      if (query.trim()) {
        const needle = query.trim().toLowerCase();
        const haystack = `${event.title} ${event.location} ${event.city} ${event.category}`.toLowerCase();
        if (!haystack.includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [catalog.events, selectedCategory, freeOnly, query]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: catalog.events.length };
    for (const event of catalog.events) {
      counts[event.category] = (counts[event.category] ?? 0) + 1;
    }
    return counts;
  }, [catalog.events]);

  const hasFilters = Boolean(query.trim()) || selectedCategory !== "all" || freeOnly;

  const resetFilters = () => {
    setQuery("");
    setSelectedCategory("all");
    setFreeOnly(false);
  };

  return (
    <div className="w-full">
      {/* In-app Hero Header */}
      <section className="relative isolate overflow-hidden px-3.5 pt-6 pb-8 sm:px-6 sm:pt-8 sm:pb-10 lg:px-8 border-b border-line/60">
        <ExploreHeroBackdrop />

        <div className="mx-auto max-w-[1240px]">
          <div className="max-w-[640px]">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-primary-text mb-1.5 sm:mb-2">
              Explore events
            </h1>
            <p className="type-body text-muted-text text-xs sm:text-sm mb-5 sm:mb-6">
              Find concerts, exhibitions, tech gatherings, and experiences happening near you.
            </p>

            {/* In-app search dock */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-[520px]">
              <div className="relative flex-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-text"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search events, places, or vibes..."
                  aria-label="Search events"
                  className="w-full rounded-xl border border-line-strong bg-card/90 backdrop-blur-md py-2 pl-9 pr-8 text-xs sm:text-sm text-primary-text placeholder:text-subtle-text shadow-sm focus:outline-none focus:border-accent"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="focus-ring absolute right-2.5 top-1/2 -translate-y-1/2 grid size-5 place-items-center rounded-full text-muted-text hover:text-primary-text"
                    aria-label="Clear search query"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                ) : null}
              </div>

              <Link to="/events" search={{}} className="focus-ring shrink-0 rounded-xl">
                <Button
                  variant="outline"
                  size="sm"
                  leadingIcon={<SlidersHorizontal aria-hidden="true" className="size-3.5" />}
                  className="rounded-xl px-3.5 text-xs font-semibold h-9 sm:h-auto w-full sm:w-auto"
                >
                  All Filters & AI
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Sticky category rail */}
      <nav
        aria-label="In-app category filter"
        className="sticky top-0 z-20 border-b border-line/60 bg-canvas/90 backdrop-blur-md py-2"
      >
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-2 px-3.5 sm:px-6 lg:px-8">
          <div
            role="tablist"
            aria-label="Filter categories"
            className="ds-rail -ml-3.5 sm:ml-0 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-3.5 sm:px-0 py-0.5"
          >
            {CATEGORIES.map(({ id, label, icon: Icon }) => {
              const active = selectedCategory === id;
              const count = categoryCounts[id];
              return (
                <CategoryChip
                  key={id}
                  icon={<Icon aria-hidden="true" className="size-3.5" />}
                  active={active}
                  onClick={() => setSelectedCategory(id)}
                  className="shrink-0 text-xs font-semibold py-1 px-3"
                >
                  <span>{label}</span>
                  {typeof count === "number" && count > 0 ? (
                    <span
                      className={`ml-1 text-[10px] rounded-full px-1.5 py-0.2 ${
                        active ? "bg-on-accent/20 text-on-accent" : "bg-elevated text-subtle-text"
                      }`}
                    >
                      {count}
                    </span>
                  ) : null}
                </CategoryChip>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setFreeOnly((prev) => !prev)}
              aria-pressed={freeOnly}
              className={`focus-ring inline-flex items-center gap-1 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-semibold border transition-colors ${
                freeOnly
                  ? "bg-accent/15 border-accent text-accent"
                  : "bg-card/60 border-line text-muted-text hover:text-primary-text"
              }`}
            >
              <Ticket aria-hidden="true" className="size-3" />
              <span>Free only</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main content feed */}
      <div className="mx-auto w-full max-w-[1240px] px-3.5 sm:px-6 py-6 sm:py-8 lg:px-8 lg:py-10">
        {catalog.error ? (
          <ErrorState
            className="mb-6 sm:mb-8"
            title="Some events may be missing."
            description={catalog.error}
            onRetry={catalog.refresh}
          />
        ) : null}

        {/* Active filters bar */}
        {hasFilters ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card/40 p-2.5 sm:p-3">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-text mr-1">
                Active filters:
              </span>
              {query.trim() ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-xs text-primary-text">
                  <span>Search: &ldquo;{query.trim()}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="focus-ring hover:text-transactional"
                    aria-label="Remove search filter"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ) : null}

              {selectedCategory !== "all" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-xs text-primary-text">
                  <span className="capitalize">{selectedCategory}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("all")}
                    className="focus-ring hover:text-transactional"
                    aria-label="Remove category filter"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ) : null}

              {freeOnly ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-xs text-primary-text">
                  <span>Free Only</span>
                  <button
                    type="button"
                    onClick={() => setFreeOnly(false)}
                    className="focus-ring hover:text-transactional"
                    aria-label="Remove free events filter"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={resetFilters}
              className="focus-ring inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
            >
              <RotateCcw aria-hidden="true" className="size-3" />
              <span>Reset</span>
            </button>
          </div>
        ) : null}

        <div className="mb-4 sm:mb-6 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold tracking-tight text-primary-text">
              {selectedCategory === "all"
                ? "Browse Events"
                : `${CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? selectedCategory}`}
            </h2>
            <p className="type-caption text-muted-text mt-0.5 text-xs">
              Showing {filteredEvents.length} {filteredEvents.length === 1 ? "event" : "events"}
            </p>
          </div>
        </div>

        {filteredEvents.length > 0 ? (
          <AppEventGrid events={filteredEvents} />
        ) : (
          <div className="text-center py-12 sm:py-16 border border-dashed border-line rounded-2xl p-6 sm:p-8">
            <Compass aria-hidden="true" className="mx-auto size-8 text-muted-text mb-3" />
            <h3 className="type-h3 mb-1 text-base sm:text-lg">No matching events</h3>
            <p className="type-body text-muted-text mb-4 text-xs sm:text-sm">
              Try adjusting your search terms or picking another category.
            </p>
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear all filters
            </Button>
          </div>
        )}
      </div>
      <CompactFooter />
    </div>
  );
}
