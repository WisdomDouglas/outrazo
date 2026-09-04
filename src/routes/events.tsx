import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MapPin, SearchX } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { CategoryChip } from "@/design-system/components/CategoryChip";
import { CityCard } from "@/design-system/components/CityCard";
import { EventCard } from "@/design-system/components/EventCard";
import { Reveal } from "@/design-system/components/Reveal";
import { SearchField } from "@/design-system/components/SearchField";
import { CATEGORIES } from "@/showcase/discovery/categories";
import { useDiscovery } from "@/showcase/discovery/use-discovery";
import { ATTENDEES, CITIES } from "@/showcase/sample-data";

export const Route = createFileRoute("/events")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
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
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const [query, setQuery] = useState(q ?? "");
  const discovery = useDiscovery();

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return discovery.events;
    return discovery.events.filter((event) =>
      `${event.title} ${event.location} ${event.city} ${event.host.name}`
        .toLowerCase()
        .includes(needle),
    );
  }, [discovery.events, query]);

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

          <div className="flex flex-col gap-xs">
            <h1 className="type-h1 text-[28px] lg:text-[40px]">Explore events</h1>
            <p className="type-body text-muted-text">
              {results.length} {results.length === 1 ? "event" : "events"} matching your
              filters.
            </p>
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

          <div className="ds-rail -mx-md flex gap-sm overflow-x-auto px-md pb-xs lg:mx-0 lg:flex-wrap lg:px-0">
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

        {results.length ? (
          <div className="grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
            {results.map((event, index) => (
              <Reveal key={event.id} delay={index * 40}>
                <EventCard
                  {...event}
                  attendees={ATTENDEES.slice(0, 3)}
                  saved={discovery.isSaved(event.id)}
                  onToggleSave={() => discovery.toggleSave(event.id)}
                />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-md rounded-lg border border-line bg-card p-2xl text-center">
            <SearchX aria-hidden className="size-8 text-accent" />
            <h2 className="type-h2">No events match that yet</h2>
            <p className="type-body text-muted-text">
              Try another category, or clear your search to see everything happening.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                discovery.setCategory("all");
                discovery.setCity(null);
                navigate({ to: "/events", search: {} });
              }}
            >
              Reset filters
            </Button>
          </div>
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
                onClick={() =>
                  discovery.setCity(discovery.city === city.name ? null : city.name)
                }
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
