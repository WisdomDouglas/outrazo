// Server-only promotion checkout core (P2 Step 4A).
//
// Quote + order creation + Bachs checkout initiation with injected fakes,
// so tests can drive concurrency, uncertainty windows, and stale recovery
// with zero network. Thin createServerFn wrappers (auth, service-role
// client) arrive in Step 4B; UI arrives in 4C.
//
// Concurrency contract (the heart of this module):
// - One order carries exactly one idempotency key: its own UUID. Every
//   createCheckout call for that order reuses the key AND the stored
//   reference + amount, so a retry can never mint a second payable session.
// - A repeat request for a fresh pending order with a live stored checkout
//   resumes the stored URL with no Bachs call at all.
// - A Bachs failure is classified conclusive (validation/config/4xx, except
//   409) or uncertain (network/timeout/5xx/409/malformed/unexpected). Only a
//   conclusive failure cancels the just-created order; uncertainty leaves it
//   pending so a retry reconciles through the same idempotency key.
// - A pending order whose stored checkout is missing is never released
//   blindly: reconcile first (idempotent re-call resolves it to the existing
//   session or a fresh one), then decide.
// - Money truth always comes from verifyPayment, and delivery always goes
//   through activate_paid_promotion. This module never marks anything paid.
//
// Financial boundaries: incoming payments only. This module starts no
// outgoing money movement — no refunds, transfers, or payouts. Verified
// money that cannot be delivered lands in refund_pending (via the existing
// activation RPC) for the MANUAL staff workflow.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  BachsError,
  createCheckout,
  verifyPayment,
} from "@/integrations/bachs/client.server";
import {
  isReservationValid,
  ORDER_DAYS_MAX,
  ORDER_DAYS_MIN,
  ORDER_RESERVATION_HOURS,
  orderTotalKobo,
} from "@/showcase/promotions/paid-promotion-orders";

// Local shape for the checkout tables. The generated Database types do not
// include promotion_orders/promotion_pricing yet, so we extend the generated
// shape here instead of editing generated files — the same pattern as
// AdminPhase1Db and BachsWebhookDb. Column shapes mirror
// supabase/migrations/20261104090000_paid_promotions_v1.sql plus the Step 4
// checkout-columns migration (checkout_id/checkout_url/checkout_expires_at).
export interface PromotionCheckoutDb {
  public: {
    Tables: {
      events: Database["public"]["Tables"]["events"];
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
          checkout_id: string | null;
          checkout_url: string | null;
          checkout_expires_at: string | null;
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
          checkout_id?: string | null;
          checkout_url?: string | null;
          checkout_expires_at?: string | null;
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
          checkout_id?: string | null;
          checkout_url?: string | null;
          checkout_expires_at?: string | null;
        };
        Relationships: [];
      };
      promotion_pricing: {
        Row: {
          id: string;
          daily_amount_kobo: number;
          currency: string;
          effective_at: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          daily_amount_kobo: number;
          currency?: string;
          effective_at?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          daily_amount_kobo?: number;
          currency?: string;
          effective_at?: string;
          created_by?: string | null;
          created_at?: string;
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
      cancel_promotion_order: {
        Args: { p_order_id: string; p_actor_id: string };
        Returns: string;
      };
    };
  };
}

export type PromotionCheckoutClient = SupabaseClient<PromotionCheckoutDb>;

export interface PromotionCheckoutDeps {
  /** Server fetch for Bachs calls. */
  fetchImpl?: typeof fetch;
  /** Service-role client (order writes bypass RLS by design). */
  supabase?: PromotionCheckoutClient;
  /** Clock override for tests (epoch milliseconds). */
  nowMs?: number;
  /** App origin override (tests); defaults to the server APP_URL env var. */
  appUrl?: string;
  /** Random suffix supplier for references (tests inject fixed values). */
  randomSuffix?: () => string;
}

export type PromotionCheckoutErrorCode =
  | "validation"
  | "forbidden"
  | "not-found"
  | "ineligible"
  | "no-pricing"
  | "config"
  | "checkout-unavailable"
  | "uncertain"
  | "order-settled";

/** User-safe errors: messages never carry secrets or internals. */
export class PromotionCheckoutError extends Error {
  readonly code: PromotionCheckoutErrorCode;

  constructor(code: PromotionCheckoutErrorCode, message: string) {
    super(message);
    this.name = "PromotionCheckoutError";
    this.code = code;
  }
}

export interface PromotionQuoteInput {
  eventId: string;
  days: number;
}

export interface PromotionQuote {
  eventId: string;
  days: number;
  dailyKobo: number;
  totalKobo: number;
  currency: string;
}

export interface CreateCheckoutInput {
  eventId: string;
  days: number;
  customerEmail: string;
  /** Authenticated organizer id (Step 4B supplies this from auth context). */
  userId: string;
}

export type PromotionCheckoutResult =
  | {
      status: "ready" | "resumed";
      orderId: string;
      checkoutUrl: string;
      expiresAt: string;
      days: number;
      totalKobo: number;
      currency: string;
    }
  | {
      status: "already-active";
      orderId: string;
      outcome: "paid" | "paid_late_honored" | "refund_pending";
    };

export interface PromotionOrderRow {
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
  checkout_id: string | null;
  checkout_url: string | null;
  checkout_expires_at: string | null;
}

const PROVIDER_REFERENCE_RE = /^[A-Za-z0-9._=-]+$/;
const MAX_REFERENCE_LENGTH = 128;
/** Bounded retries: reference regeneration on UNIQUE collision. */
const MAX_REFERENCE_ATTEMPTS = 3;
/** Exactly one immediate retry of an uncertain Bachs call, same key. */
const BACHES_RETRY_ATTEMPTS = 1;
/**
 * Safety margin subtracted from the stored checkout expiry. Bachs returns no
 * expiry timestamp, so the local copy is computed from our own clock — the
 * margin keeps resume decisions from outliving the real session under clock
 * skew or save latency.
 */
export const CHECKOUT_EXPIRY_SKEW_MARGIN_MS = 15 * 60_000;
/**
 * Payment statuses that terminally prove no money: the payment attempt is
 * over and cannot complete. Evidenced by the Step 2 client contract, which
 * encodes failed/canceled as the terminal-failure vocabulary and treats
 * only "succeeded" as money. Anything else (null, missing, processing,
 * pending, unrecognized) preserves the reservation — see recoverOrRelease.
 */
const TERMINAL_UNPAID_PAYMENT_STATUSES = ["failed", "canceled"] as const;

function asCheckoutDb(client: SupabaseClient): PromotionCheckoutClient {
  return client as unknown as PromotionCheckoutClient;
}

async function getDb(
  deps: PromotionCheckoutDeps,
): Promise<PromotionCheckoutClient> {
  if (deps.supabase) return deps.supabase;
  const { supabaseAdmin: admin } = await import(
    "@/integrations/supabase/client.server"
  );
  return asCheckoutDb(admin);
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

/**
 * Explicit server-side app origin for checkout return URLs. Any https origin
 * is allowed (local/preview/production deployments); plain http only on
 * loopback, mirroring the Bachs client's rule. Browser-supplied origins and
 * host headers are never trusted. Returns the normalized origin.
 */
export function resolveAppUrl(override?: string): string {
  const raw = override ?? process.env["APP_URL"];
  if (!raw) {
    throw new PromotionCheckoutError(
      "config",
      "Checkout is not configured yet. Set the server-side APP_URL to this app's public address.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new PromotionCheckoutError(
      "config",
      "APP_URL is not a valid URL. Set it to this app's https address.",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PromotionCheckoutError(
      "config",
      "APP_URL must use http or https.",
    );
  }
  if (parsed.protocol === "http:") {
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
      throw new PromotionCheckoutError(
        "config",
        "APP_URL may use plain http only on localhost. Production needs https.",
      );
    }
  }
  return parsed.origin;
}

/**
 * Unique provider reference for a new order. Stays inside the database
 * charset constraint and the client's length limit; uniqueness itself is
 * enforced by the UNIQUE constraint with bounded regeneration on collision.
 */
export function buildProviderReference(eventId: string, suffix: string): string {
  const eventPart = eventId.replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
  const reference = `promo_${eventPart}_${suffix}`;
  if (
    reference.length > MAX_REFERENCE_LENGTH ||
    !PROVIDER_REFERENCE_RE.test(reference)
  ) {
    throw new PromotionCheckoutError(
      "validation",
      "Could not build a valid payment reference. Please try again.",
    );
  }
  return reference;
}

async function defaultRandomSuffix(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(9).toString("hex");
}

function validatedDays(days: number): number {
  if (!Number.isInteger(days) || days < ORDER_DAYS_MIN || days > ORDER_DAYS_MAX) {
    throw new PromotionCheckoutError(
      "validation",
      `Promotion duration must be a whole number of days from ${ORDER_DAYS_MIN} to ${ORDER_DAYS_MAX}.`,
    );
  }
  return days;
}

function nonEmpty(value: string, code: PromotionCheckoutErrorCode, message: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new PromotionCheckoutError(code, message);
  }
  return value;
}

interface EligibleEvent {
  id: string;
}

async function loadOwnedEligibleEvent(
  db: PromotionCheckoutClient,
  eventId: string,
  userId: string,
  nowMs: number,
): Promise<EligibleEvent> {
  const { data, error } = await db
    .from("events")
    .select("id,created_by,published,status,ends_at")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    console.error("[promotion-checkout] event lookup failed", error);
    throw new PromotionCheckoutError(
      "checkout-unavailable",
      "Could not load that event. Please try again.",
    );
  }
  if (!data) {
    throw new PromotionCheckoutError("not-found", "That event was not found.");
  }
  if (data.created_by !== userId) {
    throw new PromotionCheckoutError(
      "forbidden",
      "Only the event's organizer can promote it.",
    );
  }
  // Same predicate the activation RPC enforces at delivery time, checked
  // early so organizers never pay for an undeliverable promotion.
  if (!data.published) {
    throw new PromotionCheckoutError(
      "ineligible",
      "Only published events can be promoted. Publish it first, then boost.",
    );
  }
  if (data.status === "cancelled") {
    throw new PromotionCheckoutError(
      "ineligible",
      "Cancelled events cannot be promoted.",
    );
  }
  if (data.ends_at !== null && Number.isNaN(Date.parse(data.ends_at))) {
    throw new PromotionCheckoutError(
      "ineligible",
      "That event has an unreadable end date, so it cannot be promoted.",
    );
  }
  if (data.ends_at !== null && Date.parse(data.ends_at) <= nowMs) {
    throw new PromotionCheckoutError(
      "ineligible",
      "That event has already ended, so it cannot be promoted.",
    );
  }
  return { id: data.id };
}

async function loadCurrentPrice(
  db: PromotionCheckoutClient,
): Promise<{ dailyKobo: number; currency: string }> {
  const { data, error } = await db
    .from("promotion_pricing")
    .select("daily_amount_kobo,currency,effective_at")
    .order("effective_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("[promotion-checkout] pricing lookup failed", error);
    throw new PromotionCheckoutError(
      "checkout-unavailable",
      "Could not load promotion pricing. Please try again.",
    );
  }
  const row = data?.[0] ?? null;
  if (!row) {
    throw new PromotionCheckoutError(
      "no-pricing",
      "Promotion pricing is not configured yet. Please check back soon.",
    );
  }
  return { dailyKobo: row.daily_amount_kobo, currency: row.currency };
}

/**
 * Priced quote for the checkout sheet. Read-only: no order is created, and
 * the browser's copy is display-only — creation recomputes everything.
 */
export async function getPromotionQuote(
  input: PromotionQuoteInput,
  deps: PromotionCheckoutDeps = {},
): Promise<PromotionQuote> {
  const eventId = nonEmpty(input.eventId, "validation", "An event is required.");
  const days = validatedDays(input.days);
  const nowMs = deps.nowMs ?? Date.now();
  const db = await getDb(deps);
  const { data, error } = await db
    .from("events")
    .select("id,published,status,ends_at")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    console.error("[promotion-checkout] quote event lookup failed", error);
    throw new PromotionCheckoutError(
      "checkout-unavailable",
      "Could not load that event. Please try again.",
    );
  }
  if (!data) {
    throw new PromotionCheckoutError("not-found", "That event was not found.");
  }
  if (!data.published || data.status === "cancelled") {
    throw new PromotionCheckoutError(
      "ineligible",
      "That event cannot be promoted right now.",
    );
  }
  if (data.ends_at !== null && Date.parse(data.ends_at) <= nowMs) {
    throw new PromotionCheckoutError(
      "ineligible",
      "That event has already ended, so it cannot be promoted.",
    );
  }
  const price = await loadCurrentPrice(db);
  let totalKobo: number;
  try {
    totalKobo = orderTotalKobo(days, price.dailyKobo);
  } catch {
    throw new PromotionCheckoutError(
      "validation",
      "That duration and the current price do not make a valid total.",
    );
  }
  return {
    eventId: data.id,
    days,
    dailyKobo: price.dailyKobo,
    totalKobo,
    currency: price.currency,
  };
}

/**
 * Classifies a failed createCheckout call. Conclusive failures prove Bachs
 * created nothing (our request never ran or was rejected), so the pending
 * order may be cancelled. Everything else is uncertain: a checkout may
 * exist at Bachs, so the order MUST stay pending for reconcile-on-retry.
 * 409 is uncertain because it can mean "same key already in flight".
 */
function isConclusiveBachsFailure(error: unknown): boolean {
  if (!(error instanceof BachsError)) return false;
  if (error.code === "validation" || error.code === "config") return true;
  if (error.code === "http" && error.httpStatus !== undefined) {
    return error.httpStatus >= 400 && error.httpStatus < 500 && error.httpStatus !== 409;
  }
  return false;
}

async function loadPendingOrder(
  db: PromotionCheckoutClient,
  eventId: string,
): Promise<PromotionOrderRow | null> {
  const { data, error } = await db
    .from("promotion_orders")
    .select(
      "id,event_id,organizer_id,days,daily_amount_kobo,total_amount_kobo,currency,status,provider_reference,created_at,checkout_id,checkout_url,checkout_expires_at",
    )
    .eq("event_id", eventId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) {
    console.error("[promotion-checkout] pending-order lookup failed", error);
    throw new PromotionCheckoutError(
      "checkout-unavailable",
      "Could not check for an existing checkout. Please try again.",
    );
  }
  return (data as PromotionOrderRow | null) ?? null;
}

function checkoutLive(order: PromotionOrderRow, nowMs: number): boolean {
  if (order.checkout_url === null || order.checkout_expires_at === null) {
    return false;
  }
  return Date.parse(order.checkout_expires_at) > nowMs;
}

function returnUrls(appOrigin: string, orderId: string): {
  successUrl: string;
  cancelUrl: string;
} {
  return {
    successUrl: `${appOrigin}/app/promotions/success?order=${orderId}`,
    cancelUrl: `${appOrigin}/app/promotions/cancelled?order=${orderId}`,
  };
}

interface StoredSession {
  checkoutId: string;
  checkoutUrl: string;
  expiresAt: string;
  /** True when a competing request stored first and we adopted its triple. */
  resumed: boolean;
}

async function loadOrderSession(
  db: PromotionCheckoutClient,
  orderId: string,
): Promise<{
  status: string;
  checkout_id: string | null;
  checkout_url: string | null;
  checkout_expires_at: string | null;
} | null> {
  const { data, error } = await db
    .from("promotion_orders")
    .select("status,checkout_id,checkout_url,checkout_expires_at")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    console.error("[promotion-checkout] session reload failed", error);
    throw new PromotionCheckoutError(
      "uncertain",
      "The checkout status is unclear. Please try again shortly to resume it.",
    );
  }
  return data ?? null;
}

async function storeCheckoutSession(
  db: PromotionCheckoutClient,
  orderId: string,
  session: { checkoutId: string; checkoutUrl: string },
  nowMs: number,
): Promise<StoredSession> {
  // The stored expiry mirrors the 24h Bachs session TTL (client
  // CHECKOUT_TTL_MINUTES), minus a skew margin so resume decisions never
  // outlive the real session. A margin-expired URL re-verifies before any
  // recreate, so the only cost of the margin is an earlier recheck.
  const expiresAt = new Date(
    nowMs + ORDER_RESERVATION_HOURS * 3_600_000 - CHECKOUT_EXPIRY_SKEW_MARGIN_MS,
  ).toISOString();
  // Conditional write: only a still-pending order with NO stored session
  // accepts this triple, so a competing request can never overwrite ours
  // and we can never overwrite theirs. The affected-row count decides.
  const { data, error } = await db
    .from("promotion_orders")
    .update({
      checkout_id: session.checkoutId,
      checkout_url: session.checkoutUrl,
      checkout_expires_at: expiresAt,
    })
    .eq("id", orderId)
    .eq("status", "pending")
    .is("checkout_id", null)
    .select("id");
  if (error) {
    console.error("[promotion-checkout] checkout save failed", error);
    throw new PromotionCheckoutError(
      "uncertain",
      "The payment session was created but could not be saved. Please retry to resume it — you will not be charged twice.",
    );
  }
  if (Array.isArray(data) && data.length > 0) {
    return {
      checkoutId: session.checkoutId,
      checkoutUrl: session.checkoutUrl,
      expiresAt,
      resumed: false,
    };
  }
  // Zero rows: a competitor stored first, or the order settled under us.
  // Reload to find out which — never guess, never overwrite.
  const current = await loadOrderSession(db, orderId);
  if (
    current !== null &&
    current.checkout_id !== null &&
    current.checkout_url !== null &&
    current.checkout_expires_at !== null
  ) {
    return {
      checkoutId: current.checkout_id,
      checkoutUrl: current.checkout_url,
      expiresAt: current.checkout_expires_at,
      resumed: true,
    };
  }
  if (current === null || current.status !== "pending") {
    // The order left pending under us (organizer cancelled elsewhere, or an
    // expiry landed first). Any live Bachs session still resolves through
    // the webhook's late-payment path; the user just needs the true state.
    throw new PromotionCheckoutError(
      "order-settled",
      "That order was already resolved. Check your promotions for its status.",
    );
  }
  // Still pending with no triple: a competitor is mid-flight. Stay
  // uncertain; the next attempt reconciles through the same idempotency key.
  throw new PromotionCheckoutError(
    "uncertain",
    "The checkout status is unclear. Please try again shortly to resume it.",
  );
}

/**
 * Best-effort release of a pending order we just proved unpayable. Never
 * throws: Supabase RPC failures arrive BOTH as thrown exceptions and as a
 * returned `{ data, error }` with error set, so both are inspected. Returns
 * true only when the slot is actually free; on failure the order stays
 * pending and the resume/reconcile path heals it on retry.
 */
async function releaseOrderQuietly(
  db: PromotionCheckoutClient,
  orderId: string,
  userId: string,
): Promise<boolean> {
  try {
    const { error } = await db.rpc("cancel_promotion_order", {
      p_order_id: orderId,
      p_actor_id: userId,
    });
    if (error) {
      console.error(
        "[promotion-checkout] order release failed; resume will heal",
        error,
      );
      return false;
    }
    return true;
  } catch (cancelError) {
    console.error(
      "[promotion-checkout] order release threw; resume will heal",
      cancelError,
    );
    return false;
  }
}

interface BachsCallInput {
  orderId: string;
  reference: string;
  totalKobo: number;
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * One createCheckout call plus exactly one immediate retry on uncertain
 * failure. Same order id (the idempotency key), same reference, same amount
 * on every attempt — a retry can only return the existing session, never a
 * second payable one.
 */
async function createBachsSession(
  input: BachsCallInput,
  fetchImpl: typeof fetch,
): Promise<{ checkoutId: string; checkoutUrl: string }> {
  // The database CHECK constrains currency to NGN, but the type is text:
  // refuse anything else here rather than trusting a stored value.
  if (input.currency !== "NGN") {
    throw new PromotionCheckoutError(
      "validation",
      "That order has an unsupported currency and cannot be checked out.",
    );
  }
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= BACHES_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await createCheckout(
        {
          orderReference: input.reference,
          amountKobo: input.totalKobo,
          currency: input.currency,
          customerEmail: input.customerEmail,
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          orderId: input.orderId,
        },
        fetchImpl,
      );
    } catch (callError) {
      lastError = callError;
      if (isConclusiveBachsFailure(callError)) throw callError;
    }
  }
  throw lastError;
}

async function activateVerifiedPayment(
  db: PromotionCheckoutClient,
  order: PromotionOrderRow,
  verification: { paid: boolean; amountKobo: number | null; reference: string | null },
): Promise<ActivatedCheckoutResult> {
  // Paid implies a verified amount by the client's contract; refuse to
  // activate on anything less, even defensively.
  if (!verification.paid || verification.amountKobo === null) {
    throw new PromotionCheckoutError(
      "uncertain",
      "That payment has no verified amount yet. Please try again shortly.",
    );
  }
  const { data: outcome, error: rpcError } = await db.rpc(
    "activate_paid_promotion",
    {
      p_order_id: order.id,
      p_provider_reference: verification.reference ?? "",
      p_amount_kobo: verification.amountKobo,
    },
  );
  if (rpcError) {
    console.error("[promotion-checkout] recovery activation failed", rpcError);
    throw new PromotionCheckoutError(
      "uncertain",
      "Payment was verified but activation did not confirm. Please try again — the webhook will also settle it.",
    );
  }
  if (
    outcome !== "paid" &&
    outcome !== "paid_late_honored" &&
    outcome !== "refund_pending"
  ) {
    console.error("[promotion-checkout] unexpected activation outcome");
    throw new PromotionCheckoutError(
      "uncertain",
      "Payment was verified but activation did not confirm. Please try again.",
    );
  }
  return { status: "already-active", orderId: order.id, outcome };
}

/**
 * Reconciles a pending order that has no stored checkout (creation crashed
 * between Bachs success and the local save, or the save failed). The
 * idempotent re-call resolves the uncertainty: Bachs returns the session it
 * already created for this order key, or creates it now.
 */
async function reconcileMissingSession(
  db: PromotionCheckoutClient,
  order: PromotionOrderRow,
  customerEmail: string,
  appOrigin: string,
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<PromotionCheckoutResult> {
  const urls = returnUrls(appOrigin, order.id);
  let session: { checkoutId: string; checkoutUrl: string };
  try {
    session = await createBachsSession(
      {
        orderId: order.id,
        reference: order.provider_reference,
        totalKobo: order.total_amount_kobo,
        currency: order.currency,
        customerEmail,
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl,
      },
      fetchImpl,
    );
  } catch (reconcileError) {
    // Already-classified checkout errors (e.g. the currency guard) pass
    // through untouched; only Bachs outcomes are classified here.
    if (reconcileError instanceof PromotionCheckoutError) throw reconcileError;
    if (isConclusiveBachsFailure(reconcileError)) {
      const released = await releaseOrderQuietly(db, order.id, order.organizer_id);
      // Never claim a release that did not happen: an unreleased order
      // stays pending and the next attempt resumes it.
      throw new PromotionCheckoutError(
        "checkout-unavailable",
        released
          ? "Bachs refused that checkout. The pending order was released — please try again."
          : "Bachs refused that checkout. Please try again shortly.",
      );
    }
    throw new PromotionCheckoutError(
      "uncertain",
      "The checkout status is unclear. Please try again shortly to resume it.",
    );
  }
  const stored = await storeCheckoutSession(db, order.id, session, nowMs);
  return {
    status: "resumed",
    orderId: order.id,
    checkoutUrl: stored.checkoutUrl,
    expiresAt: stored.expiresAt,
    days: order.days,
    totalKobo: order.total_amount_kobo,
    currency: order.currency,
  };
}

export type ActivatedCheckoutResult = Extract<
  PromotionCheckoutResult,
  { status: "already-active" }
>;

export type SettleOrderResult =
  | { settled: "activated"; result: ActivatedCheckoutResult }
  | { settled: "cancelled" };

/**
 * Shared verify-then-settle for a pending order WITH a stored checkout id.
 * Re-verifies live money truth and either activates (paid), cancels
 * (terminally unpaid), or throws uncertain (ambiguous — reservation
 * preserved). Used by creation-time recovery AND explicit user cancellation
 * so both obey one money rule. Never reconciles: callers with no stored
 * session decide that themselves.
 */
export async function settleOrderByVerification(
  db: PromotionCheckoutClient,
  order: PromotionOrderRow,
  fetchImpl: typeof fetch,
): Promise<SettleOrderResult> {
  // Fail closed on misuse: without a stored session there is nothing to
  // verify. Callers route null-triple orders to reconcile/cancel instead.
  if (order.checkout_id === null) {
    throw new PromotionCheckoutError(
      "validation",
      "That order has no payment session to verify.",
    );
  }
  const checkoutId: string = order.checkout_id;
  let verification;
  try {
    verification = await verifyPayment(checkoutId, fetchImpl);
  } catch (verifyError) {
    const code =
      verifyError instanceof BachsError ? verifyError.code : "unknown";
    console.warn(
      `[promotion-checkout] recovery verify inconclusive for ${order.id}: ${code}`,
    );
    throw new PromotionCheckoutError(
      "uncertain",
      "The previous checkout status is unclear, so its reservation is preserved. Please try again shortly.",
    );
  }
  if (verification.paid) {
    return {
      settled: "activated",
      result: await activateVerifiedPayment(db, order, verification),
    };
  }
  // Bachs claims success but the evidence is undecipherable (amount missing
  // or unparseable, or currency not NGN): money may exist, so this is NEVER
  // conclusively unpaid. Preserve the reservation for re-verification.
  if (verification.paymentStatus === "succeeded") {
    console.warn(
      `[promotion-checkout] succeeded-but-undecipherable verify for ${order.id}`,
    );
    throw new PromotionCheckoutError(
      "uncertain",
      "That payment's state is unclear, so its reservation is preserved. Please try again shortly.",
    );
  }
  // Release requires explicitly terminal evidence — never a bare paid:false.
  // A terminally failed payment, or an expired (unpayable) session with no
  // success claim, proves no money. Null, missing, processing, pending, or
  // unrecognized statuses preserve the reservation for re-verification.
  const terminalPayment =
    verification.paymentStatus !== null &&
    (TERMINAL_UNPAID_PAYMENT_STATUSES as readonly string[]).includes(
      verification.paymentStatus,
    );
  const sessionExpired = verification.status === "expired";
  if (!terminalPayment && !sessionExpired) {
    console.warn(
      `[promotion-checkout] non-terminal verify for ${order.id}; reservation preserved`,
    );
    const stillActive =
      verification.status === "open" && verification.paymentStatus === null;
    throw new PromotionCheckoutError(
      "uncertain",
      stillActive
        ? "That event already has an active checkout awaiting payment. Complete or cancel it before starting a new one."
        : "The previous checkout status is unclear, so its reservation is preserved. Please try again shortly.",
    );
  }
  // Terminally unpaid: conclusive. The slot may be released; a payment
  // landing afterwards still resolves safely through the webhook's
  // late-payment path.
  const { error: cancelError } = await db.rpc("cancel_promotion_order", {
    p_order_id: order.id,
    p_actor_id: order.organizer_id,
  });
  if (cancelError) {
    console.error("[promotion-checkout] stale release failed", cancelError);
    throw new PromotionCheckoutError(
      "uncertain",
      "The previous checkout could not be released. Please try again shortly.",
    );
  }
  return { settled: "cancelled" };
}

/**
 * Decides the fate of an existing pending order that cannot simply resume:
 * stale reservation, different days requested, or a dead stored session.
 * Missing sessions reconcile first; stored sessions settle by verification.
 */
async function recoverOrRelease(
  db: PromotionCheckoutClient,
  order: PromotionOrderRow,
  customerEmail: string,
  appOrigin: string,
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<PromotionCheckoutResult | "released"> {
  if (order.checkout_id === null) {
    return await reconcileMissingSession(
      db,
      order,
      customerEmail,
      appOrigin,
      fetchImpl,
      nowMs,
    );
  }
  const settled = await settleOrderByVerification(db, order, fetchImpl);
  if (settled.settled === "activated") return settled.result;
  return "released";
}

/**
 * Creates (or resumes) a promotion checkout. Never trusts a browser amount:
 * days are validated, the price is read server-side, and the snapshot total
 * is recomputed here for every path, including resumes.
 */
export async function createPromotionCheckout(
  input: CreateCheckoutInput,
  deps: PromotionCheckoutDeps = {},
): Promise<PromotionCheckoutResult> {
  const eventId = nonEmpty(input.eventId, "validation", "An event is required.");
  const userId = nonEmpty(input.userId, "validation", "Sign in is required.");
  const customerEmail = nonEmpty(
    input.customerEmail,
    "validation",
    "An email address is required for the payment receipt.",
  );
  const days = validatedDays(input.days);
  // Fail closed on configuration before any database write.
  const appOrigin = resolveAppUrl(deps.appUrl);
  const nowMs = deps.nowMs ?? Date.now();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const db = await getDb(deps);

  const event = await loadOwnedEligibleEvent(db, eventId, userId, nowMs);
  const price = await loadCurrentPrice(db);
  let totalKobo: number;
  try {
    totalKobo = orderTotalKobo(days, price.dailyKobo);
  } catch {
    throw new PromotionCheckoutError(
      "validation",
      "That duration and the current price do not make a valid total.",
    );
  }

  // Existing pending order? Resume, recover, or release — never stack a
  // second pending order (the unique index is the backstop, this is the UX).
  const existing = await loadPendingOrder(db, event.id);
  if (existing) {
    if (existing.organizer_id !== userId) {
      // Unreachable through the UI (one organizer per event), but a shared
      // event must never leak another organizer's checkout URL.
      throw new PromotionCheckoutError(
        "forbidden",
        "That event already has a pending checkout from its organizer.",
      );
    }
    const reservationFresh = isReservationValid(
      existing.status === "pending" ? "pending" : "expired",
      Date.parse(existing.created_at),
      nowMs,
    );
    if (
      reservationFresh &&
      existing.days === days &&
      checkoutLive(existing, nowMs)
    ) {
      return {
        status: "resumed",
        orderId: existing.id,
        checkoutUrl: existing.checkout_url as string,
        expiresAt: existing.checkout_expires_at as string,
        days: existing.days,
        totalKobo: existing.total_amount_kobo,
        currency: existing.currency,
      };
    }
    const recovery = await recoverOrRelease(
      db,
      existing,
      customerEmail,
      appOrigin,
      fetchImpl,
      nowMs,
    );
    if (recovery !== "released") return recovery;
    // Released: fall through and create the new order below.
  }

  const suffix =
    deps.randomSuffix !== undefined
      ? deps.randomSuffix()
      : await defaultRandomSuffix();
  let reference = buildProviderReference(event.id, suffix);
  let order: PromotionOrderRow | null = null;
  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
    const { data, error } = await db
      .from("promotion_orders")
      .insert({
        event_id: event.id,
        organizer_id: userId,
        days,
        daily_amount_kobo: price.dailyKobo,
        total_amount_kobo: totalKobo,
        currency: price.currency,
        provider: "bachs",
        provider_reference: reference,
      })
      .select(
        "id,event_id,organizer_id,days,daily_amount_kobo,total_amount_kobo,currency,status,provider_reference,created_at,checkout_id,checkout_url,checkout_expires_at",
      );
    if (!error) {
      order = ((data as PromotionOrderRow[] | null)?.[0] ?? null) as PromotionOrderRow | null;
      break;
    }
    if (!isUniqueViolation(error)) {
      console.error("[promotion-checkout] order insert failed", error);
      throw new PromotionCheckoutError(
        "checkout-unavailable",
        "Could not create that order. Please try again.",
      );
    }
    // 23505: either a concurrent pending order won (resume it) or the
    // random reference collided (regenerate). Pending wins the check
    // because double-clicks are common and collisions are not.
    const winner = await loadPendingOrder(db, event.id);
    if (winner) {
      if (winner.organizer_id !== userId) {
        throw new PromotionCheckoutError(
          "forbidden",
          "That event already has a pending checkout from its organizer.",
        );
      }
      if (winner.days === days && checkoutLive(winner, nowMs)) {
        return {
          status: "resumed",
          orderId: winner.id,
          checkoutUrl: winner.checkout_url as string,
          expiresAt: winner.checkout_expires_at as string,
          days: winner.days,
          totalKobo: winner.total_amount_kobo,
          currency: winner.currency,
        };
      }
      const recovery = await recoverOrRelease(
        db,
        winner,
        customerEmail,
        appOrigin,
        fetchImpl,
        nowMs,
      );
      if (recovery !== "released") return recovery;
      // Released mid-flight: retry the insert with a fresh reference.
    }
    const nextSuffix =
      deps.randomSuffix !== undefined
        ? deps.randomSuffix()
        : await defaultRandomSuffix();
    reference = buildProviderReference(event.id, `${suffix}${nextSuffix}`);
  }
  if (!order) {
    throw new PromotionCheckoutError(
      "checkout-unavailable",
      "Could not create that order. Please try again.",
    );
  }

  const urls = returnUrls(appOrigin, order.id);
  let session: { checkoutId: string; checkoutUrl: string };
  try {
    session = await createBachsSession(
      {
        orderId: order.id,
        reference: order.provider_reference,
        totalKobo: order.total_amount_kobo,
        currency: order.currency,
        customerEmail,
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl,
      },
      fetchImpl,
    );
  } catch (sessionError) {
    if (sessionError instanceof PromotionCheckoutError) throw sessionError;
    if (isConclusiveBachsFailure(sessionError)) {
      // Bachs provably created nothing: release the slot at once so the
      // organizer can retry cleanly.
      await releaseOrderQuietly(db, order.id, userId);
      const detail =
        sessionError instanceof BachsError && sessionError.code === "validation"
          ? "The checkout details were rejected."
          : "Bachs is unreachable or refused the checkout.";
      throw new PromotionCheckoutError("checkout-unavailable", `${detail} Please try again.`);
    }
    // Uncertain: the session may exist. The order stays pending; the next
    // attempt reconciles through the same idempotency key.
    throw new PromotionCheckoutError(
      "uncertain",
      "The checkout status is unclear. Please try again shortly to resume it — you will not be charged twice.",
    );
  }
  const stored = await storeCheckoutSession(db, order.id, session, nowMs);
  return {
    status: stored.resumed ? "resumed" : "ready",
    orderId: order.id,
    checkoutUrl: stored.checkoutUrl,
    expiresAt: stored.expiresAt,
    days: order.days,
    totalKobo: order.total_amount_kobo,
    currency: order.currency,
  };
}
