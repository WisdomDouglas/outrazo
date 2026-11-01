// Server-only Bachs webhook handler core (P2 Step 3).
//
// The route file stays thin (parse Request, return Response); every decision
// lives here so tests can drive duplicates, out-of-order delivery, and
// failure interleavings with injected fakes and zero network.
//
// Response contract (mirrors Bachs retry rules: 2xx wins, other 4xx stops,
// 5xx/timeout retries, 5 tries total):
//   400 — rejected delivery: unreadable body, bad/missing signature, or a
//         payload without a usable event id/type. Nothing is recorded.
//   200 — terminal routing decision reached: processed, ignored, duplicate,
//         or parked (failed-but-unretryable: retrying cannot change it).
//   500 — unknown outcome: verification incomplete, activation unconfirmed,
//         or a dependency failed. Bachs retries; redelivery re-drives from
//         the failed/received row. Nothing unresolved is ever marked
//         processed, and no event is marked processed before verification
//         and activation have completed.
//
// Financial boundaries: incoming payments only. This module never refunds,
// transfers, or pays out. Amount/currency/reference matching happens in the
// atomic activate_paid_promotion RPC (the single enforcement point); money
// that cannot be delivered lands in refund_pending for the MANUAL staff
// workflow — never sent automatically.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  BachsError,
  verifyPayment,
} from "@/integrations/bachs/client.server";
import { verifyBachsSignature } from "@/integrations/bachs/webhook-verify";

/** Verify budget inside the 10s acknowledgement window (docs: 2xx ≤ 10s). */
export const WEBHOOK_VERIFY_TIMEOUT_MS = 8000;

// Local shape for the paid-promotions tables. The generated Database types do
// not include promotion_orders/promotion_webhook_events yet, so we extend the
// generated shape here instead of editing generated files — the same pattern
// as AdminPhase1Db in require-permission.server.ts. Column shapes mirror
// supabase/migrations/20261104090000_paid_promotions_v1.sql exactly.
export interface BachsWebhookDb {
  public: {
    Tables: {
      promotion_orders: {
        Row: {
          id: string;
          event_id: string;
          organizer_id: string;
          days: number;
          daily_amount_kobo: number;
          total_amount_kobo: number;
          currency: string;
          status: string;
          status_reason: string | null;
          provider: string;
          provider_reference: string;
          promotion_id: string | null;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          organizer_id: string;
          days: number;
          daily_amount_kobo: number;
          total_amount_kobo: number;
          currency?: string;
          status?: string;
          status_reason?: string | null;
          provider?: string;
          provider_reference: string;
          promotion_id?: string | null;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          organizer_id?: string;
          days?: number;
          daily_amount_kobo?: number;
          total_amount_kobo?: number;
          currency?: string;
          status?: string;
          status_reason?: string | null;
          provider?: string;
          provider_reference?: string;
          promotion_id?: string | null;
          paid_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      promotion_webhook_events: {
        Row: {
          id: string;
          provider: string;
          provider_event_id: string;
          event_type: string;
          reference: string | null;
          payload: Record<string, unknown>;
          status: string;
          error: string | null;
          received_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          provider?: string;
          provider_event_id: string;
          event_type: string;
          reference?: string | null;
          payload: Record<string, unknown>;
          status?: string;
          error?: string | null;
          received_at?: string;
          processed_at?: string | null;
        };
        Update: {
          id?: string;
          provider?: string;
          provider_event_id?: string;
          event_type?: string;
          reference?: string | null;
          payload?: Record<string, unknown>;
          status?: string;
          error?: string | null;
          received_at?: string;
          processed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Database["public"]["Views"];
    Enums: Database["public"]["Enums"];
    CompositeTypes: Database["public"]["CompositeTypes"];
    Functions: {
      activate_paid_promotion: {
        Args: {
          p_order_id: string;
          p_provider_reference: string;
          p_amount_kobo: number;
        };
        Returns: string;
      };
    };
  };
}

type AdminDb = SupabaseClient<BachsWebhookDb>;

function asWebhookDb(client: SupabaseClient): AdminDb {
  return client as unknown as AdminDb;
}

export interface BachsWebhookDeps {
  fetchImpl?: typeof fetch;
  supabase?: AdminDb;
  /** Unix seconds. Defaults to the current time; injectable for tests. */
  nowSeconds?: number;
  /** Overrides process.env.BACHS_WEBHOOK_SECRET (tests). */
  webhookSecret?: string;
}

interface BachsEventData {
  checkout_id?: unknown;
  reference?: unknown;
  payment_status?: unknown;
  metadata?: unknown;
}

interface BachsEvent {
  id: string;
  type: string;
  data: BachsEventData;
}

interface OrderRow {
  id: string;
  status: string;
}

interface EventRow {
  id: string;
  status: string;
}

const TERMINAL_EVENT_STATUSES = ["processed", "ignored"] as const;
const RETRYABLE_EVENT_STATUSES = ["received", "failed"] as const;

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toEvent(parsed: unknown): BachsEvent | null {
  if (!isRecord(parsed)) return null;
  const id = nonEmptyString(parsed["id"]);
  const type = nonEmptyString(parsed["type"]);
  const data = parsed["data"];
  if (id === null || type === null || !isRecord(data)) return null;
  return { id, type, data: data as BachsEventData };
}

async function getDb(deps: BachsWebhookDeps): Promise<AdminDb> {
  if (deps.supabase) return deps.supabase;
  const { supabaseAdmin: admin } = await import(
    "@/integrations/supabase/client.server"
  );
  return asWebhookDb(admin);
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

async function fetchEvent(
  db: AdminDb,
  providerEventId: string,
): Promise<EventRow | null> {
  const { data, error } = await db
    .from("promotion_webhook_events")
    .select("id,status")
    .eq("provider", "bachs")
    .eq("provider_event_id", providerEventId)
    .maybeSingle();
  if (error) throw error;
  return (data as EventRow | null) ?? null;
}

/**
 * Guarded status transition: only a non-terminal row moves, so a late
 * duplicate failure can never overwrite processed/ignored. Returns true
 * when this call performed the transition.
 */
async function transitionEvent(
  db: AdminDb,
  providerEventId: string,
  to: "processed" | "failed" | "ignored",
  detail: { error?: string; nowIso: string },
): Promise<boolean> {
  const { data, error } = await db
    .from("promotion_webhook_events")
    .update({
      status: to,
      ...(detail.error !== undefined ? { error: detail.error } : {}),
      ...(to === "failed" ? {} : { processed_at: detail.nowIso }),
    })
    .eq("provider", "bachs")
    .eq("provider_event_id", providerEventId)
    .in("status", [...RETRYABLE_EVENT_STATUSES])
    .select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function findOrderByReference(
  db: AdminDb,
  reference: string,
): Promise<OrderRow | null> {
  const { data, error } = await db
    .from("promotion_orders")
    .select("id,status")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (error) throw error;
  return (data as OrderRow | null) ?? null;
}

async function findOrderById(db: AdminDb, id: string): Promise<OrderRow | null> {
  const { data, error } = await db
    .from("promotion_orders")
    .select("id,status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as OrderRow | null) ?? null;
}

export async function handleBachsWebhook(
  request: Request,
  deps: BachsWebhookDeps = {},
): Promise<Response> {
  const nowSeconds = deps.nowSeconds ?? Math.floor(Date.now() / 1000);
  const nowIso = new Date(nowSeconds * 1000).toISOString();
  const secret = deps.webhookSecret ?? process.env["BACHS_WEBHOOK_SECRET"];
  if (!secret) {
    console.error("[bachs-webhook] missing BACHS_WEBHOOK_SECRET configuration");
    return json(500, { ok: false, error: "webhook not configured" });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json(400, { ok: false, error: "unreadable request body" });
  }

  const signature = await verifyBachsSignature({
    rawBody,
    headers: request.headers,
    secret,
    nowSeconds,
  });
  if (!signature.verified) {
    console.warn(`[bachs-webhook] signature rejected: ${signature.reason}`);
    return json(400, { ok: false, error: "invalid signature" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return json(400, { ok: false, error: "malformed payload" });
  }
  const event = toEvent(parsed);
  if (!event) {
    return json(400, { ok: false, error: "malformed event envelope" });
  }

  const db = await getDb(deps);
  const fetchImpl = deps.fetchImpl ?? fetch;

  const fail = async (reason: string): Promise<Response> => {
    try {
      await transitionEvent(db, event.id, "failed", { error: reason, nowIso });
    } catch (markError) {
      console.error("[bachs-webhook] failed to record failure", markError);
    }
    return json(500, { ok: false, error: "processing failed; retry scheduled" });
  };

  const park = async (reason: string): Promise<Response> => {
    try {
      await transitionEvent(db, event.id, "failed", { error: reason, nowIso });
    } catch (markError) {
      console.error("[bachs-webhook] failed to record parked event", markError);
      return json(500, { ok: false, error: "processing failed; retry scheduled" });
    }
    console.warn(`[bachs-webhook] parked event ${event.id}: ${reason}`);
    return json(200, { ok: true, outcome: "parked" });
  };

  const complete = async (outcome: string): Promise<Response> => {
    try {
      const moved = await transitionEvent(db, event.id, "processed", { nowIso });
      if (!moved) {
        // A concurrent worker finished first (or is mid-flight): our outcome
        // agrees with terminal state, so acknowledge without rewriting it.
        const current = await fetchEvent(db, event.id).catch(() => null);
        if (
          current &&
          (TERMINAL_EVENT_STATUSES as readonly string[]).includes(current.status)
        ) {
          return json(200, { ok: true, outcome });
        }
      } else {
        return json(200, { ok: true, outcome });
      }
    } catch (markError) {
      console.error("[bachs-webhook] failed to mark processed", markError);
    }
    // Sibling mid-flight or a marking fault: Bachs retries converge via the
    // idempotent activation path, so report uncertain, not complete.
    return json(500, { ok: false, error: "processing failed; retry scheduled" });
  };

  // Record-first: insert the event row, converging duplicates on the unique
  // (provider, provider_event_id) key.
  try {
    const reference =
      nonEmptyString(event.data.reference) ??
      (isRecord(event.data.metadata)
        ? nonEmptyString(event.data.metadata["order_id"])
        : null);
    const { error: insertError } = await db.from("promotion_webhook_events").insert({
      provider: "bachs",
      provider_event_id: event.id,
      event_type: event.type,
      reference,
      // toEvent() above proved this is a record; the cast keeps the raw
      // delivery bytes (never a re-shaped copy) in the audit log.
      payload: parsed as Record<string, unknown>,
      status: "received",
    });
    if (insertError) {
      if (!isUniqueViolation(insertError)) throw insertError;
      const existing = await fetchEvent(db, event.id);
      if (
        existing &&
        (TERMINAL_EVENT_STATUSES as readonly string[]).includes(existing.status)
      ) {
        return json(200, { ok: true, outcome: "duplicate" });
      }
      // Non-terminal duplicate (sibling in flight, or a crashed worker's
      // row): fall through and process. Guarded transitions plus the
      // idempotent activation RPC make concurrent processing converge.
    }
  } catch (dbError) {
    console.error("[bachs-webhook] event log write failed", dbError);
    return json(500, { ok: false, error: "processing failed; retry scheduled" });
  }

  try {
    switch (event.type) {
      case "collection.succeeded":
        return await paymentPath(db, fetchImpl, event, { nowIso, fail, complete });

      case "checkout.completed": {
        const paymentStatus = nonEmptyString(event.data.payment_status);
        if (paymentStatus === "paid") {
          return await paymentPath(db, fetchImpl, event, { nowIso, fail, complete });
        }
        if (paymentStatus === "no_payment_required") {
          // Explicit documented no-money outcome: terminal, no activation.
          return await complete("no-payment-required");
        }
        // Open, unpaid, or ambiguous: unresolved. Retry re-evaluates live API
        // truth, and a later collection.succeeded can still activate.
        return await fail("checkout completed without resolved payment state");
      }

      case "checkout.expired": {
        const order = await resolveOrder(db, event);
        if (!order) {
          // No money can arrive for an expired session, so retrying cannot
          // help — but the missing order is an anomaly worth surfacing.
          return await park("expired checkout for unknown order");
        }
        if (order.status !== "pending") {
          return await complete("already-terminal");
        }
        const { error: expireError } = await db
          .from("promotion_orders")
          .update({ status: "expired", status_reason: "checkout_expired" })
          .eq("id", order.id)
          .eq("status", "pending")
          .select("id");
        if (expireError) throw expireError;
        // Zero matched rows means a concurrent activation won the race first:
        // either way the order is terminally resolved.
        return await complete("order-expired");
      }

      case "collection.failed": {
        // The checkout stays open at Bachs and the customer may retry, so the
        // order deliberately stays pending. No activation, no state change.
        const order = await resolveOrder(db, event);
        if (!order) {
          return await park("failed collection for unknown order");
        }
        return await complete("collection-failed-order-pending");
      }

      default: {
        try {
          await transitionEvent(db, event.id, "ignored", { nowIso });
        } catch (markError) {
          console.error("[bachs-webhook] failed to mark ignored", markError);
          return json(500, { ok: false, error: "processing failed; retry scheduled" });
        }
        return json(200, { ok: true, outcome: "ignored" });
      }
    }
  } catch (routeError) {
    console.error("[bachs-webhook] routing failed", routeError);
    return await fail("routing fault");
  }
}

async function resolveOrder(
  db: AdminDb,
  event: BachsEvent,
): Promise<OrderRow | null> {
  // A present reference is authoritative (UNIQUE): no metadata fallback when
  // it names nothing, since that combination signals corruption or tampering.
  const reference = nonEmptyString(event.data.reference);
  if (reference) {
    return await findOrderByReference(db, reference);
  }
  const metadata = event.data.metadata;
  const metadataOrderId =
    isRecord(metadata) ? nonEmptyString(metadata["order_id"]) : null;
  if (!metadataOrderId) return null;
  return await findOrderById(db, metadataOrderId);
}

interface PathHelpers {
  nowIso: string;
  fail: (reason: string) => Promise<Response>;
  complete: (outcome: string) => Promise<Response>;
}

async function paymentPath(
  db: AdminDb,
  fetchImpl: typeof fetch,
  event: BachsEvent,
  helpers: PathHelpers,
): Promise<Response> {
  const order = await resolveOrder(db, event);
  if (!order) {
    console.warn(`[bachs-webhook] payment event for unknown order: ${event.id}`);
    return await helpers.fail("unknown order reference");
  }

  const checkoutId = nonEmptyString(event.data.checkout_id);
  if (!checkoutId) {
    return await helpers.fail("payment event without checkout_id");
  }

  let verification;
  try {
    verification = await verifyPayment(checkoutId, fetchImpl, {
      timeoutMs: WEBHOOK_VERIFY_TIMEOUT_MS,
    });
  } catch (verifyError) {
    const code =
      verifyError instanceof BachsError ? verifyError.code : "unknown";
    console.warn(
      `[bachs-webhook] verification inconclusive for ${event.id}: ${code}`,
    );
    return await helpers.fail(`payment verification inconclusive: ${code}`);
  }

  if (!verification.paid || verification.amountKobo === null) {
    // Open, expired, failed, or unverifiable: unresolved. Redelivery
    // re-checks live truth; a later success event can still activate.
    return await helpers.fail("checkout not paid");
  }

  // Pass VERIFIED values: the atomic RPC compares them against the immutable
  // order snapshot and routes any mismatch to refund_pending (manual staff
  // workflow) instead of delivering. This call is the single enforcement
  // point — no client-side amount logic here.
  const { data: outcome, error: rpcError } = await db.rpc(
    "activate_paid_promotion",
    {
      p_order_id: order.id,
      p_provider_reference: verification.reference ?? "",
      p_amount_kobo: verification.amountKobo,
    },
  );
  if (rpcError) {
    console.error("[bachs-webhook] activation RPC failed", rpcError);
    return await helpers.fail("activation fault");
  }
  if (
    outcome !== "paid" &&
    outcome !== "paid_late_honored" &&
    outcome !== "refund_pending"
  ) {
    console.error(`[bachs-webhook] unexpected activation outcome for ${event.id}`);
    return await helpers.fail("unexpected activation outcome");
  }
  return await helpers.complete(outcome === "refund_pending" ? "queued-refund" : "activated");
}
