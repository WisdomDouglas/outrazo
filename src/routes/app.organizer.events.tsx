import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarPlus, FolderKanban, ImageOff } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useOrganizerEvents, type OrganizerEventsState } from "@/showcase/organizer/use-organizer-events";
import type { OrganizerEvent } from "@/showcase/organizer/organizer-events";

export const Route = createFileRoute("/app/organizer/events")({
  head: () => ({ meta: [
    { title: "My Events — Organizer Dashboard — Outrazo" },
    { name: "description", content: "View, edit, publish, and unpublish your own events." },
  ] }),
  component: OrganizerEventsPage,
});

function StatusBadges({ event }: { event: OrganizerEvent }) {
  return (
    <div className="flex flex-wrap gap-xs">
      <Badge variant={event.published ? "accent" : "neutral"}>
        {event.published ? "Published" : "Draft"}
      </Badge>
      {event.status === "cancelled" ? <Badge variant="transactional">Cancelled</Badge> : null}
      {event.status === "sold-out" ? <Badge variant="outline">Sold out</Badge> : null}
      <Badge variant="outline">{event.details.category}</Badge>
    </div>
  );
}

function EventRow({
  event,
  busyId,
  onTogglePublished,
}: {
  event: OrganizerEvent;
  busyId: string | null;
  onTogglePublished: OrganizerEventsState["togglePublished"];
}) {
  const { details } = event;
  const busy = busyId === event.id;
  const actionsDisabled = busyId !== null;

  return (
    <li className="flex flex-col gap-md rounded-lg border border-line bg-card p-md shadow-card sm:flex-row sm:items-center">
      {details.imageSrc ? (
        <img
          src={details.imageSrc}
          alt=""
          className="h-20 w-full shrink-0 rounded-md object-cover sm:w-28"
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-20 w-full shrink-0 place-items-center rounded-md bg-accent/12 text-accent sm:w-28"
        >
          <ImageOff className="size-5" />
        </span>
      )}
      <div className="grid min-w-0 flex-1 gap-xs">
        <p className="type-h3 truncate">{details.title}</p>
        <p className="type-body text-muted-text">
          {details.date} · {details.time}
        </p>
        <p className="type-body truncate text-muted-text">{details.location}</p>
        <StatusBadges event={event} />
      </div>
      <div className="flex flex-wrap gap-sm sm:flex-col sm:items-stretch lg:flex-row">
        {event.published ? (
          <Link
            to="/events/$eventId"
            params={{ eventId: event.id }}
            className="focus-ring rounded-full"
          >
            <Button type="button" variant="outline" size="sm" disabled={actionsDisabled}>
              View
            </Button>
          </Link>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title="Publish this event to view its public page."
          >
            View
          </Button>
        )}
        <Link
          to="/app/create-event"
          search={{ edit: event.id }}
          className="focus-ring rounded-full"
        >
          <Button type="button" variant="outline" size="sm" disabled={actionsDisabled}>
            Edit
          </Button>
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={busy}
          disabled={actionsDisabled}
          onClick={() => void onTogglePublished(event)}
        >
          {event.published ? "Unpublish" : "Publish"}
        </Button>
      </div>
    </li>
  );
}

function OrganizerEventsPage() {
  const { events, loading, error, notice, actionError, busyId, refresh, togglePublished, dismissNotice } =
    useOrganizerEvents();

  return (
    <div className="grid gap-lg">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h2 className="type-h2">My events</h2>
          <p className="type-body mt-xs text-muted-text">
            Only your real database events appear here — demo content is never listed.
          </p>
        </div>
        <Link to="/app/create-event" className="focus-ring rounded-full">
          <Button
            type="button"
            variant="primary"
            size="sm"
            leadingIcon={<CalendarPlus aria-hidden className="size-4" />}
          >
            Create an event
          </Button>
        </Link>
      </div>

      {notice ? (
        <div className="flex items-start justify-between gap-md rounded-lg border border-accent/30 bg-accent/10 p-md">
          <p className="type-body" role="status">
            {notice}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={dismissNotice}>
            Dismiss
          </Button>
        </div>
      ) : null}
      {actionError ? (
        <div className="flex items-start justify-between gap-md rounded-lg border border-transactional/40 bg-transactional/10 p-md">
          <p className="type-body text-transactional" role="alert">
            {actionError}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={dismissNotice}>
            Dismiss
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-md" aria-label="Loading your events">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="We couldn't load your events."
          description={error}
          onRetry={refresh}
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<FolderKanban aria-hidden className="size-5" />}
          title="No events yet."
          description="Events you post will show up here as drafts or published listings. Demo events are never included."
          action={
            <Link to="/app/create-event" className="focus-ring rounded-full">
              <Button leadingIcon={<CalendarPlus aria-hidden className="size-4" />}>
                Create an event
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-md">
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              busyId={busyId}
              onTogglePublished={togglePublished}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
