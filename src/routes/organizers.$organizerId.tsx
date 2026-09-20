import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Globe, MapPin, UserCheck, UserPlus } from "lucide-react";

import { Avatar } from "@/design-system/components/Avatar";
import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { EventCard } from "@/design-system/components/EventCard";
import { EventCardSkeleton } from "@/design-system/components/EventCardSkeleton";
import { EventShareMenu } from "@/design-system/components/EventShareMenu";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useSavedItems } from "@/design-system/lib/use-saved-items";
import {
  getOrganizer,
  getOrganizerEvents,
  ORGANIZERS,
  toEventCardProps,
} from "@/showcase/sample-data";

function OrganizerNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-md text-center text-primary-text">
      <div>
        <h1 className="type-h1">Organizer not found.</h1>
        <p className="type-body-lg mt-md text-muted-text">
          This organizer may have been removed or the link may be incorrect.
        </p>
        <Link to="/events" search={{}} className="focus-ring mt-lg inline-flex rounded-full">
          <Button>Back to Explore</Button>
        </Link>
      </div>
    </main>
  );
}

function OrganizerError({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-md">
      <ErrorState
        title="Unable to load organizer."
        description="Something went wrong while loading this profile."
        retryLabel="Try Again"
        onRetry={() => {
          router.invalidate();
          reset();
        }}
      />
    </main>
  );
}

function OrganizerPending() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-[1000px] px-md py-2xl lg:px-xl">
        <div className="flex flex-col items-center gap-md text-center">
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="mt-section grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <EventCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/organizers/$organizerId")({
  loader: ({ params }) => {
    if (!ORGANIZERS.some((item) => item.id === params.organizerId)) throw notFound();
    return {
      organizer: getOrganizer(params.organizerId),
      events: getOrganizerEvents(params.organizerId),
    };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.organizer.name} — Outrazo` },
          {
            name: "description",
            content:
              loaderData.organizer.description ?? `Events by ${loaderData.organizer.name}.`,
          },
          { property: "og:title", content: `${loaderData.organizer.name} — Outrazo` },
          {
            property: "og:description",
            content:
              loaderData.organizer.description ?? `Events by ${loaderData.organizer.name}.`,
          },
          { property: "og:type", content: "profile" },
          { name: "twitter:card", content: "summary" },
        ]
      : [
          { title: "Organizer unavailable — Outrazo" },
          { name: "description", content: "This organizer is unavailable." },
          { property: "og:title", content: "Organizer unavailable — Outrazo" },
          { property: "og:description", content: "This organizer is unavailable." },
          { property: "og:type", content: "profile" },
          { name: "twitter:card", content: "summary" },
          { name: "robots", content: "noindex" },
        ],
  }),
  pendingComponent: OrganizerPending,
  errorComponent: OrganizerError,
  notFoundComponent: OrganizerNotFound,
  component: OrganizerPage,
});

function OrganizerPage() {
  const { organizer, events } = Route.useLoaderData();
  const { isSaved: isFollowed, toggle: toggleFollow } = useSavedItems(
    "outrazo-followed-organizers",
  );
  const { isSaved, toggle } = useSavedItems();
  const following = isFollowed(organizer.id);
  const bio = organizer.description ?? `Community events hosted by ${organizer.name}.`;

  return (
    <div className="min-h-screen bg-canvas text-primary-text">
      <header className="border-b border-line">
        <div className="mx-auto flex min-h-16 max-w-[1000px] items-center justify-between gap-md px-md lg:px-xl">
          <Link
            to="/events"
            search={{}}
            className="focus-ring type-body inline-flex min-h-11 items-center gap-xs rounded-full text-muted-text transition-colors hover:text-primary-text"
          >
            <ArrowLeft aria-hidden className="size-4" />
            <span className="hidden sm:inline">Back to Explore</span>
            <span className="sm:hidden">Organizer</span>
          </Link>
          <Link to="/" className="focus-ring type-h3 rounded-sm text-accent">
            OUTRAZO
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-md pb-section pt-xl lg:px-xl">
        <section className="flex flex-col items-center gap-md text-center">
          <Avatar name={organizer.name} src={organizer.avatarSrc} size="lg" />
          <div className="flex flex-col items-center gap-sm">
            <div className="flex flex-wrap items-center justify-center gap-sm">
              <h1 className="type-h1">{organizer.name}</h1>
              {organizer.verified ? <Badge variant="accent">Verified</Badge> : null}
            </div>
            <p className="type-caption text-accent">{organizer.community}</p>
            <p className="type-body-lg max-w-2xl text-muted-text">{bio}</p>
            {organizer.location ? (
              <p className="type-body inline-flex items-center gap-xs text-muted-text">
                <MapPin aria-hidden className="size-4 text-accent" />
                {organizer.location}
              </p>
            ) : null}
            {organizer.website || organizer.socialLinks?.length ? (
              <div className="flex flex-wrap items-center justify-center gap-md">
                {organizer.website ? (
                  <a
                    href={organizer.website}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-ring type-body inline-flex min-h-11 items-center gap-xs rounded-full text-accent"
                  >
                    <Globe aria-hidden className="size-4" />
                    Website
                  </a>
                ) : null}
                {organizer.socialLinks?.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-ring type-body inline-flex min-h-11 items-center rounded-full text-muted-text transition-colors hover:text-accent"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex w-full flex-col items-stretch gap-sm sm:w-auto sm:flex-row sm:items-center">
            <Button
              variant={following ? "outline" : "primary"}
              onClick={() => toggleFollow(organizer.id)}
              aria-pressed={following}
              leadingIcon={
                following ? (
                  <UserCheck aria-hidden className="size-4" />
                ) : (
                  <UserPlus aria-hidden className="size-4" />
                )
              }
            >
              {following ? "Following" : "Follow"}
            </Button>
            <EventShareMenu
              title={organizer.name}
              copiedLabel="Organizer link copied"
              menuLabel="Share organizer"
            />
          </div>
        </section>

        <section className="pt-section">
          <h2 className="type-h2 mb-lg">Events by {organizer.name}</h2>
          {events.length ? (
            <div className="grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  {...toEventCardProps(event)}
                  saved={isSaved(event.id)}
                  onToggleSave={() => toggle(event.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="This organizer hasn't posted any events yet."
              description="Follow them to hear about the next one."
            />
          )}
        </section>

        <section className="pt-section">
          <h2 className="type-h2 mb-md">About</h2>
          <p className="type-body-lg max-w-2xl text-muted-text">{bio}</p>
          {organizer.location ? (
            <p className="type-body mt-md text-muted-text">Based in {organizer.location}.</p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
