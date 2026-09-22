import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Bookmark, CalendarDays, ChevronRight, Heart, MapPin, Navigation, Ticket, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { Avatar } from "@/design-system/components/Avatar";
import { AvatarStack } from "@/design-system/components/AvatarStack";
import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { Carousel } from "@/design-system/components/Carousel";
import { ErrorState } from "@/design-system/components/ErrorState";
import { EventBookingDrawer } from "@/design-system/components/EventBookingDrawer";
import { EventCard } from "@/design-system/components/EventCard";
import { EventShareMenu } from "@/design-system/components/EventShareMenu";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useSavedItems } from "@/design-system/lib/use-saved-items";
import { getEvent, getRelatedEvents, toEventCardProps, type EventDetails } from "@/showcase/sample-data";

function EventNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-md text-primary-text">
      <div className="max-w-lg text-center">
        <p className="type-caption text-accent">EVENT NOT FOUND</p>
        <h1 className="type-h1 mt-sm">Event not found.</h1>
        <p className="type-body-lg mt-md text-muted-text">This event may have been removed or the link may be incorrect.</p>
        <Link to="/events" search={{}} className="focus-ring mt-lg inline-flex rounded-full"><Button leadingIcon={<ArrowLeft aria-hidden className="size-4" />}>Back to Explore</Button></Link>
      </div>
    </main>
  );
}

function EventLoadError({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return <main className="grid min-h-screen place-items-center bg-canvas px-md"><ErrorState title="Something went wrong." description="Unable to load this event." onRetry={() => { router.invalidate(); reset(); }} /></main>;
}

export const Route = createFileRoute("/events/$eventId")({
  loader: ({ params }) => {
    const event = getEvent(params.eventId);
    if (!event) throw notFound();
    return event;
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [
      { title: `${loaderData.title} — Outrazo` },
      { name: "description", content: loaderData.summary },
      { property: "og:title", content: `${loaderData.title} — Outrazo` },
      { property: "og:description", content: loaderData.summary },
      { property: "og:type", content: "website" },
      { property: "og:image", content: loaderData.imageSrc },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: loaderData.imageSrc },
    ] : [
      { title: "Event unavailable — Outrazo" },
      { name: "description", content: "This Outrazo event is unavailable." },
      { property: "og:title", content: "Event unavailable — Outrazo" },
      { property: "og:description", content: "This Outrazo event is unavailable." },
      { name: "robots", content: "noindex" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: EventLoadError,
  notFoundComponent: EventNotFound,
  component: EventDetailsPage,
});

function DetailSkeleton() {
  return <div className="mx-auto grid max-w-[1200px] gap-xl px-md py-xl lg:grid-cols-[1.15fr_0.85fr] lg:px-xl"><Skeleton className="aspect-[4/3] w-full rounded-lg" /><div className="flex flex-col gap-md"><Skeleton className="h-6 w-24" /><Skeleton className="h-16 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div></div>;
}

function EventDetailsPage() {
  const event = Route.useLoaderData();
  const [loading, setLoading] = useState(true);
  const [bookingOpen, setBookingOpen] = useState(false);
  const { isSaved, toggle } = useSavedItems();
  const related = getRelatedEvents(event);
  const saved = isSaved(event.id);
  const actionLabel = event.ticketTiers.length ? "Get Tickets" : "RSVP";

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 220);
    return () => window.clearTimeout(timer);
  }, [event.id]);

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas pb-[calc(var(--spacing-section)+var(--spacing-xl))] text-primary-text lg:pb-0">
      <header className="border-b border-line bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-[1200px] items-center justify-between px-md lg:px-xl">
          <Link to="/events" search={{}} className="focus-ring grid size-11 place-items-center rounded-full text-muted-text hover:text-primary-text sm:hidden" aria-label="Back to Explore"><ArrowLeft aria-hidden className="size-5" /></Link>
          <Link to="/" className="focus-ring type-h3 hidden rounded-sm text-accent sm:inline-flex">OUTRAZO</Link>
          <nav className="flex items-center gap-sm" aria-label="Event actions">
            <button type="button" className="focus-ring grid size-11 place-items-center rounded-full border border-line sm:hidden" aria-label={saved ? "Remove from saved" : "Save event"} onClick={() => toggle(event.id)}><Heart aria-hidden className={saved ? "size-5 fill-accent text-accent" : "size-5"} /></button>
            <div className="hidden sm:block"><EventShareMenu title={event.title} /></div>
          </nav>
        </div>
      </header>

      {loading ? <DetailSkeleton /> : (
        <main>
          <div className="mx-auto max-w-[1200px] px-md pt-lg lg:px-xl lg:pt-xl">
            <Link to="/events" search={{}} className="focus-ring type-body hidden min-h-11 items-center gap-xs rounded-full text-muted-text hover:text-primary-text sm:inline-flex"><ArrowLeft aria-hidden className="size-4" />Back to Explore</Link>
          </div>

          <section className="mx-auto grid max-w-[1200px] gap-xl px-md pb-section pt-md lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:px-xl">
            <div className="overflow-hidden rounded-lg bg-card shadow-card"><img src={event.imageSrc} alt={`${event.title} event cover`} className="aspect-[4/3] w-full object-cover lg:aspect-[5/4]" /></div>
            <div className="flex flex-col gap-lg lg:sticky lg:top-lg">
              <div><Badge variant="accent">{event.category}</Badge><h1 className="type-h1 mt-md">{event.title}</h1><p className="type-body-lg mt-md text-muted-text">{event.summary}</p></div>
              <div className="grid gap-md border-y border-line py-lg">
                <DetailRow icon={<CalendarDays aria-hidden className="size-5" />} label="Date and time" value={`${event.date} · ${event.time}${event.endTime ? ` – ${event.endTime}` : ""}`} />
                <DetailRow icon={<MapPin aria-hidden className="size-5" />} label="Location" value={`${event.venue.name}, ${event.city}`} />
                <DetailRow icon={<Users aria-hidden className="size-5" />} label="People going" value={`${event.attendeeCount.toLocaleString()} people going`} />
              </div>
              <Button variant={event.ticketTiers.length ? "transactional" : "primary"} size="lg" className="w-full" leadingIcon={<Ticket aria-hidden className="size-5" />} onClick={() => setBookingOpen(true)}>{actionLabel}</Button>
              <div className="sm:hidden"><EventShareMenu title={event.title} /></div>
              <div className="hidden grid-cols-2 gap-sm sm:grid">
                <Button type="button" variant="outline" leadingIcon={<Bookmark aria-hidden className={saved ? "size-4 fill-accent" : "size-4"} />} onClick={() => toggle(event.id)}>{saved ? "Saved" : "Save"}</Button>
                <EventShareMenu title={event.title} />
              </div>
            </div>
          </section>

          <div className="mx-auto grid max-w-[1200px] gap-section px-md pb-section lg:grid-cols-[minmax(0,1fr)_360px] lg:px-xl">
            <div className="flex flex-col gap-section">
              <ContentSection title="About this event"><p className="type-body-lg text-muted-text">{event.description}</p></ContentSection>
              <ContentSection title="Hosted by">
                <div className="flex items-start gap-md"><Avatar name={event.organizer.name} src={event.organizer.avatarSrc} size="lg" /><div className="min-w-0 flex-1"><h3 className="type-h3">{event.organizer.name}</h3><p className="type-body mt-xs text-muted-text">{event.organizer.description ?? event.organizer.community}</p><Link to="/organizers/$organizerId" params={{ organizerId: event.organizer.id }} className="focus-ring type-body mt-md inline-flex min-h-11 items-center gap-xs rounded-full text-accent">View Organizer<ChevronRight aria-hidden className="size-4" /></Link></div></div>
              </ContentSection>
              <ContentSection title="People going">
                <div className="flex flex-wrap items-center gap-md"><AvatarStack people={event.attendees} totalCount={event.attendeeCount} max={5} size="md" /><strong className="type-body">{event.attendeeCount.toLocaleString()} people going</strong></div>
              </ContentSection>
            </div>
            <ContentSection title="Location">
              <div className="flex flex-col gap-md"><div><h3 className="type-h3">{event.venue.name}</h3><p className="type-body mt-xs text-muted-text">{event.venue.address}<br />{event.venue.city}</p></div><div className="grid aspect-[4/3] place-items-center rounded-md border border-line bg-card" aria-label="Map placeholder"><MapPin aria-hidden className="size-10 text-accent" /><span className="sr-only">Map preview will be available here</span></div><a href={`https://www.google.com/maps/search/?api=1&query=${event.venue.latitude},${event.venue.longitude}`} target="_blank" rel="noreferrer" className="focus-ring rounded-full"><Button variant="outline" className="w-full" leadingIcon={<Navigation aria-hidden className="size-4" />}>Get Directions</Button></a></div>
            </ContentSection>
          </div>

          <section className="border-t border-line py-section">
            <div className="mx-auto max-w-[1200px] px-md lg:px-xl"><h2 className="type-h2 mb-lg">More events you might like</h2><Carousel label="Related events" controls={false} trackClassName="-mx-md px-md lg:mx-0 lg:grid lg:grid-cols-4 lg:px-0" slideClassName="w-[280px] lg:w-auto">{related.map((item) => <EventCard key={item.id} {...toEventCardProps(item)} saved={isSaved(item.id)} onToggleSave={() => toggle(item.id)} />)}</Carousel></div>
          </section>
        </main>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 p-md backdrop-blur-md lg:hidden"><Button variant={event.ticketTiers.length ? "transactional" : "primary"} size="lg" className="w-full" onClick={() => setBookingOpen(true)}>{actionLabel}</Button></div>
      <EventBookingDrawer event={event} open={bookingOpen} onClose={() => setBookingOpen(false)} />
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-start gap-md"><span className="mt-xs text-accent">{icon}</span><div><p className="type-caption text-muted-text">{label}</p><p className="type-body mt-xs font-medium">{value}</p></div></div>;
}

function ContentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="type-caption mb-lg font-semibold text-accent">{title.toUpperCase()}</h2>{children}</section>;
}