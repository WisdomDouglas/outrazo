// Server-only Admin Intelligence watchlist + recommendations data (Phase 2).
//
// Bounded reads over existing tables feed the deterministic detection
// engine; results are schema-validated before leaving the server. Report
// queries never select reporter identities or free-text details, and audit
// reads take action counts only — no actor PII. The AI never sees these
// rows directly: explanations receive one finding's figures, nothing more.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  AdminBackendError,
  type AdminPhase1Db,
} from "./require-permission.server";
import {
  buildRecommendations,
  detectAnomalies,
  type AnomalyRule,
  type Confidence,
  type DetectionInput,
  type RecommendationKind,
  type Severity,
} from "./intelligence-detection";

export const WATCHLIST_EVENTS_LIMIT = 2000;
export const WATCHLIST_RSVPS_LIMIT = 10000;
export const WATCHLIST_SAVES_LIMIT = 5000;
export const WATCHLIST_REPORTS_LIMIT = 5000;
export const WATCHLIST_AUDIT_LIMIT = 5000;
export const WATCHLIST_ORGANIZERS_LIMIT = 2000;
export const WATCHLIST_AUDIT_DAYS = 30;

const severitySchema = z.enum(["Low", "Medium", "High"]);
const anomalyRuleSchema = z.enum([
  "report_spike",
  "rsvp_surge",
  "over_capacity",
  "publish_churn",
  "event_flapping",
  "moderation_burst",
]);

const findingSchema = z.object({
  key: z.string().min(1),
  rule: anomalyRuleSchema,
  eventId: z.string().uuid().nullable(),
  eventTitle: z.string().nullable(),
  severity: severitySchema,
  figures: z.record(z.string(), z.union([z.number(), z.string()])),
  ruleText: z.string().min(1),
  thresholdText: z.string().min(1),
  detectedAt: z.string(),
});

const baselineSchema = z.object({
  status: z.enum(["ok", "insufficient"]),
  have: z.number().int().min(0),
  need: z.number().int().min(0),
  note: z.string(),
});

export const watchlistSchema = z.object({
  generatedAt: z.string(),
  findings: z.array(findingSchema),
  baselines: z.object({ rsvpVelocity: baselineSchema.nullable() }),
  truncatedSources: z.array(z.string()),
  notes: z.array(z.string()),
});

export type AnomalyWatchlist = z.infer<typeof watchlistSchema>;
export type { AnomalyRule, Severity };

const recommendationKindSchema = z.enum([
  "consider_featuring",
  "moderation_review",
  "low_engagement",
  "organizer_attention",
]);

const recommendationSchema = z.object({
  key: z.string().min(1),
  kind: recommendationKindSchema,
  title: z.string().min(1),
  explanation: z.string().min(1),
  evidence: z.record(z.string(), z.union([z.number(), z.string()])),
  confidence: z.enum(["Low", "Medium", "High"]),
  eventId: z.string().uuid().nullable(),
  eventTitle: z.string().nullable(),
  organizerId: z.string().uuid().nullable(),
  organizerName: z.string().nullable(),
  link: z.object({ to: z.string().min(1), label: z.string().min(1) }),
});

export const recommendationsSchema = z.object({
  generatedAt: z.string(),
  items: z.array(recommendationSchema),
  truncatedSources: z.array(z.string()),
  notes: z.array(z.string()),
});

export type IntelligenceRecommendations = z.infer<typeof recommendationsSchema>;
export type { Confidence, RecommendationKind };

type WatchlistDb = SupabaseClient<AdminPhase1Db>;

async function takeRows<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    console.error(`[admin] intelligence ${label} failed:`, error.message);
    throw new AdminBackendError("Could not load intelligence data. Please try again.");
  }
  return (data ?? []) as T[];
}

interface RawEventRow {
  id: string;
  title: string | null;
  category: string | null;
  city: string | null;
  published: boolean | null;
  status: string | null;
  starts_at: string | null;
  capacity: number | null;
  attendee_count: number | null;
  created_at: string | null;
  organizer_id: string;
}

/** Bounded detection input plus the list of capped sources. */
export async function fetchDetectionInput(
  db: WatchlistDb,
  nowIso: string,
): Promise<{ input: DetectionInput; truncatedSources: string[] }> {
  const sinceAudit = new Date(Date.parse(nowIso) - WATCHLIST_AUDIT_DAYS * 86_400_000).toISOString();
  const [eventRows, rsvpRows, saveRows, reportRows, auditRows, organizerRows] = await Promise.all([
    takeRows<RawEventRow>(
      db.from("events").select(
        "id,title,category,city,published,status,starts_at,capacity,attendee_count,created_at,organizer_id",
      ).limit(WATCHLIST_EVENTS_LIMIT),
      "watchlist events",
    ),
    takeRows<{ event_id: string; created_at: string }>(
      db.from("event_attendees").select("event_id,created_at").limit(WATCHLIST_RSVPS_LIMIT),
      "watchlist rsvps",
    ),
    takeRows<{ event_id: string }>(
      db.from("saved_events").select("event_id").limit(WATCHLIST_SAVES_LIMIT),
      "watchlist saves",
    ),
    takeRows<{ event_id: string; status: string; reason: string; created_at: string }>(
      db.from("event_reports").select("event_id,status,reason,created_at").limit(WATCHLIST_REPORTS_LIMIT),
      "watchlist reports",
    ),
    takeRows<{ action: string; entity_type: string; entity_id: string | null; created_at: string }>(
      db.from("audit_log").select("action,entity_type,entity_id,created_at")
        .gte("created_at", sinceAudit)
        .limit(WATCHLIST_AUDIT_LIMIT),
      "watchlist audit",
    ),
    takeRows<{ id: string; name: string }>(
      db.from("organizers").select("id,name").limit(WATCHLIST_ORGANIZERS_LIMIT),
      "watchlist organizers",
    ),
  ]);
  const truncatedSources: string[] = [];
  if (eventRows.length >= WATCHLIST_EVENTS_LIMIT) truncatedSources.push("events");
  if (rsvpRows.length >= WATCHLIST_RSVPS_LIMIT) truncatedSources.push("rsvps");
  if (saveRows.length >= WATCHLIST_SAVES_LIMIT) truncatedSources.push("saves");
  if (reportRows.length >= WATCHLIST_REPORTS_LIMIT) truncatedSources.push("reports");
  if (auditRows.length >= WATCHLIST_AUDIT_LIMIT) truncatedSources.push("audit");
  if (organizerRows.length >= WATCHLIST_ORGANIZERS_LIMIT) truncatedSources.push("organizers");

  return {
    input: {
      events: eventRows.map((row) => ({
        id: row.id,
        title: row.title ?? "(Untitled event)",
        category: row.category || "Unspecified",
        city: row.city,
        published: row.published ?? false,
        status: row.status ?? "unknown",
        startsAt: row.starts_at,
        capacity: row.capacity ?? 0,
        attendeeCount: row.attendee_count ?? 0,
        createdAt: row.created_at,
        organizerId: row.organizer_id,
      })),
      rsvps: rsvpRows.map((row) => ({ eventId: row.event_id, createdAt: row.created_at })),
      saves: saveRows.map((row) => ({ eventId: row.event_id })),
      reports: reportRows.map((row) => ({
        eventId: row.event_id,
        status: row.status,
        reason: row.reason,
        createdAt: row.created_at,
      })),
      audits: auditRows.map((row) => ({
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        createdAt: row.created_at,
      })),
      organizers: organizerRows.map((row) => ({ id: row.id, name: row.name })),
      rsvpsTruncated: rsvpRows.length >= WATCHLIST_RSVPS_LIMIT,
    },
    truncatedSources,
  };
}

export interface WatchlistInput {
  includeRules: AnomalyRule[];
  /** Nulls the velocity baseline when the role may not see RSVP volume. */
  includeVelocityBaseline: boolean;
  nowIso?: string;
}

/**
 * Permission-shaped watchlist: only findings for allowed rules are returned.
 * Zero-assertion rules pause on capped reads rather than reasoning from
 * partial data.
 */
export async function getAnomalyWatchlistData(
  db: WatchlistDb,
  input: WatchlistInput,
): Promise<AnomalyWatchlist> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const { input: detection, truncatedSources } = await fetchDetectionInput(db, nowIso);
  const evaluated = detectAnomalies(detection, nowIso);
  const allowed = new Set(input.includeRules);
  const parsed = watchlistSchema.safeParse({
    generatedAt: nowIso,
    findings: evaluated.findings.filter((finding) => allowed.has(finding.rule)),
    baselines: {
      rsvpVelocity: input.includeVelocityBaseline ? evaluated.baselines.rsvpVelocity : null,
    },
    truncatedSources,
    notes: truncatedSources.length > 0
      ? ["Some lists were capped on a large dataset; counts are floors, not exact."]
      : [],
  });
  if (!parsed.success) {
    console.error("[admin] intelligence watchlist failed validation:", parsed.error.flatten());
    throw new AdminBackendError("Could not load intelligence data. Please try again.");
  }
  return parsed.data;
}

export interface RecommendationsInput {
  includeKinds: RecommendationKind[];
  nowIso?: string;
}

/**
 * Permission-shaped recommendations. Quiet-listing detection needs complete
 * engagement reads: on capped RSVP/save lists it pauses with an honest note
 * instead of asserting zeros it cannot prove.
 */
export async function getRecommendationsData(
  db: WatchlistDb,
  input: RecommendationsInput,
): Promise<IntelligenceRecommendations> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const { input: detection, truncatedSources } = await fetchDetectionInput(db, nowIso);
  const allowed = new Set(input.includeKinds);
  const engagementCapped =
    truncatedSources.includes("rsvps") || truncatedSources.includes("saves");
  const items = buildRecommendations(detection, nowIso).filter(
    (item) =>
      allowed.has(item.kind) && !(engagementCapped && item.kind === "low_engagement"),
  );
  const notes: string[] = [];
  if (truncatedSources.length > 0) {
    notes.push("Some lists were capped on a large dataset; counts are floors, not exact.");
  }
  if (engagementCapped) {
    notes.push("Quiet-listing detection paused: engagement reads were capped.");
  }
  const parsed = recommendationsSchema.safeParse({
    generatedAt: nowIso,
    items,
    truncatedSources,
    notes,
  });
  if (!parsed.success) {
    console.error("[admin] intelligence recommendations failed validation:", parsed.error.flatten());
    throw new AdminBackendError("Could not load intelligence data. Please try again.");
  }
  return parsed.data;
}
