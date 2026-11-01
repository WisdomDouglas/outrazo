// Promotion order read + cancel tests (P2 Step 4B).
//
// Exercises the organizer-facing order core with an in-memory database and
// a scripted Bachs fetch: ownership enforcement, cancellation with live
// money re-verification, and honest settled-state reporting. The thin
// createServerFn wrappers are covered by type-check, lint, build, and the
// manual checklist — server-function RPC needs a running app.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { PromotionCheckoutError } from "@/showcase/promotions/promotion-checkout.server";
import {
  cancelPromotionOrderAsOrganizer,
  getOwnPromotionOrder,
  listOwnPromotionOrders,
} from "@/showcase/promotions/promotion-orders.server";

const NOW_MS = 1_700_000_000_000;
const USER_ID = "user-organizer-1";
const OTHER_ID = "user-stranger-9";

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
  }

  select() {
    return this;
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
    const list = [...this.db.orders.values()].filter((row) =>
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

  limit(n) {
    if (this.db.failMode) return { data: null, error: { message: "db down" } };
    return { data: this.rows().slice(0, n), error: null };
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
    this.promotions = [];
    this.rpcCalls = [];
    this.failMode = false;
  }

  from() {
    return new FakeTable(this);
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

function seedOrder(db, overrides = {}) {
  const order = {
    id: `order-${db.orders.size + 1}`,
    event_id: "event-1",
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

function verifyStub(body) {
  return async (url, init = {}) => {
    assert.equal((init.method ?? "GET").toUpperCase(), "GET");
    assert.ok(url.includes("/v1/checkout-sessions/"));
    return jsonResponse(body);
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

describe("own order reads", () => {
  it("returns the database row for the owner", async () => {
    const db = new FakeDb();
    const order = seedOrder(db, { status: "paid", promotion_id: "promo-1" });
    const found = await getOwnPromotionOrder(
      { orderId: order.id, userId: USER_ID },
      { supabase: db },
    );
    assert.equal(found.id, order.id);
    assert.equal(found.status, "paid");
    assert.equal(found.totalKobo, 400_000);
    assert.equal(found.promotionId, "promo-1");
  });

  it("never exposes checkout session fields in summaries", async () => {
    const db = new FakeDb();
    const order = seedOrder(db, {
      checkout_id: "chk_secret",
      checkout_url: "https://pay.bachs.test/c/secret",
    });
    const found = await getOwnPromotionOrder(
      { orderId: order.id, userId: USER_ID },
      { supabase: db },
    );
    assert.ok(!("checkout_id" in found));
    assert.ok(!("checkout_url" in found));
    assert.ok(!("checkoutId" in found));
    assert.ok(!("checkoutUrl" in found));
    const listed = await listOwnPromotionOrders({ userId: USER_ID }, { supabase: db });
    assert.equal(listed.length, 1);
    assert.ok(!("checkout_url" in listed[0]));
  });

  it("rejects unknown orders, foreign orders, and database faults", async () => {
    const db = new FakeDb();
    const mine = seedOrder(db);
    seedOrder(db, { organizer_id: OTHER_ID });
    await rejectsWith(
      getOwnPromotionOrder({ orderId: "missing", userId: USER_ID }, { supabase: db }),
      "not-found",
    );
    const foreign = [...db.orders.values()].find((row) => row.organizer_id === OTHER_ID);
    await rejectsWith(
      getOwnPromotionOrder({ orderId: foreign.id, userId: USER_ID }, { supabase: db }),
      "forbidden",
    );
    db.failMode = true;
    await rejectsWith(
      getOwnPromotionOrder({ orderId: mine.id, userId: USER_ID }, { supabase: db }),
      "checkout-unavailable",
    );
  });

  it("lists only the caller's orders, newest first, with clamped limits", async () => {
    const db = new FakeDb();
    seedOrder(db, { created_at: iso(NOW_MS - 2000) });
    seedOrder(db, { created_at: iso(NOW_MS - 1000) });
    seedOrder(db, { organizer_id: OTHER_ID, created_at: iso(NOW_MS) });
    const listed = await listOwnPromotionOrders({ userId: USER_ID }, { supabase: db });
    assert.equal(listed.length, 2);
    assert.ok(listed[0].createdAt > listed[1].createdAt);
    const one = await listOwnPromotionOrders({ userId: USER_ID, limit: 1 }, { supabase: db });
    assert.equal(one.length, 1);
    const clamped = await listOwnPromotionOrders(
      { userId: USER_ID, limit: 9999 },
      { supabase: db },
    );
    assert.equal(clamped.length, 2);
  });
});

describe("organizer cancellation", () => {
  it("cancels session-less pending orders directly", async () => {
    const db = new FakeDb();
    const order = seedOrder(db);
    let verifyCalls = 0;
    const result = await cancelPromotionOrderAsOrganizer(
      { orderId: order.id, userId: USER_ID },
      {
        supabase: db,
        fetchImpl: async () => {
          verifyCalls += 1;
          throw new Error("no session: must not verify");
        },
      },
    );
    assert.deepEqual(result, {
      orderId: order.id,
      status: "cancelled",
      promotionId: null,
    });
    assert.equal(verifyCalls, 0);
    assert.equal(db.orders.get(order.id).status, "cancelled");
  });

  it("reports the true state when cancellation loses a payment race", async () => {
    const db = new FakeDb();
    const order = seedOrder(db);
    const realRpc = db.rpc.bind(db);
    db.rpc = async (name, args) => {
      if (name === "cancel_promotion_order") {
        // Payment landed first: the RPC refuses, the reload shows paid.
        db.orders.get(order.id).status = "paid";
        db.orders.get(order.id).promotion_id = "promo-race-1";
        return { data: null, error: { message: "That order is already paid." } };
      }
      return realRpc(name, args);
    };
    const result = await cancelPromotionOrderAsOrganizer(
      { orderId: order.id, userId: USER_ID },
      { supabase: db, fetchImpl: verifyStub(paidVerifyBody()) },
    );
    assert.deepEqual(result, {
      orderId: order.id,
      status: "paid",
      promotionId: "promo-race-1",
    });
  });

  it("activates instead of cancelling when verification finds money", async () => {
    const db = new FakeDb();
    const order = seedOrder(db, {
      provider_reference: "promo-seed-1",
      checkout_id: "chk_paid_1",
      checkout_url: "https://pay.bachs.test/c/chk_paid_1",
      checkout_expires_at: iso(NOW_MS + 3_600_000),
    });
    const result = await cancelPromotionOrderAsOrganizer(
      { orderId: order.id, userId: USER_ID },
      { supabase: db, fetchImpl: verifyStub(paidVerifyBody()) },
    );
    assert.equal(result.status, "paid");
    assert.equal(result.activationOutcome, "paid");
    assert.ok(result.promotionId);
    assert.equal(db.orders.get(order.id).status, "paid");
    assert.ok(
      db.rpcCalls.every((call) => call.name !== "cancel_promotion_order"),
    );
  });

  it("surfaces refund routing when verified money cannot deliver", async () => {
    const db = new FakeDb();
    const order = seedOrder(db, {
      provider_reference: "promo-seed-1",
      checkout_id: "chk_paid_2",
      checkout_url: "https://pay.bachs.test/c/chk_paid_2",
      checkout_expires_at: iso(NOW_MS + 3_600_000),
    });
    const result = await cancelPromotionOrderAsOrganizer(
      { orderId: order.id, userId: USER_ID },
      {
        supabase: db,
        fetchImpl: verifyStub(paidVerifyBody({ amount: "100.00" })),
      },
    );
    assert.equal(result.status, "refund_pending");
    assert.equal(result.activationOutcome, "refund_pending");
    assert.equal(db.promotions.length, 0);
  });

  it("cancels terminally unpaid sessions after verification", async () => {
    const db = new FakeDb();
    const order = seedOrder(db, {
      checkout_id: "chk_failed_1",
      checkout_url: "https://pay.bachs.test/c/chk_failed_1",
      checkout_expires_at: iso(NOW_MS + 3_600_000),
    });
    const result = await cancelPromotionOrderAsOrganizer(
      { orderId: order.id, userId: USER_ID },
      {
        supabase: db,
        fetchImpl: verifyStub({
          status: "open",
          payment_status: "failed",
          amount: null,
          currency: null,
          reference: null,
          metadata: {},
        }),
      },
    );
    assert.deepEqual(result, {
      orderId: order.id,
      status: "cancelled",
      promotionId: null,
    });
  });

  it("preserves the reservation when verification is ambiguous", async () => {
    const db = new FakeDb();
    const order = seedOrder(db, {
      checkout_id: "chk_open_1",
      checkout_url: "https://pay.bachs.test/c/chk_open_1",
      checkout_expires_at: iso(NOW_MS + 3_600_000),
    });
    await rejectsWith(
      cancelPromotionOrderAsOrganizer(
        { orderId: order.id, userId: USER_ID },
        {
          supabase: db,
          fetchImpl: verifyStub({
            status: "open",
            payment_status: null,
            amount: null,
            currency: null,
            reference: null,
            metadata: {},
          }),
        },
      ),
      "uncertain",
    );
    assert.equal(db.orders.get(order.id).status, "pending");
    assert.ok(
      db.rpcCalls.every((call) => call.name !== "cancel_promotion_order"),
    );
  });

  it("preserves the reservation when verification throws", async () => {
    const db = new FakeDb();
    const order = seedOrder(db, {
      checkout_id: "chk_down_1",
      checkout_url: "https://pay.bachs.test/c/chk_down_1",
      checkout_expires_at: iso(NOW_MS + 3_600_000),
    });
    await rejectsWith(
      cancelPromotionOrderAsOrganizer(
        { orderId: order.id, userId: USER_ID },
        {
          supabase: db,
          fetchImpl: async () => {
            throw new TypeError("fetch failed");
          },
        },
      ),
      "uncertain",
    );
    assert.equal(db.orders.get(order.id).status, "pending");
  });

  it("reports settled orders truthfully without further writes", async () => {
    for (const [status, promotionId] of [
      ["paid", "promo-1"],
      ["refund_pending", null],
      ["refunded", null],
      ["expired", null],
      ["failed", null],
      ["cancelled", null],
    ]) {
      const db = new FakeDb();
      const order = seedOrder(db, { status, promotion_id: promotionId });
      let verifyCalls = 0;
      const result = await cancelPromotionOrderAsOrganizer(
        { orderId: order.id, userId: USER_ID },
        {
          supabase: db,
          fetchImpl: async () => {
            verifyCalls += 1;
            throw new Error("settled orders need no verification");
          },
        },
      );
      assert.deepEqual(
        result,
        { orderId: order.id, status, promotionId },
        status,
      );
      assert.equal(verifyCalls, 0, status);
      assert.equal(db.rpcCalls.length, 0, status);
    }
  });

  it("rejects unknown orders, foreign orders, and missing sign-in", async () => {
    const db = new FakeDb();
    const mine = seedOrder(db);
    const foreign = seedOrder(db, { organizer_id: OTHER_ID });
    await rejectsWith(
      cancelPromotionOrderAsOrganizer(
        { orderId: "missing", userId: USER_ID },
        { supabase: db, fetchImpl: verifyStub(paidVerifyBody()) },
      ),
      "not-found",
    );
    await rejectsWith(
      cancelPromotionOrderAsOrganizer(
        { orderId: foreign.id, userId: USER_ID },
        { supabase: db, fetchImpl: verifyStub(paidVerifyBody()) },
      ),
      "forbidden",
    );
    await rejectsWith(
      cancelPromotionOrderAsOrganizer(
        { orderId: mine.id, userId: "" },
        { supabase: db, fetchImpl: verifyStub(paidVerifyBody()) },
      ),
      "validation",
    );
    assert.equal(db.rpcCalls.length, 0);
  });
});

describe("incoming-payments-only policy", () => {
  it("adds no refund, payout, or disbursement capability in 4B modules", () => {
    const files = [
      "../src/showcase/promotions/promotion-orders.server.ts",
      "../src/showcase/promotions/promotion-functions.ts",
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
      "record_promotion_refund",
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
