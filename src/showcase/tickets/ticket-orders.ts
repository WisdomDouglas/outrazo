// Ticket order constants + pure helpers (P1).
//
// These mirror the ticket-checkout migration CHECK constraints and the
// ticket state machine by hand, so drift between app code and the database
// fails loudly in tests. No I/O, no Supabase, no provider SDKs: safe to
// import anywhere. Server cores and UI reuse these instead of re-declaring
// the rules.
//
// Money: the ticket tables store numeric NAIRA (kept for the existing AI
// Event Intelligence revenue reader). This module computes in integer KOBO
// and converts exactly once at each database boundary.

export const TICKET_ORDER_STATUSES = [
  "pending",
  "paid",
  "failed",
  "expired",
  "cancelled",
] as const;

export type TicketOrderStatus = (typeof TICKET_ORDER_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketOrderStatus, string> = {
  pending: "Pending payment",
  paid: "Confirmed",
  failed: "Payment failed",
  expired: "Checkout expired",
  cancelled: "Cancelled",
};

/** Per-tier-line quantity bounds (the booking drawer matches these). */
export const TICKET_QTY_MIN = 1;
export const TICKET_QTY_MAX = 6;

/** Minimum transaction of NGN 100, in kobo (Bachs floor). */
export const TICKET_MIN_TOTAL_KOBO = 10000;

/** Pending checkouts expire after 24 hours (matches the Bachs session TTL). */
export const TICKET_PENDING_HOURS = 24;

export function isTicketOrderStatus(value: unknown): value is TicketOrderStatus {
  return (
    typeof value === "string" &&
    (TICKET_ORDER_STATUSES as readonly string[]).includes(value)
  );
}

/** Exact numeric-naira (as stored) -> integer kobo. Throws on garbage. */
export function nairaNumericToKobo(value: number | string): number {
  const naira = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(naira)) {
    throw new RangeError("Ticket amount is not a number.");
  }
  const kobo = Math.round(naira * 100);
  if (!Number.isSafeInteger(kobo)) {
    throw new RangeError("Ticket amount is too large to handle safely.");
  }
  return kobo;
}

/** Integer kobo -> numeric naira for database writes. Always exact to 2dp. */
export function koboToNairaNumeric(kobo: number): number {
  if (!Number.isInteger(kobo)) {
    throw new RangeError("Kobo amounts must be whole integers.");
  }
  return kobo / 100;
}

/** One ticket line as the browser requests it; the server reprices it. */
export interface TicketLineInput {
  tierId: string;
  quantity: number;
}

/**
 * Snapshot total for a ticket checkout: the sum of line totals, all integer
 * kobo. Throws on anything the database would reject, so callers fail before
 * touching the network. The caller must have priced every line from the
 * database tiers — never from browser input.
 */
export function ticketTotalKobo(lines: { unitKobo: number; quantity: number }[]): number {
  if (lines.length === 0) {
    throw new RangeError("Choose at least one ticket.");
  }
  let total = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.unitKobo) || line.unitKobo <= 0) {
      throw new RangeError("Ticket prices must be positive integer kobo amounts.");
    }
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < TICKET_QTY_MIN ||
      line.quantity > TICKET_QTY_MAX
    ) {
      throw new RangeError(
        `Ticket quantity must be a whole number from ${TICKET_QTY_MIN} to ${TICKET_QTY_MAX} per tier.`,
      );
    }
    total += line.unitKobo * line.quantity;
  }
  if (total < TICKET_MIN_TOTAL_KOBO) {
    throw new RangeError(
      `Ticket total must be at least ${TICKET_MIN_TOTAL_KOBO} kobo (NGN 100 minimum transaction).`,
    );
  }
  return total;
}

/**
 * Whether a pending order still holds its checkout: status is pending and it
 * was created within the 24-hour window. Terminal orders never resume,
 * whatever their age.
 */
export function isTicketOrderPending(
  status: TicketOrderStatus,
  createdAtMs: number,
  nowMs: number = Date.now(),
): boolean {
  if (status !== "pending") return false;
  return nowMs - createdAtMs < TICKET_PENDING_HOURS * 3_600_000;
}

export interface TicketTransitionContext {
  /** A server-side Bachs verify call just confirmed money for this order. */
  paymentVerified: boolean;
  /** Event still buyable and every tier line still has inventory. */
  inventoryFree: boolean;
}

export type TicketTransitionCheck =
  | { ok: true; noop?: boolean }
  | { ok: false; error: string };

/**
 * Executable spec of the ticket state machine (mirrors the migration):
 * pending -> paid | failed | expired | cancelled. Paid and the other
 * terminal states are absorbing; nothing ever returns to pending. Unlike
 * promotions there is no late-honor path: verified money on a terminal order
 * is recorded with a reason for MANUAL staff handling, never auto-delivered.
 */
export function checkTicketOrderTransition(
  from: TicketOrderStatus,
  to: TicketOrderStatus,
  context: TicketTransitionContext,
): TicketTransitionCheck {
  if (!isTicketOrderStatus(from) || !isTicketOrderStatus(to)) {
    return { ok: false, error: "Unknown ticket order status." };
  }
  if (from === to) {
    if (from === "pending") {
      return { ok: false, error: "A pending order must move forward, not replay." };
    }
    return { ok: true, noop: true };
  }
  if (to === "pending") {
    return { ok: false, error: "Orders never return to pending once they leave it." };
  }
  if (from === "pending") {
    if (to === "paid") {
      return context.paymentVerified && context.inventoryFree
        ? { ok: true }
        : { ok: false, error: "Delivery needs a verified payment and available tickets." };
    }
    if (to === "failed" || to === "expired" || to === "cancelled") {
      return !context.paymentVerified
        ? { ok: true }
        : { ok: false, error: "Verified money must deliver or be recorded, never strand." };
    }
    return { ok: false, error: `Pending orders cannot move to ${to}.` };
  }
  return { ok: false, error: `${from} is terminal: money history is never rewritten.` };
}
