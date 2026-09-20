import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Avatar } from "@/design-system/components/Avatar";
import { Button } from "@/design-system/components/Button";
import { ErrorState } from "@/design-system/components/ErrorState";
import { EventCard } from "@/design-system/components/EventCard";
import { useSavedItems } from "@/design-system/lib/use-saved-items";
import { getOrganizer, getOrganizerEvents, ORGANIZERS, toEventCardProps } from "@/showcase/sample-data";

function OrganizerNotFound() {
  return <main className="grid min-h-screen place-items-center bg-canvas px-md text-center text-primary-text"><div><h1 className="type-h1">Organizer not found.</h1><p className="type-body-lg mt-md text-muted-text">This organizer profile is unavailable.</p><Link to="/events" search={{}} className="focus-ring mt-lg inline-flex rounded-full"><Button>Back to Explore</Button></Link></div></main>;
}

function OrganizerError({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return <main className="grid min-h-screen place-items-center bg-canvas px-md"><ErrorState onRetry={() => { router.invalidate(); reset(); }} /></main>;
}

export const Route = createFileRoute("/organizers/$organizerId")({
  loader: ({ params }) => {
    if (!ORGANIZERS.some((item) => item.id === params.organizerId)) throw notFound();
    return { organizer: getOrganizer(params.organizerId), events: getOrganizerEvents(params.organizerId) };
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [
    { title: `${loaderData.organizer.name} — Outrazo` },
    { name: "description", content: loaderData.organizer.description ?? `Events by ${loaderData.organizer.name}.` },
    { property: "og:title", content: `${loaderData.organizer.name} — Outrazo` },
    { property: "og:description", content: loaderData.organizer.description ?? `Events by ${loaderData.organizer.name}.` },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] : [{ title: "Organizer unavailable — Outrazo" }, { name: "description", content: "This organizer is unavailable." }, { property: "og:title", content: "Organizer unavailable — Outrazo" }, { property: "og:description", content: "This organizer is unavailable." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  errorComponent: OrganizerError,
  notFoundComponent: OrganizerNotFound,
  component: OrganizerPage,
});

function OrganizerPage() {
  const { organizer, events } = Route.useLoaderData();
  const { isSaved, toggle } = useSavedItems();
  return <div className="min-h-screen bg-canvas text-primary-text"><header className="border-b border-line"><div className="mx-auto flex min-h-16 max-w-[1200px] items-center justify-between px-md lg:px-xl"><Link to="/" className="focus-ring type-h3 rounded-sm text-accent">OUTRAZO</Link><Link to="/events" search={{}} className="focus-ring type-body inline-flex min-h-11 items-center gap-xs rounded-full text-muted-text"><ArrowLeft aria-hidden className="size-4" />Explore</Link></div></header><main className="mx-auto max-w-[1200px] px-md py-section lg:px-xl"><section className="flex max-w-2xl flex-col items-start gap-lg"><Avatar name={organizer.name} src={organizer.avatarSrc} size="lg" /><div><p className="type-caption text-accent">{organizer.community}</p><h1 className="type-h1 mt-sm">{organizer.name}</h1><p className="type-body-lg mt-md text-muted-text">{organizer.description ?? `Community events hosted by ${organizer.name}.`}</p></div></section><section className="pt-section"><h2 className="type-h2 mb-lg">Events by this organizer</h2>{events.length ? <div className="grid gap-lg sm:grid-cols-2 lg:grid-cols-3">{events.map((event) => <EventCard key={event.id} {...toEventCardProps(event)} saved={isSaved(event.id)} onToggleSave={() => toggle(event.id)} />)}</div> : <p className="type-body text-muted-text">No upcoming events yet.</p>}</section></main></div>;
}