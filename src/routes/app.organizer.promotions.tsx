import { useEffect, useState } from "react";

import { createFileRoute, Link } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useAuth } from "@/showcase/auth/auth-context";
import { fetchOrganizerEvents, type OrganizerEvent } from "@/showcase/organizer/organizer-events";
import { ORDER_STATUS_LABELS, formatKoboToNgn } from "@/showcase/promotions/paid-promotion-orders";
import type { PromotionOrderSummary } from "@/showcase/promotions/promotion-functions";
import { useMyPromotionOrders } from "@/showcase/promotions/use-promotion-orders";

export const Route = createFileRoute("/app/organizer/promotions")({
  head: () => ({ meta: [
    { title: "Promotions — Organizer Dashboard — Outrazo" },
    { name: "description", content: "Your paid event promotions and pending checkouts." },
  ] }),
  component: OrganizerPromotionsPage,
});

function StatusBadge({ status }: { status: string }) {
  const label = (ORDER_STATUS_LABELS as Record<string, string>)[status] ?? status;
  if (status === "paid") return <Badge variant="accent">{label}</Badge>;
  if (status === "pending") return <Badge variant="outline">{label}</Badge>;
  if (status === "refund_pending" || status === "refunded") {
    return <Badge variant="transactional">{label}</Badge>;
  }
  return <Badge variant="neutral">{label}</Badge>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "—";
  return new Date(time).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function OrderRow({
  order,
  eventTitle,
  busy,
  actionsDisabled,
  onCancel,
}: {
  order: PromotionOrderSummary;
  eventTitle: string;
  busy: boolean;
  actionsDisabled: boolean;
  onCancel: (orderId: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const pending = order.status === "pending";

  return (
    <li className="grid gap-sm rounded-lg border border-line bg-card p-md shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="type-h3 truncate">{eventTitle}</p>
        <StatusBadge status={order.status} />
      </div>
      <p className="type-body text-muted-text">
        {order.days} {order.days === 1 ? "day" : "days"} · {formatKoboToNgn(order.totalKobo)} ·{" "}
        ordered {formatDate(order.createdAt)}
        {order.paidAt ? ` · paid ${formatDate(order.paidAt)}` : ""}
      </p>
      <p className="type-body truncate font-mono text-[13px] text-muted-text">
        Ref: {order.providerReference}
      </p>
      {pending ? (
        <div className="flex flex-wrap gap-sm">
          <Link
            to="/app/organizer/promote/$eventId"
            params={{ eventId: order.eventId }}
            className="focus-ring rounded-full"
          >
            <Button type="button" variant="transactional" size="sm" disabled={actionsDisabled}>
              Resume checkout
            </Button>
          </Link>
          {confirming ? (
            <>
              <span className="type-body w-full text-muted-text">
                Cancel this pending checkout? No payment was made.
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={busy}
                onClick={() => {
                  setConfirming(false);
                  void onCancel(order.id);
                }}
              >
                Yes, cancel it
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Keep checkout
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actionsDisabled}
              onClick={() => setConfirming(true)}
            >
              Cancel checkout
            </Button>
          )}
        </div>
      ) : order.status === "paid" ? (
        <div className="flex flex-wrap gap-sm">
          <Link
            to="/events/$eventId"
            params={{ eventId: order.eventId }}
            className="focus-ring rounded-full"
          >
            <Button type="button" variant="outline" size="sm">
              View event
            </Button>
          </Link>
        </div>
      ) : null}
    </li>
  );
}

function OrganizerPromotionsPage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const orders = useMyPromotionOrders();
  const [events, setEvents] = useState<OrganizerEvent[]>([]);

  useEffect(() => {
    if (!userId) {
      setEvents([]);
      return;
    }
    let active = true;
    fetchOrganizerEvents(userId).then(
      (rows) => {
        if (active) setEvents(rows);
      },
      () => {
        if (active) setEvents([]);
      },
    );
    return () => {
      active = false;
    };
  }, [userId]);

  const titleFor = (eventId: string) =>
    events.find((event) => event.id === eventId)?.details.title ?? "Promoted event";

  return (
    <div className="grid gap-lg">
      <div>
        <h2 className="type-h2">Promotions</h2>
        <p className="type-body mt-xs text-muted-text">
          Your paid boosts and pending checkouts. Promotions activate only after verified payment.
        </p>
      </div>

      {orders.notice ? (
        <div className="rounded-lg border border-line bg-card p-md type-body" role="status">
          {orders.notice}{" "}
          <button type="button" className="focus-ring underline" onClick={orders.dismissNotice}>
            Dismiss
          </button>
        </div>
      ) : null}

      {orders.actionError ? (
        <p className="type-body text-transactional" role="alert">{orders.actionError}</p>
      ) : null}

      {orders.loading ? (
        <div className="grid gap-md" aria-label="Loading promotions">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : orders.error ? (
        <ErrorState
          title="Could not load your promotions"
          description={orders.error}
          onRetry={orders.refresh}
        />
      ) : orders.orders.length === 0 ? (
        <EmptyState
          icon={<Megaphone aria-hidden className="size-5" />}
          title="No promotions yet."
          description="Boost a published event to feature it across Outrazo discovery."
          action={
            <Link to="/app/organizer/events" className="focus-ring rounded-full">
              <Button type="button" variant="transactional" size="sm">
                View my events
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-md">
          {orders.orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              eventTitle={titleFor(order.eventId)}
              busy={orders.busyId === order.id}
              actionsDisabled={orders.busyId !== null}
              onCancel={orders.cancelOrder}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
