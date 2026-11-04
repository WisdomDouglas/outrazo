// Ticket checkout server functions (P1). Thin bridge: every function below
// first passes through requireSupabaseAuth (proves WHO is calling);
// ownership and money rules live in the tested server core. UI gating is a
// courtesy; these checks are the real security boundary.
//
// Error contract: the core throws TicketCheckoutError with curated user-safe
// messages — rethrown untouched. Anything unexpected is logged server-side
// and replaced with a generic retry message, so internals never leak.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  asTicketDb,
  cancelTicketOrderAsBuyer,
  createTicketCheckout,
  getOwnTicketCodes as getCodesCore,
  getOwnTicketOrder as getOwnCore,
  getTicketQuote as getQuoteCore,
  listOwnTicketOrders as listOwnCore,
  refreshTicketOrderStatus as refreshCore,
  TicketCheckoutError,
  type OwnTicketCode,
  type TicketCancelResult,
  type TicketCheckoutResult,
  type TicketOrderSummary,
  type TicketQuote,
} from "./ticket-checkout.server";
import { TICKET_QTY_MAX, TICKET_QTY_MIN } from "./ticket-orders";

// UI-facing result shapes, re-exported so routes never import the server
// core directly. Type-only: erased at runtime, zero bundle impact.
export type {
  OwnTicketCode,
  TicketCancelResult,
  TicketCheckoutResult,
  TicketOrderSummary,
  TicketQuote,
} from "./ticket-checkout.server";

interface AuthedContext {
  supabase: SupabaseClient;
  userId: string;
  claims: Record<string, unknown>;
}

function authedContext(context: unknown): AuthedContext {
  const ctx = context as Partial<AuthedContext>;
  if (!ctx.supabase || typeof ctx.userId !== "string" || ctx.userId.length === 0) {
    throw new TicketCheckoutError("validation", "Sign in is required.");
  }
  return { supabase: ctx.supabase, userId: ctx.userId, claims: ctx.claims ?? {} };
}

function passTicketError(caught: unknown): never {
  if (caught instanceof TicketCheckoutError) throw caught;
  console.error("[ticket-functions] unexpected failure", caught);
  throw new TicketCheckoutError("checkout-unavailable", "Something went wrong. Please try again.");
}

/**
 * Receipt email, server-derived — never accepted from the browser. Prefers
 * the verified auth claim, falls back to the buyer's own profile row.
 */
async function buyerEmail(
  supabase: SupabaseClient,
  userId: string,
  claims: Record<string, unknown>,
): Promise<string> {
  const claimEmail = claims["email"];
  if (typeof claimEmail === "string" && claimEmail.includes("@")) {
    return claimEmail;
  }
  const { data } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
  const profile = data as { email: string | null } | null;
  if (profile?.email && profile.email.includes("@")) {
    return profile.email;
  }
  throw new TicketCheckoutError(
    "validation",
    "Add an email address to your profile to receive the payment receipt.",
  );
}

const linesSchema = z
  .array(
    z.object({
      tierId: z.string().uuid(),
      quantity: z.number().int().min(TICKET_QTY_MIN).max(TICKET_QTY_MAX),
    }),
  )
  .min(1)
  .max(20);

const quoteSchema = z.object({
  eventId: z.string().uuid(),
  lines: linesSchema,
});

const orderIdSchema = z.object({ orderId: z.string().uuid() });

// ── Priced quote (read-only; the browser's copy is display-only) ────────────

export const getTicketQuoteFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(quoteSchema)
  .handler(async ({ data, context }): Promise<TicketQuote> => {
    authedContext(context);
    try {
      return await getQuoteCore(data, { supabase: asTicketDb(supabaseAdmin) });
    } catch (caught) {
      passTicketError(caught);
    }
  });

// ── Create or resume a checkout (server-computed snapshot) ──────────────────

export const startTicketCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(quoteSchema)
  .handler(async ({ data, context }): Promise<TicketCheckoutResult> => {
    const { supabase, userId, claims } = authedContext(context);
    try {
      const customerEmail = await buyerEmail(supabase, userId, claims);
      return await createTicketCheckout(
        { eventId: data.eventId, lines: data.lines, customerEmail, userId },
        { supabase: asTicketDb(supabaseAdmin) },
      );
    } catch (caught) {
      passTicketError(caught);
    }
  });

// ── Own orders (RLS user client: buyers see only their rows) ─────────────────

export const listMyTicketOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
  .handler(async ({ data, context }): Promise<{ orders: TicketOrderSummary[] }> => {
    const { supabase, userId } = authedContext(context);
    try {
      return await listOwnCore({ userId, limit: data.limit }, { supabase: asTicketDb(supabase) });
    } catch (caught) {
      passTicketError(caught);
    }
  });

// ── Own order status (return pages read this, never the URL) ─────────────────

export const getTicketOrderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(orderIdSchema)
  .handler(async ({ data, context }): Promise<{ order: TicketOrderSummary }> => {
    const { supabase, userId } = authedContext(context);
    try {
      return await getOwnCore(
        { orderId: data.orderId, userId },
        { supabase: asTicketDb(supabase) },
      );
    } catch (caught) {
      passTicketError(caught);
    }
  });

// ── Return-page refresh (re-verifies pending orders against live truth) ──────

export const refreshTicketOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(orderIdSchema)
  .handler(async ({ data, context }): Promise<{ order: TicketOrderSummary }> => {
    const { userId } = authedContext(context);
    try {
      return await refreshCore(
        { orderId: data.orderId, userId },
        { supabase: asTicketDb(supabaseAdmin) },
      );
    } catch (caught) {
      passTicketError(caught);
    }
  });

// ── Scannable codes for one paid order (buyer-owned) ─────────────────────────

export const getMyTicketCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(orderIdSchema)
  .handler(async ({ data, context }): Promise<{ codes: OwnTicketCode[] }> => {
    const { userId } = authedContext(context);
    try {
      return await getCodesCore(
        { orderId: data.orderId, userId },
        { supabase: asTicketDb(supabaseAdmin) },
      );
    } catch (caught) {
      passTicketError(caught);
    }
  });

// ── Buyer cancellation (re-verifies money before releasing) ──────────────────

export const cancelMyTicketOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(orderIdSchema)
  .handler(async ({ data, context }): Promise<TicketCancelResult> => {
    const { userId } = authedContext(context);
    try {
      return await cancelTicketOrderAsBuyer(
        { orderId: data.orderId, userId },
        { supabase: asTicketDb(supabaseAdmin) },
      );
    } catch (caught) {
      passTicketError(caught);
    }
  });
