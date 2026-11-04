// Pure ticket-finance math (P5). Platform fee and organizer earnings in
// integer kobo, computed per order from the event's LOCKED rate — never
// from the live default, so later default changes cannot rewrite history.
//
// Rounding: fee rounds half up per order (Math.round on non-negative
// values), matching the SQL aggregate's ROUND(). Gross, fee, and net are
// derived from the same snapshot so gross = fee + net always holds.
import { nairaNumericToKobo } from "@/showcase/tickets/ticket-orders";

/** Platform fee for one gross amount at the given locked percent. */
export function feeKobo(grossKobo: number, ratePct: number): number {
  if (!Number.isFinite(grossKobo) || grossKobo < 0) return 0;
  if (!Number.isFinite(ratePct) || ratePct < 0) return 0;
  return Math.round((grossKobo * ratePct) / 100);
}

/** Organizer's share: whatever the fee does not take. */
export function netKobo(grossKobo: number, ratePct: number): number {
  return Math.max(0, grossKobo - feeKobo(grossKobo, ratePct));
}

export interface EarningsOrderRow {
  id: string;
  event_id: string;
  status: string;
  total_amount: number | string;
}

export interface EventEarnings {
  eventId: string;
  ratePct: number;
  paidOrders: number;
  grossKobo: number;
  feeKobo: number;
  netKobo: number;
}

export interface EarningsSnapshot {
  paidOrders: number;
  grossKobo: number;
  feeKobo: number;
  netKobo: number;
  events: EventEarnings[];
}

/**
 * Aggregates PAID orders into per-event earnings using each event's locked
 * rate. Only rows the caller is allowed to see may reach this function —
 * ownership (organizer) or permission (admin) is the server function's job.
 * Events missing from the rates map fall back to defaultRatePct so a
 * pre-finance row degrades to the opening rate instead of zero.
 */
export function aggregateEarnings(
  orders: EarningsOrderRow[],
  rates: Map<string, number>,
  defaultRatePct: number,
): EarningsSnapshot {
  const byEvent = new Map<string, EventEarnings>();
  let paidOrders = 0;
  let grossKobo = 0;
  let feeTotal = 0;
  for (const order of orders) {
    if (order.status !== "paid") continue;
    const gross = nairaNumericToKobo(order.total_amount);
    const rate = rates.get(order.event_id) ?? defaultRatePct;
    const fee = feeKobo(gross, rate);
    let event = byEvent.get(order.event_id);
    if (!event) {
      event = { eventId: order.event_id, ratePct: rate, paidOrders: 0, grossKobo: 0, feeKobo: 0, netKobo: 0 };
      byEvent.set(order.event_id, event);
    }
    event.paidOrders += 1;
    event.grossKobo += gross;
    event.feeKobo += fee;
    event.netKobo += gross - fee;
    paidOrders += 1;
    grossKobo += gross;
    feeTotal += fee;
  }
  return {
    paidOrders,
    grossKobo,
    feeKobo: feeTotal,
    netKobo: grossKobo - feeTotal,
    events: [...byEvent.values()].sort((a, b) => b.netKobo - a.netKobo),
  };
}

// ── Manual payout workflow (mirrors the SQL transition map) ─────────────────
// pending -> approved -> processing -> paid, with on_hold and failed.
// paid and failed are terminal. The RPC enforces this; the UI uses this map
// only to decide which buttons to show.

export const PAYOUT_STATUSES = [
  "pending",
  "approved",
  "processing",
  "paid",
  "on_hold",
  "failed",
] as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

const PAYOUT_TRANSITIONS: Record<PayoutStatus, readonly PayoutStatus[]> = {
  pending: ["approved", "on_hold", "failed"],
  approved: ["processing", "on_hold", "failed"],
  processing: ["paid", "failed"],
  paid: [],
  on_hold: ["pending", "failed"],
  failed: [],
};

export function isPayoutStatus(value: unknown): value is PayoutStatus {
  return (
    typeof value === "string" && (PAYOUT_STATUSES as readonly string[]).includes(value)
  );
}

/** Whether the workflow allows moving a payout from one status to another. */
export function canTransitionPayout(from: PayoutStatus, to: PayoutStatus): boolean {
  return PAYOUT_TRANSITIONS[from].includes(to);
}

/** Next statuses the UI may offer for a payout in the given status. */
export function nextPayoutStatuses(from: PayoutStatus): PayoutStatus[] {
  return [...(PAYOUT_TRANSITIONS[from] ?? [])];
}
