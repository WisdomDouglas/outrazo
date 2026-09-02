import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Briefcase,
  CalendarCheck,
  Compass,
  Flame,
  Menu,
  Moon,
  MoreHorizontal,
  Music,
  PartyPopper,
  Plus,
  Palette,
  ShieldCheck,
  Sun,
  Ticket,
  Trophy,
  UtensilsCrossed,
  Laptop,
  Users,
} from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EventCard } from "@/design-system/components/EventCard";
import { SearchField } from "@/design-system/components/SearchField";
import { useTheme } from "@/design-system/lib/use-theme";
import { HeroBackdrop } from "@/showcase/landing/HeroBackdrop";
import { HeroCardStrip } from "@/showcase/landing/HeroFloatingCards";

import { ATTENDEES, EVENTS } from "@/showcase/sample-data";

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

const CATEGORIES = [
  { label: "Parties", icon: PartyPopper, count: "412 events" },
  { label: "Music", icon: Music, count: "268 events" },
  { label: "Tech", icon: Laptop, count: "154 events" },
  { label: "Business", icon: Briefcase, count: "97 events" },
  { label: "Culture", icon: Palette, count: "132 events" },
  { label: "Food", icon: UtensilsCrossed, count: "88 events" },
  { label: "Sports", icon: Trophy, count: "76 events" },
  { label: "More", icon: MoreHorizontal, count: "All categories" },
];


const TONIGHT = [
  { title: "Girls Night Out", city: "Lagos", src: "photo-1516450360452-9312f5e86fc7" },
  { title: "RnB & Vibes", city: "Lagos", src: "photo-1493225457124-a3eb161ffa5f" },
  { title: "Comedy Show", city: "Abuja", src: "photo-1527224857830-43a7acc85260" },
  { title: "House Party", city: "Lagos", src: "photo-1470229722913-7c0e2dbbafd3" },
  { title: "Live Band Session", city: "Ibadan", src: "photo-1524368535928-5b5e00ddc76b" },
  { title: "Rooftop Sundown", city: "Lekki", src: "photo-1533174072545-7a4b6ad7a6c3" },
];

const CITIES = [
  { name: "Lagos", count: "1,234 events", src: "photo-1618828665011-0abd973f7bb4" },
  { name: "Abuja", count: "842 events", src: "photo-1590846406792-0adc7f938f1d" },
  { name: "Port Harcourt", count: "612 events", src: "photo-1449824913935-59a10b8d2000" },
  { name: "Ibadan", count: "423 events", src: "photo-1477959858617-67f85cf4f1df" },
];

const TRUST = [
  { icon: Users, title: "Real events", copy: "Real people" },
  { icon: ShieldCheck, title: "Trusted", copy: "Organizers" },
  { icon: Ticket, title: "Secure", copy: "Ticketing" },
  { icon: CalendarCheck, title: "Easy", copy: "Check-in" },
];

const unsplash = (id: string, w = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

function Landing() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-canvas text-primary-text">
      <header className="sticky top-0 z-40 px-md pt-md lg:pt-lg">
        <div className="mx-auto grid max-w-[1080px] grid-cols-[minmax(0,1fr)_auto] items-center gap-md rounded-full border border-primary-text/10 bg-canvas/25 px-md py-sm shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-primary-text/5 backdrop-blur-xl backdrop-saturate-150 transition-colors lg:grid-cols-[1fr_auto_1fr] lg:px-lg">

          <a href="#" className="focus-ring type-h3 min-w-0 truncate rounded-full tracking-tight">
            OUTRAZO<span className="text-accent">.</span>
          </a>
          <nav
            aria-label="Primary"
            className="hidden items-center justify-center gap-xs lg:flex"
          >
            {["Explore", "Categories", "Discover"].map((item) => (
              <a
                key={item}
                href="#"
                className="focus-ring type-body rounded-full px-md py-sm font-medium text-muted-text transition-colors hover:bg-primary-text/8 hover:text-primary-text"
              >
                {item}
              </a>
            ))}
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
            <Button size="sm" className="hidden sm:inline-flex">
              Get Started
            </Button>
            <button
              type="button"
              aria-label="Open menu"
              className="focus-ring grid size-10 shrink-0 place-items-center rounded-full border border-primary-text/15 bg-primary-text/5 text-muted-text transition-colors hover:text-primary-text lg:hidden"
            >
              <Menu aria-hidden className="size-4" />
            </button>
          </div>

        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          <HeroBackdrop />

          <div className="relative mx-auto min-h-[560px] max-w-[1100px] px-md pb-xl pt-lg lg:min-h-[720px] lg:px-xl lg:py-2xl">
            {/* Readability layers: a vertical canvas wash plus a soft radial glow keep
                the copy legible over the artwork — strongest on mobile, subtle on desktop */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-canvas via-canvas/70 to-transparent opacity-90 lg:from-canvas/70 lg:via-canvas/25 lg:opacity-60"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-1/2 h-[92%] -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,var(--color-canvas)_0%,transparent_70%)] opacity-90 lg:opacity-50"
            />

            <div className="relative z-10 mx-auto flex max-w-[600px] flex-col items-center gap-md text-center lg:gap-lg">
              <span className="type-caption inline-flex w-fit items-center gap-xs rounded-full border border-line bg-card/70 px-md py-xs font-semibold text-accent backdrop-blur-md">
                <Flame aria-hidden className="size-4" strokeWidth={2.5} />
                Trending around you
              </span>
              <h1 className="type-h1 text-balance lg:text-[56px]">
                Your city. Your people.{" "}
                <span className="text-accent">Your experiences.</span>
              </h1>
              <p className="type-body max-w-[44ch] text-muted-text">
                Discover events, experiences and communities worth showing up for — from
                rooftop parties to tech meetups, all happening around you.
              </p>

              <div className="w-full max-w-[460px]">
                <SearchField placeholder="Search events, places, or communities..." />
              </div>

              <div className="flex w-full flex-col gap-sm sm:w-auto sm:flex-row sm:justify-center">
                <Button size="md">
                  Explore Events
                  <ArrowRight aria-hidden className="size-4" />
                </Button>
                <Button size="md" variant="outline">
                  Get Started
                  <Plus aria-hidden className="size-4" />
                </Button>
              </div>

              <HeroCardStrip />
            </div>
          </div>
        </section>


        {/* Categories */}
        <section className="mx-auto max-w-[1200px] px-md lg:px-xl">
          <div className="mb-lg flex flex-wrap items-end justify-between gap-md">
            <div className="flex flex-col gap-xs">
              <h2 className="type-h2">Discover your kind of experience</h2>
              <p className="type-body text-muted-text">
                Browse by scene — every category updates as new events go live.
              </p>
            </div>
            <a href="#" className="focus-ring type-body rounded-sm text-accent hover:underline">
              Browse all
            </a>
          </div>
          <ul className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map(({ label, icon: Icon, count }) => (
              <li key={label}>
                <button
                  type="button"
                  className="focus-ring group relative flex w-full items-center gap-md overflow-hidden rounded-lg border border-line bg-card p-md text-left shadow-card transition-all duration-200 hover:-translate-y-[3px] hover:border-accent/50 hover:shadow-glow"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-6 -top-8 size-20 rounded-full bg-accent/10 opacity-0 blur-xl transition-opacity duration-200 group-hover:opacity-100"
                  />
                  <span className="grid size-11 shrink-0 place-items-center rounded-md border border-line bg-elevated text-accent transition-colors group-hover:border-accent/40">
                    <Icon aria-hidden className="size-5" strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="type-body block truncate font-semibold text-primary-text">
                      {label}
                    </span>
                    <span className="type-caption block truncate text-subtle-text">{count}</span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="ml-auto size-4 shrink-0 text-subtle-text transition-transform duration-200 group-hover:translate-x-1 group-hover:text-accent"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>


        {/* Trending */}
        <section className="mx-auto max-w-[1200px] px-md py-section lg:px-xl">
          <div className="mb-lg flex items-end justify-between gap-md">
            <h2 className="type-h2">Recommended for you</h2>
            <a href="#" className="focus-ring type-body rounded-sm text-accent hover:underline">
              See all
            </a>
          </div>
          <div className="grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
            {EVENTS.map((event) => (
              <EventCard key={event.title} {...event} attendees={ATTENDEES.slice(0, 3)} />
            ))}
          </div>
        </section>

        {/* Happening tonight — looping marquee */}
        <section className="overflow-hidden pb-section">
          <div className="mx-auto mb-lg flex max-w-[1200px] items-center gap-sm px-md lg:px-xl">
            <h2 className="type-h2">Happening tonight</h2>
            <Badge variant="transactional">Live</Badge>
          </div>
          <div className="relative">
            <div className="outrazo-marquee flex w-max gap-md">
              {[...TONIGHT, ...TONIGHT].map((item, index) => (
                <article
                  key={`${item.title}-${index}`}
                  className="relative w-[220px] shrink-0 overflow-hidden rounded-lg shadow-card"
                >
                  <img
                    src={unsplash(item.src, 500)}
                    alt={item.title}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-canvas/75 p-md backdrop-blur-md">
                    <h3 className="type-h3 text-primary-text">{item.title}</h3>
                    <p className="type-caption text-muted-text">{item.city}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Near you */}
        <section className="mx-auto max-w-[1200px] px-md pb-section lg:px-xl">
          <h2 className="type-h2 mb-lg">Near you</h2>
          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
            {CITIES.map((city) => (
              <article
                key={city.name}
                className="relative overflow-hidden rounded-lg transition-transform duration-200 hover:-translate-y-[2px]"
              >
                <img
                  src={unsplash(city.src, 600)}
                  alt={`${city.name} skyline`}
                  loading="lazy"
                  className="aspect-[16/10] w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-canvas/90 to-transparent" />
                <div className="absolute bottom-md left-md">
                  <h3 className="type-h3 text-primary-text">{city.name}</h3>
                  <p className="type-caption text-muted-text">{city.count}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Trust bar */}
        <section className="mx-auto max-w-[1200px] px-md pb-section lg:px-xl">
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
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[1200px] px-md pb-section lg:px-xl">
          <div className="flex flex-col items-start gap-lg rounded-lg bg-card p-xl shadow-glow lg:flex-row lg:items-center lg:justify-between lg:p-2xl">
            <div className="flex flex-col gap-sm">
              <h2 className="type-h2">Have something amazing planned?</h2>
              <p className="type-body-lg text-muted-text">
                Bring people together. Share your event with Outrazo.
              </p>
            </div>
            <Button size="lg">
              Post Your Event
              <Plus aria-hidden className="size-4" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-md px-md py-xl lg:px-xl">
          <span className="type-h3">
            OUTRAZO<span className="text-accent">.</span>
          </span>
          <nav aria-label="Footer" className="flex flex-wrap gap-md">
            {["Explore", "Categories", "Organizers", "Support"].map((item) => (
              <a
                key={item}
                href="#"
                className="focus-ring type-body rounded-sm text-muted-text hover:text-primary-text"
              >
                {item}
              </a>
            ))}
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
