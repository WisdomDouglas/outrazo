// Bachs webhook handler tests (P2 Step 3).
//
// The handler runs with injected fakes: an in-memory database standing in
// for the service-role Supabase client, a stub fetch for Bachs API calls,
// and a fixed clock. No test touches the network, a real secret, or the
// live database.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  WEBHOOK_VERIFY_TIMEOUT_MS,
  handleBachsWebhook,
} from "@/showcase/promotions/bachs-webhook.server";
import { verifyBachsSignature } from "@/integrations/bachs/webhook-verify";

const SECRET = "whsec_test-only-never-a-real-secret";
const NOW = 1_700_000_000;

// The Step 2 client reads its key from the environment only (no override
// parameter by design). Point it at a fake sandbox key for this suite — the
// stubbed fetch never sends it anywhere, and each test file runs in its
// own process so this cannot leak into other suites or real code.
process.env["BACHS_API_KEY"] = "sk_sandbox_test-only-never-a-real-secret";
delete process.env["BACHS_BASE_URL"];

function sign(secret, timestamp, rawBody) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
}

function signedRequest(payload, options = {}) {
  const rawBody =
    typeof payload === "string" ? payload : JSON.stringify(payload);
  const timestamp = options.timestamp ?? NOW;
  const secret = options.secret ?? SECRET;
  const headers = new Headers();
  if (options.scheme === "legacy") {
    headers.set("x-bachs-signature", sign(secret, timestamp, rawBody));
    headers.set("x-bachs-timestamp", String(timestamp));
  } else if (options.rawV2 !== undefined) {
    headers.set("x-bachs-signature-v2", options.rawV2);
  } else {
    const first = options.firstSignature ?? sign(secret, timestamp, rawBody);
    const extra = options.extraSignatures ?? [];
    headers.set(
      "x-bachs-signature-v2",
      [`t=${timestamp}`, `v1=${first}`, ...extra.map((s) => `v1=${s}`)].join(","),
    );
  }
  return new Request("https://example.test/api/webhooks/promotions", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function paidEvent(overrides = {}) {
  return {
    id: "evt_test_1",
    type: "collection.succeeded",
    created_at: "2026-01-24T14:35:00.000Z",
    data: {
      checkout_id: "chk_test123",
      reference: "promo-order-0001",
      status: "SUCCEEDED",
      amount: "2000.00",
      currency: "NGN",
      metadata: { order_id: "order-1" },
      ...overrides.data,
    },
    ...overrides.envelope,
  };
}

// Minimal in-memory stand-in for the query shapes the handler uses:
// insert (with the unique event key), select+eq chains with maybeSingle,
// guarded update+select, and the activation RPC with faithful replay rules.
class FakeTable {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.pendingUpdate = null;
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column, values) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  rows() {
    const store =
      this.table === "promotion_orders" ? this.db.orders : this.db.events;
    return [...store.values()].filter((row) =>
      this.filters.every((matches) => matches(row)),
    );
  }

  async insert(row) {
    if (this.db.failMode) return { data: null, error: { message: "db down" } };
    if (this.table === "promotion_webhook_events") {
      const clash = [...this.db.events.values()].some(
        (existing) =>
          existing.provider === row.provider &&
          existing.provider_event_id === row.provider_event_id,
      );
      if (clash) {
        return { data: null, error: { code: "23505", message: "duplicate" } };
      }
      const id = `weblog-${this.db.events.size + 1}`;
      const stored = { id, ...row };
      this.db.events.set(id, stored);
      return { data: [stored], error: null };
    }
    return { data: null, error: { message: "unsupported insert" } };
  }

  select() {
    if (this.pendingUpdate) {
      if (this.db.failMode) {
        return { data: null, error: { message: "db down" } };
      }
      const matched = this.rows();
      for (const row of matched) Object.assign(row, this.pendingUpdate);
      return { data: matched, error: null };
    }
    return this;
  }

  update(patch) {
    this.pendingUpdate = patch;
    return this;
  }

  async maybeSingle() {
    if (this.db.failMode) return { data: null, error: { message: "db down" } };
    const matched = this.rows();
    return { data: matched[0] ?? null, error: null };
  }
}

class FakeDb {
  constructor() {
    this.orders = new Map();
    this.events = new Map();
    this.promotions = [];
    this.rpcCalls = [];
    this.failMode = false;
    this.rpcImpl = this.activate.bind(this);
  }

  from(table) {
    return new FakeTable(this, table);
  }

  async rpc(name, args) {
    this.rpcCalls.push({ name, args });
    if (this.failMode) return { data: null, error: { message: "db down" } };
    return this.rpcImpl(name, args);
  }

  // Mirrors activate_paid_promotion's contract: exact snapshot match
  // delivers (once), mismatch queues a refund, replays converge.
  activate(name, args) {
    assert.equal(name, "activate_paid_promotion");
    const order = this.orders.get(args.p_order_id);
    if (!order) return { data: null, error: { message: "not found" } };
    if (order.status === "paid") return { data: "paid", error: null };
    if (order.status === "refund_pending" || order.status === "refunded") {
      return { data: order.status, error: null };
    }
    if (
      order.provider_reference !== args.p_provider_reference ||
      order.total_amount_kobo !== args.p_amount_kobo
    ) {
      order.status = "refund_pending";
      return { data: "refund_pending", error: null };
    }
    order.status = "paid";
    this.promotions.push({ orderId: order.id });
    return { data: "paid", error: null };
  }
}

function seedOrder(db, overrides = {}) {
  const order = {
    id: "order-1",
    status: "pending",
    provider_reference: "promo-order-0001",
    total_amount_kobo: 200_000,
    ...overrides,
  };
  db.orders.set(order.id, order);
  return order;
}

function paidVerifyBody(overrides = {}) {
  return {
    status: "completed",
    payment_status: "succeeded",
    amount: "2000.00",
    currency: "NGN",
    reference: "promo-order-0001",
    metadata: { order_id: "order-1" },
    ...overrides,
  };
}

function verifyFetch(body, status = 200) {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

function eventRow(db, providerEventId) {
  return (
    [...db.events.values()].find(
      (row) => row.provider_event_id === providerEventId,
    ) ?? null
  );
}

async function post(db, payload, options = {}) {
  const request = signedRequest(payload, options.request ?? {});
  return handleBachsWebhook(request, {
    fetchImpl: options.fetchImpl ?? verifyFetch(paidVerifyBody()),
    supabase: db,
    nowSeconds: NOW,
    webhookSecret: SECRET,
    ...(options.deps ?? {}),
  });
}

describe("webhook signature verification", () => {
  const VECTOR_BODY = '{"id":"evt_vec"}';
  const VECTOR_HEX =
    "ea53cb0db085c626d1a00f1fc561e3c61d19460c21ea65980e40d717dbb0efbb";

  it("pins the exact documented message format with a fixed vector", async () => {
    const headers = new Headers({
      "x-bachs-signature-v2": `t=1700000000,v1=${VECTOR_HEX}`,
    });
    const check = await verifyBachsSignature({
      rawBody: VECTOR_BODY,
      headers,
      secret: "whsec_test_vector",
      nowSeconds: 1700000000,
    });
    assert.deepEqual(check, { verified: true, reason: "ok", scheme: "v2" });
  });

  it("accepts any listed v1 during secret rotation, in any position", async () => {
    const rawBody = '{"id":"evt_rot"}';
    const good = sign(SECRET, NOW, rawBody);
    const bad = "0".repeat(64);
    for (const header of [
      `t=${NOW},v1=${bad},v1=${good}`,
      `t=${NOW},v1=${good},v1=${bad}`,
    ]) {
      const check = await verifyBachsSignature({
        rawBody,
        headers: new Headers({ "x-bachs-signature-v2": header }),
        secret: SECRET,
        nowSeconds: NOW,
      });
      assert.equal(check.verified, true, header);
    }
  });

  it("rejects tampered bodies, wrong secrets, and stale timestamps", async () => {
    const rawBody = '{"id":"evt_tamper"}';
    const good = sign(SECRET, NOW, rawBody);
    const headersFor = (header) =>
      new Headers({ "x-bachs-signature-v2": header });
    const cases = [
      [{ rawBody: '{"id":"evt_changed"}', header: `t=${NOW},v1=${good}` }, "mismatch"],
      [{ rawBody, header: `t=${NOW},v1=${"0".repeat(64)}` }, "mismatch"],
      [{ rawBody, header: `t=${NOW - 301},v1=${sign(SECRET, NOW - 301, rawBody)}` }, "stale-timestamp"],
      [{ rawBody, header: "t=not-a-time,v1=abc" }, "malformed-signature"],
      [{ rawBody, header: `t=${NOW}` }, "malformed-signature"],
    ];
    for (const [{ rawBody: body, header }, reason] of cases) {
      const check = await verifyBachsSignature({
        rawBody: body,
        headers: headersFor(header),
        secret: SECRET,
        nowSeconds: NOW,
      });
      assert.equal(check.verified, false);
      assert.equal(check.reason, reason, header);
    }
    const wrongSecret = await verifyBachsSignature({
      rawBody,
      headers: headersFor(`t=${NOW},v1=${good}`),
      secret: "whsec_wrong",
      nowSeconds: NOW,
    });
    assert.equal(wrongSecret.verified, false);
    assert.equal(wrongSecret.reason, "mismatch");
  });

  it("supports the legacy header pair and reports a missing signature", async () => {
    const rawBody = '{"id":"evt_legacy"}';
    const legacy = new Headers({
      "x-bachs-signature": sign(SECRET, NOW, rawBody),
      "x-bachs-timestamp": String(NOW),
    });
    const ok = await verifyBachsSignature({
      rawBody,
      headers: legacy,
      secret: SECRET,
      nowSeconds: NOW,
    });
    assert.deepEqual(ok, { verified: true, reason: "ok", scheme: "legacy" });

    const missing = await verifyBachsSignature({
      rawBody,
      headers: new Headers(),
      secret: SECRET,
      nowSeconds: NOW,
    });
    assert.equal(missing.verified, false);
    assert.equal(missing.reason, "missing-signature");
  });
});

describe("webhook request validation", () => {
  it("returns 400 for bad signatures without recording anything", async () => {
    const db = new FakeDb();
    const response = await post(db, paidEvent(), {
      request: { secret: "whsec_wrong" },
    });
    assert.equal(response.status, 400);
    assert.equal(db.events.size, 0);
  });

  it("returns 400 for malformed payloads and envelopes", async () => {
    const db = new FakeDb();
    const malformedJson = await post(db, "not json{{");
    assert.equal(malformedJson.status, 400);
    const noEnvelope = await post(db, { hello: "world" });
    assert.equal(noEnvelope.status, 400);
    assert.equal(db.events.size, 0);
  });

  it("returns 500 when the webhook secret is not configured", async () => {
    const db = new FakeDb();
    delete process.env["BACHS_WEBHOOK_SECRET"];
    const request = signedRequest(paidEvent(), { secret: SECRET });
    const response = await handleBachsWebhook(request, {
      fetchImpl: verifyFetch(paidVerifyBody()),
      supabase: db,
      nowSeconds: NOW,
    });
    assert.equal(response.status, 500);
  });

  it("ignores unknown event types with 200", async () => {
    const db = new FakeDb();
    const response = await post(
      db,
      paidEvent({ envelope: { id: "evt_unknown", type: "invoice.paid" } }),
    );
    assert.equal(response.status, 200);
    assert.equal(eventRow(db, "evt_unknown").status, "ignored");
  });
});

describe("successful payment and activation", () => {
  it("verifies, activates, and marks processed exactly once", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const response = await post(db, paidEvent());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, outcome: "activated" });
    assert.equal(db.orders.get("order-1").status, "paid");
    assert.equal(db.promotions.length, 1);
    assert.equal(db.rpcCalls.length, 1);
    assert.deepEqual(db.rpcCalls[0].args, {
      p_order_id: "order-1",
      p_provider_reference: "promo-order-0001",
      p_amount_kobo: 200_000,
    });
    const row = eventRow(db, "evt_test_1");
    assert.equal(row.status, "processed");
    assert.ok(row.processed_at);
  });

  it("routes snapshot mismatches to the manual refund queue, never delivery", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const response = await post(db, paidEvent(), {
      fetchImpl: verifyFetch(paidVerifyBody({ amount: "1999.00" })),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      outcome: "queued-refund",
    });
    assert.equal(db.orders.get("order-1").status, "refund_pending");
    assert.equal(db.promotions.length, 0);
    assert.equal(eventRow(db, "evt_test_1").status, "processed");
  });

  it("matches orders by metadata when the event reference is absent", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const envelope = paidEvent();
    delete envelope.data.reference;
    const response = await post(db, envelope);
    assert.equal(response.status, 200);
    assert.equal(db.orders.get("order-1").status, "paid");
  });
});

describe("duplicate and out-of-order delivery", () => {
  it("ignores redelivery of a processed event without repeating finance", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const first = await post(db, paidEvent());
    assert.equal(first.status, 200);
    const second = await post(db, paidEvent());
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), { ok: true, outcome: "duplicate" });
    assert.equal(db.rpcCalls.length, 1);
    assert.equal(db.promotions.length, 1);
  });

  it("activates once when success events arrive in either order", async () => {
    for (const firstType of ["collection.succeeded", "checkout.completed"]) {
      const db = new FakeDb();
      seedOrder(db);
      const secondType =
        firstType === "collection.succeeded"
          ? "checkout.completed"
          : "collection.succeeded";
      const firstPayload = paidEvent({
        envelope: { id: "evt_first", type: firstType },
        data:
          firstType === "checkout.completed"
            ? { payment_status: "paid" }
            : {},
      });
      const secondPayload = paidEvent({
        envelope: { id: "evt_second", type: secondType },
        data:
          secondType === "checkout.completed"
            ? { payment_status: "paid" }
            : {},
      });
      assert.equal((await post(db, firstPayload)).status, 200);
      assert.equal((await post(db, secondPayload)).status, 200);
      assert.equal(db.orders.get("order-1").status, "paid");
      assert.equal(
        db.promotions.length,
        1,
        `duplicate promotion for order ${firstType}-first`,
      );
      assert.equal(eventRow(db, "evt_first").status, "processed");
      assert.equal(eventRow(db, "evt_second").status, "processed");
    }
  });

  it("never lets a late duplicate failure overwrite processed", async () => {
    const db = new FakeDb();
    seedOrder(db);
    assert.equal((await post(db, paidEvent())).status, 200);
    assert.equal(eventRow(db, "evt_test_1").status, "processed");
    // The duplicate arrives while verification is failing: it must still
    // acknowledge without touching the settled row.
    const failingFetch = async () => {
      throw new TypeError("fetch failed");
    };
    const duplicate = await post(db, paidEvent(), { fetchImpl: failingFetch });
    assert.equal(duplicate.status, 200);
    assert.equal(eventRow(db, "evt_test_1").status, "processed");
    assert.equal(db.rpcCalls.length, 1);
  });
});

describe("unresolved outcomes stay retryable", () => {
  it("fails unknown order references with 500 for retry", async () => {
    const db = new FakeDb();
    const response = await post(db, paidEvent());
    assert.equal(response.status, 500);
    assert.equal(eventRow(db, "evt_test_1").status, "failed");
    assert.equal(db.rpcCalls.length, 0);
  });

  it("fails unpaid checkouts with 500 and never activates", async () => {
    const db = new FakeDb();
    seedOrder(db);
    for (const body of [
      paidVerifyBody({ status: "open", payment_status: null, amount: null }),
      paidVerifyBody({ payment_status: "failed" }),
    ]) {
      const response = await post(
        db,
        paidEvent({ envelope: { id: `evt_unpaid_${body.payment_status}` } }),
        { fetchImpl: verifyFetch(body) },
      );
      assert.equal(response.status, 500);
    }
    assert.equal(db.orders.get("order-1").status, "pending");
    assert.equal(db.rpcCalls.length, 0);
  });

  it("fails verification faults with 500 and recovers on redelivery", async () => {
    const db = new FakeDb();
    seedOrder(db);
    let attempts = 0;
    const flaky = async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("fetch failed");
      return new Response(JSON.stringify(paidVerifyBody()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const first = await post(db, paidEvent(), { fetchImpl: flaky });
    assert.equal(first.status, 500);
    assert.equal(eventRow(db, "evt_test_1").status, "failed");
    const second = await post(db, paidEvent(), { fetchImpl: flaky });
    assert.equal(second.status, 200);
    assert.equal(eventRow(db, "evt_test_1").status, "processed");
    assert.equal(db.orders.get("order-1").status, "paid");
    assert.equal(db.promotions.length, 1);
  });

  it("fails activation faults with 500 and never marks them processed", async () => {
    const db = new FakeDb();
    seedOrder(db);
    db.rpcImpl = () => ({ data: null, error: { message: "boom" } });
    const response = await post(db, paidEvent());
    assert.equal(response.status, 500);
    assert.equal(eventRow(db, "evt_test_1").status, "failed");
    assert.equal(db.orders.get("order-1").status, "pending");
  });

  it("treats timeouts as uncertain and retryable", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    const response = await post(db, paidEvent(), {
      fetchImpl: async () => {
        throw timeout;
      },
    });
    assert.equal(response.status, 500);
    assert.equal(eventRow(db, "evt_test_1").status, "failed");
  });

  it("keeps the verify call inside the acknowledgement budget", () => {
    assert.ok(WEBHOOK_VERIFY_TIMEOUT_MS <= 10_000);
    assert.equal(WEBHOOK_VERIFY_TIMEOUT_MS, 8000);
  });
});

describe("non-payment event routing", () => {
  it("acknowledges explicit no-payment-required without activating", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const response = await post(
      db,
      paidEvent({
        envelope: { id: "evt_free", type: "checkout.completed" },
        data: { payment_status: "no_payment_required" },
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      outcome: "no-payment-required",
    });
    assert.equal(db.rpcCalls.length, 0);
    assert.equal(db.orders.get("order-1").status, "pending");
  });

  it("retries ambiguous checkout completion until money resolves", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const envelope = paidEvent({
      envelope: { id: "evt_ambiguous", type: "checkout.completed" },
    });
    delete envelope.data.payment_status;
    const response = await post(db, envelope);
    assert.equal(response.status, 500);
    assert.equal(eventRow(db, "evt_ambiguous").status, "failed");
    // A later collection event for the same order still activates.
    const collection = await post(
      db,
      paidEvent({ envelope: { id: "evt_late_money" } }),
    );
    assert.equal(collection.status, 200);
    assert.equal(db.orders.get("order-1").status, "paid");
  });

  it("expires pending orders on checkout expiry, terminal ones untouched", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const expired = await post(
      db,
      paidEvent({ envelope: { id: "evt_exp", type: "checkout.expired" } }),
    );
    assert.equal(expired.status, 200);
    assert.equal(db.orders.get("order-1").status, "expired");

    const paidDb = new FakeDb();
    seedOrder(paidDb, { status: "paid" });
    const terminal = await post(
      paidDb,
      paidEvent({ envelope: { id: "evt_exp2", type: "checkout.expired" } }),
      { fetchImpl: verifyFetch(paidVerifyBody()) },
    );
    assert.equal(terminal.status, 200);
    assert.equal(paidDb.orders.get("order-1").status, "paid");
    assert.equal(paidDb.rpcCalls.length, 0);
  });

  it("leaves orders pending on failed collections", async () => {
    const db = new FakeDb();
    seedOrder(db);
    const response = await post(
      db,
      paidEvent({ envelope: { id: "evt_fail", type: "collection.failed" } }),
    );
    assert.equal(response.status, 200);
    assert.equal(db.orders.get("order-1").status, "pending");
    assert.equal(db.rpcCalls.length, 0);
    assert.equal(eventRow(db, "evt_fail").status, "processed");
  });
});

describe("incoming-payments-only policy", () => {
  it("introduces no refund, payout, or disbursement capability", () => {
    const files = [
      "../src/integrations/bachs/client.server.ts",
      "../src/integrations/bachs/webhook-verify.ts",
      "../src/showcase/promotions/bachs-webhook.server.ts",
      "../src/routes/api.webhooks.promotions.ts",
    ];
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
    ];
    const offenders = [];
    for (const file of files) {
      const text = readFileSync(new URL(file, import.meta.url), "utf8");
      for (const pattern of forbidden) {
        if (text.includes(pattern)) offenders.push(`${file}: ${pattern}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});
