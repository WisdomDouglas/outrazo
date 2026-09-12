import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  Compass,
  Flame,
  Menu,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { Carousel } from "@/design-system/components/Carousel";
import { CategoryCard } from "@/design-system/components/CategoryCard";
import { CityCard } from "@/design-system/components/CityCard";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { EventCard } from "@/design-system/components/EventCard";
import { EventCardSkeleton } from "@/design-system/components/EventCardSkeleton";
import { Reveal } from "@/design-system/components/Reveal";
import { SearchField } from "@/design-system/components/SearchField";
import { useTheme } from "@/design-system/lib/use-theme";
import { CtaFlyerWall } from "@/showcase/landing/CtaFlyerWall";
import { HeroBackdrop } from "@/showcase/landing/HeroBackdrop";
import { HeroCardStrip } from "@/showcase/landing/HeroFloatingCards";
import { CATEGORIES } from "@/showcase/discovery/categories";
import { useDiscovery } from "@/showcase/discovery/use-discovery";

import { CITIES, TONIGHT_EVENTS, toEventCardProps } from "@/showcase/sample-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Outrazo — Find events worth showing up for" },
      {
        name: "description",
        content:
          "Discover parties, concerts, meetups and communities happening around you. Outrazo makes local events easy to find, save and share.",
      },
      { property: "og:title", content: "Outrazo — Find events worth showing up for" },
      {
        property: "og:description",
        content:
          "Discover parties, concerts, meetups and communities happening around you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const TRUST = [
  { icon: Users, title: "Real events", copy: "Real people" },
  { icon: ShieldCheck, title: "Trusted", copy: "Organizers" },
  { icon: Ticket, title: "Secure", copy: "Ticketing" },
  { icon: CalendarCheck, title: "Easy", copy: "Check-in" },
];

const NAV = [
  { label: "Explore", href: "/events" as const },
  { label: "Categories", hash: "categories" },
  { label: "Discover", hash: "discover" },
];

function Landing() {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const discovery = useDiscovery();

  const submitSearch = () =>
    navigate({ to: "/events", search: query.trim() ? { q: query.trim() } : {} });

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas text-primary-text">
      <header className="sticky top-0 z-40 px-md pt-sm lg:pt-md">
        <div className="mx-auto grid max-w-[1080px] grid-cols-[minmax(0,1fr)_auto] items-center gap-md rounded-full border border-primary-text/10 bg-canvas/25 px-md py-sm shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-primary-text/5 backdrop-blur-xl backdrop-saturate-150 transition-colors lg:grid-cols-[1fr_auto_1fr] lg:px-lg">

          <Link to="/" className="focus-ring type-h3 min-w-0 truncate rounded-full tracking-tight">
            OUTRAZO<span className="text-accent">.</span>
          </Link>
          <nav
            aria-label="Primary"
            className="hidden items-center justify-center gap-xs lg:flex"
          >
            {NAV.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  to={item.href}
                  search={{}}
                  className="focus-ring type-body rounded-full px-md py-sm font-medium text-muted-text transition-colors hover:bg-primary-text/8 hover:text-primary-text"
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => scrollTo(item.hash!)}
                  className="focus-ring type-body rounded-full px-md py-sm font-medium text-muted-text transition-colors hover:bg-primary-text/8 hover:text-primary-text"
                >
                  {item.label}
                </button>
              ),
            )}
          </nav>

          <div className="flex items-center justify-end gap-sm">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              className="focus-ring grid size-10 shrink-0 place-items-center rounded-full border border-primary-text/15 bg-primary-text/5 text-muted-text transition-colors hover:bg-primary-text/10 hover:text-primary-text"
            >
              {theme === "dark" ? (
                <Sun aria-hidden className="size-4" />
              ) : (
                <Moon aria-hidden className="size-4" />
              )}
            </button>
            <Button
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => navigate({ to: "/create" })}
            >
              Get Started
            </Button>
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="focus-ring grid size-10 shrink-0 place-items-center rounded-full border border-primary-text/15 bg-primary-text/5 text-muted-text transition-colors hover:text-primary-text lg:hidden"
            >
              {menuOpen ? (
                <X aria-hidden className="size-4" />
              ) : (
                <Menu aria-hidden className="size-4" />
              )}
            </button>
          </div>

        </div>

        {/* Collapsed mobile menu */}
        {menuOpen ? (
          <nav
            aria-label="Mobile"
            className="mx-auto mt-sm flex max-w-[1080px] flex-col gap-xs rounded-lg border border-primary-text/10 bg-canvas/80 p-md shadow-card backdrop-blur-xl lg:hidden"
          >
            <Link
              to="/events"
              search={{}}
              onClick={() => setMenuOpen(false)}
              className="focus-ring type-body rounded-md px-md py-sm font-medium text-primary-text transition-colors hover:bg-primary-text/8"
            >
              Explore
            </Link>
            <button
              type="button"
              onClick={() => scrollTo("categories")}
              className="focus-ring type-body rounded-md px-md py-sm text-left font-medium text-primary-text transition-colors hover:bg-primary-text/8"
            >
              Categories
            </button>
            <button
              type="button"
              onClick={() => scrollTo("discover")}
              className="focus-ring type-body rounded-md px-md py-sm text-left font-medium text-primary-text transition-colors hover:bg-primary-text/8"
            >
              Discover
            </button>
            <Link
              to="/create"
              onClick={() => setMenuOpen(false)}
              className="focus-ring type-body rounded-md px-md py-sm font-semibold text-accent transition-colors hover:bg-primary-text/8"
            >
              Post Your Event
            </Link>
          </nav>
        ) : null}
      </header>

      <main>
        {/* Hero */}
        <section className="relative isolate flex min-h-[85vh] flex-col overflow-hidden lg:min-h-[720px]">
          <HeroBackdrop />

          <div className="relative mx-auto flex w-full max-w-[1100px] flex-1 flex-col justify-center px-md pb-16 pt-20 lg:min-h-[720px] lg:px-xl lg:py-2xl">
            {/* Readability layers: a vertical canvas wash plus a soft radial glow keep
                the copy legible while letting the artwork show through */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-canvas/80 via-canvas/45 to-transparent opacity-70 lg:from-canvas/60 lg:via-canvas/20 lg:opacity-50"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-1/2 h-[92%] -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,var(--color-canvas)_0%,transparent_68%)] opacity-60 lg:opacity-40"
            />

            <div className="relative z-10 mx-auto flex max-w-[600px] flex-col items-center gap-6 text-center lg:gap-lg">
              <div className="flex flex-col items-center gap-3">
                <span className="outrazo-badge-enter type-caption inline-flex w-fit items-center gap-xs rounded-full border border-line bg-card/70 px-md py-xs font-semibold text-accent backdrop-blur-md">
                  <span className="relative inline-grid size-4 place-items-center">
                    <Flame aria-hidden className="outrazo-flame size-4" strokeWidth={2.5} />
                    <span aria-hidden className="outrazo-sonar" />
                  </span>
                  <span className="outrazo-badge-text">Trending around you</span>
                </span>
                <h1 className="type-h1 text-balance text-[30px] leading-[1.15] sm:text-[40px] lg:text-[56px]">
                  Your city. Your people.{" "}
                  <span className="text-accent">Your experiences.</span>
                </h1>
                <p className="type-body max-w-[40ch] text-[14px] text-muted-text sm:text-[15px] lg:text-[16px]">
                  Discover events, experiences and communities worth showing up for — from
                  rooftop parties to tech meetups, all happening around you.
                </p>
              </div>

              <form
                className="mt-1 w-full max-w-[460px] lg:mt-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitSearch();
                }}
              >
                <SearchField
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onClear={() => setQuery("")}
                  placeholder="Search events, places, or communities..."
                />
              </form>

              <div className="flex w-full max-w-[460px] flex-col items-center gap-xs sm:w-auto sm:flex-row sm:justify-center sm:gap-sm">
                <Button
                  size="md"
                  className="w-full sm:w-auto"
                  onClick={() => navigate({ to: "/events", search: {} })}
                >
                  Explore Events
                  <ArrowRight aria-hidden className="size-4" />
                </Button>
                <Button
                  size="md"
                  variant="ghost"
                  className="w-full text-accent sm:w-auto"
                  onClick={() => navigate({ to: "/create" })}
                >
                  Post Your Event
                  <Plus aria-hidden className="size-4" />
                </Button>
              </div>

              <HeroCardStrip />
            </div>
          </div>

        </section>


        {/* Categories */}
        <section
          id="categories"
          className="mx-auto max-w-[1200px] scroll-mt-24 px-md py-section lg:px-xl"
        >
          <Reveal className="mb-lg flex flex-wrap items-end justify-between gap-md">
            <div className="flex flex-col gap-xs">
              <h2 className="type-h2">Discover your kind of experience</h2>
              <p className="type-body text-muted-text">
                Browse by scene — tap a category to filter what&apos;s happening below.
              </p>
            </div>
            <Link
              to="/events"
              search={{}}
              className="focus-ring type-body rounded-sm text-accent hover:underline"
            >
              Browse all
            </Link>
          </Reveal>

          {/* Mobile: swipeable rail. Desktop: grid. */}
          <Carousel
            label="Event categories"
            controls={false}
            className="lg:hidden"
            trackClassName="-mx-md px-md"
            slideClassName="w-[200px]"
          >
            {CATEGORIES.map(({ id, label, icon: Icon, count }) => (
              <CategoryCard
                key={id}
                label={label}
                meta={count}
                active={discovery.category === id}
                icon={<Icon aria-hidden className="size-5" strokeWidth={2} />}
                onClick={() => discovery.setCategory(id)}
              />
            ))}
          </Carousel>

          <ul className="hidden gap-md lg:grid lg:grid-cols-4">
            {CATEGORIES.map(({ id, label, icon: Icon, count }, index) => (
              <li key={id}>
                <Reveal delay={index * 40}>
                  <CategoryCard
                    label={label}
                    meta={count}
                    active={discovery.category === id}
                    icon={<Icon aria-hidden className="size-5" strokeWidth={2} />}
                    onClick={() => discovery.setCategory(id)}
                  />
                </Reveal>
              </li>
            ))}
          </ul>
        </section>

        {/* Recommended */}
        <section
          id="discover"
          className="mx-auto max-w-[1200px] scroll-mt-24 px-md pb-section lg:px-xl"
        >
          <div className="mb-lg flex items-end justify-between gap-md">
            <div className="flex flex-col gap-xs">
              <h2 className="type-h2">Recommended for you</h2>
              <p className="type-body text-muted-text">
                {discovery.events.length} events
                {discovery.category !== "all" ? " in this category" : " around you"}
              </p>
            </div>
            <Link
              to="/events"
              search={{}}
              className="focus-ring type-body rounded-sm text-accent hover:underline"
            >
              See all
            </Link>
          </div>

          {discovery.status === "loading" ? (
            <div className="grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <EventCardSkeleton key={index} />
              ))}
            </div>
          ) : discovery.status === "error" ? (
            <ErrorState onRetry={discovery.retry} />
          ) : discovery.events.length === 0 ? (
            <EmptyState
              title="Nothing happening here yet."
              description="Try another location or explore another category."
              action={
                <Button variant="outline" onClick={discovery.reset}>
                  Show all events
                </Button>
              }
            />
          ) : (
            <>
              {/* Mobile: horizontal rail. Desktop: grid. */}
              <Carousel
                label="Recommended events"
                controls={false}
                className="lg:hidden"
                trackClassName="-mx-md px-md"
                slideClassName="w-[280px]"
              >
                {discovery.events.slice(0, 8).map((event) => (
                  <EventCard
                    key={event.id}
                    {...toEventCardProps(event)}
                    saved={discovery.isSaved(event.id)}
                    onToggleSave={() => discovery.toggleSave(event.id)}
                    onSelect={() => navigate({ to: "/events", search: {} })}
                  />
                ))}
              </Carousel>

              <div className="hidden gap-lg lg:grid lg:grid-cols-3">
                {discovery.events.slice(0, 6).map((event, index) => (
                  <Reveal key={event.id} delay={index * 50}>
                    <EventCard
                      {...toEventCardProps(event)}
                      saved={discovery.isSaved(event.id)}
                      onToggleSave={() => discovery.toggleSave(event.id)}
                      onSelect={() => navigate({ to: "/events", search: {} })}
                    />
                  </Reveal>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Happening tonight — looping marquee */}
        <section className="overflow-hidden pb-section">
          <div className="mx-auto mb-lg flex max-w-[1200px] items-center gap-sm px-md lg:px-xl">
            <h2 className="type-h2">Happening tonight</h2>
            <Badge variant="transactional">Live</Badge>
          </div>
          <div className="relative">
            <div className="outrazo-marquee flex w-max gap-md">
              {[...TONIGHT_EVENTS, ...TONIGHT_EVENTS].map((item, index) => (
                <article
                  key={`${item.title}-${index}`}
                  className="relative w-[220px] shrink-0 overflow-hidden rounded-lg shadow-card"
                >
                  <img
                    src={item.imageSrc}
                    alt={item.title}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-canvas/75 p-md backdrop-blur-md">
                    <h3 className="type-h3 text-primary-text">{item.title}</h3>
                    <p className="type-caption text-muted-text">
                      {item.city} · {item.attendeeCount.toLocaleString("en-NG")} going
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Near you */}
        <section className="mx-auto max-w-[1200px] px-md pb-section lg:px-xl">
          <Reveal className="mb-lg flex items-end justify-between gap-md">
            <div className="flex flex-col gap-xs">
              <h2 className="type-h2">Near you</h2>
              <p className="type-body text-muted-text">
                Pick a city to filter the events above.
              </p>
            </div>
            {discovery.city ? (
              <button
                type="button"
                onClick={() => discovery.setCity(null)}
                className="focus-ring type-body rounded-sm text-accent hover:underline"
              >
                Clear city
              </button>
            ) : null}
          </Reveal>
          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
            {CITIES.map((city, index) => (
              <Reveal key={city.name} delay={index * 50}>
                <CityCard
                  name={city.name}
                  imageSrc={city.src}
                  meta={city.count}
                  distance={city.distance}
                  active={discovery.city === city.name}
                  onClick={() =>
                    discovery.setCity(discovery.city === city.name ? null : city.name)
                  }
                />
              </Reveal>
            ))}
          </div>
        </section>

        {/* Trust bar */}
        <section className="mx-auto max-w-[1200px] px-md pb-section lg:px-xl">
          <Reveal>
            <ul className="grid grid-cols-2 gap-lg rounded-lg bg-card p-xl shadow-card lg:grid-cols-4">
              {TRUST.map(({ icon: Icon, title, copy }) => (
                <li key={title} className="flex items-center gap-md">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                    <Icon aria-hidden className="size-5" strokeWidth={2} />
                  </span>
                  <span className="type-body">
                    <span className="block font-semibold">{title}</span>
                    <span className="text-muted-text">{copy}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[1200px] px-md pb-section lg:px-xl">
          <Reveal className="overflow-hidden rounded-lg bg-card shadow-glow">
            <div className="grid items-center gap-lg p-xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-xl lg:p-2xl">
              <div className="flex flex-col items-center gap-md text-center lg:items-start lg:gap-lg lg:text-left">
                <div className="flex flex-col gap-sm">
                  <h2 className="type-h2">Your event deserves to be discovered.</h2>
                  <p className="type-body-lg text-muted-text">
                    Reach the people already looking for something to do. Promote your
                    experience, grow your community, manage attendees — and sell tickets
                    as Outrazo grows.
                  </p>
                </div>
                <Button size="lg" onClick={() => navigate({ to: "/create" })}>
                  Post Your Event
                  <Plus aria-hidden className="size-4" />
                </Button>
              </div>
              <CtaFlyerWall />
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-md px-md py-xl lg:px-xl">
          <span className="type-h3">
            OUTRAZO<span className="text-accent">.</span>
          </span>
          <nav aria-label="Footer" className="flex flex-wrap gap-md">
            <Link
              to="/events"
              search={{}}
              className="focus-ring type-body rounded-sm text-muted-text hover:text-primary-text"
            >
              Explore
            </Link>
            <button
              type="button"
              onClick={() => scrollTo("categories")}
              className="focus-ring type-body rounded-sm text-muted-text hover:text-primary-text"
            >
              Categories
            </button>
            <Link
              to="/create"
              className="focus-ring type-body rounded-sm text-muted-text hover:text-primary-text"
            >
              Organizers
            </Link>
          </nav>
          <p className="type-caption ml-auto flex items-center gap-xs text-subtle-text">
            <Compass aria-hidden className="size-4" />
            Events worth showing up for.
          </p>
        </div>
      </footer>
    </div>
  );
}
