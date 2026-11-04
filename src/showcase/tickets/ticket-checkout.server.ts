// Server-only ticket checkout core (P1).
//
// Quote + order creation + Bachs checkout initiation with injected fakes,
// so tests can drive concurrency, uncertainty windows, and stale recovery
// with zero network. Thin createServerFn wrappers (auth, clients) live in
// ticket-functions.ts; the webhook handler in ticket-webhook.server.ts.
//
// Concurrency contract (mirrors the promotion core, simplified):
// - One order carries exactly one idempotency key: its own UUID. Every
//   createCheckout call for that order reuses the key AND the stored
//   reference + amount, so a retry can never mint a second payable session.
// - One pending order per buyer per event (partial unique index). A repeat
//   request with the same tickets resumes the stored URL with no Bachs call
//   at all; concurrent creates converge on the single pending row.
// - A Bachs failure is classified conclusive (validation/config/4xx, except
//   409) or uncertain (network/timeout/5xx/409/malformed/unexpected). Only a
//   conclusive failure marks the just-created order failed; uncertainty
//   leaves it pending so a retry reconciles through the same idempotency key.
// - Money truth always comes from verifyPayment, and delivery always goes
//   through activate_ticket_order. This module never marks anything paid.
// - Unlike promotions there is no late-honor path: verified money on a
//   terminal order is recorded with a reason for MANUAL staff handling,
//   never auto-delivered.
//
// Financial boundaries: incoming payments only. This module starts no
// outgoing money movement — no refunds, transfers, or payouts.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  BachsError,
  createCheckout,
  verifyPayment,
} from "@/integrations/bachs/client.server";
import { resolveAppUrl } from "@/showcase/promotions/promotion-checkout.server";
import {
  isTicketOrderPending,
  koboToNairaNumeric,
  nairaNumericToKobo,
  TICKET_MIN_TOTAL_KOBO,
  TICKET_PENDING_HOURS,
  TICKET_QTY_MAX,
  TICKET_QTY_MIN,
  ticketTotalKobo,
  type TicketLineInput,
  type TicketOrderStatus,
} from "@/showcase/tickets/ticket-orders";

// Local shape for the checkout tables. The generated Database types still
// describe the pre-P1 ticket schema, so we extend the generated shape here
// instead of editing generated files — the same pattern as AdminPhase1Db.
// Column shapes mirror supabase/migrations/20261110090000_ticket_checkout_v1.sql.
export interface TicketCheckoutDb {
  public: {
    Tables: {
      events: Database["public"]["Tables"]["events"];
      event_ticket_tiers: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          price: number | string;
          quantity: number;
          sold_quantity: number;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ticket_orders: {
        Row: {
          id: string;
          user_id: string;
          event_id: string;
          status: string;
          status_reason: string | null;
          total_amount: number | string;
          currency: string;
          reference: string;
          provider: string;
          provider_reference: string | null;
          paid_at: string | null;
          pending_expires_at: string | null;
          checkout_id: string | null;
          checkout_url: string | null;
          checkout_expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_id: string;
          status?: string;
          status_reason?: string | null;
          total_amount: number;
          currency?: string;
          reference: string;
          provider?: string;
          provider_reference?: string | null;
          paid_at?: string | null;
          pending_expires_at?: string | null;
          checkout_id?: string | null;
          checkout_url?: string | null;
          checkout_expires_at?: string | null;
          created_at?: string;
        };
        Update: {
          status?: string;
          status_reason?: string | null;
          total_amount?: number;
          paid_at?: string | null;
          pending_expires_at?: string | null;
          checkout_id?: string | null;
          checkout_url?: string | null;
          checkout_expires_at?: string | null;
          provider_reference?: string | null;
        };
        Relationships: [];
      };
      ticket_codes: {
        Row: {
          id: string;
          order_id: string;
          event_id: string;
          tier_id: string | null;
          tier_name: string;
          ticket_no: number;
          code: string;
          status: string;
          checked_in_at: string | null;
          issued_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ticket_items: {
        Row: {
          id: string;
          order_id: string;
          tier_id: string | null;
          tier_name: string;
          unit_price: number | string;
          quantity: number;
          created_at: string;
        };
        Insert: {
          order_id: string;
          tier_id: string | null;
          tier_name: string;
          unit_price: number;
          quantity: number;
        };
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
    };
    Views: Database["public"]["Views"];
    Enums: Database["public"]["Enums"];
    CompositeTypes: Database["public"]["CompositeTypes"];
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
}

export type TicketCheckoutClient = SupabaseClient<TicketCheckoutDb>;

export function asTicketDb(client: SupabaseClient): TicketCheckoutClient {
  return client as unknown as TicketCheckoutClient;
}

export interface TicketCheckoutDeps {
  supabase?: TicketCheckoutClient;
  fetchImpl?: typeof fetch;
  /** Milliseconds. Defaults to Date.now(); injectable for tests. */
  nowMs?: number;
  /** Overrides process.env.APP_URL (tests). */
  appUrl?: string;
}

export type TicketCheckoutErrorCode =
  | "validation"
  | "ineligible"
  | "sold-out"
  | "config"
  | "checkout-unavailable"
  | "uncertain"
  | "not-found"
  | "forbidden"
  | "already-paid";

export class TicketCheckoutError extends Error {
  readonly code: TicketCheckoutErrorCode;

  constructor(code: TicketCheckoutErrorCode, message: string) {
    super(message);
    this.name = "TicketCheckoutError";
    this.code = code;
  }
}

export interface TicketQuoteLine {
  tierId: string;
  tierName: string;
  unitKobo: number;
  quantity: number;
  lineKobo: number;
}

export interface TicketQuote {
  eventId: string;
  eventTitle: string;
  lines: TicketQuoteLine[];
  totalKobo: number;
  currency: "NGN";
}

export interface CreateTicketCheckoutInput {
  eventId: string;
  userId: string;
  customerEmail: string;
  lines: TicketLineInput[];
}

export interface TicketCheckoutResult {
  orderId: string;
  /** "paid" when a previous pending order verified + activated mid-call. */
  status: "pending" | "paid";
  /** Null when the order is already paid — nothing left to pay. */
  checkoutUrl: string | null;
  resumed: boolean;
  totalKobo: number;
}

export interface TicketOrderLine {
  tierId: string | null;
  tierName: string;
  unitKobo: number;
  quantity: number;
}

export interface TicketOrderSummary {
  orderId: string;
  eventId: string;
  eventTitle: string;
  status: TicketOrderStatus;
  statusReason: string | null;
  totalKobo: number;
  currency: string;
  reference: string;
  lines: TicketOrderLine[];
  paidAt: string | null;
  createdAt: string;
  /** Present only while pending, so the buyer can resume payment. */
  checkoutUrl: string | null;
}

export interface TicketOrderRow {
  id: string;
  user_id: string;
  event_id: string;
  status: string;
  status_reason: string | null;
  total_amount: number | string;
  currency: string;
  reference: string;
  provider_reference: string | null;
  paid_at: string | null;
  checkout_id: string | null;
  checkout_url: string | null;
  checkout_expires_at: string | null;
  created_at: string;
}

/** skew margin so a URL expiring mid-redirect still counts as stale. */
export const TICKET_CHECKOUT_SKEW_MARGIN_MS = 5 * 60_000;

/** Payment states that conclusively prove no money moved. */
const TERMINAL_UNPAID_PAYMENT_STATUSES = [
  "failed",
  "canceled",
  "cancelled",
  "declined",
  "rejected",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nonEmpty(value: string, code: TicketCheckoutErrorCode, message: string): string {
  if (!value || value.trim().length === 0) {
    throw new TicketCheckoutError(code, message);
  }
  return value;
}

function validatedLines(lines: TicketLineInput[]): TicketLineInput[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new TicketCheckoutError("validation", "Choose at least one ticket.");
  }
  const seen = new Set<string>();
  return lines.map((line) => {
    if (!line || typeof line.tierId !== "string" || !UUID_RE.test(line.tierId)) {
      throw new TicketCheckoutError("validation", "That ticket selection is invalid.");
    }
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < TICKET_QTY_MIN ||
      line.quantity > TICKET_QTY_MAX
    ) {
      throw new TicketCheckoutError(
        "validation",
        `Ticket quantity must be a whole number from ${TICKET_QTY_MIN} to ${TICKET_QTY_MAX} per tier.`,
      );
    }
    if (seen.has(line.tierId)) {
      throw new TicketCheckoutError("validation", "Choose each ticket tier only once.");
    }
    seen.add(line.tierId);
    return { tierId: line.tierId, quantity: line.quantity };
  });
}

async function getDb(deps: TicketCheckoutDeps): Promise<TicketCheckoutClient> {
  if (deps.supabase) return deps.supabase;
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  return asTicketDb(admin);
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

function isConclusiveBachsFailure(caught: unknown): boolean {
  if (!(caught instanceof BachsError)) return false;
  if (caught.code === "validation" || caught.code === "config") return true;
  if (caught.code === "http" && caught.httpStatus !== undefined) {
    return caught.httpStatus >= 400 && caught.httpStatus < 500 && caught.httpStatus !== 409;
  }
  return false;
}

interface SaleEvent {
  id: string;
  title: string;
}

async function loadEventForSale(
  db: TicketCheckoutClient,
  eventId: string,
  nowMs: number,
): Promise<SaleEvent> {
  const { data, error } = await db
    .from("events")
    .select("id,title,published,status,ends_at")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    console.error("[ticket-checkout] event lookup failed", error);
    throw new TicketCheckoutError(
      "checkout-unavailable",
      "Could not load that event. Please try again.",
    );
  }
  if (!data) {
    throw new TicketCheckoutError("not-found", "That event no longer exists.");
  }
  if (!data.published) {
    throw new TicketCheckoutError("ineligible", "That event is not on sale.");
  }
  if (data.status === "cancelled") {
    throw new TicketCheckoutError("ineligible", "That event was cancelled.");
  }
  if (data.ends_at !== null && !Number.isNaN(Date.parse(data.ends_at))) {
    if (Date.parse(data.ends_at) <= nowMs) {
      throw new TicketCheckoutError("ineligible", "That event has already ended.");
    }
  }
  return { id: data.id, title: data.title };
}

interface PricedLine extends TicketQuoteLine {
  tierId: string;
}

async function priceLines(
  db: TicketCheckoutClient,
  eventId: string,
  lines: TicketLineInput[],
): Promise<{ priced: PricedLine[]; totalKobo: number }> {
  const { data: tiers, error } = await db
    .from("event_ticket_tiers")
    .select("id,name,price,quantity,sold_quantity")
    .eq("event_id", eventId);
  if (error) {
    console.error("[ticket-checkout] tier lookup failed", error);
    throw new TicketCheckoutError(
      "checkout-unavailable",
      "Could not load ticket options. Please try again.",
    );
  }
  const byId = new Map((tiers ?? []).map((tier) => [tier.id, tier]));
  const priced = lines.map((line) => {
    const tier = byId.get(line.tierId);
    if (!tier) {
      throw new TicketCheckoutError("validation", "That ticket selection is invalid.");
    }
    let unitKobo: number;
    try {
      unitKobo = nairaNumericToKobo(tier.price);
    } catch {
      throw new TicketCheckoutError(
        "checkout-unavailable",
        "A ticket price could not be read. Please try again.",
      );
    }
    if (unitKobo <= 0) {
      throw new TicketCheckoutError("ineligible", `The ${tier.name} tier is not priced for sale.`);
    }
    const sold = typeof tier.sold_quantity === "number" ? tier.sold_quantity : 0;
    if (sold + line.quantity > tier.quantity) {
      throw new TicketCheckoutError("sold-out", `Not enough ${tier.name} tickets left.`);
    }
    return {
      tierId: tier.id,
      tierName: tier.name,
      unitKobo,
      quantity: line.quantity,
      lineKobo: unitKobo * line.quantity,
    };
  });
  let totalKobo: number;
  try {
    totalKobo = ticketTotalKobo(priced);
  } catch (rangeError) {
    throw new TicketCheckoutError(
      "validation",
      rangeError instanceof Error ? rangeError.message : "That ticket selection is invalid.",
    );
  }
  return { priced, totalKobo };
}

/**
 * Priced quote for the booking sheet. Read-only: no order is created, and
 * the browser's copy is display-only — creation reprices everything.
 */
export async function getTicketQuote(
  input: { eventId: string; lines: TicketLineInput[] },
  deps: TicketCheckoutDeps = {},
): Promise<TicketQuote> {
  const eventId = nonEmpty(input.eventId, "validation", "An event is required.");
  const lines = validatedLines(input.lines);
  const nowMs = deps.nowMs ?? Date.now();
  const db = await getDb(deps);
  const event = await loadEventForSale(db, eventId, nowMs);
  const { priced, totalKobo } = await priceLines(db, eventId, lines);
  return { eventId: event.id, eventTitle: event.title, lines: priced, totalKobo, currency: "NGN" };
}

function buildReferences(orderId: string): { reference: string; providerReference: string } {
  return {
    reference: `TKT-${orderId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}`,
    providerReference: `tkt_${orderId}`,
  };
}

const ORDER_COLUMNS =
  "id,user_id,event_id,status,status_reason,total_amount,currency,reference,provider_reference,paid_at,checkout_id,checkout_url,checkout_expires_at,created_at";

async function findPendingOrder(
  db: TicketCheckoutClient,
  userId: string,
  eventId: string,
): Promise<TicketOrderRow | null> {
  const { data, error } = await db
    .from("ticket_orders")
    .select(ORDER_COLUMNS)
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[ticket-checkout] pending lookup failed", error);
    throw new TicketCheckoutError(
      "checkout-unavailable",
      "Could not check your pending orders. Please try again.",
    );
  }
  return (data as TicketOrderRow | null) ?? null;
}

async function loadOrderItems(
  db: TicketCheckoutClient,
  orderId: string,
): Promise<{ tier_id: string | null; tier_name: string; unit_price: number | string; quantity: number }[]> {
  const { data, error } = await db
    .from("ticket_items")
    .select("tier_id,tier_name,unit_price,quantity")
    .eq("order_id", orderId);
  if (error) {
    console.error("[ticket-checkout] items lookup failed", error);
    throw new TicketCheckoutError(
      "checkout-unavailable",
      "Could not load that order. Please try again.",
    );
  }
  return (data ?? []) as {
    tier_id: string | null;
    tier_name: string;
    unit_price: number | string;
    quantity: number;
  }[];
}

function sameLines(
  stored: { tier_id: string | null; quantity: number }[],
  requested: TicketLineInput[],
): boolean {
  if (stored.length !== requested.length) return false;
  const key = (tierId: string | null, quantity: number) => `${tierId ?? "?"}:${quantity}`;
  const a = stored.map((line) => key(line.tier_id, line.quantity)).sort();
  const b = requested.map((line) => key(line.tierId, line.quantity)).sort();
  return a.every((value, index) => value === b[index]);
}

function storedCheckoutFresh(order: TicketOrderRow, nowMs: number): boolean {
  if (!order.checkout_url || !order.checkout_expires_at) return false;
  const expires = Date.parse(order.checkout_expires_at);
  if (Number.isNaN(expires)) return false;
  return expires - nowMs > TICKET_CHECKOUT_SKEW_MARGIN_MS;
}

/**
 * Conditional terminal transition: only a pending row moves, so concurrent
 * settlers converge instead of overwriting each other. Returns true when
 * this call performed the transition.
 */
async function markTerminal(
  db: TicketCheckoutClient,
  orderId: string,
  to: "failed" | "expired" | "cancelled",
  reason: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("ticket_orders")
    .update({ status: to, status_reason: reason })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id");
  if (error) {
    console.error("[ticket-checkout] terminal transition failed", error);
    throw new TicketCheckoutError(
      "uncertain",
      "That order could not be settled. Please try again shortly.",
    );
  }
  return Array.isArray(data) && data.length > 0;
}

async function activateViaRpc(
  db: TicketCheckoutClient,
  orderId: string,
  providerReference: string,
  amountKobo: number,
): Promise<void> {
  const { data, error } = await db.rpc("activate_ticket_order", {
    p_order_id: orderId,
    p_provider_reference: providerReference,
    p_amount_kobo: amountKobo,
  });
  if (error || (data !== "activated" && data !== "already_paid")) {
    throw new TicketCheckoutError(
      "checkout-unavailable",
      error ? mapActivationFailure(error.message) : "That payment could not be confirmed.",
    );
  }
}

function mapActivationFailure(message: string): string {
  if (/does not match the order snapshot/i.test(message)) {
    return "The payment amount does not match this order. It has been recorded for a manual refund.";
  }
  if (/no longer available|was cancelled|has already ended/i.test(message)) {
    return "That event is no longer available. The payment has been recorded for a manual refund.";
  }
  if (/no longer exists|Not enough .* tickets left/i.test(message)) {
    return "Those tickets just sold out. The payment has been recorded for a manual refund.";
  }
  if (/Only pending ticket orders/i.test(message)) {
    return "That order is no longer payable.";
  }
  console.error("[ticket-checkout] activation failed:", message);
  return "That payment could not be confirmed. It has been recorded for manual review.";
}

export type SettleTicketResult =
  | { settled: "activated"; orderId: string }
  | { settled: "released" }
  | { settled: "failed"; reason: string };

/**
 * Issues scannable codes for a paid order. Idempotent: retries converge on
 * the same slots, so every paid confirmation path calls this freely and a
 * failure throws uncertain (the next refresh heals it).
 */
export async function ensureTicketCodes(
  db: TicketCheckoutClient,
  orderId: string,
): Promise<void> {
  const { error } = await db.rpc("issue_ticket_codes", { p_order_id: orderId });
  if (error) {
    console.error("[ticket-checkout] ticket issuance failed", error);
    throw new TicketCheckoutError(
      "uncertain",
      "Payment confirmed, but the tickets are still being issued. Please refresh shortly.",
    );
  }
}

/**
 * Best-effort "payment confirmed" inbox note. Skips when an identical note
 * already exists, because the return page and the webhook can both settle
 * the same order. Never throws: a missing note must not break a paid order
 * (My Tickets always shows the truth).
 */
async function notifyOrderPaid(db: TicketCheckoutClient, order: TicketOrderRow): Promise<void> {
  try {
    const link = `/app/tickets/success?order=${order.id}`;
    const { data: existing, error: lookupError } = await db
      .from("notifications")
      .select("id")
      .eq("user_id", order.user_id)
      .eq("link", link)
      .limit(1);
    if (lookupError) throw lookupError;
    if (Array.isArray(existing) && existing.length > 0) return;
    const { data: event } = await db
      .from("events")
      .select("id,title")
      .eq("id", order.event_id)
      .maybeSingle();
    const title = (event as { title?: string } | null)?.title ?? "your event";
    const { error: insertError } = await db.from("notifications").insert({
      user_id: order.user_id,
      type: "order_paid",
      title: "Payment confirmed",
      body: `Your tickets for ${title} are confirmed. Find them under My Tickets.`,
      link,
    });
    if (insertError) throw insertError;
  } catch (notifyError) {
    console.error("[ticket-checkout] paid notification failed", notifyError);
  }
}

/**
 * Decides the fate of a pending order by asking Bachs for live truth.
 * Activated money delivers through the RPC; terminally unpaid sessions
 * release; anything ambiguous preserves the order and throws uncertain.
 */
export async function settleTicketOrderByVerification(
  db: TicketCheckoutClient,
  order: TicketOrderRow,
  fetchImpl: typeof fetch,
): Promise<SettleTicketResult> {
  if (order.checkout_id === null) {
    throw new TicketCheckoutError(
      "validation",
      "That order has no payment session to verify.",
    );
  }
  const checkoutId: string = order.checkout_id;
  let verification;
  try {
    verification = await verifyPayment(checkoutId, fetchImpl);
  } catch (verifyError) {
    const code = verifyError instanceof BachsError ? verifyError.code : "unknown";
    console.warn(`[ticket-checkout] verify inconclusive for ${order.id}: ${code}`);
    throw new TicketCheckoutError(
      "uncertain",
      "The payment status is unclear. Please try again shortly.",
    );
  }
  if (verification.paid) {
    const snapshotKobo = nairaNumericToKobo(order.total_amount);
    if (
      verification.amountKobo === null ||
      verification.amountKobo !== snapshotKobo ||
      verification.currency !== "NGN" ||
      (order.provider_reference !== null &&
        verification.reference !== null &&
        verification.reference !== order.provider_reference)
    ) {
      await markTerminal(db, order.id, "failed", "amount_mismatch");
      console.warn(`[ticket-checkout] amount mismatch on ${order.id}; recorded for manual refund`);
      return { settled: "failed", reason: "amount_mismatch" };
    }
    try {
      await activateViaRpc(db, order.id, order.provider_reference ?? "", snapshotKobo);
    } catch (caught) {
      if (caught instanceof TicketCheckoutError) {
        await markTerminal(db, order.id, "failed", "activation_rejected");
        return { settled: "failed", reason: "activation_rejected" };
      }
      throw caught;
    }
    await ensureTicketCodes(db, order.id);
    await notifyOrderPaid(db, order);
    return { settled: "activated", orderId: order.id };
  }
  // Bachs claims success but the evidence is undecipherable: money may
  // exist, so this is NEVER conclusively unpaid.
  if (verification.paymentStatus === "succeeded") {
    console.warn(`[ticket-checkout] succeeded-but-undecipherable verify for ${order.id}`);
    throw new TicketCheckoutError(
      "uncertain",
      "That payment's state is unclear. Please try again shortly.",
    );
  }
  const terminalPayment =
    verification.paymentStatus !== null &&
    (TERMINAL_UNPAID_PAYMENT_STATUSES as readonly string[]).includes(verification.paymentStatus);
  const sessionExpired = verification.status === "expired";
  if (!terminalPayment && !sessionExpired) {
    console.warn(`[ticket-checkout] non-terminal verify for ${order.id}; order preserved`);
    throw new TicketCheckoutError(
      "uncertain",
      "That checkout is still awaiting payment. Complete or cancel it before starting a new one.",
    );
  }
  // Terminally unpaid: conclusive. A payment landing afterwards still
  // resolves safely through the webhook's recorded-manual path.
  await markTerminal(db, order.id, sessionExpired ? "expired" : "failed", sessionExpired ? "checkout_expired" : "payment_failed");
  return { settled: "released" };
}

function ticketReturnUrls(appOrigin: string, orderId: string): { successUrl: string; cancelUrl: string } {
  return {
    successUrl: `${appOrigin}/app/tickets/success?order=${orderId}`,
    cancelUrl: `${appOrigin}/app/tickets/cancelled?order=${orderId}`,
  };
}

async function storeCheckoutTriple(
  db: TicketCheckoutClient,
  orderId: string,
  triple: { checkoutId: string; checkoutUrl: string; expiresAt: string },
): Promise<void> {
  const { error } = await db
    .from("ticket_orders")
    .update({
      checkout_id: triple.checkoutId,
      checkout_url: triple.checkoutUrl,
      checkout_expires_at: triple.expiresAt,
    })
    .eq("id", orderId)
    .eq("status", "pending");
  if (error) {
    console.error("[ticket-checkout] checkout store failed", error);
    throw new TicketCheckoutError(
      "uncertain",
      "The checkout started but could not be saved. Please try again shortly.",
    );
  }
}

/**
 * Resumes a stored checkout or reconciles a stale one. The re-call reuses
 * the order id (idempotency key) plus the stored reference + amount, so it
 * resolves to the existing session or a fresh one — never a second payable
 * session. Failures never mark the order: the next attempt retries.
 */
async function resumeTicketCheckout(
  db: TicketCheckoutClient,
  order: TicketOrderRow,
  customerEmail: string,
  appOrigin: string,
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<TicketCheckoutResult> {
  const totalKobo = nairaNumericToKobo(order.total_amount);
  if (storedCheckoutFresh(order, nowMs) && order.checkout_url) {
    return { orderId: order.id, status: "pending", checkoutUrl: order.checkout_url, resumed: true, totalKobo };
  }
  if (!order.provider_reference) {
    throw new TicketCheckoutError(
      "checkout-unavailable",
      "That order is missing its payment reference. Please start a new checkout.",
    );
  }
  const { successUrl, cancelUrl } = ticketReturnUrls(appOrigin, order.id);
  let checkout;
  try {
    checkout = await createCheckout(
      {
        orderReference: order.provider_reference,
        amountKobo: totalKobo,
        currency: "NGN",
        customerEmail,
        successUrl,
        cancelUrl,
        orderId: order.id,
      },
      fetchImpl,
    );
  } catch (caught) {
    if (isConclusiveBachsFailure(caught)) {
      throw new TicketCheckoutError(
        "checkout-unavailable",
        "The payment provider rejected that checkout. Please try again.",
      );
    }
    throw new TicketCheckoutError(
      "uncertain",
      "The checkout status is unclear. Please try again shortly.",
    );
  }
  await storeCheckoutTriple(db, order.id, {
    checkoutId: checkout.checkoutId,
    checkoutUrl: checkout.checkoutUrl,
    expiresAt: new Date(nowMs + TICKET_PENDING_HOURS * 3_600_000).toISOString(),
  });
  return { orderId: order.id, status: "pending", checkoutUrl: checkout.checkoutUrl, resumed: true, totalKobo };
}

/**
 * Creates (or resumes) a ticket checkout. Never trusts a browser amount:
 * lines are validated, tiers are priced server-side, and the snapshot total
 * is recomputed here for every path, including resumes.
 */
export async function createTicketCheckout(
  input: CreateTicketCheckoutInput,
  deps: TicketCheckoutDeps = {},
): Promise<TicketCheckoutResult> {
  const eventId = nonEmpty(input.eventId, "validation", "An event is required.");
  const userId = nonEmpty(input.userId, "validation", "Sign in is required.");
  const customerEmail = nonEmpty(input.customerEmail, "validation", "An email address is required for the receipt.");
  if (!customerEmail.includes("@")) {
    throw new TicketCheckoutError("validation", "Add an email address to your profile to receive the payment receipt.");
  }
  const lines = validatedLines(input.lines);
  const nowMs = deps.nowMs ?? Date.now();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const db = await getDb(deps);
  let appOrigin: string;
  try {
    appOrigin = resolveAppUrl(deps.appUrl);
  } catch (caught) {
    throw new TicketCheckoutError(
      "config",
      caught instanceof Error ? caught.message : "Checkout is not configured yet.",
    );
  }
  await loadEventForSale(db, eventId, nowMs);
  const { priced, totalKobo } = await priceLines(db, eventId, lines);
  if (totalKobo < TICKET_MIN_TOTAL_KOBO) {
    throw new TicketCheckoutError(
      "validation",
      "Ticket total must be at least NGN 100 (minimum transaction).",
    );
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await findPendingOrder(db, userId, eventId);
    if (existing) {
      const stored = await loadOrderItems(db, existing.id);
      if (sameLines(stored, lines)) {
        return await resumeTicketCheckout(db, existing, customerEmail, appOrigin, fetchImpl, nowMs);
      }
      const settled = await settleTicketOrderByVerification(db, existing, fetchImpl);
      if (settled.settled === "activated") {
        return {
          orderId: existing.id,
          status: "paid",
          checkoutUrl: null,
          resumed: true,
          totalKobo: nairaNumericToKobo(existing.total_amount),
        };
      }
      if (settled.settled === "failed") {
        throw new TicketCheckoutError(
          "checkout-unavailable",
          "Your previous payment needs manual review before you can check out again. Contact support with your order reference.",
        );
      }
      // Released: fall through and create the new order below.
    }

    const orderId = randomUUID();
    const refs = buildReferences(orderId);
    const expiresAt = new Date(nowMs + TICKET_PENDING_HOURS * 3_600_000).toISOString();
    const { error: insertError } = await db.from("ticket_orders").insert({
      id: orderId,
      user_id: userId,
      event_id: eventId,
      status: "pending",
      total_amount: koboToNairaNumeric(totalKobo),
      currency: "NGN",
      reference: refs.reference,
      provider: "bachs",
      provider_reference: refs.providerReference,
      pending_expires_at: expiresAt,
    });
    if (insertError) {
      if (isUniqueViolation(insertError)) {
        // A concurrent tab won the race for the single pending slot:
        // loop once more and resume the winner instead of duplicating.
        continue;
      }
      console.error("[ticket-checkout] order insert failed", insertError);
      throw new TicketCheckoutError(
        "checkout-unavailable",
        "Could not start that checkout. Please try again.",
      );
    }
    const { error: itemsError } = await db.from("ticket_items").insert(
      priced.map((line) => ({
        order_id: orderId,
        tier_id: line.tierId,
        tier_name: line.tierName,
        unit_price: koboToNairaNumeric(line.unitKobo),
        quantity: line.quantity,
      })),
    );
    if (itemsError) {
      console.error("[ticket-checkout] items insert failed", itemsError);
      await markTerminal(db, orderId, "failed", "items_write_failed");
      throw new TicketCheckoutError(
        "checkout-unavailable",
        "Could not start that checkout. Please try again.",
      );
    }
    const { successUrl, cancelUrl } = ticketReturnUrls(appOrigin, orderId);
    let checkout;
    try {
      checkout = await createCheckout(
        {
          orderReference: refs.providerReference,
          amountKobo: totalKobo,
          currency: "NGN",
          customerEmail,
          successUrl,
          cancelUrl,
          orderId,
        },
        fetchImpl,
      );
    } catch (caught) {
      if (isConclusiveBachsFailure(caught)) {
        await markTerminal(db, orderId, "failed", "provider_rejected");
        throw new TicketCheckoutError(
          "checkout-unavailable",
          "The payment provider rejected that checkout. Please try again.",
        );
      }
      throw new TicketCheckoutError(
        "uncertain",
        "The checkout status is unclear. Please try again shortly.",
      );
    }
    await storeCheckoutTriple(db, orderId, {
      checkoutId: checkout.checkoutId,
      checkoutUrl: checkout.checkoutUrl,
      expiresAt,
    });
    return { orderId, status: "pending", checkoutUrl: checkout.checkoutUrl, resumed: false, totalKobo };
  }
  throw new TicketCheckoutError(
    "uncertain",
    "Another checkout just started for this event. Please try again shortly.",
  );
}

async function buildTicketSummary(
  db: TicketCheckoutClient,
  order: TicketOrderRow,
): Promise<TicketOrderSummary> {
  const [items, event] = await Promise.all([
    loadOrderItems(db, order.id),
    db.from("events").select("id,title").eq("id", order.event_id).maybeSingle(),
  ]);
  if (event.error) {
    console.error("[ticket-checkout] event title lookup failed", event.error);
    throw new TicketCheckoutError(
      "checkout-unavailable",
      "Could not load that order. Please try again.",
    );
  }
  const status = order.status as TicketOrderStatus;
  return {
    orderId: order.id,
    eventId: order.event_id,
    eventTitle: (event.data as { title?: string } | null)?.title ?? "Unknown event",
    status,
    statusReason: order.status_reason,
    totalKobo: nairaNumericToKobo(order.total_amount),
    currency: order.currency,
    reference: order.reference,
    lines: items.map((item) => ({
      tierId: item.tier_id,
      tierName: item.tier_name,
      unitKobo: nairaNumericToKobo(item.unit_price),
      quantity: item.quantity,
    })),
    paidAt: order.paid_at,
    createdAt: order.created_at,
    checkoutUrl:
      status === "pending" && order.checkout_url ? order.checkout_url : null,
  };
}

async function loadOwnOrderRow(
  db: TicketCheckoutClient,
  orderId: string,
  userId: string,
): Promise<TicketOrderRow> {
  const { data, error } = await db
    .from("ticket_orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[ticket-checkout] order lookup failed", error);
    throw new TicketCheckoutError(
      "checkout-unavailable",
      "Could not load that order. Please try again.",
    );
  }
  if (!data) {
    // Same message whether the order is missing or belongs to someone else.
    throw new TicketCheckoutError("not-found", "That order was not found.");
  }
  return data as TicketOrderRow;
}

/**
 * Return-page refresh: re-verifies a pending order against live Bachs truth
 * (activating when money is confirmed), then returns the honest summary.
 * Terminal orders return their stored summary with no network call.
 */
export async function refreshTicketOrderStatus(
  input: { orderId: string; userId: string },
  deps: TicketCheckoutDeps = {},
): Promise<{ order: TicketOrderSummary }> {
  const orderId = nonEmpty(input.orderId, "validation", "An order is required.");
  const userId = nonEmpty(input.userId, "validation", "Sign in is required.");
  const fetchImpl = deps.fetchImpl ?? fetch;
  const db = await getDb(deps);
  let order = await loadOwnOrderRow(db, orderId, userId);
  if (order.status === "pending" && order.checkout_id !== null) {
    await settleTicketOrderByVerification(db, order, fetchImpl);
    order = await loadOwnOrderRow(db, orderId, userId);
  }
  if (order.status === "paid") {
    // Backfills codes for orders paid before issuance existed; no-op after.
    await ensureTicketCodes(db, orderId);
  }
  return { order: await buildTicketSummary(db, order) };
}

export interface OwnTicketCode {
  code: string;
  tierName: string;
  status: "valid" | "checked_in";
  checkedInAt: string | null;
}

/**
 * Scannable codes for one paid order. Service-role read with an explicit
 * ownership check: ticket_codes has no client policies at all.
 */
export async function getOwnTicketCodes(
  input: { orderId: string; userId: string },
  deps: TicketCheckoutDeps = {},
): Promise<{ codes: OwnTicketCode[] }> {
  const orderId = nonEmpty(input.orderId, "validation", "An order is required.");
  const userId = nonEmpty(input.userId, "validation", "Sign in is required.");
  const db = await getDb(deps);
  const order = await loadOwnOrderRow(db, orderId, userId);
  if (order.status !== "paid") {
    return { codes: [] };
  }
  const { data, error } = await db
    .from("ticket_codes")
    .select("code,tier_name,status,checked_in_at")
    .eq("order_id", orderId)
    .order("ticket_no", { ascending: true });
  if (error) {
    console.error("[ticket-checkout] codes lookup failed", error);
    throw new TicketCheckoutError(
      "checkout-unavailable",
      "Could not load your tickets. Please try again.",
    );
  }
  return {
    codes: ((data ?? []) as { code: string; tier_name: string; status: string; checked_in_at: string | null }[]).map(
      (row) => ({
        code: row.code,
        tierName: row.tier_name,
        status: row.status === "checked_in" ? "checked_in" : "valid",
        checkedInAt: row.checked_in_at,
      }),
    ),
  };
}

/** Single order read for the buyer, on the caller's own RLS-scoped client. */
export async function getOwnTicketOrder(
  input: { orderId: string; userId: string },
  deps: TicketCheckoutDeps = {},
): Promise<{ order: TicketOrderSummary }> {
  const orderId = nonEmpty(input.orderId, "validation", "An order is required.");
  const userId = nonEmpty(input.userId, "validation", "Sign in is required.");
  const db = await getDb(deps);
  const order = await loadOwnOrderRow(db, orderId, userId);
  return { order: await buildTicketSummary(db, order) };
}

/** Buyer order history, newest first, on the caller's own RLS-scoped client. */
export async function listOwnTicketOrders(
  input: { userId: string; limit?: number },
  deps: TicketCheckoutDeps = {},
): Promise<{ orders: TicketOrderSummary[] }> {
  const userId = nonEmpty(input.userId, "validation", "Sign in is required.");
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const db = await getDb(deps);
  const { data: rows, error } = await db
    .from("ticket_orders")
    .select(ORDER_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ticket-checkout] orders list failed", error);
    throw new TicketCheckoutError(
      "checkout-unavailable",
      "Could not load your orders. Please try again.",
    );
  }
  const orders = await Promise.all(
    ((rows ?? []) as TicketOrderRow[]).map((row) => buildTicketSummary(db, row)),
  );
  return { orders };
}

export interface TicketCancelResult {
  outcome: "cancelled" | "already_paid";
  orderId: string;
}

/**
 * Buyer cancellation. Money is re-verified first: a paid order activates
 * instead of cancelling, and an unknowable payment state refuses rather
 * than cancelling blind. Late money after a deliberate cancel lands in the
 * webhook's recorded-manual path.
 */
export async function cancelTicketOrderAsBuyer(
  input: { orderId: string; userId: string },
  deps: TicketCheckoutDeps = {},
): Promise<TicketCancelResult> {
  const orderId = nonEmpty(input.orderId, "validation", "An order is required.");
  const userId = nonEmpty(input.userId, "validation", "Sign in is required.");
  const fetchImpl = deps.fetchImpl ?? fetch;
  const db = await getDb(deps);
  const order = await loadOwnOrderRow(db, orderId, userId);
  if (order.status === "paid") {
    return { outcome: "already_paid", orderId };
  }
  if (order.status !== "pending") {
    throw new TicketCheckoutError("validation", "That order is already settled.");
  }
  if (order.checkout_id === null) {
    await markTerminal(db, orderId, "cancelled", "buyer_cancelled");
    return { outcome: "cancelled", orderId };
  }
  const checkoutId: string = order.checkout_id;
  let verification;
  try {
    verification = await verifyPayment(checkoutId, fetchImpl);
  } catch (verifyError) {
    const code = verifyError instanceof BachsError ? verifyError.code : "unknown";
    console.warn(`[ticket-checkout] cancel verify inconclusive for ${orderId}: ${code}`);
    throw new TicketCheckoutError(
      "uncertain",
      "The payment status is unclear, so the order was kept. Please try again shortly.",
    );
  }
  if (verification.paid) {
    const snapshotKobo = nairaNumericToKobo(order.total_amount);
    try {
      await activateViaRpc(db, orderId, order.provider_reference ?? "", snapshotKobo);
    } catch (caught) {
      if (caught instanceof TicketCheckoutError) {
        await markTerminal(db, orderId, "failed", "activation_rejected");
        throw new TicketCheckoutError(
          "checkout-unavailable",
          "That payment could not be confirmed. It has been recorded for manual review.",
        );
      }
      throw caught;
    }
    await ensureTicketCodes(db, orderId);
    return { outcome: "already_paid", orderId };
  }
  if (verification.paymentStatus === "succeeded") {
    throw new TicketCheckoutError(
      "uncertain",
      "That payment's state is unclear, so the order was kept. Please try again shortly.",
    );
  }
  const terminalPayment =
    verification.paymentStatus !== null &&
    (TERMINAL_UNPAID_PAYMENT_STATUSES as readonly string[]).includes(verification.paymentStatus);
  if (terminalPayment) {
    await markTerminal(db, orderId, "failed", "payment_failed");
  } else if (verification.status === "expired") {
    await markTerminal(db, orderId, "expired", "checkout_expired");
  } else {
    // Explicit buyer intent on a still-open session: cancel it. Late money
    // resolves through the webhook's recorded-manual path, never silently.
    await markTerminal(db, orderId, "cancelled", "buyer_cancelled");
  }
  return { outcome: "cancelled", orderId };
}
