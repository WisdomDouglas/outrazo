// Server-only Admin Intelligence aggregates (Phase 2C-3, Phase 0).
//
// Computes the platform numbers the intelligence UI renders and later phases
// narrate with AI. Grounding rule, enforced by construction: every figure the
// UI shows comes from these queries, never from model text. Aggregation runs
// here on the server over the service-role client; callers gate each section
// by the caller's read permission (present) or null it (absent), exactly like
// the dashboard metrics.
//
// Read-only by design: this module issues SELECT/count queries only and
// exposes no mutation, no RPC call, and no admin action.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  AdminBackendError,
  type AdminPhase1Db,
} from "./require-permission.server";
import {
  buildDaySeries,
  INTELLIGENCE_WINDOW_DAYS_MAX,
  INTELLIGENCE_WINDOW_DAYS_MIN,
  seriesStartIso,
  type DayPoint,
} from "./intelligence-time";

/** Caps series reads so one snapshot stays small and cheap. */
export const INTELLIGENCE_SERIES_ROW_LIMIT = 5000;

export const intelligenceWindowSchema = z.object({
  windowDays: z
    .number()
    .int()
    .min(INTELLIGENCE_WINDOW_DAYS_MIN)
    .max(INTELLIGENCE_WINDOW_DAYS_MAX)
    .default(30),
});

const dayPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().min(0),
});

const seriesSchema = z.object({
  points: z.array(dayPointSchema),
  /** True when the read hit the row cap: counts are a floor, not exact. */
  truncated: z.boolean(),
});

const eventsSectionSchema = z.object({
  total: z.number().int().min(0),
  published: z.number().int().min(0),
  upcoming: z.number().int().min(0),
  series: seriesSchema,
});

const rsvpsSectionSchema = z.object({
  total: z.number().int().min(0),
  series: seriesSchema,
});

const usersSectionSchema = z.object({
  total: z.number().int().min(0),
  series: seriesSchema,
});

const organizersSectionSchema = z.object({
  total: z.number().int().min(0),
  series: seriesSchema,
});

export const intelligenceSnapshotSchema = z.object({
  generatedAt: z.string(),
  windowDays: z.number().int(),
  events: eventsSectionSchema.nullable(),
  rsvps: rsvpsSectionSchema.nullable(),
  users: usersSectionSchema.nullable(),
  organizers: organizersSectionSchema.nullable(),
});

export type IntelligenceSnapshot = z.infer<typeof intelligenceSnapshotSchema>;
export type { DayPoint };

type IntelligenceDb = SupabaseClient<AdminPhase1Db>;

type SeriesTable =
  | "events"
  | "event_attendees"
  | "profiles"
  | "organizers"
  | "saved_events"
  | "ticket_orders"
  | "event_reports";

async function takeCount(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  label: string,
): Promise<number> {
  const { count, error } = await query;
  if (error) {
    console.error(`[admin] intelligence ${label} count failed:`, error.message);
    throw new AdminBackendError("Could not load intelligence data. Please try again.");
  }
  return count ?? 0;
}

async function takeSeries(
  db: IntelligenceDb,
  table: SeriesTable,
  sinceIso: string,
  untilIso: string,
  windowDays: number,
  endIso: string,
): Promise<z.infer<typeof seriesSchema>> {
  const { data, error } = await db
    .from(table)
    .select("created_at")
    .gte("created_at", sinceIso)
    .lt("created_at", untilIso)
    .order("created_at", { ascending: true })
    .limit(INTELLIGENCE_SERIES_ROW_LIMIT);
  if (error) {
    console.error(
      `[admin] intelligence ${table} series failed:`,
      (error as { message?: string }).message ?? error,
    );
    throw new AdminBackendError("Could not load intelligence data. Please try again.");
  }
  const rows = (data ?? []) as Array<{ created_at: string }>;
  return {
    points: buildDaySeries(
      rows.map((row) => row.created_at),
      windowDays,
      endIso,
    ),
    truncated: rows.length >= INTELLIGENCE_SERIES_ROW_LIMIT,
  };
}

export interface IntelligenceSectionToggles {
  events: boolean;
  rsvps: boolean;
  users: boolean;
  organizers: boolean;
}

export interface IntelligenceSnapshotInput {
  windowDays: number;
  include: IntelligenceSectionToggles;
  /** Clock override for tests (ISO instant). */
  nowIso?: string;
}

/**
 * Builds the permission-shaped snapshot. Sections the caller may not see
 * are null (shown as "Unavailable"); included sections are fully computed.
 * The assembled payload is schema-validated before it leaves the server.
 */
export async function buildIntelligenceSnapshot(
  db: IntelligenceDb,
  input: IntelligenceSnapshotInput,
): Promise<IntelligenceSnapshot> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const sinceIso = seriesStartIso(nowIso, input.windowDays);
  const untilIso = new Date(
    Date.parse(sinceIso) + input.windowDays * 86_400_000,
  ).toISOString();

  const [events, rsvps, users, organizers] = await Promise.all([
    input.include.events
      ? (async () => ({
          total: await takeCount(
            db.from("events").select("id", { count: "exact", head: true }),
            "events",
          ),
          published: await takeCount(
            db.from("events").select("id", { count: "exact", head: true }).eq("published", true),
            "published events",
          ),
          upcoming: await takeCount(
            db.from("events").select("id", { count: "exact", head: true }).gt("starts_at", nowIso),
            "upcoming events",
          ),
          series: await takeSeries(db, "events", sinceIso, untilIso, input.windowDays, nowIso),
        }))()
      : null,
    input.include.rsvps
      ? (async () => ({
          total: await takeCount(
            db.from("event_attendees").select("id", { count: "exact", head: true }),
            "rsvps",
          ),
          series: await takeSeries(db, "event_attendees", sinceIso, untilIso, input.windowDays, nowIso),
        }))()
      : null,
    input.include.users
      ? (async () => ({
          total: await takeCount(
            db.from("profiles").select("id", { count: "exact", head: true }),
            "users",
          ),
          series: await takeSeries(db, "profiles", sinceIso, untilIso, input.windowDays, nowIso),
        }))()
      : null,
    input.include.organizers
      ? (async () => ({
          total: await takeCount(
            db.from("organizers").select("id", { count: "exact", head: true }),
            "organizers",
          ),
          series: await takeSeries(db, "organizers", sinceIso, untilIso, input.windowDays, nowIso),
        }))()
      : null,
  ]);

  const parsed = intelligenceSnapshotSchema.safeParse({
    generatedAt: nowIso,
    windowDays: input.windowDays,
    events,
    rsvps,
    users,
    organizers,
  });
  if (!parsed.success) {
    console.error("[admin] intelligence snapshot failed validation:", parsed.error.flatten());
    throw new AdminBackendError("Could not load intelligence data. Please try again.");
  }
  return parsed.data;
}

// ── Event performance ────────────────────────────────────────────────────

/** Page cap keeps per-event fan-out bounded. */
export const INTELLIGENCE_EVENTS_PAGE_LIMIT = 25;
/** Per-event ticket rows read for totals; overflow is flagged, not hidden. */
export const INTELLIGENCE_TICKET_ROW_LIMIT = 500;

const ticketTotalsSchema = z.object({
  orders: z.number().int().min(0),
  grossByCurrency: z.record(z.string(), z.number().min(0)),
  byStatus: z.record(z.string(), z.number().int().min(0)),
  truncated: z.boolean(),
});

const eventPerformanceSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  city: z.string().nullable(),
  published: z.boolean(),
  status: z.string(),
  /** Null when the live row sets no start (shown as "Date to be announced"). */
  startsAt: z.string().nullable(),
  capacity: z.number().int(),
  attendeeCount: z.number().int().min(0),
  /** Whole-percent fill; null when the event sets no capacity. */
  fillPct: z.number().int().min(0).nullable(),
  priceFrom: z.number().nullable(),
  currency: z.string(),
  rsvps: z.number().int().min(0).nullable(),
  saves: z.number().int().min(0).nullable(),
  tickets: ticketTotalsSchema.nullable(),
});

export const eventPerformanceListSchema = z.object({
  events: z.array(eventPerformanceSchema),
  total: z.number().int().min(0),
});

export type EventPerformanceRow = z.infer<typeof eventPerformanceSchema>;
export type EventPerformanceList = z.infer<typeof eventPerformanceListSchema>;

export interface EventPerformanceInput {
  q?: string;
  limit?: number;
  offset?: number;
  /** Engagement sub-counts (RSVPs/saves/tickets) or null when unpermitted. */
  includeEngagement: boolean;
}

function moneyAmount(value: unknown): number | null {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

/**
 * One page of per-event performance rows, newest events first. Engagement
 * figures are null (shown as "Unavailable") when the caller may not see
 * them — never a misleading zero.
 */
export async function listEventPerformance(
  db: IntelligenceDb,
  input: EventPerformanceInput,
): Promise<EventPerformanceList> {
  const limit = Math.min(
    Math.max(input.limit ?? 10, 1),
    INTELLIGENCE_EVENTS_PAGE_LIMIT,
  );
  const offset = Math.max(input.offset ?? 0, 0);
  const term = (input.q ?? "").trim().slice(0, 120);
  let query = db
    .from("events")
    .select(
      "id,title,category,city,published,status,starts_at,capacity,attendee_count,price_from,currency",
      { count: "exact" },
    );
  if (term) {
    query = query.or(
      `title.ilike.%${term}%,city.ilike.%${term}%,venue_name.ilike.%${term}%`,
    );
  }
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error("[admin] intelligence events list failed:", error.message);
    throw new AdminBackendError("Could not load intelligence data. Please try again.");
  }
  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    category: string;
    city: string | null;
    published: boolean;
    status: string;
    starts_at: string;
    capacity: number;
    attendee_count: number;
    price_from: number | null;
    currency: string;
  }>;

  const events: EventPerformanceRow[] = [];
  for (const row of rows) {
    events.push(await buildEventPerformanceRow(db, row, input.includeEngagement));
  }

  const parsed = eventPerformanceListSchema.safeParse({ events, total: count ?? 0 });
  if (!parsed.success) {
    console.error("[admin] intelligence events failed validation:", parsed.error.flatten());
    throw new AdminBackendError("Could not load intelligence data. Please try again.");
  }
  return parsed.data;
}

/**
 * Live event row as read. Every display column is treated as nullable even
 * where migrations declare NOT NULL: a single divergent row must degrade
 * one card, never the whole page. Only the primary key stays strict.
 */
interface EventPerformanceSourceRow {
  id: string;
  title: string | null;
  category: string | null;
  city: string | null;
  published: boolean | null;
  status: string | null;
  starts_at: string | null;
  capacity: number | null;
  attendee_count: number | null;
  price_from: number | string | null;
  currency: string | null;
}

function warnCoerced(eventId: string, column: string): void {
  console.warn(
    `[admin] intelligence coerced null ${column} for event ${eventId}; check live data.`,
  );
}

async function buildEventPerformanceRow(
  db: IntelligenceDb,
  row: EventPerformanceSourceRow,
  includeEngagement: boolean,
): Promise<EventPerformanceRow> {
  let rsvps: number | null = null;
  let saves: number | null = null;
  let tickets: z.infer<typeof ticketTotalsSchema> | null = null;
  if (includeEngagement) {
    [rsvps, saves] = await Promise.all([
      takeCount(
        db.from("event_attendees").select("id", { count: "exact", head: true }).eq("event_id", row.id),
        `rsvps for ${row.id}`,
      ),
      takeCount(
        db.from("saved_events").select("id", { count: "exact", head: true }).eq("event_id", row.id),
        `saves for ${row.id}`,
      ),
    ]);
    const { data: ticketRows, error: ticketError } = await db
      .from("ticket_orders")
      .select("status,total_amount,currency")
      .eq("event_id", row.id)
      .limit(INTELLIGENCE_TICKET_ROW_LIMIT);
    if (ticketError) {
      console.error(
        `[admin] intelligence tickets for ${row.id} failed:`,
        (ticketError as { message?: string }).message ?? ticketError,
      );
      throw new AdminBackendError("Could not load intelligence data. Please try again.");
    }
    const grossByCurrency: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const orders = (ticketRows ?? []) as Array<{
      status: string;
      total_amount: number | string;
      currency: string;
    }>;
    for (const order of orders) {
      byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
      const amount = moneyAmount(order.total_amount);
      if (amount !== null) {
        const code = order.currency || "NGN";
        grossByCurrency[code] = (grossByCurrency[code] ?? 0) + amount;
      }
    }
    tickets = {
      orders: orders.length,
      grossByCurrency,
      byStatus,
      truncated: orders.length >= INTELLIGENCE_TICKET_ROW_LIMIT,
    };
  }
  const title = row.title ?? "(Untitled event)";
  if (row.title === null) warnCoerced(row.id, "title");
  const category = row.category || "Unspecified";
  if (!row.category) warnCoerced(row.id, "category");
  const published = row.published ?? false;
  if (row.published === null) warnCoerced(row.id, "published");
  const status = row.status ?? "unknown";
  if (row.status === null) warnCoerced(row.id, "status");
  const capacity = row.capacity ?? 0;
  if (row.capacity === null) warnCoerced(row.id, "capacity");
  const attendeeCount = row.attendee_count ?? 0;
  if (row.attendee_count === null) warnCoerced(row.id, "attendee_count");
  const currency = row.currency || "NGN";
  if (!row.currency) warnCoerced(row.id, "currency");
  return {
    id: row.id,
    title,
    category,
    city: row.city,
    published,
    status,
    startsAt: row.starts_at,
    capacity,
    attendeeCount,
    fillPct: capacity > 0 ? Math.round((attendeeCount / capacity) * 100) : null,
    priceFrom: moneyAmount(row.price_from),
    currency,
    rsvps,
    saves,
    tickets,
  };
}

/** Single-event performance for on-demand AI summaries. */
export async function getEventPerformance(
  db: IntelligenceDb,
  eventId: string,
  includeEngagement: boolean,
): Promise<EventPerformanceRow> {
  const { data, error } = await db
    .from("events")
    .select(
      "id,title,category,city,published,status,starts_at,capacity,attendee_count,price_from,currency",
    )
    .eq("id", eventId)
    .limit(1);
  if (error) {
    console.error("[admin] intelligence event lookup failed:", error.message);
    throw new AdminBackendError("Could not load intelligence data. Please try again.");
  }
  const row = ((data ?? []) as EventPerformanceSourceRow[])[0];
  if (!row) {
    throw new AdminBackendError("That event no longer exists.");
  }
  return buildEventPerformanceRow(db, row, includeEngagement);
}

// ── Platform trends ──────────────────────────────────────────────────────

export interface IntelligenceTrendToggles {
  events: boolean;
  rsvps: boolean;
  users: boolean;
  organizers: boolean;
  saves: boolean;
  tickets: boolean;
  reports: boolean;
}

export const intelligenceTrendsSchema = z.object({
  generatedAt: z.string(),
  windowDays: z.number().int(),
  events: seriesSchema.nullable(),
  rsvps: seriesSchema.nullable(),
  users: seriesSchema.nullable(),
  organizers: seriesSchema.nullable(),
  saves: seriesSchema.nullable(),
  tickets: seriesSchema.nullable(),
  reports: seriesSchema.nullable(),
});

export type IntelligenceTrends = z.infer<typeof intelligenceTrendsSchema>;

export interface IntelligenceTrendsInput {
  windowDays: number;
  include: IntelligenceTrendToggles;
  /** Clock override for tests (ISO instant). */
  nowIso?: string;
}

/** One daily series per included domain over the trailing window. */
export async function getIntelligenceTrends(
  db: IntelligenceDb,
  input: IntelligenceTrendsInput,
): Promise<IntelligenceTrends> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const sinceIso = seriesStartIso(nowIso, input.windowDays);
  const untilIso = new Date(
    Date.parse(sinceIso) + input.windowDays * 86_400_000,
  ).toISOString();
  const one = (
    enabled: boolean,
    table: SeriesTable,
  ): Promise<z.infer<typeof seriesSchema> | null> =>
    enabled
      ? takeSeries(db, table, sinceIso, untilIso, input.windowDays, nowIso)
      : Promise.resolve(null);
  const [events, rsvps, users, organizers, saves, tickets, reports] = await Promise.all([
    one(input.include.events, "events"),
    one(input.include.rsvps, "event_attendees"),
    one(input.include.users, "profiles"),
    one(input.include.organizers, "organizers"),
    one(input.include.saves, "saved_events"),
    one(input.include.tickets, "ticket_orders"),
    one(input.include.reports, "event_reports"),
  ]);
  const parsed = intelligenceTrendsSchema.safeParse({
    generatedAt: nowIso,
    windowDays: input.windowDays,
    events,
    rsvps,
    users,
    organizers,
    saves,
    tickets,
    reports,
  });
  if (!parsed.success) {
    console.error("[admin] intelligence trends failed validation:", parsed.error.flatten());
    throw new AdminBackendError("Could not load intelligence data. Please try again.");
  }
  return parsed.data;
}

// ── Category and location distribution ───────────────────────────────────

const DISTRIBUTION_EVENT_LIMIT = 2000;
const DISTRIBUTION_SIGNAL_LIMIT = 5000;
const DISTRIBUTION_ITEMS_MAX = 15;

const distributionSchema = z.object({
  items: z.array(z.object({ label: z.string(), count: z.number().int().min(0) })),
  /** Rows folded outside the top items (long tail + unmatched). */
  other: z.number().int().min(0),
  truncated: z.boolean(),
});

export const intelligenceDistributionSchema = z.object({
  generatedAt: z.string(),
  eventsByCategory: distributionSchema.nullable(),
  eventsByCity: distributionSchema.nullable(),
  rsvpsByCategory: distributionSchema.nullable(),
  savesByCategory: distributionSchema.nullable(),
});

export type IntelligenceDistribution = z.infer<typeof intelligenceDistributionSchema>;

function topDistribution(counts: Map<string, number>): z.infer<typeof distributionSchema> {
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const items = ranked
    .slice(0, DISTRIBUTION_ITEMS_MAX)
    .map(([label, count]) => ({ label, count }));
  const other = ranked.slice(DISTRIBUTION_ITEMS_MAX).reduce((sum, [, count]) => sum + count, 0);
  return { items, other, truncated: false };
}

export interface IntelligenceDistributionInput {
  includeEvents: boolean;
  includeEngagement: boolean;
  /** Clock override for tests (ISO instant). */
  nowIso?: string;
}

/**
 * Event mix by category/city plus RSVP and save activity by category,
 * joined in memory from bounded reads. Small platform, exact numbers;
 * the caps and flags keep it honest if the platform outgrows them.
 */
export async function getIntelligenceDistribution(
  db: IntelligenceDb,
  input: IntelligenceDistributionInput,
): Promise<IntelligenceDistribution> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const { data: eventRows, error: eventsError } = await db
    .from("events")
    .select("id,category,city")
    .limit(DISTRIBUTION_EVENT_LIMIT);
  if (eventsError) {
    console.error("[admin] intelligence distribution events failed:", eventsError.message);
    throw new AdminBackendError("Could not load intelligence data. Please try again.");
  }
  const events = (eventRows ?? []) as Array<{ id: string; category: string; city: string | null }>;
  const eventsTruncated = events.length >= DISTRIBUTION_EVENT_LIMIT;
  const categoryOf = new Map(events.map((event) => [event.id, event.category || "Unspecified"]));

  let rsvpEventIds: string[] = [];
  let rsvpsTruncated = false;
  let saveEventIds: string[] = [];
  let savesTruncated = false;
  if (input.includeEngagement) {
    const [rsvps, saves] = await Promise.all([
      db.from("event_attendees").select("event_id").limit(DISTRIBUTION_SIGNAL_LIMIT),
      db.from("saved_events").select("event_id").limit(DISTRIBUTION_SIGNAL_LIMIT),
    ]);
    if (rsvps.error) {
      console.error(
        "[admin] intelligence distribution rsvps failed:",
        (rsvps.error as { message?: string }).message ?? rsvps.error,
      );
      throw new AdminBackendError("Could not load intelligence data. Please try again.");
    }
    if (saves.error) {
      console.error(
        "[admin] intelligence distribution saves failed:",
        (saves.error as { message?: string }).message ?? saves.error,
      );
      throw new AdminBackendError("Could not load intelligence data. Please try again.");
    }
    const rsvpRows = (rsvps.data ?? []) as Array<{ event_id: string }>;
    const saveRows = (saves.data ?? []) as Array<{ event_id: string }>;
    rsvpEventIds = rsvpRows.map((row) => row.event_id);
    rsvpsTruncated = rsvpRows.length >= DISTRIBUTION_SIGNAL_LIMIT;
    saveEventIds = saveRows.map((row) => row.event_id);
    savesTruncated = saveRows.length >= DISTRIBUTION_SIGNAL_LIMIT;
  }

  const byCategory = new Map<string, number>();
  const byCity = new Map<string, number>();
  for (const event of events) {
    const category = event.category || "Unspecified";
    const city = event.city || "Unspecified";
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    byCity.set(city, (byCity.get(city) ?? 0) + 1);
  }
  const countByCategory = (eventIds: string[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const eventId of eventIds) {
      const category = categoryOf.get(eventId) ?? "Unspecified";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  };

  const eventsByCategory = input.includeEvents ? topDistribution(byCategory) : null;
  if (eventsByCategory) eventsByCategory.truncated = eventsTruncated;
  const eventsByCity = input.includeEvents ? topDistribution(byCity) : null;
  if (eventsByCity) eventsByCity.truncated = eventsTruncated;
  const rsvpsByCategory = input.includeEngagement ? topDistribution(countByCategory(rsvpEventIds)) : null;
  if (rsvpsByCategory) rsvpsByCategory.truncated = rsvpsTruncated || eventsTruncated;
  const savesByCategory = input.includeEngagement ? topDistribution(countByCategory(saveEventIds)) : null;
  if (savesByCategory) savesByCategory.truncated = savesTruncated || eventsTruncated;

  const parsed = intelligenceDistributionSchema.safeParse({
    generatedAt: nowIso,
    eventsByCategory,
    eventsByCity,
    rsvpsByCategory,
    savesByCategory,
  });
  if (!parsed.success) {
    console.error("[admin] intelligence distribution failed validation:", parsed.error.flatten());
    throw new AdminBackendError("Could not load intelligence data. Please try again.");
  }
  return parsed.data;
}
