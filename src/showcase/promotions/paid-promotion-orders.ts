// Paid promotion order constants + pure helpers (P1).
//
// These mirror the paid-promotions migration CHECK constraints, reservation
// rule, and payment state machine by hand, so drift between app code and the
// database fails loudly in tests. No I/O, no Supabase, no provider SDKs: safe to
// import anywhere. P2 (server functions) and P4 (checkout UI) reuse these
// instead of re-declaring the rules.

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "failed",
  "expired",
  "cancelled",
  "refund_pending",
  "refunded",
] as const;

export type PromotionOrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<PromotionOrderStatus, string> = {
  pending: "Pending payment",
  paid: "Promotion active",
  failed: "Payment failed",
  expired: "Checkout expired",
  cancelled: "Cancelled",
  refund_pending: "Refund in progress",
  refunded: "Refunded",
};

/** Approved duration bounds in days (decisions 3-4). */
export const ORDER_DAYS_MIN = 1;
export const ORDER_DAYS_MAX = 30;

/** Minimum transaction of NGN 100 (decision 6), in kobo. */
export const ORDER_MIN_TOTAL_KOBO = 10000;

/** Pending reservations expire after 24 hours (decision 12). */
export const ORDER_RESERVATION_HOURS = 24;

/** Suggested checkout durations (decision 5); custom values up to 30 allowed. */
export const ORDER_SUGGESTED_DURATIONS = [1, 2, 3, 4, 7] as const;

/** Outcomes returned by activate_paid_promotion(). */
export const ACTIVATION_OUTCOMES = [
  "paid",
  "paid_late_honored",
  "refund_pending",
] as const;

export type ActivationOutcome = (typeof ACTIVATION_OUTCOMES)[number];

/** Reason codes written to status_reason when money routes to the refund queue. */
export const ORDER_BLOCK_REASONS = [
  "amount_mismatch",
  "event_ineligible",
  "slot_taken",
  "newer_reservation_exists",
  "concurrent_pending_conflict",
  "overlap_race",
] as const;

export type OrderBlockReason = (typeof ORDER_BLOCK_REASONS)[number];

export function isOrderStatus(value: unknown): value is PromotionOrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

export function isActivationOutcome(
  value: unknown,
): value is ActivationOutcome {
  return (
    typeof value === "string" &&
    (ACTIVATION_OUTCOMES as readonly string[]).includes(value)
  );
}

export function isOrderBlockReason(value: unknown): value is OrderBlockReason {
  return (
    typeof value === "string" &&
    (ORDER_BLOCK_REASONS as readonly string[]).includes(value)
  );
}

/**
 * Snapshot total for a checkout: days * daily rate, all integer kobo.
 * Mirrors the table CHECK (total = days * daily). Throws on anything the
 * database would reject, so callers fail before touching the network.
 */
export function orderTotalKobo(days: number, dailyAmountKobo: number): number {
  if (!Number.isInteger(days) || days < ORDER_DAYS_MIN || days > ORDER_DAYS_MAX) {
    throw new RangeError(
      `Promotion duration must be a whole number of days from ${ORDER_DAYS_MIN} to ${ORDER_DAYS_MAX}.`,
    );
  }
  if (!Number.isInteger(dailyAmountKobo) || dailyAmountKobo <= 0) {
    throw new RangeError("Daily promotion price must be a positive integer kobo amount.");
  }
  const total = days * dailyAmountKobo;
  if (total < ORDER_MIN_TOTAL_KOBO) {
    throw new RangeError(
      `Promotion total must be at least ${ORDER_MIN_TOTAL_KOBO} kobo (NGN 100 minimum transaction).`,
    );
  }
  return total;
}

/** Formats integer kobo as whole-naira NGN for display (200000 -> NGN 2,000). */
export function formatKoboToNgn(amountKobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amountKobo / 100);
}

/**
 * Whether a pending order still holds its reservation: status is pending and
 * it was created within the 24-hour window. Terminal orders never reserve,
 * whatever their age. Mirrors the activation RPC's validity predicate.
 */
export function isReservationValid(
  status: PromotionOrderStatus,
  createdAtMs: number,
  nowMs: number = Date.now(),
): boolean {
  if (status !== "pending") return false;
  return nowMs - createdAtMs < ORDER_RESERVATION_HOURS * 3_600_000;
}

export interface TransitionContext {
  /** A server-side Bachs verify call just confirmed money for this order. */
  paymentVerified: boolean;
  /** Event eligible + no overlapping live window + no blocking reservation. */
  slotFree: boolean;
}

export type TransitionCheck =
  | { ok: true; noop?: boolean }
  | { ok: false; error: string };

/**
 * Executable spec of the order state machine (mirrors the migration RPCs):
 * pending -> paid | failed | expired | cancelled | refund_pending;
 * {expired, cancelled, failed} + verified late payment -> paid (late honor,
 * slot free) | refund_pending (slot blocked); refund_pending -> refunded.
 * paid and refunded are absorbing; nothing ever returns to pending.
 */
export function checkOrderTransition(
  from: PromotionOrderStatus,
  to: PromotionOrderStatus,
  context: TransitionContext,
): TransitionCheck {
  if (!isOrderStatus(from) || !isOrderStatus(to)) {
    return { ok: false, error: "Unknown order status." };
  }
  if (from === to) {
    // Idempotent replays: the SQL returns the current state for every
    // settled status. A pending order never legitimately replays to itself.
    if (from === "pending") {
      return { ok: false, error: "A pending order must move forward, not replay." };
    }
    return { ok: true, noop: true };
  }
  if (to === "pending") {
    return { ok: false, error: "Orders never return to pending once they leave it." };
  }
  switch (from) {
    case "pending": {
      switch (to) {
        case "paid":
          return context.paymentVerified && context.slotFree
            ? { ok: true }
            : { ok: false, error: "Delivery needs a verified payment and a free slot." };
        case "refund_pending":
          return context.paymentVerified && !context.slotFree
            ? { ok: true }
            : { ok: false, error: "Refund queue needs verified money with a blocked slot." };
        case "failed":
        case "expired":
        case "cancelled":
          return !context.paymentVerified
            ? { ok: true }
            : { ok: false, error: "Verified money must deliver or queue a refund, never strand." };
        default:
          return { ok: false, error: `Pending orders cannot move to ${to}.` };
      }
    }
    case "expired":
    case "cancelled":
    case "failed": {
      // Late-payment recovery: honor when the slot is free, refund when not.
      if (to === "paid") {
        return context.paymentVerified && context.slotFree
          ? { ok: true }
          : { ok: false, error: "Late delivery needs a verified payment and a free slot." };
      }
      if (to === "refund_pending") {
        return context.paymentVerified && !context.slotFree
          ? { ok: true }
          : { ok: false, error: "Late money with a free slot must deliver, not refund." };
      }
      return { ok: false, error: `Settled orders cannot move to ${to}.` };
    }
    case "refund_pending": {
      if (to === "refunded") return { ok: true };
      return { ok: false, error: "Queued refunds resolve only by executing the refund." };
    }
    case "paid":
    case "refunded":
      return { ok: false, error: `${from} is terminal: money history is never rewritten.` };
  }
}
