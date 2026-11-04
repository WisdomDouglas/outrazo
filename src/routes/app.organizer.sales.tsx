import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarPlus, FolderKanban, Ticket } from "lucide-react";
import { useState } from "react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useEarningsSummary } from "@/showcase/organizer/use-earnings";
import { useOrganizerEvents } from "@/showcase/organizer/use-organizer-events";
import { useEventSales, useOrganizerSalesSnapshot } from "@/showcase/organizer/use-organizer-sales";
import { formatKoboToNaira } from "@/showcase/promotions/promotion-windows";
import { TicketStatusBadge } from "@/showcase/tickets/TicketOrderStatusPanel";

export const Route = createFileRoute("/app/organizer/sales")({
  head: () => ({ meta: [
    { title: "Ticket Sales — Organizer Dashboard — Outrazo" },
    { name: "description", content: "Ticket orders and revenue per event." },
  ] }),
  component: OrganizerSalesPage,
});

function OrganizerSalesPage() {
  const { events, loading: eventsLoading, error: eventsError, refresh: refreshEvents } = useOrganizerEvents();
  const { snapshot, loading, error, refresh } = useOrganizerSalesSnapshot();
  const earnings = useEarningsSummary();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? events[0]?.id ?? null;
  const detail = useEventSales(activeId);

  if (eventsLoading || loading) {
    return (
      <div className="grid gap-md" aria-label="Loading ticket sales">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (eventsError) {
    return <ErrorState title="We couldn't load your events." description={eventsError} onRetry={refreshEvents} />;
  }
  if (error || !snapshot) {
    return <ErrorState title="We couldn't load ticket sales." description={error ?? "Please try again."} onRetry={refresh} />;
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<FolderKanban aria-hidden className="size-5" />}
        title="No events yet."
        description="Create an event first — its ticket sales will appear here."
        action={
          <Link to="/app/create-event" className="focus-ring rounded-full">
            <Button leadingIcon={<CalendarPlus aria-hidden className="size-4" />}>Create an event</Button>
          </Link>
        }
      />
    );
  }

  const stats = [
    { label: "Revenue collected", value: formatKoboToNaira(snapshot.grossKobo) },
    { label: "Tickets sold", value: String(snapshot.ticketsSold) },
    { label: "Paid orders", value: String(snapshot.paidOrders) },
    { label: "Pending checkouts", value: String(snapshot.pendingOrders) },
  ];

  return (
    <div className="grid gap-xl">
      <div>
        <h2 className="type-h2">Ticket sales</h2>
        <p className="type-body mt-xs text-muted-text">
          Paid orders across your own events. Pending checkouts hold no tickets and earn nothing until paid.
        </p>
      </div>

      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-line bg-card p-lg shadow-card">
            <p className="type-h1">{stat.value}</p>
            <p className="type-body mt-xs text-muted-text">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-md">
        <div>
          <h3 className="type-h3">Earnings</h3>
          <p className="type-body mt-xs text-muted-text">
            Your share after the platform fee. Each event locks its rate when published, so these
            figures never change when the platform default changes.
          </p>
        </div>
        {earnings.loading ? (
          <Skeleton className="h-28 rounded-lg" />
        ) : earnings.error || !earnings.snapshot ? (
          <ErrorState
            title="We couldn't load earnings."
            description={earnings.error ?? "Please try again."}
            onRetry={earnings.refresh}
          />
        ) : (
          <>
            <div className="grid gap-md sm:grid-cols-3">
              {[
                { label: "Platform fees", value: formatKoboToNaira(earnings.snapshot.feeKobo) },
                { label: "Net earnings", value: formatKoboToNaira(earnings.snapshot.netKobo) },
                { label: "Available for payout", value: formatKoboToNaira(earnings.snapshot.availableKobo) },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border border-line bg-card p-lg shadow-card">
                  <p className="type-h1">{stat.value}</p>
                  <p className="type-body mt-xs text-muted-text">{stat.label}</p>
                </div>
              ))}
            </div>
            {earnings.snapshot.events.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
                <table className="w-full min-w-[680px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      {["Event", "Rate", "Gross", "Fee", "Net"].map((column) => (
                        <th key={column} scope="col" className="type-caption px-md py-sm font-semibold tracking-wide text-muted-text uppercase">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {earnings.snapshot.events.map((event) => (
                      <tr key={event.eventId} className="border-b border-line align-top last:border-0">
                        <td className="type-body px-md py-sm font-medium">{event.eventTitle}</td>
                        <td className="type-body px-md py-sm text-muted-text">{event.ratePct}%</td>
                        <td className="type-body px-md py-sm text-muted-text">{formatKoboToNaira(event.grossKobo)}</td>
                        <td className="type-body px-md py-sm text-muted-text">{formatKoboToNaira(event.feeKobo)}</td>
                        <td className="type-body px-md py-sm font-medium">{formatKoboToNaira(event.netKobo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </div>

      {snapshot.events.length === 0 ? (
        <EmptyState
          icon={<Ticket aria-hidden className="size-5" />}
          title="No ticket sales yet."
          description="When buyers pay for your events, per-event revenue and tier breakdowns appear here."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {["Event", "Paid orders", "Tickets", "Revenue"].map((column) => (
                  <th key={column} scope="col" className="type-caption px-md py-sm font-semibold tracking-wide text-muted-text uppercase">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.events.map((event) => (
                <tr key={event.eventId} className="border-b border-line align-top last:border-0">
                  <td className="type-body px-md py-sm font-medium">
                    {snapshot.eventTitles[event.eventId] ?? "Unknown event"}
                    {event.tiers.length > 0 ? (
                      <details className="mt-xs">
                        <summary className="type-caption focus-ring cursor-pointer text-muted-text">Tier breakdown</summary>
                        <ul className="type-caption mt-xs grid gap-xs text-muted-text">
                          {event.tiers.map((tier) => (
                            <li key={tier.tierId ?? tier.tierName}>
                              {tier.ticketsSold} × {tier.tierName} · {formatKoboToNaira(tier.grossKobo)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </td>
                  <td className="type-body px-md py-sm text-muted-text">{event.paidOrders}</td>
                  <td className="type-body px-md py-sm text-muted-text">{event.ticketsSold}</td>
                  <td className="type-body px-md py-sm font-medium">{formatKoboToNaira(event.grossKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-md">
        <label className="grid max-w-md gap-sm">
          <span className="type-caption text-muted-text">Order history for</span>
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

        {detail.loading ? (
          <Skeleton className="h-48 rounded-lg" />
        ) : detail.error ? (
          <ErrorState title="We couldn't load these orders." description={detail.error} onRetry={detail.refresh} />
        ) : detail.orders.length === 0 ? (
          <EmptyState
            icon={<Ticket aria-hidden className="size-5" />}
            title="No orders for this event yet."
            description="Paid and pending checkouts will be listed here with their ticket lines."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Reference", "Tickets", "Total", "Status", "Ordered"].map((column) => (
                    <th key={column} scope="col" className="type-caption px-md py-sm font-semibold tracking-wide text-muted-text uppercase">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.orders.map((order) => (
                  <tr key={order.id} className="border-b border-line align-top last:border-0">
                    <td className="type-caption px-md py-sm font-mono text-muted-text">{order.reference}</td>
                    <td className="type-body px-md py-sm text-muted-text">
                      {order.lines.map((line) => `${line.quantity} × ${line.tierName}`).join(" · ")}
                    </td>
                    <td className="type-body px-md py-sm font-medium">{formatKoboToNaira(order.totalKobo)}</td>
                    <td className="px-md py-sm"><TicketStatusBadge status={order.status} /></td>
                    <td className="type-body px-md py-sm whitespace-nowrap text-muted-text">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
