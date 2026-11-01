// Shared promotion order status panel (P2 Step 4B). Renders ONLY what the
// server-reported order row says: landing on a return page proves nothing,
// so every claim here traces to the database status.
import { Link } from "@tanstack/react-router";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { formatKoboToNgn, ORDER_STATUS_LABELS } from "./paid-promotion-orders";
import type { PromotionOrderSummary } from "./promotion-functions";

function StatusBadge({ status }: { status: string }) {
  const label =
    (ORDER_STATUS_LABELS as Record<string, string>)[status] ?? status;
  if (status === "paid") return <Badge variant="accent">{label}</Badge>;
  if (status === "pending") return <Badge variant="outline">{label}</Badge>;
  if (status === "refund_pending" || status === "refunded") {
    return <Badge variant="transactional">{label}</Badge>;
  }
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

export function PromotionOrderStatusPanel({
  order,
  polling,
  onRefresh,
}: {
  order: PromotionOrderSummary;
  polling: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="grid gap-md rounded-lg border border-line bg-card p-md shadow-card" aria-label="Promotion order status">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="type-h3">
          {order.days} {order.days === 1 ? "day" : "days"} · {formatKoboToNgn(order.totalKobo)}
        </p>
        <StatusBadge status={order.status} />
      </div>

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
            <Link
              to="/app/organizer/promote/$eventId"
              params={{ eventId: order.eventId }}
              className="focus-ring rounded-full"
            >
              <Button type="button" variant="transactional" size="sm">
                Resume checkout
              </Button>
            </Link>
          </div>
        </div>
      ) : null}

      {order.status === "paid" ? (
        <p className="type-body">
          Your promotion is active{order.paidAt ? ` since ${formatDateTime(order.paidAt)}` : ""} and
          runs for {order.days} {order.days === 1 ? "day" : "days"}. It now appears across Outrazo discovery.
        </p>
      ) : null}

      {order.status === "expired" || order.status === "failed" ? (
        <div className="grid gap-sm">
          <p className="type-body text-muted-text">
            {order.status === "expired"
              ? "This checkout session expired before payment completed. No payment was made."
              : "The payment attempt failed. No promotion was activated."}
          </p>
          <Link
            to="/app/organizer/promote/$eventId"
            params={{ eventId: order.eventId }}
            className="focus-ring w-fit rounded-full"
          >
            <Button type="button" variant="transactional" size="sm">
              Try again
            </Button>
          </Link>
        </div>
      ) : null}

      {order.status === "cancelled" ? (
        <p className="type-body text-muted-text">
          This checkout was cancelled. No payment was made. You can start a fresh promotion any time.
        </p>
      ) : null}

      {order.status === "refund_pending" || order.status === "refunded" ? (
        <p className="type-body text-muted-text">
          {order.status === "refund_pending"
            ? "Your payment was received, but the promotion could not be delivered automatically. Our team is reviewing it and will resolve it manually — you will not lose your money."
            : "This order was refunded. Contact support if anything looks wrong."}
        </p>
      ) : null}

      <dl className="grid gap-xs border-t border-line pt-sm type-body">
        <div className="flex items-center justify-between gap-md">
          <dt className="text-muted-text">Order reference</dt>
          <dd className="truncate font-mono text-[13px]">{order.providerReference}</dd>
        </div>
        <div className="flex items-center justify-between gap-md">
          <dt className="text-muted-text">Created</dt>
          <dd>{formatDateTime(order.createdAt)}</dd>
        </div>
      </dl>
    </section>
  );
}
