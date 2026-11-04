import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateProfileUpdate } from "@/showcase/account/profile-update";

describe("profile update validation", () => {
  it("accepts a trimmed name and a known state", () => {
    const result = validateProfileUpdate({ name: "  Adaeze  ", location: "Lagos" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value, { name: "Adaeze", location: "Lagos" });
    }
  });

  it("rejects short, blank, and overlong names", () => {
    for (const name of ["", " ", "A", "x".repeat(61)]) {
      const result = validateProfileUpdate({ name, location: "Lagos" });
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.error, /name/i);
    }
  });

  it("rejects blank and unknown locations", () => {
    for (const location of ["", "   ", "Narnia", "Lagos State "]) {
      const result = validateProfileUpdate({ name: "Adaeze", location });
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.error, /state/i);
    }
  });
});
