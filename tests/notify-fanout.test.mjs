import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { notifyEventCancelled } from "@/showcase/notifications/notify-fanout.server";

class FakeTable {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  limit() {
    return this;
  }

  select() {
    return this;
  }

  rows() {
    return this.db[this.table].filter((row) => this.filters.every((matches) => matches(row)));
  }

  async then(resolve) {
    if (this.db.failReads) return resolve({ data: null, error: { message: "db down" } });
    return resolve({ data: this.rows(), error: null });
  }

  async insert(payload) {
    if (this.db.failWrites) return { data: null, error: { message: "db down" } };
    const rows = Array.isArray(payload) ? payload : [payload];
    for (const row of rows) this.db.inserted.push({ table: this.table, ...row });
    return { data: rows, error: null };
  }
}

class FakeDb {
  constructor(seed = {}) {
    this.ticket_orders = seed.orders ?? [];
    this.event_attendees = seed.attendees ?? [];
    this.inserted = [];
    this.failReads = false;
    this.failWrites = false;
  }

  from(table) {
    return new FakeTable(this, table);
  }
}

const EVENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("cancel notification fan-out", () => {
  it("notifies each paid buyer and RSVP holder exactly once", async () => {
    const db = new FakeDb({
      orders: [
        { user_id: "buyer-1", event_id: EVENT_ID, status: "paid" },
        { user_id: "buyer-2", event_id: EVENT_ID, status: "paid" },
        { user_id: "window-shopper", event_id: EVENT_ID, status: "pending" },
        { user_id: "other-event-buyer", event_id: "other-event", status: "paid" },
      ],
      attendees: [
        { user_id: "rsvp-1", event_id: EVENT_ID },
        // Buyer 2 also RSVPd: one person, one note.
        { user_id: "buyer-2", event_id: EVENT_ID },
      ],
    });
    await notifyEventCancelled(db, { eventId: EVENT_ID, eventTitle: "Lagos Food Fest" });
    const notes = db.inserted.filter((row) => row.table === "notifications");
    assert.deepEqual(
      notes.map((row) => row.user_id).sort(),
      ["buyer-1", "buyer-2", "rsvp-1"],
    );
    for (const note of notes) {
      assert.equal(note.type, "event_cancelled");
      assert.match(note.body, /Lagos Food Fest/);
      assert.equal(note.link, `/events/${EVENT_ID}`);
    }
  });

  it("writes nothing when nobody is affected", async () => {
    const db = new FakeDb();
    await notifyEventCancelled(db, { eventId: EVENT_ID, eventTitle: "Empty Meetup" });
    assert.equal(db.inserted.length, 0);
  });

  it("never throws: read and write faults stay best-effort", async () => {
    const readFault = new FakeDb({
      orders: [{ user_id: "buyer-1", event_id: EVENT_ID, status: "paid" }],
    });
    readFault.failReads = true;
    await notifyEventCancelled(readFault, { eventId: EVENT_ID, eventTitle: "Lagos Food Fest" });

    const writeFault = new FakeDb({
      orders: [{ user_id: "buyer-1", event_id: EVENT_ID, status: "paid" }],
    });
    writeFault.failWrites = true;
    await notifyEventCancelled(writeFault, { eventId: EVENT_ID, eventTitle: "Lagos Food Fest" });
    assert.equal(writeFault.inserted.length, 0);
  });
});
