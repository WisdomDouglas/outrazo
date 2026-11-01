// Server-only promotion order reads + organizer cancellation (P2 Step 4B).
//
// Testable core behind thin createServerFn wrappers: own-order reads with
// explicit organizer checks (defense in depth over RLS), and user
// cancellation that re-verifies live money before releasing anything.
//
// Cancellation obeys the same money rule as creation-time recovery by
// reusing settleOrderByVerification: verified-paid money activates (never
// cancelled away), terminally unpaid releases, and anything ambiguous
// preserves the reservation. Orders with no stored session cancel directly
// — there is nothing to verify, and a payment landing afterwards still
// resolves through the webhook's late-payment path.
//
// Financial boundaries: incoming payments only. Cancellation releases a
// reservation; it never moves money. Verified money that cannot be
// delivered lands in refund_pending (via the existing activation RPC) for
// the MANUAL staff workflow.
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PromotionCheckoutError,
  type PromotionCheckoutClient,
  type PromotionOrderRow,
  settleOrderByVerification,
} from "./promotion-checkout.server";

export interface PromotionOrdersDeps {
  /** Server fetch for Bachs verification calls. */
  fetchImpl?: typeof fetch;
  /**
   * Reads run on the caller's own user client (RLS enforces ownership at
   * the database); cancellation needs the service-role client (writes).
   * Tests inject fakes for both.
   */
  supabase?: PromotionCheckoutClient;
}

/** Owner-safe order summary. Never includes the checkout URL. */
export interface PromotionOrderSummary {
  id: string;
  eventId: string;
  days: number;
  dailyKobo: number;
  totalKobo: number;
  currency: string;
  status: string;
  statusReason: string | null;
  providerReference: string;
  promotionId: string | null;
  paidAt: string | null;
  createdAt: string;
  checkoutExpiresAt: string | null;
}

export interface CancelPromotionOrderResult {
  orderId: string;
  /** True order status after the call — the UI renders from this. */
  status: string;
  promotionId: string | null;
  /**
   * Present when cancellation found verified money: the activation outcome
   * (paid, late-honored, or queued for manual refund) — never a silent drop.
   */
  activationOutcome?: "paid" | "paid_late_honored" | "refund_pending";
}

const ORDER_SUMMARY_COLUMNS =
  "id,event_id,organizer_id,days,daily_amount_kobo,total_amount_kobo,currency,status,status_reason,provider_reference,promotion_id,paid_at,created_at,checkout_expires_at";

type SummaryRow = Pick<
  PromotionOrderRow,
  | "id"
  | "event_id"
  | "organizer_id"
  | "days"
  | "daily_amount_kobo"
  | "total_amount_kobo"
  | "currency"
  | "status"
  | "status_reason"
  | "provider_reference"
  | "promotion_id"
  | "paid_at"
  | "created_at"
  | "checkout_expires_at"
>;

/** Re-types a user client for the promotion tables (types-only; RLS still applies). */
export function asOrdersDb(client: SupabaseClient): PromotionCheckoutClient {
  return client as unknown as PromotionCheckoutClient;
}

async function getDb(deps: PromotionOrdersDeps): Promise<PromotionCheckoutClient> {
  if (deps.supabase) return deps.supabase;
  const { supabaseAdmin: admin } = await import(
    "@/integrations/supabase/client.server"
  );
  return asOrdersDb(admin);
}

function toSummary(row: SummaryRow): PromotionOrderSummary {
  return {
    id: row.id,
    eventId: row.event_id,
    days: row.days,
    dailyKobo: row.daily_amount_kobo,
    totalKobo: row.total_amount_kobo,
    currency: row.currency,
    status: row.status,
    statusReason: row.status_reason,
    providerReference: row.provider_reference,
    promotionId: row.promotion_id,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    checkoutExpiresAt: row.checkout_expires_at,
  };
}

/**
 * One own order by id. The query parameter that names the order is a lookup
 * key only: ownership is re-checked here (and by RLS), and every field comes
 * from the database — nothing the browser claims about status is trusted.
 */
export async function getOwnPromotionOrder(
  input: { orderId: string; userId: string },
  deps: PromotionOrdersDeps = {},
): Promise<PromotionOrderSummary> {
  if (!input.orderId || !input.userId) {
    throw new PromotionCheckoutError("validation", "Sign in is required.");
  }
  const db = await getDb(deps);
  const { data, error } = await db
    .from("promotion_orders")
    .select(ORDER_SUMMARY_COLUMNS)
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    console.error("[promotion-orders] order lookup failed", error);
    throw new PromotionCheckoutError(
      "checkout-unavailable",
      "Could not load that order. Please try again.",
    );
  }
  if (!data) {
    throw new PromotionCheckoutError("not-found", "That order was not found.");
  }
  const row = data as SummaryRow;
  if (row.organizer_id !== input.userId) {
    throw new PromotionCheckoutError(
      "forbidden",
      "That order belongs to a different organizer.",
    );
  }
  return toSummary(row);
}

/**
 * Own orders, newest first. Explicit organizer filter (mirrored by RLS):
 * organizers can only ever list their own rows.
 */
export async function listOwnPromotionOrders(
  input: { userId: string; limit?: number },
  deps: PromotionOrdersDeps = {},
): Promise<PromotionOrderSummary[]> {
  if (!input.userId) {
    throw new PromotionCheckoutError("validation", "Sign in is required.");
  }
  const limit =
    input.limit !== undefined && Number.isInteger(input.limit)
      ? Math.min(Math.max(input.limit, 1), 100)
      : 50;
  const db = await getDb(deps);
  const { data, error } = await db
    .from("promotion_orders")
    .select(ORDER_SUMMARY_COLUMNS)
    .eq("organizer_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[promotion-orders] order list failed", error);
    throw new PromotionCheckoutError(
      "checkout-unavailable",
      "Could not load your promotions. Please try again.",
    );
  }
  return ((data as SummaryRow[] | null) ?? []).map(toSummary);
}

/**
 * Explicit organizer cancellation with money re-verification. Settled orders
 * report their true state (paid orders are NEVER flipped to cancelled);
 * pending orders with a stored session settle by live verification; pending
 * orders with no session cancel directly.
 */
export async function cancelPromotionOrderAsOrganizer(
  input: { orderId: string; userId: string },
  deps: PromotionOrdersDeps = {},
): Promise<CancelPromotionOrderResult> {
  if (!input.orderId || !input.userId) {
    throw new PromotionCheckoutError("validation", "Sign in is required.");
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const db = await getDb(deps);
  const { data, error } = await db
    .from("promotion_orders")
    .select(
      "id,event_id,organizer_id,days,daily_amount_kobo,total_amount_kobo,currency,status,status_reason,provider_reference,promotion_id,paid_at,created_at,checkout_id,checkout_url,checkout_expires_at",
    )
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    console.error("[promotion-orders] cancel lookup failed", error);
    throw new PromotionCheckoutError(
      "checkout-unavailable",
      "Could not load that order. Please try again.",
    );
  }
  if (!data) {
    throw new PromotionCheckoutError("not-found", "That order was not found.");
  }
  const order = data as PromotionOrderRow;
  if (order.organizer_id !== input.userId) {
    throw new PromotionCheckoutError(
      "forbidden",
      "That order belongs to a different organizer.",
    );
  }
  if (order.status !== "pending") {
    // Already settled: report truth. Paid, refund-queued, expired, failed,
    // and cancelled orders all converge here without further writes.
    return {
      orderId: order.id,
      status: order.status,
      promotionId: order.promotion_id,
    };
  }
  if (order.checkout_id === null) {
    // No session was ever stored: nothing to verify. Cancel directly; a
    // payment landing afterwards still resolves through the webhook's
    // late-payment path.
    const { error: cancelError } = await db.rpc("cancel_promotion_order", {
      p_order_id: order.id,
      p_actor_id: input.userId,
    });
    if (!cancelError) {
      return { orderId: order.id, status: "cancelled", promotionId: null };
    }
    // Lost a race (e.g. paid between load and cancel): reload and report
    // the true state instead of failing or double-writing.
    const current = await db
      .from("promotion_orders")
      .select("status,promotion_id")
      .eq("id", order.id)
      .maybeSingle();
    const row = current.data as { status: string; promotion_id: string | null } | null;
    if (!current.error && row && row.status !== "pending") {
      return { orderId: order.id, status: row.status, promotionId: row.promotion_id };
    }
    console.error("[promotion-orders] cancel failed", cancelError);
    throw new PromotionCheckoutError(
      "uncertain",
      "That order could not be cancelled. Please try again shortly.",
    );
  }
  const settled = await settleOrderByVerification(db, order, fetchImpl);
  if (settled.settled === "activated") {
    // Verified money: activated (or queued for manual refund), never
    // cancelled away. Reload for the true post-activation state — the
    // pre-verify snapshot above predates the promotion row.
    const current = await db
      .from("promotion_orders")
      .select("status,promotion_id")
      .eq("id", order.id)
      .maybeSingle();
    const row = current.data as {
      status: string;
      promotion_id: string | null;
    } | null;
    return {
      orderId: order.id,
      status:
        row?.status ??
        (settled.result.outcome === "refund_pending"
          ? "refund_pending"
          : "paid"),
      promotionId: row?.promotion_id ?? null,
      activationOutcome: settled.result.outcome,
    };
  }
  return { orderId: order.id, status: "cancelled", promotionId: null };
}
