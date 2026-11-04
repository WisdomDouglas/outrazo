import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { Button } from "@/design-system/components/Button";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useAuth } from "@/showcase/auth/auth-context";
import { TicketOrderStatusPanel } from "@/showcase/tickets/TicketOrderStatusPanel";
import { useMyTicketOrders, useTicketOrderStatus } from "@/showcase/tickets/use-ticket-orders";

const searchSchema = z.object({ order: z.string().uuid().optional() });

export const Route = createFileRoute("/app/tickets/cancelled")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Payment Cancelled — Outrazo" },
      { name: "description", content: "Ticket checkout cancelled." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TicketCancelledPage,
});

function TicketCancelledPage() {
  const { order: orderId } = Route.useSearch();
  const { displayName } = useAuth();
  const { order, loading, polling, error, refresh } = useTicketOrderStatus(orderId);
  const { resumeOrder, busyId } = useMyTicketOrders();

  return (
    <div className="mx-auto grid w-full max-w-[720px] gap-lg px-md py-xl lg:px-xl">
      <div>
        <h2 className="type-h2">Checkout cancelled</h2>
        <p className="type-body mt-xs text-muted-text">
          No payment was made. Your tickets are only reserved once payment confirms.
        </p>
      </div>

      {!orderId ? (
        <ErrorState title="No order to show" description="Your tickets list has your latest orders." />
      ) : loading && !order ? (
        <Skeleton className="h-56 rounded-lg" />
      ) : error ? (
        <ErrorState title="Could not load this order" description={error} onRetry={refresh} />
      ) : order ? (
        <TicketOrderStatusPanel
          order={order}
          holderName={displayName}
          polling={polling}
          onRefresh={refresh}
          onResume={() => void resumeOrder(order)}
          resuming={busyId === order.orderId}
        />
      ) : null}

      <div className="flex flex-wrap gap-sm">
        <Link to="/app/tickets" className="focus-ring w-fit rounded-full">
          <Button type="button" variant="outline" size="sm">
            Back to my tickets
          </Button>
        </Link>
        {order ? (
          <Link to="/events/$eventId" params={{ eventId: order.eventId }} className="focus-ring w-fit rounded-full">
            <Button type="button" variant="transactional" size="sm">
              Back to event
            </Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
