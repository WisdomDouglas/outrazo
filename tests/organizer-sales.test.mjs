// Organizer sales aggregation tests (P2).
//
// The aggregation is pure: rows in, summaries out. Ownership is the server
// functions' job (tested by type-check, build, and the manual checklist);
// these tests prove paid-only revenue, pending separation, and tier math.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aggregateSales } from "@/showcase/organizer/organizer-sales";

const EVENT_A = "aaaaaaaa-0000-0000-0000-000000000000";
const EVENT_B = "bbbbbbbb-0000-0000-0000-000000000000";

function paidOrder(overrides = {}) {
  return {
    id: overrides.id ?? "order-1",
    event_id: EVENT_A,
    status: "paid",
    total_amount: 10000,
    ...overrides,
  };
}

function item(overrides = {}) {
  return {
    order_id: "order-1",
    tier_id: "tier-regular",
    tier_name: "Regular",
    unit_price: 5000,
    quantity: 2,
    ...overrides,
  };
}

describe("aggregateSales", () => {
  it("returns zeros for no orders", () => {
    assert.deepEqual(aggregateSales([], []), {
      paidOrders: 0,
      pendingOrders: 0,
      ticketsSold: 0,
      grossKobo: 0,
      events: [],
    });
  });

  it("counts only paid money and paid tickets", () => {
    const snapshot = aggregateSales(
      [
        paidOrder(),
        paidOrder({ id: "order-2", status: "pending", total_amount: 99999 }),
        paidOrder({ id: "order-3", status: "failed", total_amount: 99999 }),
        paidOrder({ id: "order-4", status: "expired", total_amount: 99999 }),
        paidOrder({ id: "order-5", status: "cancelled", total_amount: 99999 }),
      ],
      [
        item(),
        item({ order_id: "order-2", quantity: 6 }),
        item({ order_id: "order-3", quantity: 6 }),
      ],
    );
    assert.equal(snapshot.paidOrders, 1);
    assert.equal(snapshot.pendingOrders, 1);
    assert.equal(snapshot.ticketsSold, 2);
    assert.equal(snapshot.grossKobo, 1_000_000);
  });

  it("groups per event with tier breakdowns, richest first", () => {
    const snapshot = aggregateSales(
      [
        paidOrder({ id: "order-a", event_id: EVENT_A, total_amount: 10000 }),
        paidOrder({ id: "order-b", event_id: EVENT_B, total_amount: 30000 }),
      ],
      [
        item({ order_id: "order-a", tier_name: "Regular", unit_price: 5000, quantity: 2 }),
        item({ order_id: "order-b", tier_id: "tier-vip", tier_name: "VIP", unit_price: 15000, quantity: 2 }),
        item({ order_id: "order-b", tier_name: "Regular", unit_price: 5000, quantity: 1 }),
      ],
    );
    assert.equal(snapshot.ticketsSold, 5);
    assert.equal(snapshot.grossKobo, 4_000_000);
    assert.equal(snapshot.events.length, 2);
    assert.equal(snapshot.events[0].eventId, EVENT_B);
    assert.equal(snapshot.events[0].tiers.length, 2);
    assert.equal(snapshot.events[0].tiers[0].tierName, "VIP");
    assert.equal(snapshot.events[0].tiers[0].grossKobo, 3_000_000);
  });

  it("merges lines of the same tier and tolerates deleted tiers", () => {
    const snapshot = aggregateSales(
      [paidOrder(), paidOrder({ id: "order-2", total_amount: 5000 })],
      [
        item(),
        item({ order_id: "order-2", quantity: 1 }),
        item({ order_id: "order-2", tier_id: null, tier_name: "Early Bird", unit_price: 2500, quantity: 1 }),
      ],
    );
    const event = snapshot.events[0];
    const regular = event.tiers.find((tier) => tier.tierName === "Regular");
    assert.equal(regular.ticketsSold, 3);
    assert.equal(regular.grossKobo, 1_500_000);
    const deleted = event.tiers.find((tier) => tier.tierName === "Early Bird");
    assert.equal(deleted.tierId, null);
    assert.equal(deleted.ticketsSold, 1);
  });

  it("converts string numerics exactly", () => {
    const snapshot = aggregateSales(
      [paidOrder({ total_amount: "2500.50" })],
      [item({ unit_price: "2500.50", quantity: 1 })],
    );
    assert.equal(snapshot.grossKobo, 250_050);
    assert.equal(snapshot.events[0].tiers[0].grossKobo, 250_050);
  });
});
