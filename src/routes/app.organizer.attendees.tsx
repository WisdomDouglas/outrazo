import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarPlus, FolderKanban, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { Avatar } from "@/design-system/components/Avatar";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useAuth } from "@/showcase/auth/auth-context";
import { useOrganizerEvents } from "@/showcase/organizer/use-organizer-events";
import { fetchEventAttendees, type EventAttendee } from "@/showcase/rsvp/rsvp";
import { attendeeDisplayName, classifyReservationError, formatReservationDate } from "@/showcase/rsvp/reservation-helpers";

export const Route = createFileRoute("/app/organizer/attendees")({
  head: () => ({ meta: [
    { title: "Attendees — Organizer Dashboard — Outrazo" },
    { name: "description", content: "See who reserved a spot at your own events." },
  ] }),
  component: OrganizerAttendeesPage,
});

function OrganizerAttendeesPage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { events, loading: eventsLoading, error: eventsError, refresh: refreshEvents } = useOrganizerEvents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);

  const activeId = selectedId ?? events[0]?.id ?? null;

  useEffect(() => {
    if (!activeId || !userId) {
      setAttendees([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetchEventAttendees(activeId).then(
      (rows) => {
        if (!active) return;
        setAttendees(rows);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(classifyReservationError(caught, "load").message);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [activeId, userId, request]);

  if (eventsLoading) {
    return (
      <div className="grid gap-md" aria-label="Loading your events">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (eventsError) {
    return <ErrorState title="We couldn't load your events." description={eventsError} onRetry={refreshEvents} />;
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<FolderKanban aria-hidden className="size-5" />}
        title="No events yet."
        description="Create an event first — its RSVPs will appear here."
        action={
          <Link to="/app/create-event" className="focus-ring rounded-full">
            <Button leadingIcon={<CalendarPlus aria-hidden className="size-4" />}>Create an event</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-lg">
      <div>
        <h2 className="type-h2">Attendees</h2>
        <p className="type-body mt-xs text-muted-text">
          Only people who reserved your own events appear here — {attendees.length} {attendees.length === 1 ? "person" : "people"} below.
        </p>
      </div>

      <label className="grid max-w-md gap-sm">
        <span className="type-caption text-muted-text">Event</span>
        <select
          value={activeId ?? ""}
          onChange={(selectEvent) => setSelectedId(selectEvent.currentTarget.value || null)}
          className="type-body h-12 rounded-md border border-line bg-card px-md text-primary-text outline-none focus:border-accent"
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>{event.details.title}</option>
          ))}
        </select>
      </label>

      {loading ? (
        <div className="grid gap-md" aria-label="Loading attendees">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="We couldn't load attendees."
          description={error}
          onRetry={() => setRequest((current) => current + 1)}
        />
      ) : attendees.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden className="size-5" />}
          title="No RSVPs yet."
          description="When someone reserves a spot at this event, they'll show up here."
        />
      ) : (
        <ul className="grid gap-md">
          {attendees.map((attendee) => (
            <li key={attendee.userId} className="flex items-center gap-md rounded-lg border border-line bg-card p-md shadow-card">
              <Avatar name={attendeeDisplayName(attendee)} src={attendee.avatarUrl ?? undefined} size="lg" />
              <div className="grid min-w-0 flex-1 gap-xs">
                <p className="type-body truncate font-semibold text-primary-text">{attendeeDisplayName(attendee)}</p>
                <p className="type-caption truncate text-muted-text">Reserved {formatReservationDate(attendee.reservedAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
