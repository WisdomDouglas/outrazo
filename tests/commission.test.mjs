import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aggregateEarnings,
  canTransitionPayout,
  feeKobo,
  isPayoutStatus,
  netKobo,
  nextPayoutStatuses,
} from "@/showcase/finance/commission";

describe("platform fee math", () => {
  it("takes 10% of round amounts exactly", () => {
    assert.equal(feeKobo(100000, 10), 10000);
    assert.equal(netKobo(100000, 10), 90000);
  });

  it("rounds half up per order and keeps gross = fee + net", () => {
    // 10% of 15 kobo = 1.5 -> 2 kobo fee, 13 net.
    assert.equal(feeKobo(15, 10), 2);
    assert.equal(netKobo(15, 10), 13);
    for (const gross of [0, 1, 99, 101, 999, 123456]) {
      for (const rate of [0, 5, 10, 12.5, 100]) {
        assert.equal(feeKobo(gross, rate) + netKobo(gross, rate), gross);
      }
    }
  });

  it("treats nonsense inputs as zero fee, never negative net", () => {
    assert.equal(feeKobo(-5, 10), 0);
    assert.equal(feeKobo(1000, -1), 0);
    assert.equal(feeKobo(Number.NaN, 10), 0);
    assert.equal(netKobo(1000, 200), 0);
  });
});

describe("earnings aggregation", () => {
  it("uses each event's locked rate and ignores unpaid orders", () => {
    const snapshot = aggregateEarnings(
      [
        { id: "o1", event_id: "e1", status: "paid", total_amount: 10000 },
        { id: "o2", event_id: "e1", status: "pending", total_amount: 10000 },
        { id: "o3", event_id: "e2", status: "paid", total_amount: 5000 },
        { id: "o4", event_id: "e2", status: "failed", total_amount: 5000 },
      ],
      new Map([
        ["e1", 10],
        ["e2", 5],
      ]),
      10,
    );
    assert.equal(snapshot.paidOrders, 2);
    assert.equal(snapshot.grossKobo, 1500000);
    // e1: 10% of 1,000,000 = 100,000. e2: 5% of 500,000 = 25,000.
    assert.equal(snapshot.feeKobo, 125000);
    assert.equal(snapshot.netKobo, 1375000);
    assert.equal(snapshot.events.length, 2);
    const e2 = snapshot.events.find((row) => row.eventId === "e2");
    assert.equal(e2?.ratePct, 5);
    assert.equal(e2?.feeKobo, 25000);
  });

  it("falls back to the default rate for events missing a locked rate", () => {
    const snapshot = aggregateEarnings(
      [{ id: "o1", event_id: "e9", status: "paid", total_amount: 1000 }],
      new Map(),
      10,
    );
    assert.equal(snapshot.feeKobo, 10000);
    assert.equal(snapshot.events[0]?.ratePct, 10);
  });
});

describe("payout workflow", () => {
  it("allows exactly the approved transitions", () => {
    const allowed = [
      ["pending", "approved"],
      ["pending", "on_hold"],
      ["pending", "failed"],
      ["approved", "processing"],
      ["approved", "on_hold"],
      ["approved", "failed"],
      ["processing", "paid"],
      ["processing", "failed"],
      ["on_hold", "pending"],
      ["on_hold", "failed"],
    ];
    for (const [from, to] of allowed) {
      assert.equal(canTransitionPayout(from, to), true, `${from} -> ${to}`);
    }
    assert.deepEqual(nextPayoutStatuses("pending"), ["approved", "on_hold", "failed"]);
    assert.deepEqual(nextPayoutStatuses("paid"), []);
    assert.deepEqual(nextPayoutStatuses("failed"), []);
  });

  it("rejects skips, backwards moves, and terminal exits", () => {
    for (const [from, to] of [
      ["pending", "paid"],
      ["pending", "processing"],
      ["approved", "paid"],
      ["approved", "pending"],
      ["processing", "pending"],
      ["processing", "approved"],
      ["on_hold", "paid"],
      ["paid", "failed"],
      ["failed", "pending"],
    ]) {
      assert.equal(canTransitionPayout(from, to), false, `${from} -> ${to}`);
    }
  });

  it("validates status strings", () => {
    assert.equal(isPayoutStatus("paid"), true);
    assert.equal(isPayoutStatus("on_hold"), true);
    assert.equal(isPayoutStatus("refunded"), false);
    assert.equal(isPayoutStatus(""), false);
    assert.equal(isPayoutStatus(null), false);
  });
});
