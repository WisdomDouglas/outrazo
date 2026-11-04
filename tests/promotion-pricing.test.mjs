// Promotion pricing helper tests (P0 admin pricing UI).
//
// Covers the pure naira<->kobo parsing/formatting and RPC error mapping that
// the admin Promotions page and the setPromotionPrice server function share.
// The thin createServerFn wrappers are covered by type-check, lint, build,
// and the manual checklist — server-function RPC needs a running app.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatKoboToNaira,
  friendlyPricingError,
  parsePriceNairaToKobo,
  PROMOTION_MAX_DAILY_KOBO,
  PROMOTION_MIN_DAILY_KOBO,
} from "@/showcase/promotions/promotion-windows";

describe("promotion pricing bounds", () => {
  it("floors the daily rate at NGN 100 in kobo, matching the RPC", () => {
    assert.equal(PROMOTION_MIN_DAILY_KOBO, 10_000);
  });

  it("caps the daily rate at NGN 1,000,000 in kobo as a typo guard", () => {
    assert.equal(PROMOTION_MAX_DAILY_KOBO, 100_000_000);
  });
});

describe("parsePriceNairaToKobo", () => {
  it("parses plain naira amounts into kobo", () => {
    assert.deepEqual(parsePriceNairaToKobo("2000"), { ok: true, kobo: 200_000 });
    assert.deepEqual(parsePriceNairaToKobo("100"), { ok: true, kobo: 10_000 });
  });

  it("accepts commas, naira signs, and surrounding whitespace", () => {
    assert.deepEqual(parsePriceNairaToKobo("2,000"), { ok: true, kobo: 200_000 });
    assert.deepEqual(parsePriceNairaToKobo("₦2,000"), { ok: true, kobo: 200_000 });
    assert.deepEqual(parsePriceNairaToKobo("  2000  "), { ok: true, kobo: 200_000 });
  });

  it("accepts up to two decimal places", () => {
    assert.deepEqual(parsePriceNairaToKobo("2500.50"), { ok: true, kobo: 250_050 });
    assert.deepEqual(parsePriceNairaToKobo("100.99"), { ok: true, kobo: 10_099 });
  });

  it("rejects empty input with a friendly error", () => {
    const result = parsePriceNairaToKobo("   ");
    assert.equal(result.ok, false);
    assert.match(result.error, /enter a daily price/i);
  });

  it("rejects non-numeric and over-precise input", () => {
    for (const input of ["two thousand", "2,000.555", "20a0", "-500"]) {
      const result = parsePriceNairaToKobo(input);
      assert.equal(result.ok, false, input);
      assert.match(result.error, /plain amount/i, input);
    }
  });

  it("rejects amounts below the NGN 100 floor", () => {
    const result = parsePriceNairaToKobo("99.99");
    assert.equal(result.ok, false);
    assert.match(result.error, /at least ₦100/i);
  });

  it("rejects amounts above the NGN 1,000,000 ceiling", () => {
    const result = parsePriceNairaToKobo("1000000.01");
    assert.equal(result.ok, false);
    assert.match(result.error, /cannot exceed/i);
  });

  it("accepts exactly the floor and ceiling", () => {
    assert.deepEqual(parsePriceNairaToKobo("100"), { ok: true, kobo: 10_000 });
    assert.deepEqual(parsePriceNairaToKobo("1000000"), { ok: true, kobo: 100_000_000 });
  });
});

describe("formatKoboToNaira", () => {
  it("formats whole-naira amounts without decimals", () => {
    assert.equal(formatKoboToNaira(200_000), "₦2,000");
    assert.equal(formatKoboToNaira(10_000), "₦100");
  });

  it("keeps kobo remainders", () => {
    assert.equal(formatKoboToNaira(250_050), "₦2,500.50");
  });
});

describe("friendlyPricingError", () => {
  it("maps the RPC role gate to a staff-friendly message", () => {
    assert.equal(
      friendlyPricingError("Only a super_admin or finance_admin may manage promotion pricing."),
      "Only a super admin or finance admin may change promotion pricing.",
    );
  });

  it("maps the RPC floor to a staff-friendly message", () => {
    assert.equal(
      friendlyPricingError("Daily promotion price must be at least 10000 kobo (NGN 100 minimum transaction)."),
      "The daily price must be at least ₦100.",
    );
  });

  it("maps sign-in failures without leaking internals", () => {
    assert.equal(
      friendlyPricingError("Sign in is required to manage promotion pricing."),
      "Sign in to use the admin console.",
    );
  });

  it("falls back to a safe retry message for unknown failures", () => {
    assert.equal(
      friendlyPricingError("relation does not exist"),
      "Could not save the new price. Please try again.",
    );
  });
});
