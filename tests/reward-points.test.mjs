import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canTransitionWithdrawal,
  isWithdrawalStatus,
  koboToPoints,
  maskAccountNumber,
  minPointsForNaira,
  nextWithdrawalStatuses,
  OPENING_MIN_WITHDRAWAL_NAIRA,
  OPENING_NAIRA_PER_POINT,
  pointsToKobo,
  validateWithdrawalInput,
} from "@/showcase/rewards/reward-points";

describe("opening conversion", () => {
  it("prices 100 points at ₦1,000", () => {
    assert.equal(OPENING_NAIRA_PER_POINT, 10);
    assert.equal(OPENING_MIN_WITHDRAWAL_NAIRA, 3000);
    assert.equal(pointsToKobo(100, OPENING_NAIRA_PER_POINT), 100000);
    assert.equal(minPointsForNaira(OPENING_MIN_WITHDRAWAL_NAIRA, OPENING_NAIRA_PER_POINT), 300);
  });
});

describe("points conversion", () => {
  it("converts both directions without overpaying", () => {
    assert.equal(pointsToKobo(300, 10), 300000);
    assert.equal(koboToPoints(300000, 10), 300);
    // Dust rounds down: ₦1.50 buys 0 whole points at ₦10/pt, never 1.
    assert.equal(koboToPoints(150, 10), 0);
    assert.equal(koboToPoints(1000, 10), 1);
  });

  it("rounds the minimum up so the floor always holds", () => {
    // ₦3,000 at ₦7/pt needs 429 points (428 × 7 = ₦2,996 < floor).
    assert.equal(minPointsForNaira(3000, 7), 429);
    assert.ok(429 * 7 >= 3000);
    assert.ok(428 * 7 < 3000);
  });

  it("treats nonsense inputs as zero, never negative", () => {
    assert.equal(pointsToKobo(-5, 10), 0);
    assert.equal(pointsToKobo(100, 0), 0);
    assert.equal(pointsToKobo(Number.NaN, 10), 0);
    assert.equal(koboToPoints(1000, -1), 0);
    assert.equal(minPointsForNaira(3000, 0), 0);
  });
});

describe("account masking", () => {
  it("shows only the last four digits", () => {
    assert.equal(maskAccountNumber("0123456789"), "•••• 6789");
    assert.equal(maskAccountNumber("12"), "••••");
    assert.equal(maskAccountNumber(""), "••••");
  });
});

describe("withdrawal validation", () => {
  const base = { balancePoints: 1000, minPoints: 300, maxPoints: null };

  it("accepts a valid whole amount", () => {
    const result = validateWithdrawalInput({ ...base, points: 300 });
    assert.equal(result.ok, true);
  });

  it("rejects fractions, zero, and negatives", () => {
    for (const points of [0, -5, 1.5, Number.NaN]) {
      const result = validateWithdrawalInput({ ...base, points });
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.error, /whole points amount/i);
    }
  });

  it("rejects below-minimum amounts", () => {
    const result = validateWithdrawalInput({ ...base, points: 299 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /minimum/i);
  });

  it("rejects amounts above the balance", () => {
    const result = validateWithdrawalInput({ ...base, points: 1001 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /available balance/i);
  });

  it("rejects amounts above the maximum when one is set", () => {
    const capped = validateWithdrawalInput({ ...base, maxPoints: 500, points: 501 });
    assert.equal(capped.ok, false);
    if (!capped.ok) assert.match(capped.error, /maximum/i);
    const allowed = validateWithdrawalInput({ ...base, maxPoints: 500, points: 500 });
    assert.equal(allowed.ok, true);
  });
});

describe("withdrawal workflow", () => {
  it("allows exactly the approved transitions", () => {
    const allowed = [
      ["pending", "processing"],
      ["pending", "rejected"],
      ["pending", "cancelled"],
      ["processing", "paid"],
      ["processing", "rejected"],
      ["processing", "cancelled"],
    ];
    for (const [from, to] of allowed) {
      assert.equal(canTransitionWithdrawal(from, to), true, `${from} -> ${to}`);
    }
    assert.deepEqual(nextWithdrawalStatuses("pending"), ["processing", "rejected", "cancelled"]);
    assert.deepEqual(nextWithdrawalStatuses("paid"), []);
    assert.deepEqual(nextWithdrawalStatuses("rejected"), []);
    assert.deepEqual(nextWithdrawalStatuses("cancelled"), []);
  });

  it("rejects skips, backwards moves, and terminal exits", () => {
    const denied = [
      ["pending", "paid"],
      ["processing", "pending"],
      ["processing", "processing"],
      ["paid", "processing"],
      ["rejected", "pending"],
      ["cancelled", "processing"],
    ];
    for (const [from, to] of denied) {
      assert.equal(canTransitionWithdrawal(from, to), false, `${from} -> ${to}`);
    }
  });

  it("validates status strings", () => {
    assert.equal(isWithdrawalStatus("paid"), true);
    assert.equal(isWithdrawalStatus("processing"), true);
    assert.equal(isWithdrawalStatus("refunded"), false);
    assert.equal(isWithdrawalStatus(""), false);
    assert.equal(isWithdrawalStatus(null), false);
  });
});
