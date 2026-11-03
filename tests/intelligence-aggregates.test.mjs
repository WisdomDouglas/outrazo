// Admin Intelligence aggregate tests (Phase 0). The UTC-day bucketing
// primitives and the snapshot assembly run against a fake query builder that
// implements exactly the two read shapes the aggregates use (head counts and
// bounded created_at series reads): no database, no secrets, no network.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDaySeries,
  dayBucketKey,
  seriesStartIso,
} from "@/showcase/admin/intelligence-time";
import {
  buildIntelligenceSnapshot,
  getEventPerformance,
  getIntelligenceDistribution,
  getIntelligenceTrends,
  INTELLIGENCE_SERIES_ROW_LIMIT,
  intelligenceSnapshotSchema,
  intelligenceWindowSchema,
  listEventPerformance,
} from "@/showcase/admin/intelligence-aggregates.server";

const NOW = "2026-11-05T12:00:00.000Z";
const DAY = 86_400_000;
const at = (offsetMs) => new Date(new Date(NOW).getTime() + offsetMs).toISOString();

class FakeQuery {
  constructor(db, table, columns, opts) {
    this.db = db;
    this.table = table;
    this.columns = columns.split(",").map((name) => name.trim());
    this.head = opts?.head === true;
    this.wantCount = opts?.count === "exact";
    this.filters = [];
    this.sort = null;
    this.rangeFrom = null;
    this.rangeTo = null;
    this.limitN = null;
  }
  eq(col, val) { this.filters.push((row) => row[col] === val); return this; }
  gt(col, val) { this.filters.push((row) => row[col] > val); return this; }
  gte(col, val) { this.filters.push((row) => row[col] >= val); return this; }
  lt(col, val) { this.filters.push((row) => row[col] < val); return this; }
  ilike(col, pattern) {
    const term = pattern.replace(/%/g, "").toLowerCase();
    this.filters.push((row) => String(row[col] ?? "").toLowerCase().includes(term));
    return this;
  }
  or(group) {
    const alts = group.split(",").map((part) => {
      const match = /^(\w+)\.ilike\.%(.*)%$/.exec(part);
      if (!match) throw new Error(`fake cannot parse or() part: ${part}`);
      return { col: match[1], term: match[2].toLowerCase() };
    });
    this.filters.push((row) =>
      alts.some((alt) => String(row[alt.col] ?? "").toLowerCase().includes(alt.term)),
    );
    return this;
  }
  order(col, opts = {}) {
    this.sort = { col, asc: opts.ascending !== false };
    return this;
  }
  range(from, to) { this.rangeFrom = from; this.rangeTo = to; return this; }
  limit(n) { this.limitN = n; return this; }
  then(resolve) {
    if (this.db.failOn.has(this.table)) {
      resolve({ data: null, count: null, error: { message: "db down" } });
      return;
    }
    let rows = [...(this.db.rows[this.table] ?? [])];
    for (const keep of this.filters) rows = rows.filter(keep);
    const count = this.wantCount || this.head ? rows.length : null;
    if (this.sort) {
      const { col, asc } = this.sort;
      rows.sort((a, b) => {
        if (a[col] === b[col]) return 0;
        return (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    if (this.rangeFrom !== null && this.rangeTo !== null) {
      rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    const data = this.head
      ? []
      : rows.map((row) => Object.fromEntries(this.columns.map((col) => [col, row[col]])));
    resolve({ data, count, error: null });
  }
}

class FakeDb {
  constructor(rows = {}) {
    this.rows = rows;
    this.failOn = new Set();
  }
  from(table) {
    const db = this;
    return { select: (columns, opts) => new FakeQuery(db, table, columns, opts) };
  }
}

const ALL_INCLUDED = { events: true, rsvps: true, users: true, organizers: true };
const NONE_INCLUDED = { events: false, rsvps: false, users: false, organizers: false };

describe("intelligence day bucketing", () => {
  it("buckets instants onto UTC calendar days", () => {
    assert.equal(dayBucketKey("2026-11-05T00:00:00.000Z"), "2026-11-05");
    assert.equal(dayBucketKey("2026-11-05T23:59:59.999Z"), "2026-11-05");
    assert.equal(dayBucketKey("2026-11-04T23:00:00+01:00"), "2026-11-04");
    assert.equal(dayBucketKey("not-a-date"), null);
  });

  it("derives the inclusive window start from the end instant", () => {
    assert.equal(seriesStartIso(NOW, 7), "2026-10-30T00:00:00.000Z");
    assert.equal(seriesStartIso(NOW, 1), "2026-11-05T00:00:00.000Z");
  });

  it("builds zero-filled ascending series and ignores noise", () => {
    const points = buildDaySeries(
      [
        at(0), // Nov 5
        at(-DAY), // Nov 4
        at(-DAY - 1000), // Nov 4
        at(-400 * DAY), // far outside: ignored
        "garbage", // unreadable: ignored
      ],
      3,
      NOW,
    );
    assert.deepEqual(points, [
      { date: "2026-11-03", count: 0 },
      { date: "2026-11-04", count: 2 },
      { date: "2026-11-05", count: 1 },
    ]);
  });
});

describe("intelligence window input", () => {
  it("defaults to 30 days within 7..90", () => {
    assert.equal(intelligenceWindowSchema.parse({}).windowDays, 30);
    assert.equal(intelligenceWindowSchema.parse({ windowDays: 7 }).windowDays, 7);
    assert.equal(intelligenceWindowSchema.parse({ windowDays: 90 }).windowDays, 90);
    assert.throws(() => intelligenceWindowSchema.parse({ windowDays: 6 }));
    assert.throws(() => intelligenceWindowSchema.parse({ windowDays: 91 }));
    assert.throws(() => intelligenceWindowSchema.parse({ windowDays: 7.5 }));
  });
});

describe("buildIntelligenceSnapshot", () => {
  function seed() {
    return new FakeDb({
      events: [
        { id: "e1", created_at: at(0), published: true, starts_at: at(DAY) },
        { id: "e2", created_at: at(-2 * DAY), published: true, starts_at: at(-DAY) },
        { id: "e3", created_at: at(-40 * DAY), published: false, starts_at: at(2 * DAY) },
      ],
      event_attendees: [
        { id: "a1", created_at: at(0) },
        { id: "a2", created_at: at(-DAY) },
      ],
      profiles: [{ id: "u1", created_at: at(-3 * DAY) }],
      organizers: [{ id: "o1", created_at: at(-10 * DAY) }],
    });
  }

  it("counts totals and buckets the window series", async () => {
    const snapshot = await buildIntelligenceSnapshot(seed(), {
      windowDays: 7,
      include: ALL_INCLUDED,
      nowIso: NOW,
    });
    assert.equal(snapshot.windowDays, 7);
    assert.equal(snapshot.generatedAt, NOW);
    assert.equal(snapshot.events.total, 3);
    assert.equal(snapshot.events.published, 2);
    assert.equal(snapshot.events.upcoming, 2);
    assert.equal(snapshot.events.series.points.length, 7);
    assert.equal(
      snapshot.events.series.points.reduce((sum, point) => sum + point.count, 0),
      2,
    );
    assert.equal(snapshot.events.series.truncated, false);
    assert.equal(snapshot.rsvps.total, 2);
    assert.equal(snapshot.users.total, 1);
    assert.equal(snapshot.organizers.total, 1);
    assert.ok(intelligenceSnapshotSchema.safeParse(snapshot).success);
  });

  it("nulls excluded sections instead of leaking them", async () => {
    const snapshot = await buildIntelligenceSnapshot(seed(), {
      windowDays: 7,
      include: NONE_INCLUDED,
      nowIso: NOW,
    });
    assert.equal(snapshot.events, null);
    assert.equal(snapshot.rsvps, null);
    assert.equal(snapshot.users, null);
    assert.equal(snapshot.organizers, null);
  });

  it("flags truncated series instead of reporting a silent floor", async () => {
    const rows = Array.from({ length: INTELLIGENCE_SERIES_ROW_LIMIT + 5 }, (_, index) => ({
      id: `a-${index}`,
      created_at: at(0),
    }));
    const db = new FakeDb({ event_attendees: rows });
    const snapshot = await buildIntelligenceSnapshot(db, {
      windowDays: 7,
      include: { ...NONE_INCLUDED, rsvps: true },
      nowIso: NOW,
    });
    assert.equal(snapshot.rsvps.total, INTELLIGENCE_SERIES_ROW_LIMIT + 5);
    assert.equal(snapshot.rsvps.series.truncated, true);
  });

  it("fails closed with a safe message on database errors", async () => {
    const db = seed();
    db.failOn.add("events");
    await assert.rejects(
      buildIntelligenceSnapshot(db, { windowDays: 7, include: ALL_INCLUDED, nowIso: NOW }),
      (error) => {
        assert.equal(error.message, "Could not load intelligence data. Please try again.");
        return true;
      },
    );
  });
});

describe("listEventPerformance", () => {
  function seed() {
    return new FakeDb({
      events: [
        {
          id: "e1", title: "Tech Summit", category: "tech", city: "Lagos",
          published: true, status: "active", starts_at: at(DAY), capacity: 100,
          attendee_count: 25, price_from: 5000, currency: "NGN", created_at: at(0),
          venue_name: "Landmark",
        },
        {
          id: "e2", title: "Food Fair", category: "food", city: null,
          published: false, status: "draft", starts_at: at(2 * DAY), capacity: 0,
          attendee_count: 0, price_from: null, currency: "NGN", created_at: at(-DAY),
          venue_name: "Market",
        },
      ],
      event_attendees: [
        { id: "a1", event_id: "e1", created_at: at(0) },
        { id: "a2", event_id: "e1", created_at: at(0) },
      ],
      saved_events: [{ id: "s1", event_id: "e1", created_at: at(0) }],
      ticket_orders: [
        { id: "t1", event_id: "e1", status: "confirmed", total_amount: 5000, currency: "NGN" },
        { id: "t2", event_id: "e1", status: "confirmed", total_amount: "2500.50", currency: "NGN" },
        { id: "t3", event_id: "e1", status: "refunded", total_amount: 5000, currency: "NGN" },
        { id: "t4", event_id: "e2", status: "confirmed", total_amount: "bogus", currency: "NGN" },
      ],
    });
  }

  it("assembles per-event rows with fill, engagement, and ticket totals", async () => {
    const list = await listEventPerformance(seed(), { includeEngagement: true });
    assert.equal(list.total, 2);
    assert.deepEqual(
      list.events.map((event) => event.id),
      ["e1", "e2"],
    );
    const [first, second] = list.events;
    assert.equal(first.fillPct, 25);
    assert.equal(first.rsvps, 2);
    assert.equal(first.saves, 1);
    assert.deepEqual(first.tickets, {
      orders: 3,
      grossByCurrency: { NGN: 12500.5 },
      byStatus: { confirmed: 2, refunded: 1 },
      truncated: false,
    });
    assert.equal(second.fillPct, null);
    assert.equal(second.city, null);
    assert.equal(second.rsvps, 0);
    assert.equal(second.tickets.orders, 1);
    assert.deepEqual(second.tickets.grossByCurrency, {});
  });

  it("searches titles and paginates with exact totals", async () => {
    const found = await listEventPerformance(seed(), { q: "food", includeEngagement: false });
    assert.equal(found.total, 1);
    assert.deepEqual(
      found.events.map((event) => event.id),
      ["e2"],
    );
    const page = await listEventPerformance(seed(), { limit: 1, offset: 1, includeEngagement: false });
    assert.equal(page.total, 2);
    assert.deepEqual(
      page.events.map((event) => event.id),
      ["e2"],
    );
  });

  it("nulls engagement instead of leaking or zeroing it", async () => {
    const list = await listEventPerformance(seed(), { includeEngagement: false });
    for (const event of list.events) {
      assert.equal(event.rsvps, null);
      assert.equal(event.saves, null);
      assert.equal(event.tickets, null);
    }
  });

  it("degrades divergent live rows instead of failing the page", async () => {
    const db = new FakeDb({
      events: [
        {
          id: "e-null", title: null, category: null, city: null,
          published: null, status: null, starts_at: null, capacity: null,
          attendee_count: null, price_from: "2500.50", currency: null,
          created_at: at(0),
        },
      ],
      event_attendees: [],
      saved_events: [],
      ticket_orders: [],
    });
    const list = await listEventPerformance(db, { includeEngagement: true });
    assert.equal(list.total, 1);
    assert.deepEqual(list.events[0], {
      id: "e-null",
      title: "(Untitled event)",
      category: "Unspecified",
      city: null,
      published: false,
      status: "unknown",
      startsAt: null,
      capacity: 0,
      attendeeCount: 0,
      fillPct: null,
      priceFrom: 2500.5,
      currency: "NGN",
      rsvps: 0,
      saves: 0,
      tickets: { orders: 0, grossByCurrency: {}, byStatus: {}, truncated: false },
    });
  });
});

describe("getEventPerformance", () => {
  it("loads one event or reports it missing", async () => {
    const db = new FakeDb({
      events: [
        {
          id: "e1", title: "Tech Summit", category: "tech", city: "Lagos",
          published: true, status: "active", starts_at: at(DAY), capacity: 50,
          attendee_count: 10, price_from: null, currency: "NGN", created_at: at(0),
        },
      ],
      event_attendees: [{ id: "a1", event_id: "e1" }],
      saved_events: [],
      ticket_orders: [],
    });
    const row = await getEventPerformance(db, "e1", true);
    assert.equal(row.title, "Tech Summit");
    assert.equal(row.fillPct, 20);
    assert.equal(row.rsvps, 1);
    assert.equal(row.saves, 0);
    await assert.rejects(
      getEventPerformance(db, "nope", true),
      (error) => {
        assert.equal(error.message, "That event no longer exists.");
        return true;
      },
    );
  });
});

describe("getIntelligenceTrends", () => {
  it("returns one series per included domain and nulls the rest", async () => {
    const db = new FakeDb({
      event_attendees: [{ id: "a1", created_at: at(0) }],
      saved_events: [{ id: "s1", created_at: at(-DAY) }],
      event_reports: [{ id: "r1", created_at: at(0) }],
    });
    const trends = await getIntelligenceTrends(db, {
      windowDays: 7,
      include: {
        events: false, rsvps: true, users: false, organizers: false,
        saves: true, tickets: false, reports: true,
      },
      nowIso: NOW,
    });
    assert.equal(trends.events, null);
    assert.equal(trends.users, null);
    assert.equal(trends.rsvps.points.length, 7);
    assert.equal(
      trends.rsvps.points.reduce((sum, point) => sum + point.count, 0),
      1,
    );
    assert.equal(
      trends.saves.points.reduce((sum, point) => sum + point.count, 0),
      1,
    );
    assert.equal(
      trends.reports.points.reduce((sum, point) => sum + point.count, 0),
      1,
    );
  });
});

describe("getIntelligenceDistribution", () => {
  it("groups events, cities, and engagement by category", async () => {
    const db = new FakeDb({
      events: [
        { id: "e1", category: "tech", city: "Lagos" },
        { id: "e2", category: "tech", city: "Abuja" },
        { id: "e3", category: "", city: null },
      ],
      event_attendees: [
        { id: "a1", event_id: "e1" },
        { id: "a2", event_id: "e1" },
        { id: "a3", event_id: "missing" },
      ],
      saved_events: [{ id: "s1", event_id: "e2" }],
    });
    const dist = await getIntelligenceDistribution(db, {
      includeEvents: true,
      includeEngagement: true,
      nowIso: NOW,
    });
    assert.deepEqual(dist.eventsByCategory.items, [
      { label: "tech", count: 2 },
      { label: "Unspecified", count: 1 },
    ]);
    assert.equal(dist.eventsByCategory.other, 0);
    assert.equal(dist.eventsByCity.items.length, 3);
    assert.deepEqual(dist.rsvpsByCategory.items, [
      { label: "tech", count: 2 },
      { label: "Unspecified", count: 1 },
    ]);
    assert.deepEqual(dist.savesByCategory.items, [{ label: "tech", count: 1 }]);
    assert.equal(dist.rsvpsByCategory.truncated, false);
  });

  it("nulls sections the caller may not see", async () => {
    const dist = await getIntelligenceDistribution(new FakeDb({ events: [] }), {
      includeEvents: true,
      includeEngagement: false,
      nowIso: NOW,
    });
    assert.deepEqual(dist.eventsByCategory.items, []);
    assert.equal(dist.rsvpsByCategory, null);
    assert.equal(dist.savesByCategory, null);
  });
});

describe("intelligenceSnapshotSchema", () => {
  it("rejects malformed snapshots", () => {
    assert.equal(
      intelligenceSnapshotSchema.safeParse({
        generatedAt: NOW,
        windowDays: 7,
        events: { total: -1, published: 0, upcoming: 0, series: { points: [], truncated: false } },
        rsvps: null,
        users: null,
        organizers: null,
      }).success,
      false,
    );
    assert.equal(
      intelligenceSnapshotSchema.safeParse({
        generatedAt: NOW,
        windowDays: 7,
        events: null,
        rsvps: { total: 0, series: { points: [{ date: "05/11/2026", count: 0 }], truncated: false } },
        users: null,
        organizers: null,
      }).success,
      false,
    );
  });
});
