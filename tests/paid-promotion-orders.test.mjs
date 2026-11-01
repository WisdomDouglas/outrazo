// Paid promotion order pure-helper tests (P1).
//
// Scope, stated honestly: these pin the executable SPEC of the order state
// machine, reservation rule, and kobo math that the migration implements in
// SQL. They run without a database and do NOT prove live behavior — the
// migration-safeguard suite asserts the SQL contains each guard, and the P1
// report lists the live drills that prove the real thing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ACTIVATION_OUTCOMES,
  checkOrderTransition,
  formatKoboToNgn,
  isActivationOutcome,
  isOrderBlockReason,
  isOrderStatus,
  isReservationValid,
  ORDER_BLOCK_REASONS,
  ORDER_DAYS_MAX,
  ORDER_DAYS_MIN,
  ORDER_MIN_TOTAL_KOBO,
  ORDER_RESERVATION_HOURS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  ORDER_SUGGESTED_DURATIONS,
  orderTotalKobo,
} from "@/showcase/promotions/paid-promotion-orders";

const MIGRATION_SQL = readFileSync(
  new URL(
    "../supabase/migrations/20261104090000_paid_promotions_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("order statuses", () => {
  it("defines exactly the seven approved states", () => {
    assert.deepEqual([...ORDER_STATUSES], [
      "pending",
      "paid",
      "failed",
      "expired",
      "cancelled",
      "refund_pending",
      "refunded",
    ]);
  });

  it("labels every status in plain English", () => {
    assert.deepEqual({ ...ORDER_STATUS_LABELS }, {
      pending: "Pending payment",
      paid: "Promotion active",
      failed: "Payment failed",
      expired: "Checkout expired",
      cancelled: "Cancelled",
      refund_pending: "Refund in progress",
      refunded: "Refunded",
    });
  });

  it("recognizes only known statuses", () => {
    assert.equal(isOrderStatus("pending"), true);
    assert.equal(isOrderStatus("refunded"), true);
    assert.equal(isOrderStatus("active"), false);
    assert.equal(isOrderStatus("PENDING"), false);
    assert.equal(isOrderStatus(null), false);
    assert.equal(isOrderStatus(undefined), false);
  });

  it("matches the migration CHECK constraint states", () => {
    for (const status of ORDER_STATUSES) {
      assert.ok(
        MIGRATION_SQL.includes(`'${status}'`),
        `migration is missing order status ${status}`,
      );
    }
  });
});

describe("order bounds", () => {
  it("pins the approved duration, minimum, reservation, and suggestion rules", () => {
    assert.equal(ORDER_DAYS_MIN, 1);
    assert.equal(ORDER_DAYS_MAX, 30);
    assert.equal(ORDER_MIN_TOTAL_KOBO, 10000);
    assert.equal(ORDER_RESERVATION_HOURS, 24);
    assert.deepEqual([...ORDER_SUGGESTED_DURATIONS], [1, 2, 3, 4, 7]);
  });
});

describe("kobo snapshot math", () => {
  it("computes the approved pricing examples exactly", () => {
    // Daily price example: NGN 2,000 = 200,000 kobo.
    assert.equal(orderTotalKobo(1, 200_000), 200_000);
    assert.equal(orderTotalKobo(2, 200_000), 400_000);
    assert.equal(orderTotalKobo(3, 200_000), 600_000);
    assert.equal(orderTotalKobo(4, 200_000), 800_000);
    assert.equal(orderTotalKobo(7, 200_000), 1_400_000);
    assert.equal(orderTotalKobo(30, 200_000), 6_000_000);
  });

  it("rejects anything the database CHECKs would reject", () => {
    assert.throws(() => orderTotalKobo(0, 200_000), RangeError);
    assert.throws(() => orderTotalKobo(31, 200_000), RangeError);
    assert.throws(() => orderTotalKobo(2.5, 200_000), RangeError);
    assert.throws(() => orderTotalKobo(1, 0), RangeError);
    assert.throws(() => orderTotalKobo(1, -50), RangeError);
    assert.throws(() => orderTotalKobo(1, 9999), /NGN 100 minimum/);
  });

  it("accepts exactly the NGN 100 (10000 kobo) minimum", () => {
    assert.equal(orderTotalKobo(1, 10000), 10000);
  });

  it("formats kobo as whole-naira NGN", () => {
    const formatted = formatKoboToNgn(200_000);
    assert.match(formatted, /2,000/);
    assert.match(formatted, /₦|NGN/);
    assert.equal(formatKoboToNgn(100), "₦1");
    assert.match(formatKoboToNgn(10_000), /100/);
  });
});

describe("reservation validity", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const hour = 3_600_000;

  it("holds for fresh pending orders only", () => {
    assert.equal(isReservationValid("pending", now - hour, now), true);
    assert.equal(isReservationValid("pending", now - 23 * hour, now), true);
  });

  it("expires pending orders at 24 hours", () => {
    assert.equal(isReservationValid("pending", now - 24 * hour, now), false);
    assert.equal(isReservationValid("pending", now - 25 * hour, now), false);
  });

  it("never holds for non-pending orders, whatever their age", () => {
    for (const status of ORDER_STATUSES) {
      if (status === "pending") continue;
      assert.equal(
        isReservationValid(status, now - hour, now),
        false,
        `${status} must never reserve`,
      );
    }
  });
});

describe("activation outcomes and block reasons", () => {
  it("defines exactly the three activation outcomes", () => {
    assert.deepEqual([...ACTIVATION_OUTCOMES], [
      "paid",
      "paid_late_honored",
      "refund_pending",
    ]);
    assert.equal(isActivationOutcome("paid_late_honored"), true);
    assert.equal(isActivationOutcome("refunded"), false);
  });

  it("defines every refund-queue reason used by the migration", () => {
    assert.deepEqual([...ORDER_BLOCK_REASONS], [
      "amount_mismatch",
      "event_ineligible",
      "slot_taken",
      "newer_reservation_exists",
      "concurrent_pending_conflict",
      "overlap_race",
    ]);
    for (const reason of ORDER_BLOCK_REASONS) {
      assert.ok(
        MIGRATION_SQL.includes(`'${reason}'`),
        `migration is missing block reason ${reason}`,
      );
      assert.equal(isOrderBlockReason(reason), true);
    }
    assert.equal(isOrderBlockReason("unknown"), false);
  });
});

describe("order state machine", () => {
  const verifiedFree = { paymentVerified: true, slotFree: true };
  const verifiedBlocked = { paymentVerified: true, slotFree: false };
  const unpaid = { paymentVerified: false, slotFree: true };

  it("delivers fresh pending orders only on verified payment + free slot", () => {
    assert.deepEqual(
      checkOrderTransition("pending", "paid", verifiedFree),
      { ok: true },
    );
    assert.equal(
      checkOrderTransition("pending", "paid", unpaid).ok,
      false,
    );
    assert.equal(
      checkOrderTransition("pending", "paid", verifiedBlocked).ok,
      false,
    );
  });

  it("settles pending orders without payment as failed, expired, or cancelled", () => {
    for (const to of ["failed", "expired", "cancelled"]) {
      assert.deepEqual(
        checkOrderTransition("pending", to, unpaid),
        { ok: true },
        `pending -> ${to}`,
      );
    }
  });

  it("never strands verified money on a no-delivery terminal state", () => {
    for (const to of ["failed", "expired", "cancelled"]) {
      const result = checkOrderTransition("pending", to, verifiedFree);
      assert.equal(result.ok, false, `pending -> ${to} with verified money`);
    }
    const queued = checkOrderTransition("pending", "refund_pending", verifiedBlocked);
    assert.deepEqual(queued, { ok: true });
  });

  it("honors late payments when the slot is free (approved decision 2)", () => {
    for (const from of ["expired", "cancelled", "failed"]) {
      assert.deepEqual(
        checkOrderTransition(from, "paid", verifiedFree),
        { ok: true },
        `${from} -> paid (late honor)`,
      );
    }
  });

  it("queues late payments for refund when the slot is blocked (clarification B)", () => {
    // An expired order's late payment arrives while a NEWER valid pending
    // order holds the reservation: the late order must not disturb it.
    for (const from of ["expired", "cancelled", "failed"]) {
      assert.deepEqual(
        checkOrderTransition(from, "refund_pending", verifiedBlocked),
        { ok: true },
        `${from} -> refund_pending (newer reservation wins)`,
      );
      const steal = checkOrderTransition(from, "paid", verifiedBlocked);
      assert.equal(steal.ok, false, `${from} must not steal a taken slot`);
    }
  });

  it("resolves queued refunds only by executing the refund", () => {
    assert.deepEqual(
      checkOrderTransition("refund_pending", "refunded", unpaid),
      { ok: true },
    );
    assert.equal(
      checkOrderTransition("refund_pending", "paid", verifiedFree).ok,
      false,
    );
    assert.equal(
      checkOrderTransition("refund_pending", "cancelled", unpaid).ok,
      false,
    );
  });

  it("treats paid and refunded as absorbing", () => {
    for (const from of ["paid", "refunded"]) {
      for (const to of ORDER_STATUSES) {
        if (from === to) continue;
        const result = checkOrderTransition(from, to, verifiedFree);
        assert.equal(result.ok, false, `${from} -> ${to} must be impossible`);
      }
    }
  });

  it("never resurrects an order back to pending", () => {
    for (const from of ORDER_STATUSES) {
      if (from === "pending") continue;
      assert.equal(
        checkOrderTransition(from, "pending", unpaid).ok,
        false,
        `${from} -> pending must be impossible`,
      );
    }
  });

  it("allows idempotent replays of settled states, but never of pending", () => {
    for (const status of ORDER_STATUSES) {
      const result = checkOrderTransition(status, status, unpaid);
      if (status === "pending") {
        assert.equal(result.ok, false, "pending must not replay to itself");
      } else {
        assert.deepEqual(result, { ok: true, noop: true }, `${status} replay`);
      }
    }
  });

  it("rejects unknown statuses", () => {
    assert.equal(
      checkOrderTransition("pending", "bogus", unpaid).ok,
      false,
    );
  });
});
