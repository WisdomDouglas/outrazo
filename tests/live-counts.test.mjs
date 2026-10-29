// Live-count helper tests. The channel manager (`live-count-store.ts`) owns
// the websocket and is verified manually; everything imported here is pure.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attendeeChannelName,
  attendeeEventFilter,
  COUNTS_CHANNEL,
  extractCountUpdate,
  reduceCountUpdate,
} from "@/showcase/rsvp/live-counts";

describe("extractCountUpdate", () => {
  const valid = {
    eventType: "UPDATE",
    new: { id: "event-1", attendee_count: 42 },
  };

  it("accepts well-formed UPDATE payloads", () => {
    assert.deepEqual(extractCountUpdate(valid), { eventId: "event-1", count: 42 });
  });

  it("floors fractional counts", () => {
    assert.equal(
      extractCountUpdate({ eventType: "UPDATE", new: { id: "e", attendee_count: 7.9 } })?.count,
      7,
    );
  });

  it("rejects other event types and malformed payloads", () => {
    assert.equal(extractCountUpdate({ ...valid, eventType: "INSERT" }), null);
    assert.equal(extractCountUpdate({ eventType: "UPDATE" }), null);
    assert.equal(extractCountUpdate({ eventType: "UPDATE", new: null }), null);
    assert.equal(extractCountUpdate({ eventType: "UPDATE", new: { attendee_count: 1 } }), null);
    assert.equal(extractCountUpdate({ eventType: "UPDATE", new: { id: "", attendee_count: 1 } }), null);
    assert.equal(extractCountUpdate({ eventType: "UPDATE", new: { id: "e", attendee_count: -1 } }), null);
    assert.equal(extractCountUpdate({ eventType: "UPDATE", new: { id: "e", attendee_count: NaN } }), null);
    assert.equal(extractCountUpdate({ eventType: "UPDATE", new: { id: "e", attendee_count: "3" } }), null);
    assert.equal(extractCountUpdate(null), null);
    assert.equal(extractCountUpdate("UPDATE"), null);
  });
});

describe("reduceCountUpdate", () => {
  it("sets previously unseen counts", () => {
    const next = reduceCountUpdate(new Map(), { eventId: "a", count: 5 });
    assert.ok(next);
    assert.equal(next.get("a"), 5);
  });

  it("overwrites with the absolute value, so echoes converge", () => {
    const first = reduceCountUpdate(new Map([["a", 5]]), { eventId: "a", count: 6 });
    assert.ok(first);
    assert.equal(first.get("a"), 6);
    // A delayed older echo overwrites back; the next fresh echo corrects it.
    const stale = reduceCountUpdate(first, { eventId: "a", count: 5 });
    assert.ok(stale);
    assert.equal(stale.get("a"), 5);
  });

  it("returns null when nothing changed", () => {
    assert.equal(reduceCountUpdate(new Map([["a", 5]]), { eventId: "a", count: 5 }), null);
  });

  it("keeps other events untouched", () => {
    const next = reduceCountUpdate(new Map([["a", 1], ["b", 2]]), { eventId: "a", count: 9 });
    assert.ok(next);
    assert.equal(next.get("a"), 9);
    assert.equal(next.get("b"), 2);
  });
});

describe("channel and filter builders", () => {
  it("uses one shared counts channel", () => {
    assert.equal(COUNTS_CHANNEL, "event-attendee-counts");
  });

  it("builds per-event attendee channels and server-side filters", () => {
    assert.equal(attendeeChannelName("event-9"), "attendees:event-9");
    assert.equal(attendeeEventFilter("event-9"), "event_id=eq.event-9");
  });
});
