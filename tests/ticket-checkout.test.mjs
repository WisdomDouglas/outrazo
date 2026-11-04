// Ticket checkout tests (P1).
//
// The ticket core runs with injected fakes: an in-memory database for the
// service-role queries (including the pending-slot unique index and a
// faithful activate_ticket_order emulation), a scripted fetch for Bachs, a
// fixed clock, and a fixed app URL. No test touches the network, a real
// secret, or live data.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cancelTicketOrderAsBuyer,
  createTicketCheckout,
  getOwnTicketOrder,
  getTicketQuote,
  listOwnTicketOrders,
  refreshTicketOrderStatus,
  settleTicketOrderByVerification,
  TicketCheckoutError,
} from "@/showcase/tickets/ticket-checkout.server";
import {
  checkTicketOrderTransition,
  isTicketOrderPending,
  koboToNairaNumeric,
  nairaNumericToKobo,
  TICKET_MIN_TOTAL_KOBO,
  ticketTotalKobo,
} from "@/showcase/tickets/ticket-orders";

const NOW_MS = 1_700_000_000_000;
const APP_URL = "https://app.outrazo.test";
const USER_ID = "user-buyer-1";
const OTHER_ID = "user-stranger-9";
const EVENT_ID = "11111111-2222-3333-4444-555555555555";
const TIER_REGULAR = "22222222-2222-3333-4444-555555555555";
const TIER_VIP = "33333333-2222-3333-4444-555555555555";

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
  }

  store() {
    if (this.table === "events") return this.db.events;
    if (this.table === "event_ticket_tiers") return this.db.tiers;
    if (this.table === "ticket_items") return this.db.items;
    return this.db.orders;
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  order(column, { ascending }) {
    this.ordering = { column, ascending };
    return this;
  }

  rows() {
    const list = [...this.store().values()].filter((row) =>
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

  insert(payload) {
    if (this.db.failMode) return { data: null, error: { message: "db down" } };
    const rows = Array.isArray(payload) ? payload : [payload];
    if (this.table === "ticket_orders") {
      for (const row of rows) {
        const clash = [...this.db.orders.values()].some(
          (existing) =>
            existing.user_id === row.user_id &&
            existing.event_id === row.event_id &&
            existing.status === "pending",
        );
        if (clash) {
          return { data: null, error: { code: "23505", message: "one pending order per buyer" } };
        }
        const stored = {
          id: row.id ?? `order-${this.db.orders.size + 1}`,
          status_reason: null,
          paid_at: null,
          checkout_id: null,
          checkout_url: null,
          checkout_expires_at: null,
          created_at: iso(NOW_MS),
          ...row,
        };
        this.db.orders.set(stored.id, stored);
      }
      return { data: rows, error: null };
    }
    for (const row of rows) {
      const stored = { id: `item-${this.db.items.size + 1}`, created_at: iso(NOW_MS), ...row };
      this.db.items.set(stored.id, stored);
    }
    return { data: rows, error: null };
  }

  update(patch) {
    this.pendingUpdate = patch;
    return this;
  }

  applyUpdate() {
    const matched = this.rows();
    for (const row of matched) {
      Object.assign(row, this.pendingUpdate);
    }
    return matched;
  }

  select() {
    if (this.pendingUpdate) {
      if (this.db.failMode) return { data: null, error: { message: "db down" } };
      return { data: this.applyUpdate(), error: null };
    }
    return this;
  }

  limit(n) {
    this.limitN = n;
    return this;
  }

  async maybeSingle() {
    if (this.db.failMode) return { data: null, error: { message: "db down" } };
    const matched = this.rows();
    const limited = typeof this.limitN === "number" ? matched.slice(0, this.limitN) : matched;
    return { data: limited[0] ?? null, error: null };
  }

  then(resolve, reject) {
    try {
      if (this.db.failMode) return resolve({ data: null, error: { message: "db down" } });
      if (this.pendingUpdate) {
        this.applyUpdate();
        return resolve({ data: null, error: null });
      }
      const matched = this.rows();
      const limited = typeof this.limitN === "number" ? matched.slice(0, this.limitN) : matched;
      return resolve({ data: limited, error: null });
    } catch (caught) {
      return reject(caught);
    }
  }
}

class FakeDb {
  constructor() {
    this.events = new Map();
    this.tiers = new Map();
    this.orders = new Map();
    this.items = new Map();
    this.rpcCalls = [];
    this.failMode = false;
  }

  from(table) {
    return new FakeTable(this, table);
  }

  async rpc(name, args) {
    this.rpcCalls.push({ name, args });
    if (this.failMode) return { data: null, error: { message: "db down" } };
    if (name === "activate_ticket_order") {
      return this.activate(args);
    }
    if (name === "issue_ticket_codes") {
      if (this.failIssue) return { data: null, error: { message: "issue down" } };
      const order = this.orders.get(args.p_order_id);
      if (!order || order.status !== "paid") {
        return { data: null, error: { message: "Ticket codes are issued only for paid orders." } };
      }
      return { data: 2, error: null };
    }
    throw new Error(`unexpected rpc ${name}`);
  }

  activate({ p_order_id, p_provider_reference, p_amount_kobo }) {
    const fail = (message) => ({ data: null, error: { message } });
    const order = this.orders.get(p_order_id);
    if (!order) return fail("Ticket order not found.");
    if (order.status === "paid") return { data: "already_paid", error: null };
    if (order.status !== "pending") return fail("Only pending ticket orders can be activated.");
    const snapshotKobo = Math.round(Number(order.total_amount) * 100);
    if (order.provider_reference !== p_provider_reference || snapshotKobo !== p_amount_kobo) {
      return fail("Payment does not match the order snapshot.");
    }
    const event = this.events.get(order.event_id);
    if (!event || !event.published) return fail("That event is no longer available.");
    if (event.status === "cancelled") return fail("That event was cancelled.");
    if (event.ends_at !== null && Date.parse(event.ends_at) <= NOW_MS) {
      return fail("That event has already ended.");
    }
    for (const item of this.items.values()) {
      if (item.order_id !== p_order_id || item.tier_id === null) continue;
      const tier = this.tiers.get(item.tier_id);
      if (!tier) return fail(`The ${item.tier_name} tier no longer exists.`);
      if ((tier.sold_quantity ?? 0) + item.quantity > tier.quantity) {
        return fail(`Not enough ${item.tier_name} tickets left.`);
      }
    }
    for (const item of this.items.values()) {
      if (item.order_id !== p_order_id || item.tier_id === null) continue;
      const tier = this.tiers.get(item.tier_id);
      tier.sold_quantity = (tier.sold_quantity ?? 0) + item.quantity;
    }
    order.status = "paid";
    order.paid_at = iso(NOW_MS);
    order.status_reason = null;
    return { data: "activated", error: null };
  }
}

function seedEvent(db, overrides = {}) {
  db.events.set(EVENT_ID, {
    id: EVENT_ID,
    title: "Lagos Tech Summit",
    published: true,
    status: "upcoming",
    ends_at: iso(NOW_MS + 7 * 86_400_000),
    ...overrides,
  });
}

function seedTiers(db, overrides = {}) {
  db.tiers.set(TIER_REGULAR, {
    id: TIER_REGULAR,
    event_id: EVENT_ID,
    name: "Regular",
    price: 5000,
    quantity: 100,
    sold_quantity: 0,
    ...overrides.regular,
  });
  db.tiers.set(TIER_VIP, {
    id: TIER_VIP,
    event_id: EVENT_ID,
    name: "VIP",
    price: 15000,
    quantity: 20,
    sold_quantity: 0,
    ...overrides.vip,
  });
}

function seedDb(overrides = {}) {
  const db = new FakeDb();
  seedEvent(db, overrides.event);
  seedTiers(db, overrides.tiers);
  return db;
}

function seedPendingOrder(db, overrides = {}) {
  const order = {
    id: overrides.id ?? "order-pending-1",
    user_id: USER_ID,
    event_id: EVENT_ID,
    status: "pending",
    status_reason: null,
    total_amount: 10000,
    currency: "NGN",
    reference: "TKT-SEED01",
    provider: "bachs",
    provider_reference: "tkt_order-pending-1",
    paid_at: null,
    checkout_id: "chk_seed_1",
    checkout_url: "https://pay.bachs.test/c/chk_seed_1",
    checkout_expires_at: iso(NOW_MS + 23 * 3_600_000),
    created_at: iso(NOW_MS - 3_600_000),
    ...overrides,
  };
  db.orders.set(order.id, order);
  return order;
}

function seedItems(db, orderId, lines = [{ tierId: TIER_REGULAR, quantity: 2 }]) {
  for (const line of lines) {
    const tier = db.tiers.get(line.tierId);
    db.items.set(`item-${db.items.size + 1}`, {
      id: `item-${db.items.size + 1}`,
      order_id: orderId,
      tier_id: line.tierId,
      tier_name: tier ? tier.name : "Regular",
      unit_price: tier ? tier.price : 5000,
      quantity: line.quantity,
      created_at: iso(NOW_MS - 3_600_000),
    });
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
    amount: "10000.00",
    currency: "NGN",
    reference: "tkt_order-pending-1",
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

function quoteInput(overrides = {}) {
  return {
    eventId: EVENT_ID,
    lines: [{ tierId: TIER_REGULAR, quantity: 2 }],
    ...overrides,
  };
}

function createInput(overrides = {}) {
  return {
    eventId: EVENT_ID,
    userId: USER_ID,
    customerEmail: "buyer@example.ng",
    lines: [{ tierId: TIER_REGULAR, quantity: 2 }],
    ...overrides,
  };
}

function testDeps(db, stub, overrides = {}) {
  return {
    fetchImpl: stub.fetchImpl,
    supabase: db,
    nowMs: NOW_MS,
    appUrl: APP_URL,
    ...overrides,
  };
}

describe("ticket money helpers", () => {
  it("converts naira numerics to kobo exactly", () => {
    assert.equal(nairaNumericToKobo(5000), 500_000);
    assert.equal(nairaNumericToKobo("2500.50"), 250_050);
    assert.equal(nairaNumericToKobo("100.99"), 10_099);
  });

  it("rejects non-numeric amounts", () => {
    assert.throws(() => nairaNumericToKobo("lots"), RangeError);
    assert.throws(() => nairaNumericToKobo(Number.NaN), RangeError);
  });

  it("converts kobo back to naira exactly", () => {
    assert.equal(koboToNairaNumeric(500_000), 5000);
    assert.equal(koboToNairaNumeric(250_050), 2500.5);
    assert.throws(() => koboToNairaNumeric(10.5), RangeError);
  });

  it("totals lines and enforces the NGN 100 floor", () => {
    assert.equal(TICKET_MIN_TOTAL_KOBO, 10_000);
    assert.equal(ticketTotalKobo([{ unitKobo: 500_000, quantity: 2 }]), 1_000_000);
    assert.throws(
      () => ticketTotalKobo([{ unitKobo: 5_000, quantity: 1 }]),
      /at least 10000 kobo/,
    );
    assert.throws(() => ticketTotalKobo([]), /at least one ticket/);
    assert.throws(
      () => ticketTotalKobo([{ unitKobo: 500_000, quantity: 7 }]),
      /from 1 to 6/,
    );
  });

  it("tracks pending validity against the 24-hour window", () => {
    assert.equal(isTicketOrderPending("pending", NOW_MS - 3_600_000, NOW_MS), true);
    assert.equal(isTicketOrderPending("pending", NOW_MS - 25 * 3_600_000, NOW_MS), false);
    assert.equal(isTicketOrderPending("paid", NOW_MS - 1000, NOW_MS), false);
  });
});

describe("ticket state machine", () => {
  it("delivers only on verified money with inventory", () => {
    assert.deepEqual(
      checkTicketOrderTransition("pending", "paid", { paymentVerified: true, inventoryFree: true }),
      { ok: true },
    );
    assert.equal(
      checkTicketOrderTransition("pending", "paid", { paymentVerified: true, inventoryFree: false }).ok,
      false,
    );
    assert.equal(
      checkTicketOrderTransition("pending", "paid", { paymentVerified: false, inventoryFree: true }).ok,
      false,
    );
  });

  it("settles unpaid orders without money only", () => {
    for (const to of ["failed", "expired", "cancelled"]) {
      assert.equal(
        checkTicketOrderTransition("pending", to, { paymentVerified: false, inventoryFree: true }).ok,
        true,
        to,
      );
      assert.equal(
        checkTicketOrderTransition("pending", to, { paymentVerified: true, inventoryFree: true }).ok,
        false,
        to,
      );
    }
  });

  it("keeps terminal states absorbing with idempotent replays", () => {
    for (const terminal of ["paid", "failed", "expired", "cancelled"]) {
      assert.deepEqual(
        checkTicketOrderTransition(terminal, terminal, { paymentVerified: false, inventoryFree: true }),
        { ok: true, noop: true },
      );
      assert.equal(
        checkTicketOrderTransition(terminal, "paid", { paymentVerified: true, inventoryFree: true }).ok,
        terminal === "paid" ? true : false,
      );
      assert.equal(
        checkTicketOrderTransition(terminal, "pending", { paymentVerified: false, inventoryFree: true }).ok,
        false,
      );
    }
  });
});

describe("ticket quote", () => {
  it("prices lines from database tiers, never the browser", async () => {
    const db = seedDb();
    const quote = await getTicketQuote(quoteInput(), { supabase: db, nowMs: NOW_MS });
    assert.equal(quote.eventTitle, "Lagos Tech Summit");
    assert.equal(quote.totalKobo, 1_000_000);
    assert.deepEqual(quote.lines, [
      { tierId: TIER_REGULAR, tierName: "Regular", unitKobo: 500_000, quantity: 2, lineKobo: 1_000_000 },
    ]);
    assert.equal(quote.currency, "NGN");
  });

  it("rejects unknown tiers, bad quantities, and duplicates", async () => {
    const db = seedDb();
    await assert.rejects(
      getTicketQuote(quoteInput({ lines: [{ tierId: TIER_VIP, quantity: 1 }, { tierId: TIER_VIP, quantity: 1 }] }), { supabase: db, nowMs: NOW_MS }),
      /only once/,
    );
    await assert.rejects(
      getTicketQuote(quoteInput({ lines: [{ tierId: TIER_REGULAR, quantity: 0 }] }), { supabase: db, nowMs: NOW_MS }),
      /from 1 to 6/,
    );
    await assert.rejects(
      getTicketQuote(quoteInput({ lines: [{ tierId: "99999999-2222-3333-4444-555555555555", quantity: 1 }] }), { supabase: db, nowMs: NOW_MS }),
      /invalid/,
    );
  });

  it("rejects unpublished, cancelled, ended, and missing events", async () => {
    for (const [label, event] of [
      ["unpublished", { published: false }],
      ["cancelled", { status: "cancelled" }],
      ["ended", { ends_at: iso(NOW_MS - 1000) }],
    ]) {
      const db = seedDb({ event });
      await assert.rejects(getTicketQuote(quoteInput(), { supabase: db, nowMs: NOW_MS }), TicketCheckoutError, label);
    }
    const empty = new FakeDb();
    await assert.rejects(
      getTicketQuote(quoteInput(), { supabase: empty, nowMs: NOW_MS }),
      /no longer exists/,
    );
  });

  it("rejects lines that exceed remaining inventory", async () => {
    const db = seedDb({ tiers: { regular: { sold_quantity: 99 } } });
    await assert.rejects(
      getTicketQuote(quoteInput(), { supabase: db, nowMs: NOW_MS }),
      /Not enough Regular tickets left/,
    );
  });

  it("rejects totals below the NGN 100 floor", async () => {
    const db = seedDb({ tiers: { regular: { price: 40 } } });
    await assert.rejects(
      getTicketQuote(quoteInput({ lines: [{ tierId: TIER_REGULAR, quantity: 1 }] }), { supabase: db, nowMs: NOW_MS }),
      /at least 10000 kobo/,
    );
  });
});

describe("ticket checkout creation", () => {
  it("creates a pending order with server-computed snapshots and opens Bachs", async () => {
    const db = seedDb();
    const stub = checkoutSuccess();
    const result = await createTicketCheckout(createInput(), testDeps(db, stub));
    assert.equal(result.status, "pending");
    assert.equal(result.resumed, false);
    assert.equal(result.totalKobo, 1_000_000);
    assert.match(result.checkoutUrl, /^https:\/\/pay\.bachs\.test\/c\//);
    const order = db.orders.get(result.orderId);
    assert.equal(order.status, "pending");
    assert.equal(order.total_amount, 10000);
    assert.equal(order.user_id, USER_ID);
    assert.match(order.provider_reference, /^tkt_/);
    const items = [...db.items.values()].filter((item) => item.order_id === result.orderId);
    assert.equal(items.length, 1);
    assert.equal(items[0].tier_name, "Regular");
    assert.equal(items[0].unit_price, 5000);
    assert.equal(items[0].quantity, 2);
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].idempotencyKey, result.orderId);
    assert.equal(stub.calls[0].body.pricing.amount, "10000.00");
    assert.equal(stub.calls[0].body.reference, order.provider_reference);
  });

  it("resumes the same tickets with no Bachs call", async () => {
    const db = seedDb();
    const order = seedPendingOrder(db);
    seedItems(db, order.id);
    const stub = checkoutSuccess();
    const result = await createTicketCheckout(createInput(), testDeps(db, stub));
    assert.equal(result.orderId, order.id);
    assert.equal(result.resumed, true);
    assert.equal(result.checkoutUrl, order.checkout_url);
    assert.equal(stub.calls.length, 0);
  });

  it("reconciles a stale triple reusing the order idempotency key", async () => {
    const db = seedDb();
    const order = seedPendingOrder(db, { checkout_expires_at: iso(NOW_MS - 1000) });
    seedItems(db, order.id);
    const stub = checkoutSuccess("chk_fresh_9");
    const result = await createTicketCheckout(createInput(), testDeps(db, stub));
    assert.equal(result.orderId, order.id);
    assert.equal(result.resumed, true);
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].idempotencyKey, order.id);
    assert.equal(stub.calls[0].body.reference, order.provider_reference);
    assert.equal(db.orders.get(order.id).checkout_id, "chk_fresh_9");
  });

  it("activates a previously pending order that verified paid mid-call", async () => {
    const db = seedDb();
    const order = seedPendingOrder(db);
    seedItems(db, order.id);
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody()),
      onVerify: () => jsonResponse(paidVerifyBody()),
    });
    const result = await createTicketCheckout(
      createInput({ lines: [{ tierId: TIER_VIP, quantity: 1 }] }),
      testDeps(db, stub),
    );
    assert.equal(result.orderId, order.id);
    assert.equal(result.status, "paid");
    assert.equal(result.checkoutUrl, null);
    assert.equal(db.orders.get(order.id).status, "paid");
    assert.equal(db.tiers.get(TIER_REGULAR).sold_quantity, 2);
  });

  it("releases a terminally unpaid order and creates the new one", async () => {
    const db = seedDb();
    const order = seedPendingOrder(db);
    seedItems(db, order.id);
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody("chk_new_2")),
      onVerify: () => jsonResponse(unpaidVerifyBody({ status: "completed", payment_status: "failed" })),
    });
    const result = await createTicketCheckout(
      createInput({ lines: [{ tierId: TIER_VIP, quantity: 1 }] }),
      testDeps(db, stub),
    );
    assert.notEqual(result.orderId, order.id);
    assert.equal(result.status, "pending");
    assert.equal(db.orders.get(order.id).status, "failed");
  });

  it("refuses new checkouts while the old state is uncertain", async () => {
    const db = seedDb();
    const order = seedPendingOrder(db);
    seedItems(db, order.id);
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody()),
      onVerify: () => jsonResponse(unpaidVerifyBody()),
    });
    await assert.rejects(
      createTicketCheckout(
        createInput({ lines: [{ tierId: TIER_VIP, quantity: 1 }] }),
        testDeps(db, stub),
      ),
      /still awaiting payment/,
    );
    assert.equal(db.orders.get(order.id).status, "pending");
  });

  it("marks the order failed on conclusive provider rejection", async () => {
    const db = seedDb();
    const stub = scriptFetch({
      onCheckout: () => jsonResponse({ detail: "bad pricing" }, 422),
      onVerify: () => jsonResponse(unpaidVerifyBody()),
    });
    await assert.rejects(createTicketCheckout(createInput(), testDeps(db, stub)), /rejected/);
    const [order] = [...db.orders.values()];
    assert.equal(order.status, "failed");
    assert.equal(order.status_reason, "provider_rejected");
  });

  it("leaves the order pending on uncertain provider failure", async () => {
    const db = seedDb();
    const stub = scriptFetch({
      onCheckout: () => {
        throw new Error("socket hangup");
      },
      onVerify: () => jsonResponse(unpaidVerifyBody()),
    });
    await assert.rejects(createTicketCheckout(createInput(), testDeps(db, stub)), /unclear/);
    const [order] = [...db.orders.values()];
    assert.equal(order.status, "pending");
  });

  it("converges concurrent creates on the single pending slot", async () => {
    const db = seedDb();
    const winner = seedPendingOrder(db, { id: "order-winner-1" });
    seedItems(db, winner.id);
    const stub = checkoutSuccess();
    const result = await createTicketCheckout(createInput(), testDeps(db, stub));
    assert.equal(result.orderId, winner.id);
    assert.equal(result.resumed, true);
    assert.equal(db.orders.size, 1);
  });
});

describe("ticket settle by verification", () => {
  function pendingWithItems(db, overrides = {}) {
    const order = seedPendingOrder(db, overrides);
    seedItems(db, order.id);
    return db.orders.get(order.id);
  }

  it("activates matching paid money through the RPC", async () => {
    const db = seedDb();
    const order = pendingWithItems(db);
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody()),
      onVerify: () => jsonResponse(paidVerifyBody()),
    });
    const settled = await settleTicketOrderByVerification(db, order, stub.fetchImpl);
    assert.deepEqual(settled, { settled: "activated", orderId: order.id });
    assert.deepEqual(
      db.rpcCalls.map((call) => call.name),
      ["activate_ticket_order", "issue_ticket_codes"],
    );
    assert.equal(db.rpcCalls[0].args.p_amount_kobo, 1_000_000);
    assert.equal(db.rpcCalls[1].args.p_order_id, order.id);
    assert.equal(db.orders.get(order.id).status, "paid");
  });

  it("fails mismatched money for manual handling, never delivers", async () => {
    const db = seedDb();
    const order = pendingWithItems(db);
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody()),
      onVerify: () => jsonResponse(paidVerifyBody({ amount: "1.00" })),
    });
    const settled = await settleTicketOrderByVerification(db, order, stub.fetchImpl);
    assert.deepEqual(settled, { settled: "failed", reason: "amount_mismatch" });
    assert.equal(db.rpcCalls.length, 0);
    assert.equal(db.orders.get(order.id).status, "failed");
  });

  it("fails orders the RPC rejects (sold out) for manual handling", async () => {
    const db = seedDb({ tiers: { regular: { sold_quantity: 100 } } });
    const order = pendingWithItems(db);
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody()),
      onVerify: () => jsonResponse(paidVerifyBody()),
    });
    const settled = await settleTicketOrderByVerification(db, order, stub.fetchImpl);
    assert.deepEqual(settled, { settled: "failed", reason: "activation_rejected" });
    assert.equal(db.orders.get(order.id).status, "failed");
  });

  it("releases terminally unpaid and expired sessions", async () => {
    for (const [label, body, status] of [
      ["failed payment", unpaidVerifyBody({ status: "completed", payment_status: "failed" }), "failed"],
      ["expired session", unpaidVerifyBody({ status: "expired" }), "expired"],
    ]) {
      const db = seedDb();
      const order = pendingWithItems(db);
      const stub = scriptFetch({
        onCheckout: () => jsonResponse(checkoutResponseBody()),
        onVerify: () => jsonResponse(body),
      });
      const settled = await settleTicketOrderByVerification(db, order, stub.fetchImpl);
      assert.deepEqual(settled, { settled: "released" }, label);
      assert.equal(db.orders.get(order.id).status, status, label);
    }
  });

  it("keeps paid money paid when issuance fails, retrying later", async () => {
    const db = seedDb();
    db.failIssue = true;
    const order = pendingWithItems(db);
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody()),
      onVerify: () => jsonResponse(paidVerifyBody()),
    });
    await assert.rejects(
      settleTicketOrderByVerification(db, order, stub.fetchImpl),
      /still being issued/,
    );
    assert.equal(db.orders.get(order.id).status, "paid");
    db.failIssue = false;
    await refreshTicketOrderStatus(
      { orderId: order.id, userId: USER_ID },
      testDeps(db, stub),
    );
    assert.deepEqual(
      db.rpcCalls.filter((call) => call.name === "issue_ticket_codes").length,
      2,
    );
  });

  it("preserves the order on open and undecipherable states", async () => {
    for (const body of [
      unpaidVerifyBody(),
      unpaidVerifyBody({ status: "completed", payment_status: "succeeded", amount: null }),
    ]) {
      const db = seedDb();
      const order = pendingWithItems(db);
      const stub = scriptFetch({
        onCheckout: () => jsonResponse(checkoutResponseBody()),
        onVerify: () => jsonResponse(body),
      });
      await assert.rejects(settleTicketOrderByVerification(db, order, stub.fetchImpl), TicketCheckoutError);
      assert.equal(db.orders.get(order.id).status, "pending");
    }
  });
});

describe("ticket cancel and reads", () => {
  it("cancels a session-less pending order immediately", async () => {
    const db = seedDb();
    const order = seedPendingOrder(db, { checkout_id: null, checkout_url: null, checkout_expires_at: null });
    seedItems(db, order.id);
    const result = await cancelTicketOrderAsBuyer(
      { orderId: order.id, userId: USER_ID },
      { supabase: db, fetchImpl: checkoutSuccess().fetchImpl, nowMs: NOW_MS },
    );
    assert.deepEqual(result, { outcome: "cancelled", orderId: order.id });
    assert.equal(db.orders.get(order.id).status, "cancelled");
  });

  it("activates instead of cancelling when money already landed", async () => {
    const db = seedDb();
    const order = seedPendingOrder(db);
    seedItems(db, order.id);
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody()),
      onVerify: () => jsonResponse(paidVerifyBody()),
    });
    const result = await cancelTicketOrderAsBuyer(
      { orderId: order.id, userId: USER_ID },
      testDeps(db, stub),
    );
    assert.deepEqual(result, { outcome: "already_paid", orderId: order.id });
    assert.equal(db.orders.get(order.id).status, "paid");
  });

  it("refuses to cancel blind when verification is down", async () => {
    const db = seedDb();
    const order = seedPendingOrder(db);
    seedItems(db, order.id);
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody()),
      onVerify: () => {
        throw new Error("socket hangup");
      },
    });
    await assert.rejects(
      cancelTicketOrderAsBuyer({ orderId: order.id, userId: USER_ID }, testDeps(db, stub)),
      /order was kept/,
    );
    assert.equal(db.orders.get(order.id).status, "pending");
  });

  it("reads own orders with lines and titles, hiding others", async () => {
    const db = seedDb();
    const mine = seedPendingOrder(db);
    seedItems(db, mine.id);
    seedPendingOrder(db, { id: "order-theirs-1", user_id: OTHER_ID });
    const { orders } = await listOwnTicketOrders({ userId: USER_ID }, { supabase: db });
    assert.equal(orders.length, 1);
    assert.equal(orders[0].orderId, mine.id);
    assert.equal(orders[0].eventTitle, "Lagos Tech Summit");
    assert.equal(orders[0].totalKobo, 1_000_000);
    assert.deepEqual(orders[0].lines, [
      { tierId: TIER_REGULAR, tierName: "Regular", unitKobo: 500_000, quantity: 2 },
    ]);
    await assert.rejects(
      getOwnTicketOrder({ orderId: "order-theirs-1", userId: USER_ID }, { supabase: db }),
      /not found/,
    );
  });

  it("refresh re-verifies pending orders and skips terminal ones", async () => {
    const db = seedDb();
    const order = seedPendingOrder(db);
    seedItems(db, order.id);
    const stub = scriptFetch({
      onCheckout: () => jsonResponse(checkoutResponseBody()),
      onVerify: () => jsonResponse(paidVerifyBody()),
    });
    const refreshed = await refreshTicketOrderStatus(
      { orderId: order.id, userId: USER_ID },
      testDeps(db, stub),
    );
    assert.equal(refreshed.order.status, "paid");
    assert.equal(refreshed.order.lines.length, 1);
    const quiet = scriptFetch({
      onCheckout: () => {
        throw new Error("must not be called");
      },
      onVerify: () => {
        throw new Error("must not be called");
      },
    });
    const again = await refreshTicketOrderStatus(
      { orderId: order.id, userId: USER_ID },
      testDeps(db, quiet),
    );
    assert.equal(again.order.status, "paid");
    assert.equal(quiet.calls.length, 0);
  });
});
