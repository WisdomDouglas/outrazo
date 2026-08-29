import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Briefcase,
  CalendarCheck,
  Clock,
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
  MapPin,
  Users,
} from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { CategoryChip } from "@/design-system/components/CategoryChip";
import { EventCard } from "@/design-system/components/EventCard";
import { SearchField } from "@/design-system/components/SearchField";
import { useTheme } from "@/design-system/lib/use-theme";
import {
  HeroCardStrip,
  HeroFloatingCards,
} from "@/showcase/landing/HeroFloatingCards";
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
  { label: "Parties", icon: PartyPopper },
  { label: "Music", icon: Music },
  { label: "Tech", icon: Laptop },
  { label: "Business", icon: Briefcase },
  { label: "Culture", icon: Palette },
  { label: "Food", icon: UtensilsCrossed },
  { label: "Sports", icon: Trophy },
  { label: "More", icon: MoreHorizontal },
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
        <div className="mx-auto grid max-w-[1080px] grid-cols-[minmax(0,1fr)_auto] items-center gap-md rounded-full border border-line bg-card/80 px-md py-sm shadow-floating backdrop-blur-xl lg:grid-cols-[1fr_auto_1fr] lg:px-lg">
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
                className="focus-ring type-body rounded-full px-md py-sm text-muted-text transition-colors hover:bg-primary-text/8 hover:text-primary-text"
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
              className="focus-ring grid size-10 shrink-0 place-items-center rounded-full border border-line text-muted-text transition-colors hover:text-primary-text"
            >
              {theme === "dark" ? (
                <Sun aria-hidden className="size-4" />
              ) : (
                <Moon aria-hidden className="size-4" />
              )}
            </button>
            <Button size="sm" className="hidden sm:inline-flex">
              Post Your Event
            </Button>
            <button
              type="button"
              aria-label="Open menu"
              className="focus-ring grid size-10 shrink-0 place-items-center rounded-full border border-line text-muted-text lg:hidden"
            >
              <Menu aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* ambient glows */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[-10%] size-[520px] -translate-x-1/2 rounded-full bg-accent/20 blur-[120px]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-[-20%] right-[10%] size-[320px] rounded-full bg-transactional/10 blur-[120px]"
          />

          <div className="relative mx-auto min-h-[560px] max-w-[1200px] px-md py-2xl lg:min-h-[760px] lg:px-xl lg:py-section">
            <HeroFloatingCards />

            <div className="relative z-10 mx-auto flex max-w-[640px] flex-col items-center gap-lg text-center">
              <span className="type-caption inline-flex w-fit items-center gap-xs rounded-full border border-line bg-card/70 px-md py-sm font-semibold text-accent backdrop-blur-md">
                <Flame aria-hidden className="size-4" strokeWidth={2.5} />
                Trending around you
              </span>
              <h1 className="type-hero text-balance">
                Your city. Your people.{" "}
                <span className="text-accent">Your experiences.</span>
              </h1>
              <p className="type-body-lg max-w-[46ch] text-muted-text">
                Discover events, experiences and communities worth showing up for — from
                rooftop parties to tech meetups, all happening around you.
              </p>

              <div className="flex w-full flex-col items-center gap-md">
                <div className="w-full max-w-[520px]">
                  <SearchField placeholder="Search events, places, or communities..." />
                </div>
                <div className="flex flex-wrap justify-center gap-sm">
                  <CategoryChip icon={<Clock className="size-4" />} active>
                    Tonight
                  </CategoryChip>
                  <CategoryChip icon={<CalendarCheck className="size-4" />}>
                    This Weekend
                  </CategoryChip>
                  <CategoryChip icon={<MapPin className="size-4" />}>Near You</CategoryChip>
                  <CategoryChip icon={<Ticket className="size-4" />}>Free Events</CategoryChip>
                </div>
              </div>

              <div className="flex w-full flex-col gap-md sm:w-auto sm:flex-row sm:justify-center">
                <Button size="lg">
                  Explore Events
                  <ArrowRight aria-hidden className="size-4" />
                </Button>
                <Button size="lg" variant="outline">
                  Post Your Event
                  <Plus aria-hidden className="size-4" />
                </Button>
              </div>

              <HeroCardStrip />
            </div>
          </div>
        </section>


        {/* Live stats band */}
        <section className="mx-auto max-w-[1200px] px-md pt-lg lg:px-xl">
          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line shadow-card lg:grid-cols-4">
            {STATS.map(({ icon: Icon, value, label }) => (
              <li
                key={label}
                className="flex items-center gap-md bg-card px-md py-lg lg:justify-center"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
                  <Icon aria-hidden className="size-[18px]" strokeWidth={2} />
                </span>
                <span>
                  <span className="type-h3 block text-primary-text">{value}</span>
                  <span className="type-caption text-muted-text">{label}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Categories */}
        <section className="mx-auto max-w-[1200px] px-md pt-section lg:px-xl">
          <h2 className="type-h2 mb-lg">Discover your kind of experience</h2>
          <ul className="grid grid-cols-2 gap-sm sm:grid-cols-4 lg:grid-cols-8 lg:gap-md lg:rounded-lg lg:bg-card lg:p-lg lg:shadow-card">
            {CATEGORIES.map(({ label, icon: Icon }) => (
              <li key={label}>
                <button
                  type="button"
                  className="focus-ring flex w-full items-center gap-sm rounded-md border border-line bg-card px-md py-md text-muted-text transition-all duration-150 hover:-translate-y-[2px] hover:border-accent/40 hover:text-accent lg:flex-col lg:justify-center lg:border-0 lg:bg-transparent lg:px-sm"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent lg:size-11">
                    <Icon aria-hidden className="size-[18px] lg:size-5" strokeWidth={2} />
                  </span>
                  <span className="type-caption truncate">{label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Trending */}
        <section className="py-section">
          <div className="mx-auto mb-lg flex max-w-[1200px] items-end justify-between gap-md px-md lg:px-xl">
            <h2 className="type-h2">Recommended for you</h2>
            <a
              href="#"
              className="focus-ring type-body inline-flex shrink-0 items-center gap-xs rounded-sm text-accent hover:underline"
            >
              See all
              <ArrowRight aria-hidden className="size-4" />
            </a>
          </div>
          {/* Snapping rail on mobile, grid from sm up. */}
          <div className="outrazo-rail gap-md px-md pb-sm sm:mx-auto sm:grid sm:max-w-[1200px] sm:grid-cols-2 sm:gap-lg sm:overflow-visible lg:grid-cols-3 lg:px-xl">
            {EVENTS.map((event) => (
              <EventCard
                key={event.title}
                {...event}
                attendees={ATTENDEES.slice(0, 3)}
                className="w-[82vw] max-w-[340px] shrink-0 sm:w-auto sm:max-w-none"
              />
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-[1200px] px-md pb-section lg:px-xl">
          <h2 className="type-h2 mb-lg">Three taps to your next night out</h2>
          <ol className="grid gap-md lg:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, copy }, index) => (
              <li
                key={title}
                className="relative flex gap-md overflow-hidden rounded-lg border border-line bg-card p-lg shadow-card"
              >
                <span
                  aria-hidden
                  className="type-hero absolute -right-2 -top-6 select-none text-primary-text/5"
                >
                  {index + 1}
                </span>
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
                  <Icon aria-hidden className="size-5" strokeWidth={2} />
                </span>
                <span className="relative">
                  <span className="type-h3 block">{title}</span>
                  <span className="type-body text-muted-text">{copy}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Near you */}
        <section className="pb-section">
          <h2 className="type-h2 mx-auto mb-lg max-w-[1200px] px-md lg:px-xl">Near you</h2>
          <div className="outrazo-rail gap-md px-md pb-sm sm:mx-auto sm:grid sm:max-w-[1200px] sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4 lg:px-xl">
            {CITIES.map((city) => (
              <article
                key={city.name}
                className="relative w-[68vw] max-w-[300px] shrink-0 overflow-hidden rounded-lg transition-transform duration-200 hover:-translate-y-[2px] sm:w-auto sm:max-w-none"
              >
                <img
                  src={unsplash(city.src, 600)}
                  alt={`${city.name} skyline`}
                  loading="lazy"
                  className="aspect-[16/10] w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-canvas/90 to-transparent" />
                <div className="absolute bottom-md left-md flex items-center gap-sm">
                  <span className="grid size-9 place-items-center rounded-full bg-canvas/70 text-accent backdrop-blur-md">
                    <MapPin aria-hidden className="size-4" strokeWidth={2} />
                  </span>
                  <span>
                    <h3 className="type-h3 text-primary-text">{city.name}</h3>
                    <p className="type-caption text-muted-text">{city.count}</p>
                  </span>
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
