// Server-only Bachs webhook handler for TICKET payments (P1).
//
// Mirrors the promotion webhook's safety shape: signature first, record the
// event before processing, guarded status transitions, verify-then-deliver,
// and honest HTTP semantics (unknown/unresolved money -> 500 so Bachs
// retries; conclusively settled -> 200).
//
// Ticket difference: there is no late-honor path. Verified money that
// cannot be delivered (mismatch, ineligible event, sold out, terminal
// order) is RECORDED on the order with a reason and completed 200 — the
// MANUAL staff process refunds it. Nothing here moves money out.
import type { SupabaseClient } from "@supabase/supabase-js";

import { BachsError, verifyPayment } from "@/integrations/bachs/client.server";
import { verifyBachsSignature } from "@/integrations/bachs/webhook-verify";

export const TICKET_WEBHOOK_VERIFY_TIMEOUT_MS = 8000;

type TicketWebhookDb = {
  public: {
    Tables: {
      ticket_orders: {
        Row: {
          id: string;
          status: string;
          total_amount: number | string;
          provider_reference: string | null;
        };
        Insert: never;
        Update: {
          status?: string;
          status_reason?: string | null;
        };
        Relationships: [];
      };
      events: {
        Row: { id: string; title: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string | null;
          link: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          type: string;
          title: string;
          body: string;
          link?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      ticket_webhook_events: {
        Row: {
          id: string;
          provider: string;
          provider_event_id: string;
          event_type: string;
          status: string;
        };
        Insert: {
          provider?: string;
          provider_event_id: string;
          event_type: string;
          reference?: string | null;
          payload: Record<string, unknown>;
          status?: string;
          error?: string | null;
        };
        Update: {
          status?: string;
          error?: string | null;
          processed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      activate_ticket_order: {
        Args: { p_order_id: string; p_provider_reference: string; p_amount_kobo: number };
        Returns: string;
      };
      issue_ticket_codes: {
        Args: { p_order_id: string };
        Returns: number;
      };
    };
  };
};

type AdminDb = SupabaseClient<TicketWebhookDb>;

function asWebhookDb(client: SupabaseClient): AdminDb {
  return client as unknown as AdminDb;
}

export interface TicketWebhookDeps {
  fetchImpl?: typeof fetch;
  supabase?: AdminDb;
  /** Unix seconds. Defaults to the current time; injectable for tests. */
  nowSeconds?: number;
  /** Overrides process.env.BACHS_WEBHOOK_SECRET (tests). */
  webhookSecret?: string;
}

interface TicketEventData {
  checkout_id?: unknown;
  reference?: unknown;
  payment_status?: unknown;
  metadata?: unknown;
}

interface TicketEvent {
  id: string;
  type: string;
  data: TicketEventData;
}

interface OrderRow {
  id: string;
  status: string;
  user_id: string;
  event_id: string;
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

function toEvent(parsed: unknown): TicketEvent | null {
  if (!isRecord(parsed)) return null;
  const id = nonEmptyString(parsed["id"]);
  const type = nonEmptyString(parsed["type"]);
  const data = parsed["data"];
  if (id === null || type === null || !isRecord(data)) return null;
  return { id, type, data: data as TicketEventData };
}

async function getDb(deps: TicketWebhookDeps): Promise<AdminDb> {
  if (deps.supabase) return deps.supabase;
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  return asWebhookDb(admin);
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

async function fetchEvent(db: AdminDb, providerEventId: string): Promise<EventRow | null> {
  const { data, error } = await db
    .from("ticket_webhook_events")
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
    .from("ticket_webhook_events")
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

async function findOrderByReference(db: AdminDb, reference: string): Promise<OrderRow | null> {
  const { data, error } = await db
    .from("ticket_orders")
    .select("id,status,user_id,event_id")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (error) throw error;
  return (data as OrderRow | null) ?? null;
}

async function findOrderById(db: AdminDb, id: string): Promise<OrderRow | null> {
  const { data, error } = await db.from("ticket_orders").select("id,status,user_id,event_id").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as OrderRow | null) ?? null;
}

/**
 * Best-effort "payment confirmed" inbox note with the same dedupe key as
 * the return-page path, so the buyer gets exactly one note. Never throws.
 */
async function notifyOrderPaid(db: AdminDb, order: OrderRow): Promise<void> {
  try {
    const link = `/app/tickets/success?order=${order.id}`;
    const existing = await db
      .from("notifications")
      .select("id")
      .eq("user_id", order.user_id)
      .eq("link", link)
      .limit(1);
    if (Array.isArray(existing.data) && existing.data.length > 0) return;
    const { data: event } = await db
      .from("events")
      .select("id,title")
      .eq("id", order.event_id)
      .maybeSingle();
    const title = (event as { title?: string } | null)?.title ?? "your event";
    await db.from("notifications").insert({
      user_id: order.user_id,
      type: "order_paid",
      title: "Payment confirmed",
      body: `Your tickets for ${title} are confirmed. Find them under My Tickets.`,
      link,
    });
  } catch (notifyError) {
    console.error("[ticket-webhook] paid notification failed", notifyError);
  }
}

export async function handleTicketWebhook(
  request: Request,
  deps: TicketWebhookDeps = {},
): Promise<Response> {
  const nowSeconds = deps.nowSeconds ?? Math.floor(Date.now() / 1000);
  const nowIso = new Date(nowSeconds * 1000).toISOString();
  const secret = deps.webhookSecret ?? process.env["BACHS_WEBHOOK_SECRET"];
  if (!secret) {
    console.error("[ticket-webhook] missing BACHS_WEBHOOK_SECRET configuration");
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
    console.warn(`[ticket-webhook] signature rejected: ${signature.reason}`);
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
      console.error("[ticket-webhook] failed to record failure", markError);
    }
    return json(500, { ok: false, error: "processing failed; retry scheduled" });
  };

  const park = async (reason: string): Promise<Response> => {
    try {
      await transitionEvent(db, event.id, "failed", { error: reason, nowIso });
    } catch (markError) {
      console.error("[ticket-webhook] failed to record parked event", markError);
      return json(500, { ok: false, error: "processing failed; retry scheduled" });
    }
    console.warn(`[ticket-webhook] parked event ${event.id}: ${reason}`);
    return json(200, { ok: true, outcome: "parked" });
  };

  const complete = async (outcome: string): Promise<Response> => {
    try {
      const moved = await transitionEvent(db, event.id, "processed", { nowIso });
      if (!moved) {
        const current = await fetchEvent(db, event.id).catch(() => null);
        if (current && (TERMINAL_EVENT_STATUSES as readonly string[]).includes(current.status)) {
          return json(200, { ok: true, outcome });
        }
      } else {
        return json(200, { ok: true, outcome });
      }
    } catch (markError) {
      console.error("[ticket-webhook] failed to mark processed", markError);
    }
    return json(500, { ok: false, error: "processing failed; retry scheduled" });
  };

  // Record-first: insert the event row, converging duplicates on the unique
  // (provider, provider_event_id) key.
  try {
    const reference =
      nonEmptyString(event.data.reference) ??
      (isRecord(event.data.metadata) ? nonEmptyString(event.data.metadata["order_id"]) : null);
    const { error: insertError } = await db.from("ticket_webhook_events").insert({
      provider: "bachs",
      provider_event_id: event.id,
      event_type: event.type,
      reference,
      payload: parsed as Record<string, unknown>,
      status: "received",
    });
    if (insertError) {
      if (!isUniqueViolation(insertError)) throw insertError;
      const existing = await fetchEvent(db, event.id);
      if (existing && (TERMINAL_EVENT_STATUSES as readonly string[]).includes(existing.status)) {
        return json(200, { ok: true, outcome: "duplicate" });
      }
    }
  } catch (dbError) {
    console.error("[ticket-webhook] event log write failed", dbError);
    return json(500, { ok: false, error: "processing failed; retry scheduled" });
  }

  try {
    switch (event.type) {
      case "collection.succeeded":
        return await ticketPaymentPath(db, fetchImpl, event, { nowIso, fail, complete });

      case "checkout.completed": {
        const paymentStatus = nonEmptyString(event.data.payment_status);
        if (paymentStatus === "paid") {
          return await ticketPaymentPath(db, fetchImpl, event, { nowIso, fail, complete });
        }
        if (paymentStatus === "no_payment_required") {
          return await complete("no-payment-required");
        }
        return await fail("checkout completed without resolved payment state");
      }

      case "checkout.expired": {
        const order = await resolveOrder(db, event);
        if (!order) {
          return await park("expired checkout for unknown order");
        }
        if (order.status !== "pending") {
          return await complete("already-terminal");
        }
        const { error: expireError } = await db
          .from("ticket_orders")
          .update({ status: "expired", status_reason: "checkout_expired" })
          .eq("id", order.id)
          .eq("status", "pending")
          .select("id");
        if (expireError) throw expireError;
        return await complete("order-expired");
      }

      case "collection.failed": {
        // The checkout stays open at Bachs and the buyer may retry, so the
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
          console.error("[ticket-webhook] failed to mark ignored", markError);
          return json(500, { ok: false, error: "processing failed; retry scheduled" });
        }
        return json(200, { ok: true, outcome: "ignored" });
      }
    }
  } catch (routeError) {
    console.error("[ticket-webhook] routing failed", routeError);
    return await fail("routing fault");
  }
}

async function resolveOrder(db: AdminDb, event: TicketEvent): Promise<OrderRow | null> {
  const reference = nonEmptyString(event.data.reference);
  if (reference) {
    return await findOrderByReference(db, reference);
  }
  const metadata = event.data.metadata;
  const metadataOrderId = isRecord(metadata) ? nonEmptyString(metadata["order_id"]) : null;
  if (!metadataOrderId) return null;
  return await findOrderById(db, metadataOrderId);
}

interface PathHelpers {
  nowIso: string;
  fail: (reason: string) => Promise<Response>;
  complete: (outcome: string) => Promise<Response>;
}

/**
 * Records verified-but-undeliverable money on the order for the MANUAL
 * staff process, then completes 200: retrying cannot fix a mismatch or a
 * sold-out tier, and the record (not silence) is what gets the buyer
 * refunded. Terminal rows keep their status; only the reason is stamped.
 */
async function recordManual(
  db: AdminDb,
  orderId: string,
  wasPending: boolean,
  reason: string,
): Promise<void> {
  if (wasPending) {
    const { error } = await db
      .from("ticket_orders")
      .update({ status: "failed", status_reason: reason })
      .eq("id", orderId)
      .eq("status", "pending")
      .select("id");
    if (error) throw error;
    return;
  }
  const { error } = await db
    .from("ticket_orders")
    .update({ status_reason: reason })
    .eq("id", orderId)
    .select("id");
  if (error) throw error;
}

async function ticketPaymentPath(
  db: AdminDb,
  fetchImpl: typeof fetch,
  event: TicketEvent,
  helpers: PathHelpers,
): Promise<Response> {
  const order = await resolveOrder(db, event);
  if (!order) {
    console.warn(`[ticket-webhook] payment event for unknown order: ${event.id}`);
    return await helpers.fail("unknown order reference");
  }

  const checkoutId = nonEmptyString(event.data.checkout_id);
  if (!checkoutId) {
    return await helpers.fail("payment event without checkout_id");
  }

  let verification;
  try {
    verification = await verifyPayment(checkoutId, fetchImpl, {
      timeoutMs: TICKET_WEBHOOK_VERIFY_TIMEOUT_MS,
    });
  } catch (verifyError) {
    const code = verifyError instanceof BachsError ? verifyError.code : "unknown";
    console.warn(`[ticket-webhook] verification inconclusive for ${event.id}: ${code}`);
    return await helpers.fail(`payment verification inconclusive: ${code}`);
  }

  if (!verification.paid || verification.amountKobo === null) {
    return await helpers.fail("checkout not paid");
  }
  if (verification.currency !== "NGN") {
    await recordManual(db, order.id, order.status === "pending", "currency_mismatch");
    return await helpers.complete("recorded-manual");
  }

  const { data: outcome, error: rpcError } = await db.rpc("activate_ticket_order", {
    p_order_id: order.id,
    p_provider_reference: verification.reference ?? "",
    p_amount_kobo: verification.amountKobo,
  });
  if (rpcError) {
    const message = rpcError.message ?? "";
    const reason = /does not match the order snapshot/i.test(message)
      ? "amount_mismatch"
      : /no longer available|was cancelled|has already ended/i.test(message)
        ? "event_invalid"
        : /no longer exists|Not enough .* tickets left/i.test(message)
          ? "sold_out"
          : /Only pending ticket orders/i.test(message)
            ? "late_payment_terminal_order"
            : "activation_fault";
    console.warn(`[ticket-webhook] activation rejected for ${event.id}: ${reason}`);
    try {
      await recordManual(db, order.id, order.status === "pending", reason);
    } catch (recordError) {
      console.error("[ticket-webhook] manual record failed", recordError);
      return await helpers.fail("manual record fault");
    }
    return await helpers.complete("recorded-manual");
  }
  if (outcome !== "activated" && outcome !== "already_paid") {
    console.error(`[ticket-webhook] unexpected activation outcome for ${event.id}`);
    return await helpers.fail("unexpected activation outcome");
  }
  const { error: issueError } = await db.rpc("issue_ticket_codes", { p_order_id: order.id });
  if (issueError) {
    console.error("[ticket-webhook] ticket issuance failed", issueError);
    return await helpers.fail("ticket issuance fault");
  }
  await notifyOrderPaid(db, order);
  return await helpers.complete("activated");
}
