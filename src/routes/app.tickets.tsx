import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Ticket } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useAuth } from "@/showcase/auth/auth-context";
import { cancelReservation, fetchMyReservations, type MyReservation } from "@/showcase/rsvp/rsvp";
import { refreshLiveCount } from "@/showcase/rsvp/live-count-store";
import { classifyReservationError, formatReservationDate } from "@/showcase/rsvp/reservation-helpers";
import { rememberReturnTo } from "@/showcase/saved/saved-events-store";

export const Route = createFileRoute("/app/tickets")({
  head: () => ({ meta: [
    { title: "My Tickets — Outrazo" }, { name: "description", content: "Your Outrazo tickets and RSVPs." },
    { property: "og:title", content: "My Tickets — Outrazo" }, { property: "og:description", content: "View your Outrazo tickets and RSVPs." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: TicketsPage,
});

function TicketsPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user.id ?? null;
  const [tickets, setTickets] = useState<MyReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [request, setRequest] = useState(0);

  const refresh = useCallback(() => setRequest((current) => current + 1), []);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setTickets([]);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetchMyReservations(userId).then(
      (rows) => {
        if (!active) return;
        setTickets(rows);
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
  }, [authLoading, userId, request]);

  const cancel = async (eventId: string) => {
    if (!userId || busyId) return;
    setBusyId(eventId);
    setNotice(null);
    try {
      await cancelReservation(eventId, userId);
      setTickets((current) => current.filter((ticket) => ticket.eventId !== eventId));
      void refreshLiveCount(eventId);
      setNotice("Reservation cancelled.");
    } catch (caught: unknown) {
      setError(classifyReservationError(caught, "cancel").message);
    } finally {
      setBusyId(null);
    }
  };

  const goToLogin = () => {
    rememberReturnTo("/app/tickets");
    void navigate({ to: "/login" });
  };

  return (
    <div className="mx-auto w-full max-w-[900px] px-md py-xl lg:px-xl lg:py-2xl">
      <h1 className="type-h1">My Tickets</h1>
      <p className="type-body-lg mt-sm text-muted-text">Your tickets and confirmed RSVPs live here.</p>

      {notice ? (
        <div className="mt-lg flex items-start justify-between gap-md rounded-lg border border-accent/30 bg-accent/10 p-md">
          <p className="type-body" role="status">{notice}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setNotice(null)}>Dismiss</Button>
        </div>
      ) : null}

      {authLoading || loading ? (
        <div className="mt-xl grid gap-md" aria-label="Loading your tickets">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : !userId ? (
        <EmptyState
          className="mt-xl"
          icon={<Ticket aria-hidden className="size-5" />}
          title="Sign in to see your tickets."
          description="Your reservations are saved on your account."
          action={<Button onClick={goToLogin}>Sign in</Button>}
        />
      ) : error ? (
        <div className="mt-xl">
          <ErrorState title="We couldn't load your tickets." description={error} onRetry={refresh} />
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState className="mt-xl" icon={<Ticket aria-hidden className="size-5" />} title="No tickets yet." description="When you reserve a spot, your ticket will appear here." action={<Link to="/app/explore" className="focus-ring rounded-full"><Button>Find an event</Button></Link>} />
      ) : (
        <ul className="mt-xl grid gap-md">
          {tickets.map((ticket) => (
            <li key={ticket.eventId} className="flex flex-col gap-md rounded-lg border border-line bg-card p-md shadow-card sm:flex-row sm:items-center">
              {ticket.event.imageSrc ? (
                <img src={ticket.event.imageSrc} alt="" className="h-20 w-full shrink-0 rounded-md object-cover sm:w-28" loading="lazy" />
              ) : null}
              <div className="grid min-w-0 flex-1 gap-xs">
                <p className="type-h3 truncate">{ticket.event.title}</p>
                <p className="type-body text-muted-text">{ticket.event.date} · {ticket.event.time}</p>
                <p className="type-body truncate text-muted-text">{ticket.event.location}</p>
                <p className="type-caption text-muted-text">Reserved {formatReservationDate(ticket.reservedAt)}</p>
              </div>
              <div className="flex flex-wrap gap-sm sm:flex-col sm:items-stretch lg:flex-row">
                <Link to="/events/$eventId" params={{ eventId: ticket.eventId }} className="focus-ring rounded-full">
                  <Button type="button" variant="outline" size="sm" disabled={busyId !== null}>View event</Button>
                </Link>
                <Button type="button" variant="outline" size="sm" loading={busyId === ticket.eventId} disabled={busyId !== null} onClick={() => void cancel(ticket.eventId)}>Cancel</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
