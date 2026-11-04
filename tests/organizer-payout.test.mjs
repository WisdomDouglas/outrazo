// Payout-details validation tests (P2). Shared by the organizer form
// and the save server function, so both enforce the same rules.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { maskAccountNumber, validatePayoutDetails } from "@/showcase/organizer/organizer-payout";

const ORGANIZER_ID = "aaaaaaaa-0000-0000-0000-000000000000";

function validInput(overrides = {}) {
  return {
    organizerId: ORGANIZER_ID,
    bankName: "GTBank",
    accountNumber: "0123456789",
    accountName: "Ada Obi",
    ...overrides,
  };
}

describe("validatePayoutDetails", () => {
  it("accepts complete valid details", () => {
    const result = validatePayoutDetails(validInput());
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, validInput());
  });

  it("trims surrounding whitespace", () => {
    const result = validatePayoutDetails(validInput({ bankName: "  GTBank ", accountName: " Ada Obi " }));
    assert.equal(result.ok, true);
    assert.equal(result.value.bankName, "GTBank");
    assert.equal(result.value.accountName, "Ada Obi");
  });

  it("rejects non-10-digit account numbers", () => {
    for (const accountNumber of ["123", "012345678", "01234567890", "abcdefghij", "0123-4567", ""]) {
      const result = validatePayoutDetails(validInput({ accountNumber }));
      assert.equal(result.ok, false, accountNumber || "(empty)");
      assert.match(result.error, /10-digit/, accountNumber || "(empty)");
    }
  });

  it("rejects blank names with field-specific messages", () => {
    assert.match(validatePayoutDetails(validInput({ bankName: " " })).error, /bank's name/);
    assert.match(validatePayoutDetails(validInput({ accountName: "x" })).error, /name on the account/);
  });

  it("rejects invalid organizer ids", () => {
    const result = validatePayoutDetails(validInput({ organizerId: "not-a-uuid" }));
    assert.equal(result.ok, false);
    assert.match(result.error, /organizer profile/);
  });
});

describe("maskAccountNumber", () => {
  it("shows only the last two digits", () => {
    assert.equal(maskAccountNumber("0123456789"), "••••••89");
  });

  it("hides short or empty values entirely", () => {
    assert.equal(maskAccountNumber(""), "••••");
    assert.equal(maskAccountNumber("12"), "••••");
  });
});
