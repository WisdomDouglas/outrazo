import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Compass,
  Heart,
  MapPin,
  Music2,
  Navigation,
  Search,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { SearchField } from "@/design-system/components/SearchField";
import emptyArt from "@/assets/home-empty.webp";
import homeHero from "@/assets/home-hero-festival.webp";
import { useSavedItems } from "@/design-system/lib/use-saved-items";
import { AppEventGrid } from "@/showcase/app-shell/AppEventGrid";
import { EventRail } from "@/showcase/app-shell/EventRail";
import { LocationPicker } from "@/showcase/app-shell/LocationPicker";
import { useAuth } from "@/showcase/auth/auth-context";
import { CATEGORIES } from "@/showcase/discovery/categories";
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

type QuickFilter = "tonight" | "weekend" | "nearby" | "free" | "all";

const QUICK_FILTERS: { id: Exclude<QuickFilter, "all">; label: string; icon: typeof Clock3 }[] = [
  { id: "tonight", label: "Tonight", icon: Clock3 },
  { id: "weekend", label: "This Weekend", icon: CalendarDays },
  { id: "nearby", label: "Near You", icon: MapPin },
  { id: "free", label: "Free Events", icon: Ticket },
];

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Home — Outrazo" },
      {
        name: "description",
        content: "Your personalized Outrazo home: discover events, people, and places in your city.",
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
      <div className="flex min-w-0 flex-col gap-xs">
        <h2 className="type-h2 flex min-w-0 items-center gap-sm">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
            <Icon aria-hidden className="size-4" strokeWidth={2} />
          </span>
          {title}
        </h2>
        {meta}
      </div>
      {action}
    </div>
  );
}

function FeaturedEventCard({
  event,
  saved,
  onToggleSave,
}: {
  event: OutrazoEvent;
  saved: boolean;
  onToggleSave: () => void;
}) {
  const badge = event.tonight ? "Tonight" : event.tag;

  return (
    <article className="home-feature-card group">
      <div className="home-feature-image-wrap">
        <Link
          to="/events/$eventId"
          params={{ eventId: event.id }}
          className="focus-ring home-feature-image-link"
          aria-label={`View ${event.title}`}
        >
          <img src={event.imageSrc} alt={`${event.title} cover`} loading="lazy" className="home-feature-image" />
        </Link>
        {badge ? <span className="home-feature-badge">{badge}</span> : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="home-feature-save"
          onClick={onToggleSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${event.title} from saved` : `Save ${event.title}`}
        >
          <Heart aria-hidden className={`size-[18px] ${saved ? "fill-transactional text-transactional" : ""}`} />
        </Button>
      </div>
      <div className="home-feature-content">
        <div className="home-feature-copy">
          <Link
            to="/events/$eventId"
            params={{ eventId: event.id }}
            className="focus-ring rounded-sm"
          >
            <h3 className="home-feature-title">{event.title}</h3>
          </Link>
          <p className="home-feature-location">
            <MapPin aria-hidden className="size-3.5 shrink-0 text-accent" />
            <span className="truncate">{event.location}</span>
          </p>
          <p className="home-feature-date">
            <CalendarDays aria-hidden className="size-3.5 shrink-0" />
            <span>{event.date}{event.time ? ` · ${event.time}` : ""}</span>
          </p>
        </div>
        <span className={`home-feature-price ${event.price ? "home-feature-price--paid" : ""}`}>
          {event.price ?? "Free"}
        </span>
      </div>
    </article>
  );
}

function AppHome() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [record, setRecord] = useState<OnboardingRecord | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("tonight");
  const [query, setQuery] = useState("");
  const { isSaved, toggle } = useSavedItems();

  useEffect(() => {
    setRecord(loadOnboardingRecord());
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

  const featured = useMemo(() => {
    const searchTerm = query.trim().toLowerCase();
    return [...EVENTS]
      .filter((event) => {
        if (quickFilter === "tonight" && !event.tonight) return false;
        if (quickFilter === "weekend" && !/weekend/i.test(event.tag ?? "") && !/\b(Sat|Sun)\b/.test(event.date)) return false;
        if (quickFilter === "nearby" && event.city !== location) return false;
        if (quickFilter === "free" && event.price) return false;
        if (searchTerm && !`${event.title} ${event.location} ${event.city}`.toLowerCase().includes(searchTerm)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          Number(b.city === location) - Number(a.city === location) ||
          Number(Boolean(b.tonight)) - Number(Boolean(a.tonight)) ||
          b.attendeeCount - a.attendeeCount,
      )
      .slice(0, 3);
  }, [location, query, quickFilter]);

  const nearYou = useMemo(() => {
    const alreadyFeatured = new Set(featured.map((event) => event.id));
    return EVENTS
      .filter((event) => event.city === location && !alreadyFeatured.has(event.id))
      .sort((a, b) => b.attendeeCount - a.attendeeCount)
      .slice(0, 3);
  }, [featured, location]);

  const picked = useMemo<OutrazoEvent[]>(() => {
    if (!interestCategories.length) return [];
    const alreadyShown = new Set([...featured, ...nearYou].map((event) => event.id));
    return EVENTS
      .filter((event) => !alreadyShown.has(event.id))
      .filter((event) => interestCategories.includes(event.category))
      .sort(
        (a, b) =>
          Number(b.city === location) - Number(a.city === location) ||
          b.attendeeCount - a.attendeeCount,
      )
      .slice(0, 4);
  }, [featured, interestCategories, location, nearYou]);

  const soon = useMemo(() => {
    const alreadyShown = new Set([...featured, ...nearYou, ...picked].map((event) => event.id));
    return EVENTS
      .filter((event) => !alreadyShown.has(event.id))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 4);
  }, [featured, nearYou, picked]);

  const popular = useMemo(
    () => {
      const alreadyShown = new Set([...featured, ...nearYou, ...picked, ...soon].map((event) => event.id));
      return EVENTS
        .filter((event) => !alreadyShown.has(event.id))
        .sort((a, b) => b.attendeeCount - a.attendeeCount)
        .slice(0, 3);
    },
    [featured, nearYou, picked, soon],
  );

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    navigate({ to: "/events", search: query.trim() ? { q: query.trim() } : {} });
  };

  return (
    <div className="app-home">
      <section className="app-home-welcome" aria-labelledby="app-home-title">
        <img className="app-home-hero-background" src={homeHero} alt="" aria-hidden="true" fetchPriority="high" />
        <div className="app-home-copy">
          <p className="home-discover-pill">
            <span className="home-discover-dot" aria-hidden="true" />
            Discover <span>·</span> Connect <span>·</span> Attend
          </p>
          <h1 id="app-home-title" className="home-title">
            Your city has<br className="hidden sm:block" /> plans for <em>you.</em>
          </h1>
          <p className="home-description">Find your next great event, new connection, or favourite spot.</p>

          <form className="home-search" role="search" onSubmit={submitSearch}>
            <SearchField
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (event.target.value) setQuickFilter("all");
              }}
              onClear={() => setQuery("")}
              placeholder="Search events, places, or communities..."
              className="home-search-field"
            />
            <Button type="submit" variant="primary" size="icon" className="home-search-submit" aria-label="Search events">
              <ArrowRight aria-hidden className="size-5" />
            </Button>
          </form>

          <div className="home-quick-filters" role="group" aria-label="Quick event filters">
            {QUICK_FILTERS.map(({ id, label, icon: Icon }) => {
              const selected = quickFilter === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`home-quick-filter ${selected ? "home-quick-filter--selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => setQuickFilter(selected ? "all" : id)}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <div className="home-location-row">
            <LocationPicker location={location} onChange={changeLocation} className="home-location-change" />
          </div>
        </div>

        <div className="app-home-art">
          <span className="app-home-art-label app-home-art-label--music"><Music2 aria-hidden className="size-4" /> Good vibes</span>
          <span className="app-home-art-place" aria-hidden="true"><MapPin className="size-5" /></span>
        </div>
      </section>

      <section className="home-category-section" aria-labelledby="home-category-title">
        <div className="home-category-heading">
          <div>
            <p className="home-section-kicker">Browse by category</p>
            <h2 id="home-category-title">Find your kind of experience</h2>
            <p>Pick a scene and discover events made for you.</p>
          </div>
          <Link to="/events" search={{}} className="focus-ring home-view-all">
            All events <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <div className="home-category-grid" aria-label="Event categories">
          {CATEGORIES.filter(({ id }) => id !== "all").map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="home-category-item focus-ring"
              aria-label={`Browse ${label} events`}
              onClick={() => navigate({ to: "/events", search: { category: id } })}
            >
              <span className="home-category-icon"><Icon aria-hidden className="size-5" strokeWidth={1.7} /></span>
              <span className="home-category-label">{label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="app-home-section home-featured-section">
        <div className="home-feature-heading">
          <div>
            <p className="home-section-kicker">Featured events</p>
            <h2>What&apos;s happening now</h2>
          </div>
          <Link to="/events" search={{}} className="focus-ring home-view-all">
            View all <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        {featured.length ? (
          <div className="home-feature-grid">
            {featured.map((event) => (
              <FeaturedEventCard
                key={event.id}
                event={event}
                saved={isSaved(event.id)}
                onToggleSave={() => toggle(event.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No events match those filters yet."
            description="Try another time or explore all events around you."
            icon={<Search aria-hidden className="size-5" />}
            action={<Link to="/events" search={{}}><Button variant="primary">Explore all events</Button></Link>}
          />
        )}
      </section>

      <section className="app-home-section home-secondary-section">
        <SectionHeader
          title="Near you"
          icon={Compass}
          meta={<LocationPicker location={location} onChange={changeLocation} />}
        />
        <a
          className="nearby-map-card focus-ring"
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location}, Nigeria`)}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${location} in Google Maps`}
        >
          <span className="nearby-map-art" aria-hidden="true">
            <span className="nearby-map-road nearby-map-road--one" />
            <span className="nearby-map-road nearby-map-road--two" />
            <span className="nearby-map-road nearby-map-road--three" />
            <span className="nearby-map-pin"><MapPin className="size-5" /></span>
          </span>
          <span className="nearby-map-copy">
            <span className="nearby-map-kicker"><Navigation className="size-3.5" /> Explore the area</span>
            <strong>Find your next plan in {location}</strong>
            <span>Open this city in Google Maps <ArrowRight className="size-4" /></span>
          </span>
        </a>
        {nearYou.length ? (
          <AppEventGrid events={nearYou} className="nearby-event-list" label={`Events near ${location}`} />
        ) : (
          <EmptyState
            title={`Nothing happening in ${location} just yet.`}
            icon={<img src={emptyArt} alt="" loading="lazy" width={816} height={816} className="size-10" />}
            action={<Link to="/events" search={{}}><Button variant="outline">Explore other locations</Button></Link>}
          />
        )}
      </section>

      <section className="app-home-section home-secondary-section">
        <SectionHeader
          title="Picked for you"
          icon={Sparkles}
          meta={
            <p className="type-caption text-muted-text">
              {interestCategories.length
                ? "Based on the interests you chose."
                : "Choose your interests to get event picks tailored to your taste."}
            </p>
          }
          action={
            picked.length ? (
              <Link to="/events" search={{}} className="focus-ring type-body inline-flex min-h-11 items-center gap-xs rounded-full text-accent">
                See all <ArrowRight aria-hidden className="size-4" />
              </Link>
            ) : null
          }
        />
        {picked.length ? (
          <AppEventGrid events={picked} className="app-home-event-rail" label="Your picked events" />
        ) : interestCategories.length ? (
          <p className="type-body text-muted-text">More picks are on the way. Explore a category to find your next event.</p>
        ) : (
          <EmptyState
            title="Make your home feel more like you."
            description="Choose a few interests to get event picks tailored to your taste."
            icon={<Compass aria-hidden className="size-5" strokeWidth={2} />}
            action={<Link to="/app/profile"><Button variant="outline">Choose your interests</Button></Link>}
          />
        )}
      </section>

      {soon.length ? (
        <section className="app-home-section home-secondary-section">
          <SectionHeader title="Happening soon" icon={CalendarDays} />
          <EventRail events={soon} label="Events happening soon" />
        </section>
      ) : null}

      {popular.length ? (
        <section className="app-home-section home-secondary-section">
          <SectionHeader
            title="People are going to"
            icon={Users}
            meta={<p className="type-caption text-muted-text">Popular with the Outrazo community.</p>}
          />
          <AppEventGrid events={popular} className="app-home-event-rail" label="Popular events" />
        </section>
      ) : null}
    </div>
  );
}
