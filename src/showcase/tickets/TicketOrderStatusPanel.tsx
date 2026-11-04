// Shared ticket order status panel (P1). Renders ONLY what the
// server-reported order row says: landing on a return page proves nothing,
// so every claim here traces to the database status.
import { Link } from "@tanstack/react-router";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { formatKoboToNaira } from "@/showcase/promotions/promotion-windows";
import { TICKET_STATUS_LABELS } from "./ticket-orders";
import { TicketPassList } from "./TicketPass";
import type { TicketOrderSummary } from "./ticket-functions";

export function TicketStatusBadge({ status }: { status: string }) {
  const label = (TICKET_STATUS_LABELS as Record<string, string>)[status] ?? status;
  if (status === "paid") return <Badge variant="accent">{label}</Badge>;
  if (status === "pending") return <Badge variant="outline">{label}</Badge>;
  if (status === "failed") return <Badge variant="transactional">{label}</Badge>;
  return <Badge variant="neutral">{label}</Badge>;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "—";
  return new Date(time).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TicketOrderStatusPanel({
  order,
  holderName,
  polling,
  onRefresh,
  onResume,
  resuming,
}: {
  order: TicketOrderSummary;
  holderName: string;
  polling: boolean;
  onRefresh: () => void;
  onResume?: () => void;
  resuming?: boolean;
}) {
  const ticketCount = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <section className="grid gap-md rounded-lg border border-line bg-card p-md shadow-card" aria-label="Ticket order status">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="type-h3">
          {ticketCount} {ticketCount === 1 ? "ticket" : "tickets"} · {formatKoboToNaira(order.totalKobo)}
        </p>
        <TicketStatusBadge status={order.status} />
      </div>

      <ul className="grid gap-xs">
        {order.lines.map((line) => (
          <li key={`${line.tierId ?? line.tierName}`} className="type-body flex items-center justify-between gap-sm text-muted-text">
            <span>{line.quantity} × {line.tierName}</span>
            <span>{formatKoboToNaira(line.unitKobo * line.quantity)}</span>
          </li>
        ))}
      </ul>

      <p className="type-caption text-muted-text">
        Order {order.reference}
        {order.paidAt ? ` · paid ${formatDateTime(order.paidAt)}` : ` · started ${formatDateTime(order.createdAt)}`}
      </p>

      {order.status === "pending" && polling ? (
        <p className="type-body text-muted-text" role="status">
          Confirming your payment — this usually takes a few seconds. This page updates automatically.
        </p>
      ) : null}

      {order.status === "pending" && !polling ? (
        <div className="grid gap-sm">
          <p className="type-body text-muted-text">
            Still awaiting payment confirmation. If you already paid, the confirmation is on its way.
          </p>
          <div className="flex flex-wrap gap-sm">
            <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
              Check again
            </Button>
            {onResume ? (
              <Button type="button" variant="transactional" size="sm" loading={resuming} onClick={onResume}>
                Resume checkout
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {order.status === "paid" ? (
        <div className="grid gap-md">
          <p className="type-body">
            Your tickets are confirmed. Show a code below at the door — each code admits one person, once.
          </p>
          <TicketPassList order={order} holderName={holderName} />
        </div>
      ) : null}

      {order.status === "expired" || order.status === "cancelled" ? (
        <div className="grid gap-sm">
          <p className="type-body text-muted-text">
            {order.status === "expired"
              ? "This checkout session expired before payment completed. No payment was made."
              : "This checkout was cancelled. No payment was made."}{" "}
            You can start a fresh order any time.
          </p>
          <Link to="/events/$eventId" params={{ eventId: order.eventId }} className="focus-ring w-fit rounded-full">
            <Button type="button" variant="transactional" size="sm">
              Back to event
            </Button>
          </Link>
        </div>
      ) : null}

      {order.status === "failed" ? (
        <div className="grid gap-sm">
          <p className="type-body text-muted-text">
            This payment could not be completed
            {order.statusReason === "amount_mismatch" || order.statusReason === "activation_rejected"
              ? ", but money may have moved. It has been recorded for a manual refund — contact support with your order reference and you will not lose it"
              : ". No tickets were issued"}
            .
          </p>
          <Link to="/events/$eventId" params={{ eventId: order.eventId }} className="focus-ring w-fit rounded-full">
            <Button type="button" variant="transactional" size="sm">
              Try again
            </Button>
          </Link>
        </div>
      ) : null}
    </section>
  );
}
