import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { Button } from "@/design-system/components/Button";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { SuccessRibbon } from "@/design-system/components/SuccessRibbon";
import { useAuth } from "@/showcase/auth/auth-context";
import { TicketOrderStatusPanel } from "@/showcase/tickets/TicketOrderStatusPanel";
import { useMyTicketOrders, useTicketOrderStatus } from "@/showcase/tickets/use-ticket-orders";

const searchSchema = z.object({ order: z.string().uuid().optional() });

export const Route = createFileRoute("/app/tickets/success")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Payment Complete — Outrazo" },
      { name: "description", content: "Ticket payment confirmation." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TicketSuccessPage,
});

function TicketSuccessPage() {
  const { order: orderId } = Route.useSearch();
  const { displayName } = useAuth();
  const { order, loading, polling, error, refresh } = useTicketOrderStatus(orderId);
  const { resumeOrder, busyId } = useMyTicketOrders();

  const ticketCount = order?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;

  return (
    <div className="mx-auto grid w-full max-w-[720px] gap-lg px-md py-xl lg:px-xl">
      {order?.status === "paid" ? (
        <SuccessRibbon
          key={order.orderId}
          detail={
            ticketCount > 0
              ? `${ticketCount} ${ticketCount === 1 ? "ticket" : "tickets"} · ${order.eventTitle}`
              : order.eventTitle
          }
        />
      ) : null}
      <div>
        <h2 className="type-h2">Payment complete</h2>
        <p className="type-body mt-xs text-muted-text">
          {order?.eventTitle ?? "Confirming your tickets with the payment provider."}
        </p>
      </div>

      {!orderId ? (
        <ErrorState
          title="No order to show"
          description="Return to your tickets and open the order again."
        />
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

      <Link to="/app/tickets" className="focus-ring w-fit rounded-full">
        <Button type="button" variant="outline" size="sm">
          Back to my tickets
        </Button>
      </Link>
    </div>
  );
}
