// Organizer reporting server functions (P2). Thin bridge: every function
// below first passes through requireSupabaseAuth (proves WHO is calling),
// then proves the caller owns the event or organizer profile in question
// before any cross-user row (orders, buyers, payouts) is read. UI gating is
// a courtesy; these checks are the real security boundary.
//
// Read-only except payout details (the organizer's own bank details) and
// cancel/reopen (the organizer's own event status). Nothing here moves
// money, and paid-order history is never rewritten.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ACTIVE_STATUS,
  CANCELLED_STATUS,
  describeStalledMutation,
} from "@/showcase/admin/event-transitions";
import { aggregateEarnings } from "@/showcase/finance/commission";
import { notifyEventCancelled } from "@/showcase/notifications/notify-fanout.server";
import { normalizeTicketCode } from "@/showcase/tickets/ticket-codes";
import { nairaNumericToKobo } from "@/showcase/tickets/ticket-orders";
import { aggregateSales, type SalesSnapshot } from "./organizer-sales";
import { validatePayoutDetails } from "./organizer-payout";

export type { SalesSnapshot } from "./organizer-sales";

interface ReportsDb {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          created_by: string;
          title: string;
          status: string;
          published: boolean;
          commission_pct: number | string | null;
        };
        Insert: never;
        Update: { status?: string };
        Relationships: [];
      };
      commission_rates: {
        Row: {
          id: string;
          rate_pct: number | string;
          effective_at: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      organizer_payouts: {
        Row: {
          id: string;
          organizer_id: string;
          amount_kobo: number;
          currency: string;
          status: string;
          status_reason: string | null;
          reference: string | null;
          admin_note: string | null;
          created_at: string;
          updated_at: string;
          paid_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ticket_orders: {
        Row: {
          id: string;
          event_id: string;
          user_id: string;
          status: string;
          total_amount: number | string;
          reference: string;
          paid_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ticket_items: {
        Row: {
          order_id: string;
          tier_id: string | null;
          tier_name: string;
          unit_price: number | string;
          quantity: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: { id: string; name: string | null; email: string | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      organizers: {
        Row: { id: string; name: string; owner_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ticket_codes: {
        Row: {
          order_id: string;
          status: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      organizer_payout_details: {
        Row: {
          organizer_id: string;
          bank_name: string;
          account_number: string;
          account_name: string;
          updated_at: string;
        };
        Insert: {
          organizer_id: string;
          bank_name: string;
          account_number: string;
          account_name: string;
        };
        Update: {
          bank_name?: string;
          account_number?: string;
          account_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      check_in_ticket: {
        Args: { p_code: string; p_event_id: string; p_actor: string };
        Returns: { outcome: string; tier_name: string; order_reference: string; checked_in_at: string }[];
      };
    };
  };
}

type ReportsClient = SupabaseClient<ReportsDb>;

function asReportsDb(client: SupabaseClient): ReportsClient {
  return client as unknown as ReportsClient;
}

export class OrganizerReportsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizerReportsError";
  }
}

interface AuthedContext {
  userId: string;
}

function authedContext(context: unknown): AuthedContext {
  const userId = (context as { userId?: unknown }).userId;
  if (typeof userId !== "string" || userId.length === 0) {
    throw new OrganizerReportsError("Sign in is required.");
  }
  return { userId };
}

function passReportsError(caught: unknown): never {
  if (caught instanceof OrganizerReportsError) throw caught;
  console.error("[organizer-reports] unexpected failure", caught);
  throw new OrganizerReportsError("Something went wrong. Please try again.");
}

function adminDb(): ReportsClient {
  return asReportsDb(supabaseAdmin);
}

/** Loads an owned event or throws the same message for missing/foreign. */
async function loadOwnedEvent(db: ReportsClient, eventId: string, userId: string) {
  const { data, error } = await db
    .from("events")
    .select("id,created_by,title,status,published")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    console.error("[organizer-reports] event lookup failed", error);
    throw new OrganizerReportsError("Could not load that event. Please try again.");
  }
  if (!data || data.created_by !== userId) {
    throw new OrganizerReportsError("That event was not found.");
  }
  return data;
}

async function ownEventIds(db: ReportsClient, userId: string): Promise<string[]> {
  const { data, error } = await db.from("events").select("id").eq("created_by", userId).limit(500);
  if (error) {
    console.error("[organizer-reports] events lookup failed", error);
    throw new OrganizerReportsError("Could not load your events. Please try again.");
  }
  return (data ?? []).map((row) => row.id);
}

async function ordersForEvents(db: ReportsClient, eventIds: string[]) {
  if (eventIds.length === 0) {
    return { orders: [], items: [] } as {
      orders: { id: string; event_id: string; user_id: string; status: string; total_amount: number | string; reference: string; paid_at: string | null; created_at: string }[];
      items: { order_id: string; tier_id: string | null; tier_name: string; unit_price: number | string; quantity: number }[];
    };
  }
  const { data: orders, error: ordersError } = await db
    .from("ticket_orders")
    .select("id,event_id,user_id,status,total_amount,reference,paid_at,created_at")
    .in("event_id", eventIds)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (ordersError) {
    console.error("[organizer-reports] orders lookup failed", ordersError);
    throw new OrganizerReportsError("Could not load ticket sales. Please try again.");
  }
  const orderIds = (orders ?? []).map((order) => order.id);
  if (orderIds.length === 0) {
    return { orders: orders ?? [], items: [] };
  }
  const { data: items, error: itemsError } = await db
    .from("ticket_items")
    .select("order_id,tier_id,tier_name,unit_price,quantity")
    .in("order_id", orderIds)
    .limit(5000);
  if (itemsError) {
    console.error("[organizer-reports] items lookup failed", itemsError);
    throw new OrganizerReportsError("Could not load ticket sales. Please try again.");
  }
  return { orders: orders ?? [], items: items ?? [] };
}

// ── Account-wide sales snapshot (overview strip + sales page) ────────────────

export const getOrganizerSalesSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SalesSnapshot & { eventTitles: Record<string, string> }> => {
    const { userId } = authedContext(context);
    try {
      const db = adminDb();
      const eventIds = await ownEventIds(db, userId);
      const { orders, items } = await ordersForEvents(db, eventIds);
      const snapshot = aggregateSales(orders, items);
      const { data: events } =
        eventIds.length > 0
          ? await db.from("events").select("id,title").in("id", eventIds)
          : { data: [] as { id: string; title: string }[] };
      const eventTitles: Record<string, string> = {};
      for (const event of events ?? []) {
        eventTitles[event.id] = event.title;
      }
      return { ...snapshot, eventTitles };
    } catch (caught) {
      passReportsError(caught);
    }
  });

// ── Earnings + payouts (organizer's own money, read-only) ─────────────────────
// Fees derive from each event's LOCKED commission_pct. The live default is
// read only as a fallback for rows that predate finance, and as the rate a
// next publish would lock (shown on the payouts page).

export interface OrganizerEarningRow {
  eventId: string;
  eventTitle: string;
  ratePct: number;
  paidOrders: number;
  grossKobo: number;
  feeKobo: number;
  netKobo: number;
}

export interface OrganizerEarningsSnapshot {
  paidOrders: number;
  grossKobo: number;
  feeKobo: number;
  netKobo: number;
  reservedKobo: number;
  availableKobo: number;
  defaultRatePct: number;
  events: OrganizerEarningRow[];
}

export interface OrganizerPayoutRow {
  id: string;
  amountKobo: number;
  currency: string;
  status: string;
  statusReason: string | null;
  reference: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
}

function rateToNumber(value: number | string | null, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const getEarningsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrganizerEarningsSnapshot> => {
    const { userId } = authedContext(context);
    try {
      const db = adminDb();
      const eventIds = await ownEventIds(db, userId);
      const { data: ownEvents } =
        eventIds.length > 0
          ? await db.from("events").select("id, title, commission_pct").in("id", eventIds)
          : { data: [] as { id: string; title: string; commission_pct: number | string | null }[] };
      const { data: defaultRow } = await db
        .from("commission_rates")
        .select("rate_pct")
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const defaultRate = rateToNumber(defaultRow?.rate_pct ?? null, 10);
      const titles = new Map((ownEvents ?? []).map((event) => [event.id, event.title]));
      const rates = new Map(
        (ownEvents ?? []).map((event) => [event.id, rateToNumber(event.commission_pct, defaultRate)]),
      );
      const { orders } = await ordersForEvents(db, eventIds);
      const snapshot = aggregateEarnings(orders, rates, defaultRate);
      const { data: payouts, error: payoutsError } = await db
        .from("organizer_payouts")
        .select("amount_kobo, status")
        .eq("organizer_id", userId)
        .neq("status", "failed")
        .limit(5000);
      if (payoutsError) {
        console.error("[organizer-reports] payouts lookup failed", payoutsError);
        throw new OrganizerReportsError("Could not load your payouts. Please try again.");
      }
      const reservedKobo = (payouts ?? []).reduce((sum, row) => sum + row.amount_kobo, 0);
      return {
        paidOrders: snapshot.paidOrders,
        grossKobo: snapshot.grossKobo,
        feeKobo: snapshot.feeKobo,
        netKobo: snapshot.netKobo,
        reservedKobo,
        availableKobo: Math.max(0, snapshot.netKobo - reservedKobo),
        defaultRatePct: defaultRate,
        events: snapshot.events.map((event) => ({
          eventId: event.eventId,
          eventTitle: titles.get(event.eventId) ?? "Unknown event",
          ratePct: event.ratePct,
          paidOrders: event.paidOrders,
          grossKobo: event.grossKobo,
          feeKobo: event.feeKobo,
          netKobo: event.netKobo,
        })),
      };
    } catch (caught) {
      passReportsError(caught);
    }
  });

export const listMyPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ payouts: OrganizerPayoutRow[] }> => {
    const { userId } = authedContext(context);
    try {
      const db = adminDb();
      const { data, error } = await db
        .from("organizer_payouts")
        .select("id, amount_kobo, currency, status, status_reason, reference, created_at, updated_at, paid_at")
        .eq("organizer_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.error("[organizer-reports] payouts lookup failed", error);
        throw new OrganizerReportsError("Could not load your payouts. Please try again.");
      }
      return {
        payouts: (data ?? []).map((row) => ({
          id: row.id,
          amountKobo: row.amount_kobo,
          currency: row.currency,
          status: row.status,
          statusReason: row.status_reason,
          reference: row.reference,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          paidAt: row.paid_at,
        })),
      };
    } catch (caught) {
      passReportsError(caught);
    }
  });

// ── Per-event paid orders (sales page detail) ─────────────────────────────────

export interface OrganizerOrderRow {
  id: string;
  status: string;
  totalKobo: number;
  reference: string;
  paidAt: string | null;
  createdAt: string;
  lines: { tierName: string; unitKobo: number; quantity: number }[];
}

const eventIdSchema = z.object({ eventId: z.string().uuid() });

export const listEventSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(eventIdSchema)
  .handler(async ({ data, context }): Promise<{
    eventTitle: string;
    orders: OrganizerOrderRow[];
    totals: { paidOrders: number; pendingOrders: number; ticketsSold: number; grossKobo: number };
  }> => {
    const { userId } = authedContext(context);
    try {
      const db = adminDb();
      const event = await loadOwnedEvent(db, data.eventId, userId);
      const { orders, items } = await ordersForEvents(db, [event.id]);
      const itemsByOrder = new Map<string, typeof items>();
      for (const item of items) {
        const list = itemsByOrder.get(item.order_id) ?? [];
        list.push(item);
        itemsByOrder.set(item.order_id, list);
      }
      let paidOrders = 0;
      let pendingOrders = 0;
      let ticketsSold = 0;
      let grossKobo = 0;
      const rows: OrganizerOrderRow[] = orders.map((order) => {
        const lines = (itemsByOrder.get(order.id) ?? []).map((item) => ({
          tierName: item.tier_name,
          unitKobo: nairaNumericToKobo(item.unit_price),
          quantity: item.quantity,
        }));
        if (order.status === "paid") {
          paidOrders += 1;
          grossKobo += nairaNumericToKobo(order.total_amount);
          ticketsSold += lines.reduce((sum, line) => sum + line.quantity, 0);
        } else if (order.status === "pending") {
          pendingOrders += 1;
        }
        return {
          id: order.id,
          status: order.status,
          totalKobo: nairaNumericToKobo(order.total_amount),
          reference: order.reference,
          paidAt: order.paid_at,
          createdAt: order.created_at,
          lines,
        };
      });
      return { eventTitle: event.title, orders: rows, totals: { paidOrders, pendingOrders, ticketsSold, grossKobo } };
    } catch (caught) {
      passReportsError(caught);
    }
  });

// ── Paid buyers per event (attendees page; organizer's own events only) ───────

export interface EventBuyerRow {
  name: string;
  email: string | null;
  tickets: number;
  checkedIn: number;
  totalKobo: number;
  tiers: string;
  paidAt: string | null;
}

export const listEventBuyers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(eventIdSchema)
  .handler(async ({ data, context }): Promise<{ buyers: EventBuyerRow[] }> => {
    const { userId } = authedContext(context);
    try {
      const db = adminDb();
      const event = await loadOwnedEvent(db, data.eventId, userId);
      const { orders, items } = await ordersForEvents(db, [event.id]);
      const paid = orders.filter((order) => order.status === "paid");
      if (paid.length === 0) {
        return { buyers: [] };
      }
      const buyerIds = [...new Set(paid.map((order) => order.user_id))];
      const { data: profiles, error: profilesError } = await db
        .from("profiles")
        .select("id,name,email")
        .in("id", buyerIds);
      if (profilesError) {
        console.error("[organizer-reports] buyers lookup failed", profilesError);
        throw new OrganizerReportsError("Could not load ticket buyers. Please try again.");
      }
      const names = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      const itemsByOrder = new Map<string, typeof items>();
      for (const item of items) {
        const list = itemsByOrder.get(item.order_id) ?? [];
        list.push(item);
        itemsByOrder.set(item.order_id, list);
      }
      const paidIds = paid.map((order) => order.id);
      const { data: codes, error: codesError } =
        paidIds.length > 0
          ? await db.from("ticket_codes").select("order_id,status").in("order_id", paidIds).limit(5000)
          : { data: [] as { order_id: string; status: string }[] };
      if (codesError) {
        console.error("[organizer-reports] check-in lookup failed", codesError);
        throw new OrganizerReportsError("Could not load ticket buyers. Please try again.");
      }
      const checkedInByOrder = new Map<string, number>();
      for (const code of codes ?? []) {
        if (code.status === "checked_in") {
          checkedInByOrder.set(code.order_id, (checkedInByOrder.get(code.order_id) ?? 0) + 1);
        }
      }
      const buyers: EventBuyerRow[] = paid.map((order) => {
        const profile = names.get(order.user_id);
        const lines = itemsByOrder.get(order.id) ?? [];
        return {
          name: profile?.name?.trim() || "Ticket buyer",
          email: profile?.email ?? null,
          tickets: lines.reduce((sum, line) => sum + line.quantity, 0),
          checkedIn: checkedInByOrder.get(order.id) ?? 0,
          totalKobo: nairaNumericToKobo(order.total_amount),
          tiers: lines.map((line) => `${line.quantity} × ${line.tier_name}`).join(", "),
          paidAt: order.paid_at,
        };
      });
      return { buyers };
    } catch (caught) {
      passReportsError(caught);
    }
  });

// ── Owned organizer profiles (payout-details form) ────────────────────────────

export interface OwnOrganizerProfile {
  id: string;
  name: string;
}

export const listOwnOrganizerProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ profiles: OwnOrganizerProfile[] }> => {
    const { userId } = authedContext(context);
    try {
      const db = adminDb();
      const { data, error } = await db
        .from("organizers")
        .select("id,name")
        .eq("owner_id", userId)
        .order("name")
        .limit(100);
      if (error) {
        console.error("[organizer-reports] organizer profiles lookup failed", error);
        throw new OrganizerReportsError("Could not load your organizer profiles. Please try again.");
      }
      return { profiles: (data ?? []).map((row) => ({ id: row.id, name: row.name })) };
    } catch (caught) {
      passReportsError(caught);
    }
  });

// ── Payout details (owner-only bank details for MANUAL payouts) ───────────────

export interface PayoutDetailsRow {
  organizerId: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  updatedAt: string | null;
}

async function loadOwnedOrganizer(db: ReportsClient, organizerId: string, userId: string) {
  const { data, error } = await db
    .from("organizers")
    .select("id,name,owner_id")
    .eq("id", organizerId)
    .maybeSingle();
  if (error) {
    console.error("[organizer-reports] organizer lookup failed", error);
    throw new OrganizerReportsError("Could not load that organizer profile. Please try again.");
  }
  if (!data || data.owner_id !== userId) {
    throw new OrganizerReportsError("That organizer profile was not found.");
  }
  return data;
}

const payoutReadSchema = z.object({ organizerId: z.string().uuid() });

export const getPayoutDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(payoutReadSchema)
  .handler(async ({ data, context }): Promise<{ details: PayoutDetailsRow | null }> => {
    const { userId } = authedContext(context);
    try {
      const db = adminDb();
      await loadOwnedOrganizer(db, data.organizerId, userId);
      const { data: row, error } = await db
        .from("organizer_payout_details")
        .select("organizer_id,bank_name,account_number,account_name,updated_at")
        .eq("organizer_id", data.organizerId)
        .maybeSingle();
      if (error) {
        console.error("[organizer-reports] payout details lookup failed", error);
        throw new OrganizerReportsError("Could not load payout details. Please try again.");
      }
      if (!row) {
        return { details: null };
      }
      return {
        details: {
          organizerId: row.organizer_id,
          bankName: row.bank_name,
          accountNumber: row.account_number,
          accountName: row.account_name,
          updatedAt: row.updated_at,
        },
      };
    } catch (caught) {
      passReportsError(caught);
    }
  });

const payoutWriteSchema = z.object({
  organizerId: z.string().uuid(),
  bankName: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
});

export const savePayoutDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(payoutWriteSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { userId } = authedContext(context);
    const validated = validatePayoutDetails(data);
    if (!validated.ok) {
      throw new OrganizerReportsError(validated.error);
    }
    try {
      const db = adminDb();
      await loadOwnedOrganizer(db, validated.value.organizerId, userId);
      const { error } = await db.from("organizer_payout_details").upsert(
        {
          organizer_id: validated.value.organizerId,
          bank_name: validated.value.bankName,
          account_number: validated.value.accountNumber,
          account_name: validated.value.accountName,
        },
        { onConflict: "organizer_id" },
      );
      if (error) {
        console.error("[organizer-reports] payout details save failed", error);
        throw new OrganizerReportsError("Could not save payout details. Please try again.");
      }
      return { ok: true };
    } catch (caught) {
      passReportsError(caught);
    }
  });

// ── Cancel / reopen (organizer's own events; paid history is kept) ────────────

export interface CancelEventResult {
  eventId: string;
  status: string;
  paidOrders: number;
  paidTotalKobo: number;
}

async function transitionOwnEvent(
  db: ReportsClient,
  eventId: string,
  userId: string,
  to: typeof CANCELLED_STATUS | typeof ACTIVE_STATUS,
  kind: "cancel" | "reopen",
): Promise<CancelEventResult> {
  const event = await loadOwnedEvent(db, eventId, userId);
  if ((kind === "cancel") === (event.status === CANCELLED_STATUS)) {
    throw new OrganizerReportsError(
      describeStalledMutation(kind, { published: event.published, status: event.status }),
    );
  }
  const { data, error } = await db
    .from("events")
    .update({ status: to })
    .eq("id", eventId)
    .eq("created_by", userId)
    .neq("status", to)
    .select("id");
  if (error) {
    console.error("[organizer-reports] event transition failed", error);
    throw new OrganizerReportsError("Could not update that event. Please try again.");
  }
  if (!Array.isArray(data) || data.length === 0) {
    const current = await db
      .from("events")
      .select("id,status,published")
      .eq("id", eventId)
      .maybeSingle();
    throw new OrganizerReportsError(
      describeStalledMutation(
        kind,
        current.data ? { published: current.data.published, status: current.data.status } : null,
      ),
    );
  }
  const { orders } = await ordersForEvents(db, [eventId]);
  const paid = orders.filter((order) => order.status === "paid");
  if (kind === "cancel") {
    // Genuine flip only (the update above no-ops otherwise), so each buyer
    // and RSVP holder hears about this cancellation exactly once.
    await notifyEventCancelled(db as unknown as SupabaseClient, {
      eventId,
      eventTitle: event.title,
    });
  }
  return {
    eventId,
    status: to,
    paidOrders: paid.length,
    paidTotalKobo: paid.reduce((sum, order) => sum + nairaNumericToKobo(order.total_amount), 0),
  };
}

export const cancelEventAsOrganizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(eventIdSchema)
  .handler(async ({ data, context }): Promise<CancelEventResult> => {
    const { userId } = authedContext(context);
    try {
      return await transitionOwnEvent(adminDb(), data.eventId, userId, CANCELLED_STATUS, "cancel");
    } catch (caught) {
      passReportsError(caught);
    }
  });

export const reopenEventAsOrganizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(eventIdSchema)
  .handler(async ({ data, context }): Promise<CancelEventResult> => {
    const { userId } = authedContext(context);
    try {
      return await transitionOwnEvent(adminDb(), data.eventId, userId, ACTIVE_STATUS, "reopen");
    } catch (caught) {
      passReportsError(caught);
    }
  });

// ── Door check-in (organizer's own events; single locked path) ────────────────

export interface CheckInResult {
  outcome: "checked_in" | "already_checked_in";
  tierName: string;
  orderReference: string;
  checkedInAt: string;
}

const checkInSchema = z.object({
  eventId: z.string().uuid(),
  code: z.string().min(1).max(32),
});

function mapCheckInFailure(message: string): string {
  if (/not found/i.test(message)) {
    return "That ticket code was not found. Check the code and try again.";
  }
  if (/different event/i.test(message)) {
    return "That ticket is for a different event.";
  }
  if (/not paid/i.test(message)) {
    return "That ticket is not paid for.";
  }
  if (/cancelled/i.test(message)) {
    return "That event was cancelled.";
  }
  if (/already ended/i.test(message)) {
    return "That event has already ended.";
  }
  if (/no longer available/i.test(message)) {
    return "That event is no longer available.";
  }
  console.error("[organizer-reports] check-in failed:", message);
  return "That ticket could not be checked in. Please try again.";
}

export const checkInTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(checkInSchema)
  .handler(async ({ data, context }): Promise<CheckInResult> => {
    const { userId } = authedContext(context);
    const normalized = normalizeTicketCode(data.code);
    if (!normalized.ok) {
      throw new OrganizerReportsError(normalized.error);
    }
    try {
      const db = adminDb();
      await loadOwnedEvent(db, data.eventId, userId);
      const { data: rows, error } = await db.rpc("check_in_ticket", {
        p_code: normalized.code,
        p_event_id: data.eventId,
        p_actor: userId,
      });
      if (error) {
        throw new OrganizerReportsError(mapCheckInFailure(error.message));
      }
      const row = (rows ?? [])[0] as
        | { outcome: string; tier_name: string; order_reference: string; checked_in_at: string }
        | undefined;
      if (!row || (row.outcome !== "checked_in" && row.outcome !== "already_checked_in")) {
        console.error("[organizer-reports] unexpected check-in outcome");
        throw new OrganizerReportsError("That ticket could not be checked in. Please try again.");
      }
      return {
        outcome: row.outcome,
        tierName: row.tier_name,
        orderReference: row.order_reference,
        checkedInAt: row.checked_in_at,
      };
    } catch (caught) {
      passReportsError(caught);
    }
  });
