// Free-RSVP helper tests. The data layer (`rsvp.ts`) talks to Supabase and is
// verified manually; everything imported here is pure and runs in Node.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attendeeDisplayName,
  classifyReservationError,
  formatReservationDate,
} from "@/showcase/rsvp/reservation-helpers";

describe("classifyReservationError", () => {
  it("treats unique violations as already-reserved when reserving", () => {
    const shapes = [
      { code: "23505", message: 'duplicate key value violates unique constraint "event_attendees_event_id_user_id_key"' },
      { code: "409", message: "Conflict" },
      { message: "duplicate key value violates unique constraint" },
    ];
    for (const shape of shapes) {
      const result = classifyReservationError(shape, "reserve");
      assert.equal(result.kind, "already-reserved");
      assert.match(result.message, /already going/);
    }
  });

  it("never reports already-reserved for cancel or load failures", () => {
    assert.notEqual(classifyReservationError({ code: "23505" }, "cancel").kind, "already-reserved");
    assert.notEqual(classifyReservationError({ code: "23505" }, "load").kind, "already-reserved");
  });

  it("maps permission denials without leaking provider wording", () => {
    const shapes = [
      { code: "42501", message: "permission denied for table event_attendees" },
      { message: "new row violates row-level security policy" },
    ];
    for (const shape of shapes) {
      const result = classifyReservationError(shape, "reserve");
      assert.equal(result.kind, "denied");
      assert.match(result.message, /permissions/);
      assert.doesNotMatch(result.message.toLowerCase(), /row-level|42501/);
    }
  });

  it("maps connectivity problems to a retry message", () => {
    const result = classifyReservationError(new TypeError("fetch failed"), "reserve");
    assert.equal(result.kind, "network");
    assert.match(result.message, /connection/);
  });

  it("falls back to a per-action generic message", () => {
    assert.equal(classifyReservationError({}, "reserve").kind, "unknown");
    assert.match(classifyReservationError({}, "reserve").message, /reserve your spot/);
    assert.match(classifyReservationError(null, "cancel").message, /cancel/);
    assert.match(classifyReservationError(undefined, "load").message, /load/);
  });

  it("maps empty single-row results to not-found", () => {
    const result = classifyReservationError({ code: "PGRST116", message: "The result contains 0 rows" }, "load");
    assert.equal(result.kind, "not-found");
  });
});

describe("formatReservationDate", () => {
  it("formats valid instants as a short date", () => {
    assert.match(formatReservationDate("2026-01-15T12:00:00.000Z"), /\d{1,2} \w{3} \d{4}/);
  });

  it("falls back gracefully for invalid input", () => {
    assert.equal(formatReservationDate("not-a-date"), "recently");
    assert.equal(formatReservationDate(""), "recently");
  });
});

describe("attendeeDisplayName", () => {
  it("prefers the profile name", () => {
    assert.equal(attendeeDisplayName({ name: "  Adaeze ", email: "ada@example.com" }), "Adaeze");
  });

  it("falls back to the email prefix, never the full address", () => {
    assert.equal(attendeeDisplayName({ name: null, email: "ada@example.com" }), "ada");
  });

  it("falls back to Guest", () => {
    assert.equal(attendeeDisplayName({ name: null, email: null }), "Guest");
    assert.equal(attendeeDisplayName(null), "Guest");
  });
});
