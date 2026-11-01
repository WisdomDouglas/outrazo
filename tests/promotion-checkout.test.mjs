// Promotion checkout tests (P2 Step 4A).
//
// The checkout core runs with injected fakes: an in-memory database for the
// service-role queries, a scripted fetch for Bachs, a fixed clock, and fixed
// reference suffixes. No test touches the network, a real secret, or live data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildProviderReference,
  CHECKOUT_EXPIRY_SKEW_MARGIN_MS,
  createPromotionCheckout,
  getPromotionQuote,
  PromotionCheckoutError,
  resolveAppUrl,
  settleOrderByVerification,
} from "@/showcase/promotions/promotion-checkout.server";

const NOW_MS = 1_700_000_000_000;
const APP_URL = "https://app.outrazo.test";
const USER_ID = "user-organizer-1";
const EVENT_ID = "11111111-2222-3333-4444-555555555555";

// The Step 2 client reads its key from the environment only. Fake sandbox
// key for this suite; the stubbed fetch never sends it anywhere.
process.env["BACHS_API_KEY"] = "sk_sandbox_test-only-never-a-real-secret";
delete process.env["BACHS_BASE_URL"];

function iso(ms) {
  return new Date(ms).toISOString();
}

class FakeTable {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.ordering = null;
    this.pendingUpdate = null;
    this.pendingInsert = null;
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  order(column, { ascending }) {
    this.ordering = { column, ascending };
    return this;
  }

  rows() {
    const store =
      this.table === "events"
        ? this.db.events
        : this.table === "promotion_pricing"
          ? this.db.prices
          : this.db.orders;
    const list = [...store.values()].filter((row) =>
      this.filters.every((matches) => matches(row)),
    );
    if (this.ordering) {
      const { column, ascending } = this.ordering;
      list.sort((a, b) =>
        ascending
          ? String(a[column]).localeCompare(String(b[column]))
          : String(b[column]).localeCompare(String(a[column])),
      );
    }
    return list;
  }

  insert(row) {
    this.pendingInsert = row;
    return this;
  }

  update(patch) {
    this.pendingUpdate = patch;
    return this;
  }

  select() {
    if (this.pendingInsert) return this.executeInsert();
    if (this.pendingUpdate) return this.executeUpdate();
    return this;
  }

  limit(n) {
    if (this.db.failMode) return { data: null, error: { message: "db down" } };
    return { data: this.rows().slice(0, n), error: null };
  }

  async maybeSingle() {
    if (this.db.failMode) return { data: null, error: { message: "db down" } };
    const matched = this.rows();
    return { data: matched[0] ?? null, error: null };
  }

  executeInsert() {
    if (this.db.failMode) {
      return { data: null, error: { message: "db down" } };
    }
    const row = this.pendingInsert;
    const pendingClash = [...this.db.orders.values()].some(
      (existing) =>
        existing.event_id === row.event_id && existing.status === "pending",
    );
    if (pendingClash) {
      return {
        data: null,
        error: { code: "23505", message: "one pending order per event" },
      };
    }
    const referenceClash = [...this.db.orders.values()].some(
      (existing) => existing.provider_reference === row.provider_reference,
    );
    if (referenceClash) {
      return {
        data: null,
        error: { code: "23505", message: "duplicate provider reference" },
      };
    }
    const stored = {
      id: `order-${this.db.orders.size + 1}`,
      status: "pending",
      status_reason: null,
      currency: "NGN",
      provider: "bachs",
      promotion_id: null,
      paid_at: null,
      created_at: iso(NOW_MS),
      checkout_id: null,
      checkout_url: null,
      checkout_expires_at: null,
      ...row,
    };
    this.db.orders.set(stored.id, stored);
    return { data: [stored], error: null };
  }

  executeUpdate() {
    if (this.db.failMode) {
      return { data: null, error: { message: "db down" } };
    }
    // One-shot interleave hook: lets a test commit a competing write (or a
    // settlement) inside this update, genuinely exercising lost-update races.
    if (this.db.interleave) {
      const run = this.db.interleave;
      this.db.interleave = null;
      run();
    }
    if (this.db.nextUpdate === "error") {
      this.db.nextUpdate = null;
      return { data: null, error: { message: "save lost" } };
    }
    if (this.db.nextUpdate === "zero-rows") {
      this.db.nextUpdate = null;
      return { data: [], error: null };
    }
    const matched = this.rows();
    for (const row of matched) Object.assign(row, this.pendingUpdate);
    return { data: matched, error: null };
  }
}

class FakeDb {
  constructor() {
    this.events = new Map();
    this.prices = new Map();
    this.orders = new Map();
    this.promotions = [];
    this.rpcCalls = [];
    this.failMode = false;
    this.nextUpdate = null;
    this.interleave = null;
  }

  from(table) {
    return new FakeTable(this, table);
  }

  async rpc(name, args) {
    this.rpcCalls.push({ name, args });
    if (this.failMode) return { data: null, error: { message: "db down" } };
    try {
      if (name === "activate_paid_promotion") {
        return { data: this.activate(args), error: null };
      }
      if (name === "cancel_promotion_order") {
        return { data: this.cancel(args), error: null };
      }
      return { data: null, error: { message: `unknown rpc ${name}` } };
    } catch (rpcError) {
      return { data: null, error: { message: rpcError.message } };
    }
  }

  activate(args) {
    const order = this.orders.get(args.p_order_id);
    if (!order) throw new Error("Promotion order not found.");
    if (order.status === "paid") return "paid";
    if (order.status === "refund_pending" || order.status === "refunded") {
      return order.status;
    }
    if (
      order.provider_reference !== args.p_provider_reference ||
      order.total_amount_kobo !== args.p_amount_kobo
    ) {
      order.status = "refund_pending";
      order.status_reason = "amount_mismatch";
      return "refund_pending";
    }
    order.status = "paid";
    order.status_reason = null;
    order.paid_at = iso(NOW_MS);
    order.promotion_id = `promo-${this.promotions.length + 1}`;
    this.promotions.push({ orderId: order.id });
    return "paid";
  }

  cancel(args) {
    const order = this.orders.get(args.p_order_id);
    if (!order) throw new Error("Promotion order not found.");
    if (order.organizer_id !== args.p_actor_id) {
      throw new Error("That order belongs to a different organizer.");
    }
    if (order.status === "paid") {
      throw new Error("That order is already paid.");
    }
    if (order.status === "refund_pending" || order.status === "refunded") {
      throw new Error("That order is already in the refund process.");
    }
    if (
      order.status === "failed" ||
      order.status === "expired" ||
      order.status === "cancelled"
    ) {
      return order.status;
    }
    order.status = "cancelled";
    order.status_reason = "cancelled_by_organizer";
    return "cancelled";
  }
}

function seedEvent(db, overrides = {}) {
  const event = {
    id: EVENT_ID,
    created_by: USER_ID,
    published: true,
    status: "active",
    ends_at: iso(NOW_MS + 7 * 24 * 3_600_000),
    ...overrides,
  };
  db.events.set(event.id, event);
  return event;
}

function seedPrice(db, dailyKobo = 200_000, effectiveAt = iso(NOW_MS)) {
  const row = {
    id: `price-${db.prices.size + 1}`,
    daily_amount_kobo: dailyKobo,
    currency: "NGN",
    effective_at: effectiveAt,
    created_by: null,
    created_at: effectiveAt,
  };
  db.prices.set(row.id, row);
  return row;
}

function seedOrder(db, overrides = {}) {
  const order = {
    id: `order-${db.orders.size + 1}`,
    event_id: EVENT_ID,
    organizer_id: USER_ID,
    days: 2,
    daily_amount_kobo: 200_000,
    total_amount_kobo: 400_000,
    currency: "NGN",
    status: "pending",
    status_reason: null,
    provider: "bachs",
    provider_reference: `promo-seed-${db.orders.size + 1}`,
    promotion_id: null,
    paid_at: null,
    created_at: iso(NOW_MS),
    checkout_id: null,
    checkout_url: null,
    checkout_expires_at: null,
    ...overrides,
  };
  db.orders.set(order.id, order);
  return order;
}

function liveTriple(orderId, createdMs = NOW_MS) {
  return {
    checkout_id: `chk_${orderId}`,
    checkout_url: `https://pay.bachs.test/c/${orderId}`,
    checkout_expires_at: iso(createdMs + 24 * 3_600_000),
  };
}

function checkoutResponseBody(checkoutId = "chk_new_1") {
  return {
    checkout_id: checkoutId,
    checkout_url: `https://pay.bachs.test/c/${checkoutId}`,
  };
}

function paidVerifyBody(overrides = {}) {
  return {
    status: "completed",
    payment_status: "succeeded",
    amount: "4000.00",
    currency: "NGN",
    reference: "promo-seed-1",
    metadata: {},
    ...overrides,
  };
}

function unpaidVerifyBody(overrides = {}) {
  return {
    status: "open",
    payment_status: null,
    amount: null,
    currency: null,
    reference: null,
    metadata: {},
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Scripted Bachs stub. Handlers receive the parsed call and return a
// Response or throw; every call is captured for idempotency assertions.
function scriptFetch({ onCheckout, onVerify }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers ?? {});
    const call = {
      method,
      url,
      idempotencyKey: headers.get("Idempotency-Key"),
      body: init.body ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    if (method === "POST" && url.endsWith("/v1/checkout-sessions")) {
      return onCheckout(call);
    }
    if (method === "GET" && url.includes("/v1/checkout-sessions/")) {
      return onVerify(call);
    }
    throw new Error(`unexpected Bachs call ${method} ${url}`);
  };
  return { fetchImpl, calls };
}

function checkoutSuccess(checkoutId = "chk_new_1") {
  return scriptFetch({
    onCheckout: () => jsonResponse(checkoutResponseBody(checkoutId)),
    onVerify: () => jsonResponse(unpaidVerifyBody()),
  });
}

function input(overrides = {}) {
  return {
    eventId: EVENT_ID,
    days: 2,
    customerEmail: "organizer@example.ng",
    userId: USER_ID,
    ...overrides,
  };
}

function deps(db, stub, overrides = {}) {
  return {
    fetchImpl: stub.fetchImpl,
    supabase: db,
    nowMs: NOW_MS,
    appUrl: APP_URL,
    randomSuffix: () => "a1b2c3d4e5f6",
    ...overrides,
  };
}

async function rejectsWith(promise, code) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof PromotionCheckoutError);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected rejection with code ${code}`);
}

describe("APP_URL resolution", () => {
  const saved = process.env["APP_URL"];

  function restore() {
    if (saved === undefined) delete process.env["APP_URL"];
    else process.env["APP_URL"] = saved;
  }

  it("requires an explicit server-side origin", () => {
    delete process.env["APP_URL"];
    assert.throws(() => resolveAppUrl(), (error) => {
      assert.ok(error instanceof PromotionCheckoutError);
      assert.equal(error.code, "config");
      return true;
    });
    restore();
  });

  it("rejects malformed, non-http, and remote-http origins", () => {
    for (const bad of [
      "not-a-url",
      "ftp://files.example.com/app",
      "http://app.outrazo.test/checkout",
      "http://192.168.1.10:3000",
    ]) {
      assert.throws(() => resolveAppUrl(bad), (error) => {
        assert.ok(error instanceof PromotionCheckoutError);
        assert.equal(error.code, "config");
        return true;
      }, bad);
    }
  });

  it("accepts https anywhere and http on loopback, normalized to origin", () => {
    assert.equal(
      resolveAppUrl("https://outrazo.vercel.app/some/path?x=1"),
      "https://outrazo.vercel.app",
    );
    assert.equal(
      resolveAppUrl("https://outrazo.vercel.app:8443/"),
      "https://outrazo.vercel.app:8443",
    );
    for (const loopback of [
      "http://localhost:3000/app",
      "http://127.0.0.1:3000/",
      "http://[::1]:3000/callback",
    ]) {
      assert.ok(resolveAppUrl(loopback).startsWith("http://"), loopback);
    }
  });
});

describe("provider references", () => {
  it("builds charset-safe references inside the length limit", () => {
    const reference = buildProviderReference(EVENT_ID, "a1b2c3d4e5f6");
    assert.match(reference, /^[A-Za-z0-9._=-]+$/);
    assert.ok(reference.length <= 128);
    assert.ok(reference.startsWith("promo_11111111_"));
  });

  it("rejects suffixes that would violate the database constraint", () => {
    assert.throws(
      () => buildProviderReference(EVENT_ID, "has spaces!"),
      (error) => error instanceof PromotionCheckoutError,
    );
    assert.throws(
      () => buildProviderReference(EVENT_ID, "x".repeat(200)),
      (error) => error instanceof PromotionCheckoutError,
    );
  });
});

describe("promotion quotes", () => {
  it("prices days times the current daily rate", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db, 200_000);
    const quote = await getPromotionQuote(
      { eventId: EVENT_ID, days: 3 },
      deps(db, checkoutSuccess()),
    );
    assert.deepEqual(quote, {
      eventId: EVENT_ID,
      days: 3,
      dailyKobo: 200_000,
      totalKobo: 600_000,
      currency: "NGN",
    });
    assert.equal(db.orders.size, 0);
  });

  it("uses the latest effective price row", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db, 100_000, iso(NOW_MS - 10_000));
    seedPrice(db, 250_000, iso(NOW_MS));
    const quote = await getPromotionQuote(
      { eventId: EVENT_ID, days: 1 },
      deps(db, checkoutSuccess()),
    );
    assert.equal(quote.dailyKobo, 250_000);
  });

  it("refuses unknown, draft, cancelled, and ended events", async () => {
    const db = new FakeDb();
    seedPrice(db);
    await rejectsWith(
      getPromotionQuote({ eventId: "missing", days: 1 }, deps(db, checkoutSuccess())),
      "not-found",
    );
    for (const [label, overrides, code] of [
      ["draft", { published: false }, "ineligible"],
      ["cancelled", { status: "cancelled" }, "ineligible"],
      ["ended", { ends_at: iso(NOW_MS - 1) }, "ineligible"],
    ]) {
      const eventDb = new FakeDb();
      seedEvent(eventDb, { id: `event-${label}`, ...overrides });
      seedPrice(eventDb);
      await rejectsWith(
        getPromotionQuote(
          { eventId: `event-${label}`, days: 1 },
          deps(eventDb, checkoutSuccess()),
        ),
        code,
      );
    }
  });

  it("fails cleanly without pricing and without writing orders", async () => {
    const db = new FakeDb();
    seedEvent(db);
    await rejectsWith(
      getPromotionQuote({ eventId: EVENT_ID, days: 1 }, deps(db, checkoutSuccess())),
      "no-pricing",
    );
    assert.equal(db.orders.size, 0);
  });

  it("validates duration bounds", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    for (const days of [0, 31, 2.5, Number.NaN]) {
      await rejectsWith(
        getPromotionQuote({ eventId: EVENT_ID, days }, deps(db, checkoutSuccess())),
        "validation",
      );
    }
  });
});

describe("checkout creation", () => {
  it("snapshots server-side price and opens exactly one Bachs session", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db, 200_000);
    const stub = checkoutSuccess("chk_fresh_1");
    const result = await createPromotionCheckout(input({ days: 2 }), deps(db, stub));
    assert.equal(result.status, "ready");
    assert.equal(result.days, 2);
    assert.equal(result.totalKobo, 400_000);
    assert.equal(result.checkoutUrl, "https://pay.bachs.test/c/chk_fresh_1");

    const order = db.orders.get(result.orderId);
    assert.equal(order.event_id, EVENT_ID);
    assert.equal(order.organizer_id, USER_ID);
    assert.equal(order.days, 2);
    assert.equal(order.daily_amount_kobo, 200_000);
    assert.equal(order.total_amount_kobo, 400_000);
    assert.equal(order.currency, "NGN");
    assert.equal(order.status, "pending");
    assert.equal(order.provider, "bachs");
    assert.match(order.provider_reference, /^promo_11111111_a1b2c3d4e5f6$/);
    assert.equal(order.checkout_id, "chk_fresh_1");
    assert.equal(order.checkout_url, "https://pay.bachs.test/c/chk_fresh_1");
    assert.equal(
      order.checkout_expires_at,
      iso(NOW_MS + 24 * 3_600_000 - CHECKOUT_EXPIRY_SKEW_MARGIN_MS),
    );

    assert.equal(stub.calls.length, 1);
    const [call] = stub.calls;
    assert.equal(call.idempotencyKey, result.orderId);
    assert.equal(call.body.reference, order.provider_reference);
    assert.equal(call.body.pricing.amount, "4000.00");
    assert.equal(call.body.pricing.currency, "NGN");
    assert.deepEqual(call.body.metadata, { order_id: result.orderId });
    assert.equal(call.body.customer.email, "organizer@example.ng");
    assert.equal(
      call.body.success_url,
      `${APP_URL}/app/promotions/success?order=${result.orderId}`,
    );
    assert.equal(
      call.body.cancel_url,
      `${APP_URL}/app/promotions/cancelled?order=${result.orderId}`,
    );
  });

  it("refuses foreign, draft, cancelled, and ended events without writing", async () => {
    for (const [label, eventOverrides, inputOverrides, code] of [
      ["foreign", { created_by: "someone-else" }, {}, "forbidden"],
      ["draft", { published: false }, {}, "ineligible"],
      ["cancelled", { status: "cancelled" }, {}, "ineligible"],
      ["ended", { ends_at: iso(NOW_MS - 1) }, {}, "ineligible"],
      ["missing", null, { eventId: "nope" }, "not-found"],
    ]) {
      const db = new FakeDb();
      if (eventOverrides) seedEvent(db, eventOverrides);
      seedPrice(db);
      const stub = checkoutSuccess();
      await rejectsWith(
        createPromotionCheckout(input(inputOverrides), deps(db, stub)),
        code,
        label,
      );
      assert.equal(db.orders.size, 0, label);
      assert.equal(stub.calls.length, 0, label);
    }
  });

  it("validates input and configuration before any write", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    const stub = checkoutSuccess();
    await rejectsWith(
      createPromotionCheckout(input({ days: 0 }), deps(db, stub)),
      "validation",
    );
    await rejectsWith(
      createPromotionCheckout(input({ customerEmail: "" }), deps(db, stub)),
      "validation",
    );
    await rejectsWith(
      createPromotionCheckout(input(), deps(db, stub, { appUrl: "http://evil.test/" })),
      "config",
    );
    const noPrice = new FakeDb();
    seedEvent(noPrice);
    await rejectsWith(
      createPromotionCheckout(input(), deps(noPrice, checkoutSuccess())),
      "no-pricing",
    );
    assert.equal(db.orders.size, 0);
    assert.equal(stub.calls.length, 0);
  });
});

describe("resume and concurrency", () => {
  it("resumes a fresh matching checkout with zero Bachs calls", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    const order = seedOrder(db, liveTriple("order-1"));
    const stub = checkoutSuccess();
    const result = await createPromotionCheckout(input({ days: 2 }), deps(db, stub));
    assert.equal(result.status, "resumed");
    assert.equal(result.orderId, order.id);
    assert.equal(result.checkoutUrl, order.checkout_url);
    assert.equal(stub.calls.length, 0);
    assert.equal(db.orders.size, 1);
  });

  it("never overwrites a stored session with a different one", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    const order = seedOrder(db, liveTriple("order-1"));
    // Even if Bachs would hand out a new session, a live stored triple wins
    // with zero calls: the stored session is never superseded in place.
    const stub = checkoutSuccess("chk_intruder_1");
    const result = await createPromotionCheckout(input({ days: 2 }), deps(db, stub));
    assert.equal(result.status, "resumed");
    assert.equal(result.checkoutUrl, order.checkout_url);
    assert.equal(db.orders.get(order.id).checkout_id, order.checkout_id);
    assert.equal(stub.calls.length, 0);
  });

  it("resumes the stored snapshot even after a price change", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db, 200_000, iso(NOW_MS - 10_000));
    const order = seedOrder(db, liveTriple("order-1"));
    seedPrice(db, 999_000, iso(NOW_MS));
    const stub = checkoutSuccess();
    const result = await createPromotionCheckout(input({ days: 2 }), deps(db, stub));
    assert.equal(result.status, "resumed");
    assert.equal(result.totalKobo, 400_000);
    assert.equal(db.orders.size, 1);
  });

  it("converges double submissions onto one order and one session", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    const stub = checkoutSuccess("chk_race_1");
    const first = await createPromotionCheckout(input({ days: 2 }), deps(db, stub));
    assert.equal(first.status, "ready");
    const second = await createPromotionCheckout(input({ days: 2 }), deps(db, stub));
    assert.equal(second.status, "resumed");
    assert.equal(second.orderId, first.orderId);
    assert.equal(second.checkoutUrl, first.checkoutUrl);
    assert.equal(db.orders.size, 1);
    assert.equal(stub.calls.length, 1);
  });

  it("heals an insert race through the unique-index winner", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    // A concurrent request inserted first but has not saved its session yet.
    const winner = seedOrder(db, { provider_reference: "promo_11111111_winner1" });
    const stub = checkoutSuccess("chk_winner_1");
    const result = await createPromotionCheckout(input({ days: 2 }), deps(db, stub));
    assert.equal(result.status, "resumed");
    assert.equal(result.orderId, winner.id);
    assert.equal(db.orders.size, 1);
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].idempotencyKey, winner.id);
    assert.equal(stub.calls[0].body.reference, "promo_11111111_winner1");
  });

  it("regenerates references on collision instead of failing", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    // Another event's paid order already owns the first generated reference.
    seedOrder(db, {
      event_id: "99999999-2222-3333-4444-555555555555",
      status: "paid",
      provider_reference: "promo_11111111_a1b2c3d4e5f6",
    });
    const suffixes = ["a1b2c3d4e5f6", "caf00d"];
    const stub = checkoutSuccess("chk_regen_1");
    const result = await createPromotionCheckout(
      input({ days: 2 }),
      deps(db, stub, { randomSuffix: () => suffixes.shift() ?? "f00" }),
    );
    assert.equal(result.status, "ready");
    const order = db.orders.get(result.orderId);
    assert.equal(order.provider_reference, "promo_11111111_a1b2c3d4e5f6caf00d");
    assert.equal(stub.calls.length, 1);
  });

  it("refuses stored orders with a non-NGN currency", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    seedOrder(db, { currency: "USD" });
    const stub = checkoutSuccess();
    await rejectsWith(
      createPromotionCheckout(input({ days: 2 }), deps(db, stub)),
      "validation",
    );
    assert.equal(stub.calls.length, 0);
  });

  it("never leaks another organizer's checkout URL", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    seedOrder(db, {
      organizer_id: "someone-else",
      ...liveTriple("order-1"),
    });
    await rejectsWith(
      createPromotionCheckout(input({ days: 2 }), deps(db, checkoutSuccess())),
      "forbidden",
    );
  });
});

describe("Bachs failure classification", () => {
  it("cancels the order on conclusive refusal and retries cleanly", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    const refused = scriptFetch({
      onCheckout: () => jsonResponse({ error: "rejected" }, 400),
      onVerify: () => jsonResponse(unpaidVerifyBody()),
    });
    await rejectsWith(
      createPromotionCheckout(input({ days: 2 }), deps(db, refused)),
      "checkout-unavailable",
    );
    // Refused also means "no retry storm": exactly one attempt, then release.
    assert.equal(refused.calls.length, 1);
    const [order] = [...db.orders.values()];
    assert.equal(order.status, "cancelled");
    assert.equal(order.checkout_id, null);

    const retry = checkoutSuccess("chk_retry_1");
    const result = await createPromotionCheckout(
      input({ days: 2 }),
      deps(db, retry, { randomSuffix: () => "b2c3d4e5f6a7" }),
    );
    assert.equal(result.status, "ready");
    assert.equal(
      db.orders.get(result.orderId).provider_reference,
      "promo_11111111_b2c3d4e5f6a7",
    );
  });

  it("never claims a release the cancel RPC did not confirm", async () => {
    for (const [label, rigCancel] of [
      [
        "returned-error",
        (realRpc) => async (name, args) => {
          if (name === "cancel_promotion_order") {
            return { data: null, error: { message: "cancel lost" } };
          }
          return realRpc(name, args);
        },
      ],
      [
        "thrown",
        (realRpc) => async (name, args) => {
          if (name === "cancel_promotion_order") {
            throw new Error("transport down");
          }
          return realRpc(name, args);
        },
      ],
    ]) {
      const db = new FakeDb();
      seedEvent(db);
      seedPrice(db);
      // Pending order with no stored session: the reconcile path attempts a
      // release on conclusive refusal, and must report its real outcome.
      seedOrder(db);
      const realRpc = db.rpc.bind(db);
      db.rpc = rigCancel(realRpc);
      const refused = scriptFetch({
        onCheckout: () => jsonResponse({ error: "rejected" }, 400),
        onVerify: () => jsonResponse(unpaidVerifyBody()),
      });
      const error = await rejectsWith(
        createPromotionCheckout(input({ days: 2 }), deps(db, refused)),
        "checkout-unavailable",
        label,
      );
      assert.ok(!error.message.includes("released"), label);
      const [order] = [...db.orders.values()];
      assert.equal(order.status, "pending", label);
    }
  });

  it("retries once on uncertainty with the identical key and params", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    let attempts = 0;
    const flaky = scriptFetch({
      onCheckout: (call) => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("fetch failed");
        return jsonResponse(checkoutResponseBody("chk_flaky_1"));
      },
      onVerify: () => jsonResponse(unpaidVerifyBody()),
    });
    const result = await createPromotionCheckout(input({ days: 2 }), deps(db, flaky));
    assert.equal(result.status, "ready");
    assert.equal(flaky.calls.length, 2);
    assert.equal(flaky.calls[0].idempotencyKey, result.orderId);
    assert.equal(flaky.calls[1].idempotencyKey, result.orderId);
    assert.deepEqual(flaky.calls[1].body, flaky.calls[0].body);
  });

  it("leaves the order pending when uncertainty persists, then reconciles", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    const down = scriptFetch({
      onCheckout: () => {
        throw timeout;
      },
      onVerify: () => jsonResponse(unpaidVerifyBody()),
    });
    await rejectsWith(
      createPromotionCheckout(input({ days: 2 }), deps(db, down)),
      "uncertain",
    );
    // Initial attempt plus exactly one retry, then stop — no storm.
    assert.equal(down.calls.length, 2);
    const [order] = [...db.orders.values()];
    assert.equal(order.status, "pending");
    assert.equal(order.checkout_id, null);
    assert.ok(
      db.rpcCalls.every((call) => call.name !== "cancel_promotion_order"),
      "uncertain orders are never released",
    );

    // Bachs recovers: the idempotent key returns THE session (created during
    // the timed-out attempt), and it is saved — one session total.
    const healed = scriptFetch({
      onCheckout: (call) => {
        assert.equal(call.idempotencyKey, order.id);
        assert.equal(call.body.reference, order.provider_reference);
        return jsonResponse(checkoutResponseBody("chk_existing_1"));
      },
      onVerify: () => jsonResponse(unpaidVerifyBody()),
    });
    const resumed = await createPromotionCheckout(
      input({ days: 2 }),
      deps(db, healed),
    );
    assert.equal(resumed.status, "resumed");
    assert.equal(resumed.orderId, order.id);
    assert.equal(resumed.checkoutUrl, "https://pay.bachs.test/c/chk_existing_1");
    assert.equal(db.orders.get(order.id).checkout_id, "chk_existing_1");
  });

  it("treats 409 and malformed responses as uncertain, other 4xx as refused", async () => {
    for (const [label, handler, code, released] of [
      ["conflict", () => jsonResponse({ error: "in flight" }, 409), "uncertain", false],
      ["bad-request", () => jsonResponse({ error: "nope" }, 400), "checkout-unavailable", true],
      ["forbidden", () => jsonResponse({ error: "nope" }, 403), "checkout-unavailable", true],
      ["server-error", () => jsonResponse({ error: "boom" }, 500), "uncertain", false],
    ]) {
      const db = new FakeDb();
      seedEvent(db);
      seedPrice(db);
      const stub = scriptFetch({
        onCheckout: handler,
        onVerify: () => jsonResponse(unpaidVerifyBody()),
      });
      await rejectsWith(
        createPromotionCheckout(input({ days: 2 }), deps(db, stub)),
        code,
        label,
      );
      const [order] = [...db.orders.values()];
      assert.equal(order.status, released ? "cancelled" : "pending", label);
    }
  });

  it("recovers when Bachs succeeded but the local save failed", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    db.nextUpdate = "error";
    const stub = checkoutSuccess("chk_unsaved_1");
    await rejectsWith(
      createPromotionCheckout(input({ days: 2 }), deps(db, stub)),
      "uncertain",
    );
    const [order] = [...db.orders.values()];
    assert.equal(order.status, "pending");
    assert.equal(order.checkout_id, null);

    const healed = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody("chk_unsaved_1")),
      onVerify: () => jsonResponse(unpaidVerifyBody()),
    });
    const resumed = await createPromotionCheckout(
      input({ days: 2 }),
      deps(db, healed),
    );
    assert.equal(resumed.status, "resumed");
    assert.equal(resumed.checkoutUrl, "https://pay.bachs.test/c/chk_unsaved_1");
  });

  it("adopts the winner when competing writes race the same order", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    // Request 2's Bachs call returns its own session, but request 1 commits
    // first: the conditional write matches zero rows, request 2 reloads and
    // adopts request 1's triple instead of overwriting it.
    const stub = checkoutSuccess("chk_loser_1");
    db.interleave = () => {
      const [order] = [...db.orders.values()];
      Object.assign(order, liveTriple("winner-1"));
    };
    const result = await createPromotionCheckout(input({ days: 2 }), deps(db, stub));
    assert.equal(result.status, "resumed");
    assert.equal(result.checkoutUrl, "https://pay.bachs.test/c/winner-1");
    const [order] = [...db.orders.values()];
    assert.equal(order.checkout_id, "chk_winner-1");
    assert.equal(order.checkout_url, "https://pay.bachs.test/c/winner-1");
  });

  it("stays uncertain when a competitor is mid-flight with no triple yet", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    // Zero rows matched, yet the reload still shows pending-without-triple:
    // a competitor is between its own calls. Uncertain, never overwrite.
    db.nextUpdate = "zero-rows";
    await rejectsWith(
      createPromotionCheckout(input({ days: 2 }), deps(db, checkoutSuccess())),
      "uncertain",
    );
    const [order] = [...db.orders.values()];
    assert.equal(order.status, "pending");
    assert.equal(order.checkout_id, null);
  });

  it("reports honestly when the order settled mid-flight", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    // A cancellation lands after the Bachs call but before the save: the
    // conditional write matches zero rows and the reload proves settlement.
    db.interleave = () => {
      const [order] = [...db.orders.values()];
      order.status = "cancelled";
    };
    await rejectsWith(
      createPromotionCheckout(input({ days: 2 }), deps(db, checkoutSuccess())),
      "order-settled",
    );
  });
});

describe("stale and mismatched recovery", () => {
  it("refuses to settle orders with no stored session", async () => {
    const db = new FakeDb();
    const order = seedOrder(db);
    assert.equal(order.checkout_id, null);
    await rejectsWith(
      settleOrderByVerification(db, order, checkoutSuccess().fetchImpl),
      "validation",
    );
    assert.equal(db.rpcCalls.length, 0);
  });

  it("activates when recovery finds verified money on a stale order", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    const stale = seedOrder(db, {
      created_at: iso(NOW_MS - 25 * 3_600_000),
      provider_reference: "promo-seed-1",
      ...liveTriple("order-1", NOW_MS - 25 * 3_600_000),
    });
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody("chk_should_not_happen")),
      onVerify: () => jsonResponse(paidVerifyBody({ amount: "4000.00" })),
    });
    const result = await createPromotionCheckout(input({ days: 2 }), deps(db, stub));
    assert.equal(result.status, "already-active");
    assert.equal(result.orderId, stale.id);
    assert.equal(result.outcome, "paid");
    assert.equal(db.orders.get(stale.id).status, "paid");
    assert.equal(db.promotions.length, 1);
    assert.equal(stub.calls.length, 1);
    assert.ok(stub.calls[0].url.includes(stale.checkout_id));
    // Recovery uses VERIFIED money, never stored or browser values.
    const activate = db.rpcCalls.find(
      (call) => call.name === "activate_paid_promotion",
    );
    assert.deepEqual(activate.args, {
      p_order_id: stale.id,
      p_provider_reference: "promo-seed-1",
      p_amount_kobo: 400_000,
    });
  });

  it("surfaces refund routing when verified money cannot deliver", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    const stale = seedOrder(db, {
      created_at: iso(NOW_MS - 25 * 3_600_000),
      provider_reference: "promo-seed-1",
      ...liveTriple("order-1", NOW_MS - 25 * 3_600_000),
    });
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody("chk_nope")),
      onVerify: () => jsonResponse(paidVerifyBody({ amount: "100.00" })),
    });
    const result = await createPromotionCheckout(input({ days: 2 }), deps(db, stub));
    assert.equal(result.status, "already-active");
    assert.equal(result.outcome, "refund_pending");
    assert.equal(db.orders.get(stale.id).status, "refund_pending");
    assert.equal(db.promotions.length, 0);
  });

  it("releases expired-session stale orders and creates fresh", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db, 200_000);
    const stale = seedOrder(db, {
      created_at: iso(NOW_MS - 25 * 3_600_000),
      ...liveTriple("order-1", NOW_MS - 25 * 3_600_000),
    });
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody("chk_fresh_2")),
      onVerify: () =>
        jsonResponse(unpaidVerifyBody({ status: "expired", payment_status: null })),
    });
    const result = await createPromotionCheckout(
      input({ days: 3 }),
      deps(db, stub, { randomSuffix: () => "c3d4e5f6a7b8" }),
    );
    assert.equal(result.status, "ready");
    assert.notEqual(result.orderId, stale.id);
    assert.equal(db.orders.get(stale.id).status, "cancelled");
    assert.equal(db.orders.get(result.orderId).total_amount_kobo, 600_000);
  });

  it("never releases when Bachs claims success with undecipherable evidence", async () => {
    for (const [label, verifyOverrides] of [
      ["bad-amount", { amount: "not-a-number" }],
      ["null-amount", { amount: null }],
      ["wrong-currency", { amount: "4000.00", currency: "EUR" }],
    ]) {
      const db = new FakeDb();
      seedEvent(db);
      seedPrice(db);
      const stale = seedOrder(db, {
        created_at: iso(NOW_MS - 25 * 3_600_000),
        provider_reference: "promo-seed-1",
        ...liveTriple("order-1", NOW_MS - 25 * 3_600_000),
      });
      const stub = scriptFetch({
        onCheckout: () => jsonResponse(checkoutResponseBody("chk_nope")),
        onVerify: () => jsonResponse(paidVerifyBody(verifyOverrides)),
      });
      await rejectsWith(
        createPromotionCheckout(input({ days: 2 }), deps(db, stub)),
        "uncertain",
        label,
      );
      assert.equal(db.orders.get(stale.id).status, "pending", label);
      assert.ok(
        db.rpcCalls.every((call) => call.name !== "cancel_promotion_order"),
        label,
      );
      assert.ok(
        db.rpcCalls.every((call) => call.name !== "activate_paid_promotion"),
        label,
      );
    }
  });

  it("preserves reservations on ambiguous payment statuses", async () => {
    const { payment_status: _dropped, ...missingKey } = unpaidVerifyBody();
    void _dropped;
    const cases = [
      ["null", unpaidVerifyBody({ status: "open", payment_status: null })],
      ["missing-key", { ...missingKey, status: "open" }],
      ["processing", unpaidVerifyBody({ status: "open", payment_status: "processing" })],
      ["pending", unpaidVerifyBody({ status: "open", payment_status: "pending" })],
      ["unexpected", unpaidVerifyBody({ status: "open", payment_status: "on_hold_review" })],
      ["completed-ambiguous", unpaidVerifyBody({ status: "completed", payment_status: null })],
    ];
    for (const [label, body] of cases) {
      const db = new FakeDb();
      seedEvent(db);
      seedPrice(db);
      const stale = seedOrder(db, {
        created_at: iso(NOW_MS - 25 * 3_600_000),
        ...liveTriple("order-1", NOW_MS - 25 * 3_600_000),
      });
      const stub = scriptFetch({
        onCheckout: () => jsonResponse(checkoutResponseBody("chk_nope")),
        onVerify: () => jsonResponse(body),
      });
      await rejectsWith(
        createPromotionCheckout(input({ days: 2 }), deps(db, stub)),
        "uncertain",
        label,
      );
      assert.equal(db.orders.get(stale.id).status, "pending", label);
      assert.ok(
        db.rpcCalls.every((call) => call.name !== "cancel_promotion_order"),
        label,
      );
    }
  });

  it("releases on each terminal unpaid signal", async () => {
    const cases = [
      ["failed", { status: "open", payment_status: "failed" }],
      ["canceled", { status: "completed", payment_status: "canceled" }],
      ["expired-session", { status: "expired", payment_status: null }],
    ];
    for (const [label, verifyOverrides] of cases) {
      const db = new FakeDb();
      seedEvent(db);
      seedPrice(db);
      const stale = seedOrder(db, {
        created_at: iso(NOW_MS - 25 * 3_600_000),
        ...liveTriple("order-1", NOW_MS - 25 * 3_600_000),
      });
      const stub = scriptFetch({
        onCheckout: () => jsonResponse(checkoutResponseBody(`chk_${label}_1`)),
        onVerify: () => jsonResponse(unpaidVerifyBody(verifyOverrides)),
      });
      const result = await createPromotionCheckout(
        input({ days: 2 }),
        deps(db, stub, { randomSuffix: () => "f6a7b8c9d0e1" }),
        label,
      );
      assert.equal(result.status, "ready", label);
      assert.notEqual(result.orderId, stale.id, label);
      assert.equal(db.orders.get(stale.id).status, "cancelled", label);
    }
  });

  it("preserves stale reservations when verification is uncertain", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    const stale = seedOrder(db, {
      created_at: iso(NOW_MS - 25 * 3_600_000),
      ...liveTriple("order-1", NOW_MS - 25 * 3_600_000),
    });
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody("chk_nope")),
      onVerify: () => {
        throw new TypeError("fetch failed");
      },
    });
    await rejectsWith(
      createPromotionCheckout(input({ days: 2 }), deps(db, stub)),
      "uncertain",
    );
    assert.equal(db.orders.get(stale.id).status, "pending");
    assert.equal(db.orders.size, 1);
    assert.ok(
      db.rpcCalls.every((call) => call.name !== "cancel_promotion_order"),
    );
  });

  it("preserves a live unpaid checkout when different days are requested", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    const live = seedOrder(db, { days: 2, ...liveTriple("order-1") });
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody("chk_nope")),
      onVerify: () => jsonResponse(unpaidVerifyBody()),
    });
    // Open + null is an ACTIVE unpaid checkout, not terminal evidence: the
    // organizer may be paying it in another tab. Preserve; explicit user
    // cancellation (4B) or session expiry releases it.
    const error = await rejectsWith(
      createPromotionCheckout(
        input({ days: 5 }),
        deps(db, stub, { randomSuffix: () => "d4e5f6a7b8c9" }),
      ),
      "uncertain",
    );
    assert.match(error.message, /already has an active checkout/);
    assert.equal(db.orders.get(live.id).status, "pending");
    assert.equal(db.orders.size, 1);
    assert.ok(
      db.rpcCalls.every((call) => call.name !== "cancel_promotion_order"),
    );
  });

  it("replaces an order whose payment terminally failed, on new days", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    const old = seedOrder(db, { days: 2, ...liveTriple("order-1") });
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody("chk_newdays_1")),
      onVerify: () =>
        jsonResponse(unpaidVerifyBody({ payment_status: "failed" })),
    });
    const result = await createPromotionCheckout(
      input({ days: 5 }),
      deps(db, stub, { randomSuffix: () => "d4e5f6a7b8c9" }),
    );
    assert.equal(result.status, "ready");
    assert.notEqual(result.orderId, old.id);
    assert.equal(db.orders.get(old.id).status, "cancelled");
    assert.equal(result.totalKobo, 1_000_000);
  });

  it("recreates when the stored session expired, after verifying unpaid", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    const old = seedOrder(db, {
      checkout_id: "chk_old_1",
      checkout_url: "https://pay.bachs.test/c/chk_old_1",
      checkout_expires_at: iso(NOW_MS - 1),
    });
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody("chk_renew_1")),
      onVerify: () =>
        jsonResponse(
          unpaidVerifyBody({ status: "expired", payment_status: null }),
        ),
    });
    const result = await createPromotionCheckout(
      input({ days: 2 }),
      deps(db, stub, { randomSuffix: () => "e5f6a7b8c9d0" }),
    );
    assert.equal(result.status, "ready");
    assert.notEqual(result.orderId, old.id);
    assert.equal(db.orders.get(old.id).status, "cancelled");
    assert.ok(stub.calls[0].url.includes("chk_old_1"));
  });

  it("fails activation faults as uncertain without settling money", async () => {
    const db = new FakeDb();
    seedEvent(db);
    seedPrice(db);
    const stale = seedOrder(db, {
      created_at: iso(NOW_MS - 25 * 3_600_000),
      provider_reference: "promo-seed-1",
      ...liveTriple("order-1", NOW_MS - 25 * 3_600_000),
    });
    const realRpc = db.rpc.bind(db);
    db.rpc = async (name, args) => {
      if (name === "activate_paid_promotion") {
        return { data: null, error: { message: "boom" } };
      }
      return realRpc(name, args);
    };
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody("chk_nope")),
      onVerify: () => jsonResponse(paidVerifyBody({ amount: "4000.00" })),
    });
    await rejectsWith(
      createPromotionCheckout(input({ days: 2 }), deps(db, stub)),
      "uncertain",
    );
    assert.equal(db.orders.get(stale.id).status, "pending");
    assert.equal(db.promotions.length, 0);
  });
});

describe("incoming-payments-only policy", () => {
  it("introduces no refund, payout, or disbursement capability", () => {
    const text = readFileSync(
      new URL("../src/showcase/promotions/promotion-checkout.server.ts", import.meta.url),
      "utf8",
    );
    const forbidden = [
      "/v1/refunds",
      "/v1/transfers",
      "/v1/payouts",
      "/v1/disputes",
      "createRefund(",
      "initiateTransfer",
      "sendPayout",
      "disburse",
      "autoRefund",
      "processRefund(",
      "record_promotion_refund",
    ];
    const offenders = forbidden.filter((pattern) => text.includes(pattern));
    assert.deepEqual(offenders, []);
  });
});
