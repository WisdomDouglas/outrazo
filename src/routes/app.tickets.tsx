import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Compass,
  MapPin,
  QrCode,
  Ticket,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { EventCard } from "@/design-system/components/EventCard";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useAuth } from "@/showcase/auth/auth-context";
import { cancelReservation, fetchMyReservations, type MyReservation } from "@/showcase/rsvp/rsvp";
import { refreshLiveCount } from "@/showcase/rsvp/live-count-store";
import { classifyReservationError, formatReservationDate } from "@/showcase/rsvp/reservation-helpers";
import { rememberReturnTo } from "@/showcase/saved/saved-events-store";
import { TicketsHeroBackdrop } from "@/showcase/rsvp/TicketsHeroBackdrop";
import { formatKoboToNaira } from "@/showcase/promotions/promotion-windows";
import { TicketStatusBadge } from "@/showcase/tickets/TicketOrderStatusPanel";
import { useMyTicketOrders as usePaidTicketOrders } from "@/showcase/tickets/use-ticket-orders";
import { EVENTS, toEventCardProps } from "@/showcase/sample-data";

export const Route = createFileRoute("/app/tickets")({
  head: () => ({
    meta: [
      { title: "My Tickets — Outrazo" },
      { name: "description", content: "Your Outrazo tickets and RSVPs." },
      { property: "og:title", content: "My Tickets — Outrazo" },
      { property: "og:description", content: "View your Outrazo tickets and RSVPs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TicketsPage,
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
      setNotice("Reservation cancelled successfully.");
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
    <div className="min-h-screen bg-canvas text-primary-text">
      {/* =========================================================================
          HERO SECTION: Blends smoothly into background in both themes
          ========================================================================= */}
      <section className="relative isolate overflow-hidden border-b border-line/60 px-3.5 pt-6 pb-8 sm:px-6 sm:pt-8 sm:pb-12 lg:px-8">
        <TicketsHeroBackdrop />

        <div className="mx-auto max-w-[1000px]">
          {/* Top navigation row */}
          <div className="mb-5 sm:mb-8 flex items-center justify-between gap-3">
            <Link
              to="/app/explore"
              className="focus-ring group inline-flex items-center gap-1.5 rounded-full border border-line bg-card/70 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-muted-text hover:text-primary-text hover:border-line-strong transition-colors"
              aria-label="Back to Explore"
            >
              <ArrowLeft
                aria-hidden="true"
                className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5"
              />
              <span>Explore events</span>
            </Link>

            {userId && !loading && tickets.length > 0 ? (
              <Badge variant="accent" className="text-xs py-1 px-3">
                <Ticket aria-hidden="true" className="size-3" />
                <span>
                  {tickets.length} Confirmed {tickets.length === 1 ? "Pass" : "Passes"}
                </span>
              </Badge>
            ) : null}
          </div>

          {/* Hero Narrative */}
          <div className="max-w-[620px]">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-primary-text leading-tight mb-2">
              My Tickets &amp; Passes
            </h1>
            <p className="type-body text-muted-text text-xs sm:text-sm">
              Your confirmed reservations, digital event passes, and entry credentials.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          MAIN TICKETS FEED & LIST
          ========================================================================= */}
      <main className="mx-auto w-full max-w-[1000px] px-3.5 sm:px-6 py-6 sm:py-10 lg:px-8">
        {/* Notice alert */}
        {notice ? (
          <div
            role="status"
            className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-xs sm:text-sm text-primary-text"
          >
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="focus-ring rounded-full text-muted-text hover:text-primary-text"
              aria-label="Dismiss notice"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        ) : null}

        {userId ? <PaidTicketOrders /> : null}

        {/* Loading Skeletons */}
        {authLoading || loading ? (
          <div className="grid gap-4 sm:gap-6" aria-label="Loading your tickets">
            {[0, 1, 2].map((key) => (
              <div
                key={key}
                className="rounded-2xl border border-line bg-card p-4 sm:p-6 shadow-card"
              >
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <Skeleton className="h-24 w-full sm:w-32 rounded-xl" />
                  <div className="flex-1 grid gap-2 w-full">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !userId ? (
          /* Signed out state */
          <EmptyState
            className="mt-6"
            icon={<Ticket aria-hidden="true" className="size-6 text-accent" />}
            title="Sign in to view your tickets."
            description="Your reservations and digital access passes are saved to your account."
            action={
              <Button onClick={goToLogin} variant="primary">
                Sign in
              </Button>
            }
          />
        ) : error ? (
          /* Error State */
          <ErrorState
            title="We couldn't load your tickets."
            description={error}
            onRetry={refresh}
          />
        ) : tickets.length === 0 ? (
          /* Empty State + Recommended Events */
          <div className="space-y-12">
            <div className="rounded-2xl border border-dashed border-line bg-card/40 p-8 sm:p-12 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-accent/10 text-accent mb-3">
                <Ticket aria-hidden="true" className="size-6" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-primary-text mb-1">
                No tickets or reservations yet
              </h2>
              <p className="type-body text-muted-text text-xs sm:text-sm max-w-[420px] mx-auto mb-5">
                When you RSVP or claim a spot for a concert, festival, or tech summit, your digital pass will appear here.
              </p>
              <Link to="/events" search={{}} className="focus-ring rounded-full inline-block">
                <Button variant="primary" size="sm">
                  Explore Live Events
                </Button>
              </Link>
            </div>

            {/* Popular Upcoming Events Fallback */}
            <section className="pt-8 border-t border-line/60">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="type-h3 text-base sm:text-lg">Events you might like</h3>
                  <p className="type-caption text-muted-text text-xs mt-0.5">
                    Discover top experiences happening across Nigeria
                  </p>
                </div>
                <Link
                  to="/events"
                  search={{}}
                  className="focus-ring type-caption text-accent hover:underline hidden sm:inline"
                >
                  View all
                </Link>
              </div>

              <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {EVENTS.slice(0, 3).map((event) => (
                  <EventCard key={event.id} {...toEventCardProps(event)} />
                ))}
              </div>
            </section>
          </div>
        ) : (
          /* Confirmed Digital Ticket Passes List */
          <ul className="grid gap-4 sm:gap-6" aria-label="Confirmed tickets list">
            {tickets.map((ticket) => (
              <li
                key={ticket.eventId}
                className="group relative rounded-2xl border border-line bg-card shadow-card transition-all duration-200 hover:border-line-strong overflow-hidden"
              >
                <div className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_auto] items-stretch">
                  {/* Left / Main Pass Information */}
                  <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center min-w-0">
                    {/* Event thumbnail */}
                    {ticket.event.imageSrc ? (
                      <Link
                        to="/events/$eventId"
                        params={{ eventId: ticket.eventId }}
                        className="focus-ring relative h-28 sm:h-24 w-full sm:w-32 shrink-0 rounded-xl overflow-hidden bg-elevated block"
                        aria-label={`View ${ticket.event.title}`}
                      >
                        <img
                          src={ticket.event.imageSrc}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      </Link>
                    ) : null}

                    {/* Pass Details */}
                    <div className="min-w-0 flex-1 grid gap-1 sm:gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
                          <Check aria-hidden="true" className="size-3" />
                          <span>Confirmed RSVP</span>
                        </span>
                        <span className="text-[11px] text-muted-text font-mono">
                          ID: {ticket.eventId.slice(0, 8).toUpperCase()}
                        </span>
                      </div>

                      <Link
                        to="/events/$eventId"
                        params={{ eventId: ticket.eventId }}
                        className="focus-ring rounded-sm inline-block"
                      >
                        <h2 className="text-base sm:text-lg font-bold text-primary-text leading-snug line-clamp-1 hover:text-accent transition-colors">
                          {ticket.event.title}
                        </h2>
                      </Link>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-text mt-0.5">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar aria-hidden="true" className="size-3 text-accent shrink-0" />
                          <span>
                            {ticket.event.date}
                            {ticket.event.time ? ` · ${ticket.event.time}` : ""}
                          </span>
                        </span>

                        <span className="inline-flex items-center gap-1.5 truncate">
                          <MapPin aria-hidden="true" className="size-3 text-accent shrink-0" />
                          <span className="truncate">{ticket.event.location}</span>
                        </span>
                      </div>

                      <p className="text-[11px] text-subtle-text flex items-center gap-1 mt-0.5">
                        <Clock aria-hidden="true" className="size-3 shrink-0" />
                        <span>Reserved {formatReservationDate(ticket.reservedAt)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Desktop Vertical Perforation Divider */}
                  <div className="hidden sm:flex flex-col items-center justify-between py-2 relative">
                    <div className="size-3 rounded-full bg-canvas -mt-3.5 border-b border-line" />
                    <div className="w-[1px] h-full border-l border-dashed border-line my-1" />
                    <div className="size-3 rounded-full bg-canvas -mb-3.5 border-t border-line" />
                  </div>

                  {/* Mobile Horizontal Perforation Line */}
                  <div className="sm:hidden relative border-t border-dashed border-line mx-4 my-1">
                    <div className="absolute -left-5 -top-2 size-4 rounded-full bg-canvas border-r border-line" />
                    <div className="absolute -right-5 -top-2 size-4 rounded-full bg-canvas border-l border-line" />
                  </div>

                  {/* Right / Stub Action Panel */}
                  <div className="p-4 sm:p-5 flex sm:flex-col items-center justify-between sm:justify-center gap-2.5 sm:w-44 bg-card/60 shrink-0">
                    <div className="hidden sm:flex flex-col items-center gap-1 text-muted-text">
                      <QrCode aria-hidden="true" className="size-7" />
                      <span className="text-[10px] uppercase tracking-wider font-mono">Admission Pass</span>
                    </div>

                    <div className="flex items-center sm:flex-col gap-2 w-full justify-end">
                      <Link
                        to="/events/$eventId"
                        params={{ eventId: ticket.eventId }}
                        className="focus-ring rounded-xl w-full"
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busyId !== null}
                          className="w-full text-xs font-semibold h-8"
                        >
                          View event
                        </Button>
                      </Link>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={busyId === ticket.eventId}
                        disabled={busyId !== null}
                        onClick={() => void cancel(ticket.eventId)}
                        className="w-full text-xs text-muted-text hover:text-transactional h-8"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function PaidTicketOrders() {
  const paid = usePaidTicketOrders();
  if (paid.loading) {
    return (
      <section aria-label="Paid tickets" className="mb-6 grid gap-4 sm:mb-10">
        <h2 className="type-h3">Paid tickets</h2>
        <Skeleton className="h-32 rounded-2xl" />
      </section>
    );
  }
  if (paid.error) {
    return (
      <section aria-label="Paid tickets" className="mb-6 grid gap-4 sm:mb-10">
        <h2 className="type-h3">Paid tickets</h2>
        <ErrorState title="We couldn't load your paid tickets." description={paid.error} onRetry={paid.refresh} />
      </section>
    );
  }
  if (paid.orders.length === 0) return null;
  return (
    <section aria-label="Paid tickets" className="mb-6 grid gap-4 sm:mb-10">
      <h2 className="type-h3">Paid tickets</h2>
      {paid.notice ? (
        <p className="type-body rounded-lg border border-line bg-card px-md py-sm" role="status">{paid.notice}</p>
      ) : null}
      {paid.actionError ? (
        <p className="type-body rounded-lg border border-line bg-card px-md py-sm text-transactional" role="alert">{paid.actionError}</p>
      ) : null}
      <ul className="grid gap-4 sm:gap-6">
        {paid.orders.map((order) => {
          const ticketCount = order.lines.reduce((sum, line) => sum + line.quantity, 0);
          return (
            <li key={order.orderId} className="rounded-2xl border border-line bg-card p-4 sm:p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-sm">
                <div className="min-w-0">
                  <Link to="/events/$eventId" params={{ eventId: order.eventId }} className="focus-ring rounded-sm inline-block">
                    <h3 className="text-base sm:text-lg font-bold leading-snug hover:text-accent transition-colors">{order.eventTitle}</h3>
                  </Link>
                  <p className="type-body mt-xs text-muted-text">
                    {order.lines.map((line) => `${line.quantity} × ${line.tierName}`).join(" · ")}
                  </p>
                  <p className="type-caption mt-xs font-mono text-muted-text">Order {order.reference}</p>
                </div>
                <div className="grid justify-items-end gap-xs">
                  <TicketStatusBadge status={order.status} />
                  <p className="type-h3">{formatKoboToNaira(order.totalKobo)}</p>
                </div>
              </div>
              <div className="mt-md flex flex-wrap gap-sm">
                <Link
                  to="/app/tickets/success"
                  search={{ order: order.orderId }}
                  className="focus-ring rounded-full"
                >
                  <Button type="button" variant="outline" size="sm">View</Button>
                </Link>
                {order.status === "pending" ? (
                  <>
                    <Button
                      type="button"
                      variant="transactional"
                      size="sm"
                      loading={paid.busyId === order.orderId}
                      disabled={paid.busyId !== null}
                      onClick={() => void paid.resumeOrder(order)}
                    >
                      Complete payment
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={paid.busyId === order.orderId}
                      disabled={paid.busyId !== null}
                      onClick={() => void paid.cancelOrder(order.orderId)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
