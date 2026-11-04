// Ticket-code normalization tests (P3). Shared by the check-in form,
// the camera scanner, and the server function.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeTicketCode, TICKET_CODE_RE } from "@/showcase/tickets/ticket-codes";

describe("normalizeTicketCode", () => {
  it("accepts well-formed codes", () => {
    assert.deepEqual(normalizeTicketCode("TKT-A1B2C3D4E5"), { ok: true, code: "TKT-A1B2C3D4E5" });
  });

  it("trims scanner whitespace and uppercases", () => {
    assert.deepEqual(normalizeTicketCode("  tkt-a1b2c3d4e5\n"), { ok: true, code: "TKT-A1B2C3D4E5" });
  });

  it("rejects blanks with a friendly error", () => {
    const result = normalizeTicketCode("   ");
    assert.equal(result.ok, false);
    assert.match(result.error, /Enter or scan/);
  });

  it("rejects malformed codes", () => {
    for (const input of ["TKT-SHORT", "TKT-A1B2C3D4E5F6", "ABC-A1B2C3D4E5", "TKT-G1B2C3D4E5", "TKT-A1B2C3D4E!"]) {
      const result = normalizeTicketCode(input);
      assert.equal(result.ok, false, input);
      assert.match(result.error, /doesn't look like/, input);
    }
  });

  it("pins the code shape", () => {
    assert.equal(TICKET_CODE_RE.source, "^TKT-[0-9A-F]{10}$");
  });
});
