// Pure organizer sales aggregation (P2). Turns ticket-order + item rows
// into per-event and account-wide summaries. No I/O: the server functions
// fetch the rows (ownership-checked) and call these; tests drive them with
// plain arrays. Money is computed in integer kobo from the numeric naira
// columns, converted exactly once at the boundary.

import { nairaNumericToKobo } from "@/showcase/tickets/ticket-orders";

export interface SalesOrderRow {
  id: string;
  event_id: string;
  status: string;
  total_amount: number | string;
}

export interface SalesItemRow {
  order_id: string;
  tier_id: string | null;
  tier_name: string;
  unit_price: number | string;
  quantity: number;
}

export interface TierSales {
  tierId: string | null;
  tierName: string;
  ticketsSold: number;
  grossKobo: number;
}

export interface EventSales {
  eventId: string;
  paidOrders: number;
  pendingOrders: number;
  ticketsSold: number;
  grossKobo: number;
  tiers: TierSales[];
}

export interface SalesSnapshot {
  paidOrders: number;
  pendingOrders: number;
  ticketsSold: number;
  grossKobo: number;
  events: EventSales[];
}

const EMPTY_EVENT = (eventId: string): EventSales => ({
  eventId,
  paidOrders: 0,
  pendingOrders: 0,
  ticketsSold: 0,
  grossKobo: 0,
  tiers: [],
});

/**
 * Aggregates PAID orders into sales figures; pending orders are counted
 * separately and never contribute revenue or tickets. Unknown statuses are
 * ignored (failed/expired/cancelled move no money). Rows for events the
 * caller does not own must never reach this function — ownership is the
 * server function's job, checked before any row is read.
 */
export function aggregateSales(orders: SalesOrderRow[], items: SalesItemRow[]): SalesSnapshot {
  const byEvent = new Map<string, EventSales>();
  const paidIds = new Set<string>();
  let paidOrders = 0;
  let pendingOrders = 0;

  for (const order of orders) {
    if (order.status !== "paid" && order.status !== "pending") continue;
    let event = byEvent.get(order.event_id);
    if (!event) {
      event = EMPTY_EVENT(order.event_id);
      byEvent.set(order.event_id, event);
    }
    if (order.status === "paid") {
      paidIds.add(order.id);
      paidOrders += 1;
      event.paidOrders += 1;
      event.grossKobo += nairaNumericToKobo(order.total_amount);
    } else {
      pendingOrders += 1;
      event.pendingOrders += 1;
    }
  }

  let ticketsSold = 0;
  let grossKobo = 0;
  for (const event of byEvent.values()) {
    grossKobo += event.grossKobo;
  }
  const tierBuckets = new Map<string, Map<string, TierSales>>();
  for (const item of items) {
    if (!paidIds.has(item.order_id)) continue;
    const order = orders.find((candidate) => candidate.id === item.order_id);
    if (!order) continue;
    const event = byEvent.get(order.event_id);
    if (!event) continue;
    const unitKobo = nairaNumericToKobo(item.unit_price);
    event.ticketsSold += item.quantity;
    ticketsSold += item.quantity;
    let buckets = tierBuckets.get(order.event_id);
    if (!buckets) {
      buckets = new Map();
      tierBuckets.set(order.event_id, buckets);
    }
    const key = item.tier_id ?? `name:${item.tier_name}`;
    const bucket = buckets.get(key) ?? {
      tierId: item.tier_id,
      tierName: item.tier_name,
      ticketsSold: 0,
      grossKobo: 0,
    };
    bucket.ticketsSold += item.quantity;
    bucket.grossKobo += unitKobo * item.quantity;
    buckets.set(key, bucket);
  }
  for (const [eventId, buckets] of tierBuckets) {
    const event = byEvent.get(eventId);
    if (event) {
      event.tiers = [...buckets.values()].sort((a, b) => b.grossKobo - a.grossKobo);
    }
  }
  return {
    paidOrders,
    pendingOrders,
    ticketsSold,
    grossKobo,
    events: [...byEvent.values()].sort((a, b) => b.grossKobo - a.grossKobo),
  };
}
