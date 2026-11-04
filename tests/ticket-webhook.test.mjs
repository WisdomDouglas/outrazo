// Ticket webhook handler tests (P1).
//
// The handler runs with injected fakes: an in-memory database standing in
// for the service-role Supabase client, a stub fetch for Bachs verify calls,
// and a fixed clock. No test touches the network, a real secret, or the
// live database.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import { handleTicketWebhook } from "@/showcase/tickets/ticket-webhook.server";

const SECRET = "whsec_test-only-never-a-real-secret";
const NOW = 1_700_000_000;
const NOW_MS = NOW * 1000;
const EVENT_ID = "11111111-2222-3333-4444-555555555555";
const TIER_ID = "22222222-2222-3333-4444-555555555555";

process.env["BACHS_API_KEY"] = "sk_sandbox_test-only-never-a-real-secret";
delete process.env["BACHS_BASE_URL"];

function sign(secret, timestamp, rawBody) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

function signedRequest(payload, options = {}) {
  const rawBody = typeof payload === "string" ? payload : JSON.stringify(payload);
  const timestamp = options.timestamp ?? NOW;
  const secret = options.secret ?? SECRET;
  const headers = new Headers();
  headers.set(
    "x-bachs-signature-v2",
    [`t=${timestamp}`, `v1=${sign(secret, timestamp, rawBody)}`].join(","),
  );
  return new Request("https://example.test/api/webhooks/tickets", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function paidEvent(overrides = {}) {
  return {
    id: "evt_ticket_1",
    type: "collection.succeeded",
    data: {
      checkout_id: "chk_ticket_1",
      reference: "tkt_order-1",
      payment_status: "succeeded",
      metadata: { order_id: "order-1" },
      ...overrides.data,
    },
    ...overrides.envelope,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function verifyStub(body) {
  return async (url, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "GET" && url.includes("/v1/checkout-sessions/")) {
      return jsonResponse(body);
    }
    throw new Error(`unexpected call ${method} ${url}`);
  };
}

function paidVerifyBody(overrides = {}) {
  return {
    status: "completed",
    payment_status: "succeeded",
    amount: "10000.00",
    currency: "NGN",
    reference: "tkt_order-1",
    metadata: {},
    ...overrides,
  };
}

class FakeTable {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.inFilters = [];
    this.pendingUpdate = null;
  }

  store() {
    if (this.table === "ticket_webhook_events") return this.db.events;
    if (this.table === "notifications") return this.db.notifications;
    return this.db.orders;
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column, values) {
    this.inFilters.push((row) => values.includes(row[column]));
    return this;
  }

  rows() {
    return [...this.store().values()].filter(
      (row) => this.filters.every((matches) => matches(row)) && this.inFilters.every((matches) => matches(row)),
    );
  }

  insert(row) {
    if (this.table === "ticket_webhook_events") {
      const clash = [...this.db.events.values()].some(
        (existing) =>
          existing.provider === (row.provider ?? "bachs") &&
          existing.provider_event_id === row.provider_event_id,
      );
      if (clash) {
        return { data: null, error: { code: "23505", message: "duplicate event" } };
      }
      const stored = { id: `evt-row-${this.db.events.size + 1}`, ...row };
      this.db.events.set(stored.provider_event_id, stored);
      return { data: [stored], error: null };
    }
    if (this.table === "notifications") {
      const stored = { id: `notif-${this.db.notifications.size + 1}`, ...row };
      this.db.notifications.set(stored.id, stored);
      return { data: [stored], error: null };
    }
    return { data: [row], error: null };
  }

  update(patch) {
    this.pendingUpdate = patch;
    return this;
  }

  select() {
    if (!this.pendingUpdate) return this;
    const matched = this.rows();
    for (const row of matched) {
      Object.assign(row, this.pendingUpdate);
    }
    return { data: matched, error: null };
  }

  async maybeSingle() {
    const matched = this.rows();
    return { data: matched[0] ?? null, error: null };
  }

  limit() {
    return this;
  }

  then(resolve) {
    return resolve({ data: this.rows(), error: null });
  }
}

class FakeDb {
  constructor() {
    this.orders = new Map();
    this.events = new Map();
    this.tiers = new Map();
    this.notifications = new Map();
    this.rpcCalls = [];
  }

  from(table) {
    return new FakeTable(this, table);
  }

  async rpc(name, args) {
    this.rpcCalls.push({ name, args });
    if (name === "issue_ticket_codes") {
      if (this.failIssue) return { data: null, error: { message: "issue down" } };
      return { data: 2, error: null };
    }
    if (name !== "activate_ticket_order") throw new Error(`unexpected rpc ${name}`);
    const fail = (message) => ({ data: null, error: { message } });
    const order = this.orders.get(args.p_order_id);
    if (!order) return fail("Ticket order not found.");
    if (order.status === "paid") return { data: "already_paid", error: null };
    if (order.status !== "pending") return fail("Only pending ticket orders can be activated.");
    const snapshotKobo = Math.round(Number(order.total_amount) * 100);
    if (order.provider_reference !== args.p_provider_reference || snapshotKobo !== args.p_amount_kobo) {
      return fail("Payment does not match the order snapshot.");
    }
    for (const item of order.items ?? []) {
      const tier = this.tiers.get(item.tier_id);
      if (!tier) return fail(`The ${item.tier_name} tier no longer exists.`);
      if ((tier.sold_quantity ?? 0) + item.quantity > tier.quantity) {
        return fail(`Not enough ${item.tier_name} tickets left.`);
      }
    }
    for (const item of order.items ?? []) {
      const tier = this.tiers.get(item.tier_id);
      tier.sold_quantity = (tier.sold_quantity ?? 0) + item.quantity;
    }
    order.status = "paid";
    order.paid_at = new Date(NOW_MS).toISOString();
    return { data: "activated", error: null };
  }
}

function seedOrder(db, overrides = {}) {
  const order = {
    id: "order-1",
    status: "pending",
    user_id: "user-1",
    event_id: EVENT_ID,
    total_amount: 10000,
    provider_reference: "tkt_order-1",
    items: [{ tier_id: TIER_ID, tier_name: "Regular", quantity: 2 }],
    ...overrides,
  };
  db.orders.set(order.id, order);
  db.tiers.set(TIER_ID, { id: TIER_ID, quantity: 100, sold_quantity: 0 });
  return order;
}

function deps(db, fetchImpl, overrides = {}) {
  return { fetchImpl, supabase: db, nowSeconds: NOW, webhookSecret: SECRET, ...overrides };
}

describe("ticket webhook safety", () => {
  it("rejects unsigned and malformed deliveries without touching the database", async () => {
    const db = new FakeDb();
    const noSig = new Request("https://example.test/api/webhooks/tickets", {
      method: "POST",
      headers: {},
      body: JSON.stringify(paidEvent()),
    });
    const unsigned = await handleTicketWebhook(noSig, deps(db, verifyStub(paidVerifyBody())));
    assert.equal(unsigned.status, 400);
    const malformed = await handleTicketWebhook(
      signedRequest("not-json{{"),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(malformed.status, 400);
    assert.equal(db.events.size, 0);
  });

  it("fails closed when the webhook secret is not configured", async () => {
    const db = new FakeDb();
    const response = await handleTicketWebhook(signedRequest(paidEvent()), {
      fetchImpl: verifyStub(paidVerifyBody()),
      supabase: db,
      nowSeconds: NOW,
      webhookSecret: "",
    });
    assert.equal(response.status, 500);
  });

  it("dedupes redeliveries of processed events", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const stub = verifyStub(paidVerifyBody());
    const first = await handleTicketWebhook(signedRequest(paidEvent()), deps(db, stub));
    assert.equal(first.status, 200);
    const second = await handleTicketWebhook(signedRequest(paidEvent()), deps(db, stub));
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), { ok: true, outcome: "duplicate" });
    assert.deepEqual(
      db.rpcCalls.map((call) => call.name),
      ["activate_ticket_order", "issue_ticket_codes"],
    );
  });
});

describe("ticket webhook payment path", () => {
  it("activates verified matching money", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const response = await handleTicketWebhook(
      signedRequest(paidEvent()),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, outcome: "activated" });
    assert.equal(db.orders.get("order-1").status, "paid");
    assert.equal(db.tiers.get(TIER_ID).sold_quantity, 2);
  });

  it("sends exactly one payment-confirmed notification across duplicate settlements", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const first = await handleTicketWebhook(
      signedRequest(paidEvent()),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(first.status, 200);
    // A second, distinct delivery for the same order (e.g. late webhook after
    // the return page settled it) must not create a second inbox note.
    const second = await handleTicketWebhook(
      signedRequest(paidEvent({ envelope: { id: "evt_ticket_2" } })),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(second.status, 200);
    assert.equal(db.notifications.size, 1);
    const [note] = [...db.notifications.values()];
    assert.equal(note.user_id, "user-1");
    assert.equal(note.type, "order_paid");
    assert.equal(note.link, "/app/tickets/success?order=order-1");
  });

  it("records mismatched money for manual handling instead of delivering", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const response = await handleTicketWebhook(
      signedRequest(paidEvent()),
      deps(db, verifyStub(paidVerifyBody({ amount: "1.00" }))),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, outcome: "recorded-manual" });
    const order = db.orders.get("order-1");
    assert.equal(order.status, "failed");
    assert.equal(order.status_reason, "amount_mismatch");
  });

  it("records sold-out money for manual handling", async () => {
    const db = new FakeDb();
    seedOrder(db);
    db.tiers.get(TIER_ID).sold_quantity = 100;
    const response = await handleTicketWebhook(
      signedRequest(paidEvent()),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, outcome: "recorded-manual" });
    assert.equal(db.orders.get("order-1").status_reason, "sold_out");
  });

  it("records late money on terminal orders without changing their status", async () => {
    const db = new FakeDb();
    seedOrder(db, { status: "expired" });
    const response = await handleTicketWebhook(
      signedRequest(paidEvent()),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, outcome: "recorded-manual" });
    const order = db.orders.get("order-1");
    assert.equal(order.status, "expired");
    assert.equal(order.status_reason, "late_payment_terminal_order");
  });

  it("retries when issuance fails after activation", async () => {
    const db = new FakeDb();
    db.failIssue = true;
    seedOrder(db);
    const response = await handleTicketWebhook(
      signedRequest(paidEvent()),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(response.status, 500);
    assert.equal(db.orders.get("order-1").status, "paid");
  });

  it("returns 500 for unknown orders so Bachs retries", async () => {
    const db = new FakeDb();
    const response = await handleTicketWebhook(
      signedRequest(paidEvent()),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(response.status, 500);
  });

  it("retries when verification is inconclusive", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const down = async () => {
      throw new Error("socket hangup");
    };
    const response = await handleTicketWebhook(signedRequest(paidEvent()), deps(db, down));
    assert.equal(response.status, 500);
    assert.equal(db.orders.get("order-1").status, "pending");
  });
});

describe("ticket webhook lifecycle events", () => {
  it("treats no-payment-required as terminal and ambiguous completion as retry", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const none = await handleTicketWebhook(
      signedRequest(paidEvent({ envelope: { id: "evt_nopay", type: "checkout.completed" }, data: { payment_status: "no_payment_required" } })),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(none.status, 200);
    const vague = await handleTicketWebhook(
      signedRequest(paidEvent({ envelope: { id: "evt_vague", type: "checkout.completed" }, data: { payment_status: "open" } })),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(vague.status, 500);
  });

  it("expires pending orders on checkout expiry and parks unknown ones", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const expired = await handleTicketWebhook(
      signedRequest(paidEvent({ envelope: { id: "evt_exp", type: "checkout.expired" } })),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(expired.status, 200);
    assert.equal(db.orders.get("order-1").status, "expired");
    const parked = await handleTicketWebhook(
      signedRequest(
        paidEvent({ envelope: { id: "evt_exp2", type: "checkout.expired" }, data: { reference: "tkt_missing", metadata: {} } }),
      ),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(parked.status, 200);
    assert.deepEqual(await parked.json(), { ok: true, outcome: "parked" });
  });

  it("keeps orders pending on failed collections and ignores unknown types", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const failed = await handleTicketWebhook(
      signedRequest(paidEvent({ envelope: { id: "evt_fail", type: "collection.failed" } })),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(failed.status, 200);
    assert.equal(db.orders.get("order-1").status, "pending");
    const ignored = await handleTicketWebhook(
      signedRequest(paidEvent({ envelope: { id: "evt_weird", type: "customer.created" } })),
      deps(db, verifyStub(paidVerifyBody())),
    );
    assert.equal(ignored.status, 200);
    assert.deepEqual(await ignored.json(), { ok: true, outcome: "ignored" });
  });
});
