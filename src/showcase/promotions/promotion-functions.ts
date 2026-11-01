// Promotion checkout server functions (P2 Step 4B). Thin bridge: every
// function below first passes through requireSupabaseAuth (proves WHO is
// calling); ownership and money rules live in the tested server cores.
// UI gating is a courtesy; these checks are the real security boundary.
//
// Error contract: cores throw PromotionCheckoutError with curated user-safe
// messages — rethrown untouched. Anything unexpected is logged server-side
// and replaced with a generic retry message, so internals never leak.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createPromotionCheckout,
  getPromotionQuote as getQuoteCore,
  PromotionCheckoutError,
  type PromotionCheckoutResult,
  type PromotionQuote,
} from "./promotion-checkout.server";
import {
  asOrdersDb,
  cancelPromotionOrderAsOrganizer,
  getOwnPromotionOrder,
  listOwnPromotionOrders,
  type CancelPromotionOrderResult,
  type PromotionOrderSummary,
} from "./promotion-orders.server";
import { ORDER_DAYS_MAX, ORDER_DAYS_MIN } from "./paid-promotion-orders";

// UI-facing result shapes, re-exported so routes and hooks never import the
// server cores directly. Type-only: erased at runtime, zero bundle impact.
export type {
  PromotionCheckoutResult,
  PromotionQuote,
} from "./promotion-checkout.server";
export type {
  CancelPromotionOrderResult,
  PromotionOrderSummary,
} from "./promotion-orders.server";

interface AuthedContext {
  supabase: SupabaseClient;
  userId: string;
  claims: Record<string, unknown>;
}

function authedContext(context: unknown): AuthedContext {
  const ctx = context as Partial<AuthedContext>;
  if (!ctx.supabase || typeof ctx.userId !== "string" || ctx.userId.length === 0) {
    throw new PromotionCheckoutError("validation", "Sign in is required.");
  }
  return { supabase: ctx.supabase, userId: ctx.userId, claims: ctx.claims ?? {} };
}

function passCheckoutError(caught: unknown): never {
  if (caught instanceof PromotionCheckoutError) throw caught;
  console.error("[promotion-functions] unexpected failure", caught);
  throw new PromotionCheckoutError(
    "checkout-unavailable",
    "Something went wrong. Please try again.",
  );
}

/**
 * Receipt email, server-derived — never accepted from the browser. Prefers
 * the verified auth claim, falls back to the organizer's own profile row.
 */
async function organizerEmail(
  supabase: SupabaseClient,
  userId: string,
  claims: Record<string, unknown>,
): Promise<string> {
  const claimEmail = claims["email"];
  if (typeof claimEmail === "string" && claimEmail.includes("@")) {
    return claimEmail;
  }
  const { data } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  const profile = data as { email: string | null } | null;
  if (profile?.email && profile.email.includes("@")) {
    return profile.email;
  }
  throw new PromotionCheckoutError(
    "validation",
    "Add an email address to your profile to receive the payment receipt.",
  );
}

const eventDaysSchema = z.object({
  eventId: z.string().uuid(),
  days: z.number().int().min(ORDER_DAYS_MIN).max(ORDER_DAYS_MAX),
});

const orderIdSchema = z.object({ orderId: z.string().uuid() });

// ── Priced quote (read-only; the browser's copy is display-only) ──────────

export const getPromotionQuoteFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(eventDaysSchema)
  .handler(async ({ data, context }): Promise<PromotionQuote> => {
    authedContext(context);
    try {
      return await getQuoteCore(data, { supabase: asOrdersDb(supabaseAdmin) });
    } catch (caught) {
      passCheckoutError(caught);
    }
  });

// ── Create or resume a checkout (server-computed snapshot) ────────────────

export const startPromotionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(eventDaysSchema)
  .handler(async ({ data, context }): Promise<PromotionCheckoutResult> => {
    const { supabase, userId, claims } = authedContext(context);
    try {
      const customerEmail = await organizerEmail(supabase, userId, claims);
      return await createPromotionCheckout(
        { eventId: data.eventId, days: data.days, customerEmail, userId },
        { supabase: asOrdersDb(supabaseAdmin) },
      );
    } catch (caught) {
      passCheckoutError(caught);
    }
  });

// ── Own orders (RLS user client: organizers see only their rows) ───────────

export const listMyPromotionOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
  .handler(async ({ data, context }): Promise<{ orders: PromotionOrderSummary[] }> => {
    const { supabase, userId } = authedContext(context);
    try {
      const orders = await listOwnPromotionOrders(
        { userId, limit: data.limit },
        { supabase: asOrdersDb(supabase) },
      );
      return { orders };
    } catch (caught) {
      passCheckoutError(caught);
    }
  });

// ── Own order status (return pages + polling read this, never the URL) ─────

export const getPromotionOrderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(orderIdSchema)
  .handler(async ({ data, context }): Promise<{ order: PromotionOrderSummary }> => {
    const { supabase, userId } = authedContext(context);
    try {
      const order = await getOwnPromotionOrder(
        { orderId: data.orderId, userId },
        { supabase: asOrdersDb(supabase) },
      );
      return { order };
    } catch (caught) {
      passCheckoutError(caught);
    }
  });

// ── Organizer cancellation (re-verifies money before releasing) ────────────

export const cancelMyPromotionOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(orderIdSchema)
  .handler(async ({ data, context }): Promise<CancelPromotionOrderResult> => {
    const { userId } = authedContext(context);
    try {
      return await cancelPromotionOrderAsOrganizer(
        { orderId: data.orderId, userId },
        { supabase: asOrdersDb(supabaseAdmin) },
      );
    } catch (caught) {
      passCheckoutError(caught);
    }
  });
