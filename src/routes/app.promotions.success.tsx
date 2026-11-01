import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { PromotionOrderStatusPanel } from "@/showcase/promotions/PromotionOrderStatusPanel";
import { usePromotionOrderStatus } from "@/showcase/promotions/use-promotion-orders";

// Bachs redirects here after the hosted checkout. The redirect itself proves
// NOTHING about payment: the order id below only selects which database row
// to read, and every claim on this page comes from that row.
export const Route = createFileRoute("/app/promotions/success")({
  validateSearch: (search: Record<string, unknown>): { order?: string } => ({
    order: typeof search.order === "string" && search.order.length > 0 ? search.order : undefined,
  }),
  head: () => ({ meta: [
    { title: "Payment Status — Outrazo" },
    { name: "description", content: "Promotion payment status." },
  ] }),
  component: PromotionSuccessPage,
});

function PromotionSuccessPage() {
  const { order: orderId } = Route.useSearch();
  const { order, loading, polling, error, refresh } = usePromotionOrderStatus(orderId);

  return (
    <div className="grid gap-lg">
      <div>
        <h2 className="type-h2">Payment status</h2>
        <p className="type-body mt-xs text-muted-text">
          {order?.status === "paid"
            ? "Payment confirmed."
            : "Checking your promotion payment with the server."}
        </p>
      </div>

      {!orderId ? (
        <EmptyState
          title="No order selected"
          description="This page needs an order to check. Open it from your promotions."
          action={
            <Link to="/app/organizer/promotions" className="focus-ring rounded-full">
              <Button type="button" variant="outline" size="sm">
                View promotions
              </Button>
            </Link>
          }
        />
      ) : loading && !order ? (
        <Skeleton className="h-48 w-full" aria-label="Loading order status" />
      ) : error ? (
        <ErrorState
          title="Could not load this order"
          description={error}
          onRetry={refresh}
        />
      ) : order ? (
        <PromotionOrderStatusPanel order={order} polling={polling} onRefresh={refresh} />
      ) : null}
    </div>
  );
}
