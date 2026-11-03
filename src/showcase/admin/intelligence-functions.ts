// Admin Intelligence server functions (Phase 2C-3, Phase 0).
//
// Thin bridge over the aggregates module: proves WHO is calling (auth),
// WHAT they may see (per-section read permissions, null when absent), and
// returns the validated snapshot. Read-only: no mutation, no AI call, and
// no admin action exists on this path — later phases add narration and
// interactivity behind the same gates.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { MetaError, metaChatJson } from "@/integrations/meta/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canSeeMetric, roleHasPermission, type AdminRole } from "./permissions";
import {
  AdminBackendError,
  AdminForbiddenError,
  asAdminDb,
  getCallerRole,
  requirePermission,
  type AdminPhase1Db,
} from "./require-permission.server";
import {
  buildIntelligenceSnapshot,
  getEventPerformance,
  getIntelligenceDistribution as fetchIntelligenceDistribution,
  getIntelligenceTrends as fetchIntelligenceTrends,
  INTELLIGENCE_EVENTS_PAGE_LIMIT,
  intelligenceWindowSchema,
  listEventPerformance,
  type EventPerformanceList,
  type EventPerformanceRow,
  type IntelligenceDistribution,
  type IntelligenceSnapshot,
  type IntelligenceTrends,
} from "./intelligence-aggregates.server";
import {
  buildBriefFigures,
  buildFiguresBlock,
  buildGroundedInstruction,
  ANOMALY_EXPLANATION_JSON_SCHEMA,
  anomalyExplanationSchema,
  ASSISTANT_ANSWER_JSON_SCHEMA,
  assistantAnswerSchema,
  CATEGORY_OBSERVATIONS_JSON_SCHEMA,
  categoryObservationsSchema,
  describeNarrationPayload,
  EVENT_SUMMARY_JSON_SCHEMA,
  eventSummarySchema,
  extractNarrationContent,
  PLATFORM_BRIEF_JSON_SCHEMA,
  platformBriefSchema,
  shouldRetryNarration,
  significantChange,
  type AnomalyExplanationText,
  type AssistantAnswerText,
  type BriefWindowChange,
  type CategoryObservationsText,
  type EventSummaryText,
  type PlatformBriefText,
} from "./intelligence-narration";
import {
  findingAllowed,
  REC_PERMISSIONS,
  recommendationAllowed,
  RULE_PERMISSIONS,
  type AnomalyRule,
  type RecommendationKind,
} from "./intelligence-detection";
import {
  ASSISTANT_INTENT_META,
  ASSISTANT_QUESTION_MAX_CHARS,
  assistantAllowed,
  classifyAssistantQuestion,
  type AssistantIntent,
} from "./intelligence-assistant";
import {
  getAnomalyWatchlistData,
  getRecommendationsData,
  type AnomalyWatchlist,
  type IntelligenceRecommendations,
} from "./intelligence-anomalies.server";

export type {
  EventPerformanceList,
  EventPerformanceRow,
  IntelligenceDistribution,
  IntelligenceSnapshot,
  IntelligenceTrends,
  AnomalyWatchlist,
  IntelligenceRecommendations,
  AnomalyExplanationText,
  AssistantAnswerText,
  EventSummaryText,
  PlatformBriefText,
  CategoryObservationsText,
};

// Generous completion budget: outputs stay small (schema-capped), but the
// headroom absorbs provider-side reasoning so answers are not starved out.
const INTELLIGENCE_NARRATION_TOKENS = 4096;
const INTELLIGENCE_NARRATION_TIMEOUT_MS = 30_000;

/**
 * Maps shared-transport failures to this feature's user-facing messages.
 * AI text is advisory and on-demand; every failure degrades to an honest
 * error while the verified aggregates underneath keep working.
 */
function mapIntelligenceError(caught: unknown): Error {
  if (caught instanceof MetaError) {
    switch (caught.code) {
      case "config":
        return new Error("Event intelligence is not set up yet. Please try again later.");
      case "timeout":
        return new Error("Event intelligence took too long to answer. Please try again.");
      case "network":
        return new Error("Could not reach the AI service. Check your connection and try again.");
      case "unauthorized":
        return new Error("The AI service rejected its credentials. Please tell the site administrator.");
      case "rate_limited":
        return new Error("Event intelligence is busy right now. Please wait a moment and try again.");
      case "server":
        return new Error("The AI service is unavailable right now. Please try again later.");
      case "malformed":
        return new Error("The AI service returned an unreadable response. Please try again.");
      case "bad_request":
        return new Error("Event intelligence could not complete that request. Please try again.");
    }
  }
  return caught instanceof Error
    ? caught
    : new Error("Event intelligence could not complete that request. Please try again.");
}

async function narrate<T>(
  task: string,
  figures: unknown,
  schemaName: string,
  jsonSchema: unknown,
  parse: (value: unknown) => T | null,
): Promise<T> {
  // One silent retry for degenerate model output: cutoffs, empties, missing
  // choices, and unparsable JSON are often transient, and a fresh sample
  // usually resolves them. Transport failures and refusals throw at once.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let status: number;
    let payload: unknown;
    try {
      ({ status, payload } = await metaChatJson({
        messages: [
          { role: "developer", content: buildGroundedInstruction(task) },
          { role: "user", content: buildFiguresBlock(figures) },
        ],
        schemaName,
        jsonSchema,
        maxTokens: INTELLIGENCE_NARRATION_TOKENS,
        timeoutMs: INTELLIGENCE_NARRATION_TIMEOUT_MS,
        logPrefix: "[intelligence]",
      }));
    } catch (caught) {
      throw mapIntelligenceError(caught);
    }
    const extracted = extractNarrationContent(payload);
    if (!extracted.ok) {
      // Structural diagnostics only: HTTP status, failure reason, payload
      // shape. Never model text, keys, headers, or bodies.
      console.error(
        "[intelligence] unusable Meta payload",
        JSON.stringify({
          status,
          attempt,
          reason: extracted.reason,
          ...describeNarrationPayload(payload),
        }),
      );
      if (shouldRetryNarration(extracted.reason, attempt)) continue;
      if (extracted.reason === "refusal") {
        throw new Error("The AI service declined that request. Please try again.");
      }
      if (extracted.reason === "length_cutoff") {
        throw new Error("The AI response was cut short. Please try again.");
      }
      if (extracted.reason === "no_choices") {
        throw new Error("The AI service returned no answer. Please try again.");
      }
      throw new Error("The AI response was empty. Please try again.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(extracted.content) as unknown;
    } catch {
      if (shouldRetryNarration("invalid_json", attempt)) continue;
      throw new Error("The AI response was incomplete. Please try again.");
    }
    const checked = parse(parsed);
    if (checked === null) {
      if (shouldRetryNarration("invalid_json", attempt)) continue;
      throw new Error("The AI response was incomplete. Please try again.");
    }
    return checked;
  }
  throw new Error("The AI response was incomplete. Please try again.");
}

async function requireAdminRole(context: unknown): Promise<AdminRole> {
  const ctx = context as { supabase?: unknown };
  if (!ctx.supabase) {
    throw new AdminForbiddenError("Sign in is required.");
  }
  const role = await getCallerRole(
    ctx.supabase as Parameters<typeof getCallerRole>[number],
  );
  if (!role) {
    throw new AdminForbiddenError(
      "You do not have permission to access the admin console.",
    );
  }
  return role;
}

export const getIntelligenceSnapshot = createServerFn({ method: "GET" })
  .validator(intelligenceWindowSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<IntelligenceSnapshot> => {
    const role = await requireAdminRole(context);
    const db = asAdminDb(supabaseAdmin);
    return await buildIntelligenceSnapshot(db, {
      windowDays: data.windowDays,
      include: {
        events: canSeeMetric(role, "events"),
        rsvps: canSeeMetric(role, "rsvps"),
        users: canSeeMetric(role, "users"),
        organizers: canSeeMetric(role, "organizers"),
      },
    });
  });

export const listIntelligenceEvents = createServerFn({ method: "GET" })
  .validator(
    z.object({
      q: z.string().max(120).default(""),
      limit: z.number().int().min(1).max(INTELLIGENCE_EVENTS_PAGE_LIMIT).default(10),
      offset: z.number().int().min(0).default(0),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<EventPerformanceList> => {
    const grant = await requirePermission(context, "events.read");
    const db = asAdminDb(grant.supabase);
    return await listEventPerformance(db, {
      q: data.q,
      limit: data.limit,
      offset: data.offset,
      includeEngagement: roleHasPermission(grant.role, "attendees.read"),
    });
  });

export const getIntelligenceTrends = createServerFn({ method: "GET" })
  .validator(intelligenceWindowSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<IntelligenceTrends> => {
    const role = await requireAdminRole(context);
    const db = asAdminDb(supabaseAdmin);
    const engagement = roleHasPermission(role, "attendees.read");
    return await fetchIntelligenceTrends(db, {
      windowDays: data.windowDays,
      include: {
        events: canSeeMetric(role, "events"),
        rsvps: canSeeMetric(role, "rsvps"),
        users: canSeeMetric(role, "users"),
        organizers: canSeeMetric(role, "organizers"),
        saves: engagement,
        tickets: engagement,
        reports: roleHasPermission(role, "reports.read"),
      },
    });
  });

export const getIntelligenceDistribution = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntelligenceDistribution> => {
    const role = await requireAdminRole(context);
    const db = asAdminDb(supabaseAdmin);
    return await fetchIntelligenceDistribution(db, {
      includeEvents: canSeeMetric(role, "events"),
      includeEngagement: roleHasPermission(role, "attendees.read"),
    });
  });

export interface EventSummaryResult extends EventSummaryText {
  eventId: string;
  title: string;
  generatedAt: string;
  figures: EventPerformanceRow;
}

export const generateEventSummary = createServerFn({ method: "POST" })
  .validator(z.object({ eventId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<EventSummaryResult> => {
    const grant = await requirePermission(context, "events.read");
    const db = asAdminDb(grant.supabase);
    const figures = await getEventPerformance(
      db,
      data.eventId,
      roleHasPermission(grant.role, "attendees.read"),
    );
    const text = await narrate<EventSummaryText>(
      "Summarize this event's performance for a staff reviewer in two or three sentences, then list up to four short, factual takeaways.",
      figures,
      "EventSummary",
      EVENT_SUMMARY_JSON_SCHEMA,
      (value) => {
        const checked = eventSummarySchema.safeParse(value);
        return checked.success ? checked.data : null;
      },
    );
    return {
      eventId: figures.id,
      title: figures.title,
      generatedAt: new Date().toISOString(),
      figures,
      ...text,
    };
  });

export interface PlatformBriefResult extends PlatformBriefText {
  generatedAt: string;
  windowDays: number;
  figures: IntelligenceSnapshot;
}

export const generatePlatformBrief = createServerFn({ method: "POST" })
  .validator(intelligenceWindowSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<PlatformBriefResult> => {
    const role = await requireAdminRole(context);
    const db = asAdminDb(supabaseAdmin);
    const snapshot = await buildIntelligenceSnapshot(db, {
      windowDays: data.windowDays,
      include: {
        events: canSeeMetric(role, "events"),
        rsvps: canSeeMetric(role, "rsvps"),
        users: canSeeMetric(role, "users"),
        organizers: canSeeMetric(role, "organizers"),
      },
    });
    // Window halves compared with the small-data floor: at low volume every
    // change stays null and the brief honestly reports insufficient history.
    const changes: BriefWindowChange[] = [];
    const halves = (
      metric: string,
      points: Array<{ count: number }> | undefined,
    ): void => {
      if (!points || points.length < 2) return;
      const mid = Math.floor(points.length / 2);
      const previous = points.slice(0, mid).reduce((sum, point) => sum + point.count, 0);
      const current = points.slice(mid).reduce((sum, point) => sum + point.count, 0);
      const change = significantChange(current, previous);
      if (change) {
        changes.push({ metric, current, previous, delta: change.delta, pct: change.pct });
      }
    };
    halves("events", snapshot.events?.series.points);
    halves("rsvps", snapshot.rsvps?.series.points);
    halves("users", snapshot.users?.series.points);
    halves("organizers", snapshot.organizers?.series.points);
    const text = await narrate<PlatformBriefText>(
      "Write a staff briefing headline (always required, even when activity is quiet) plus up to five short highlights from these platform figures and window changes. Keep the entire reply under 120 words. Mention a change only if it appears in the changes list; otherwise say plainly when history is too thin for trends.",
      buildBriefFigures(snapshot, changes),
      "PlatformBrief",
      PLATFORM_BRIEF_JSON_SCHEMA,
      (value) => {
        const checked = platformBriefSchema.safeParse(value);
        return checked.success ? checked.data : null;
      },
    );
    return {
      generatedAt: new Date().toISOString(),
      windowDays: data.windowDays,
      figures: snapshot,
      ...text,
    };
  });

export interface CategoryObservationsResult extends CategoryObservationsText {
  generatedAt: string;
  figures: IntelligenceDistribution;
}

export const generateCategoryObservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CategoryObservationsResult> => {
    const grant = await requirePermission(context, "events.read");
    const db = asAdminDb(grant.supabase);
    const figures = await fetchIntelligenceDistribution(db, {
      includeEvents: true,
      includeEngagement: roleHasPermission(grant.role, "attendees.read"),
    });
    const text = await narrate<CategoryObservationsText>(
      "Write up to five short observations about the event mix and where audience activity concentrates, strictly from these distributions.",
      figures,
      "CategoryObservations",
      CATEGORY_OBSERVATIONS_JSON_SCHEMA,
      (value) => {
        const checked = categoryObservationsSchema.safeParse(value);
        return checked.success ? checked.data : null;
      },
    );
    return { generatedAt: new Date().toISOString(), figures, ...text };
  });

// ── Phase 2: anomaly watchlist + recommendations. ──────────────────────────
// Detection stays deterministic: the server re-runs the rules on every call
// and the AI only ever explains one finding's figures. Each role receives
// only the rules and recommendation kinds its permissions allow.

function allowedRules(role: AdminRole): AnomalyRule[] {
  return (Object.keys(RULE_PERMISSIONS) as AnomalyRule[]).filter((rule) =>
    findingAllowed(rule, role),
  );
}

function allowedKinds(role: AdminRole): RecommendationKind[] {
  return (Object.keys(REC_PERMISSIONS) as RecommendationKind[]).filter((kind) =>
    recommendationAllowed(kind, role),
  );
}

export const getAnomalyWatchlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AnomalyWatchlist> => {
    const role = await requireAdminRole(context);
    const db = asAdminDb(supabaseAdmin);
    return await getAnomalyWatchlistData(db, {
      includeRules: allowedRules(role),
      includeVelocityBaseline: roleHasPermission(role, "attendees.read"),
    });
  });

export const getIntelligenceRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntelligenceRecommendations> => {
    const role = await requireAdminRole(context);
    const db = asAdminDb(supabaseAdmin);
    return await getRecommendationsData(db, { includeKinds: allowedKinds(role) });
  });

// Same writer path as admin-functions.ts: service-role insert after the work
// it describes has happened, with a distinct failure message.
async function insertExplanationAudit(
  db: SupabaseClient<AdminPhase1Db>,
  input: { actorId: string; rule: AnomalyRule; eventId: string | null; severity: string },
): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    actor_id: input.actorId,
    action: "admin.intelligence.explain_anomaly",
    entity_type: "intelligence",
    entity_id: input.eventId,
    metadata: { rule: input.rule, severity: input.severity },
  });
  if (error) {
    console.error("[intelligence] explain_anomaly audit insert failed:", error.message);
    throw new AdminBackendError(
      "The explanation was generated, but the audit record could not be written. Refresh and try again, then report this.",
    );
  }
}

export interface AnomalyExplanationResult extends AnomalyExplanationText {
  rule: AnomalyRule;
  eventId: string | null;
  eventTitle: string | null;
  severity: string;
  generatedAt: string;
}

export const explainAnomaly = createServerFn({ method: "POST" })
  .validator(
    z.object({
      rule: z.enum([
        "report_spike",
        "rsvp_surge",
        "over_capacity",
        "publish_churn",
        "event_flapping",
        "moderation_burst",
      ]),
      eventId: z.string().uuid().nullable(),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AnomalyExplanationResult> => {
    const grant = await requirePermission(context, RULE_PERMISSIONS[data.rule][0]);
    if (!findingAllowed(data.rule, grant.role)) {
      throw new AdminForbiddenError("You do not have permission to view this finding.");
    }
    const db = asAdminDb(grant.supabase);
    // Re-detect on the server: client-supplied figures are never trusted, and
    // a finding that no longer reproduces is reported as stale, not explained.
    const watchlist = await getAnomalyWatchlistData(db, {
      includeRules: [data.rule],
      includeVelocityBaseline: roleHasPermission(grant.role, "attendees.read"),
    });
    const finding = watchlist.findings.find(
      (candidate) =>
        candidate.rule === data.rule && candidate.eventId === data.eventId,
    );
    if (!finding) {
      throw new Error("That finding is no longer current. Refresh the watchlist and try again.");
    }
    const text = await narrate<AnomalyExplanationText>(
      "Explain why this deterministic anomaly finding fired, strictly from the supplied figures: what crossed the threshold, what uncertainty or small-data limits apply, and what a staff reviewer should check next. Never restate severity as your own judgment and never recommend an administrative action as decided.",
      {
        rule: finding.rule,
        ruleText: finding.ruleText,
        thresholdText: finding.thresholdText,
        severity: finding.severity,
        eventTitle: finding.eventTitle,
        figures: finding.figures,
      },
      "AnomalyExplanation",
      ANOMALY_EXPLANATION_JSON_SCHEMA,
      (value) => {
        const checked = anomalyExplanationSchema.safeParse(value);
        return checked.success ? checked.data : null;
      },
    );
    await insertExplanationAudit(db, {
      actorId: grant.userId,
      rule: finding.rule,
      eventId: finding.eventId,
      severity: finding.severity,
    });
    return {
      rule: finding.rule,
      eventId: finding.eventId,
      eventTitle: finding.eventTitle,
      severity: finding.severity,
      generatedAt: new Date().toISOString(),
      ...text,
    };
  });

// ── Phase 3: natural-language intelligence assistant. ───────────────────────
// The question is classified by deterministic keyword scoring over a fixed
// allowlist — the model never chooses what to query and never writes SQL.
// Each intent runs one approved server aggregation; the model narrates the
// verified figures and nothing else. Figures render separately in the UI so
// readers can check the narration against the numbers.

export interface AssistantDisplayFigure {
  label: string;
  value: string;
}

export type AskAssistantResult =
  | {
      status: "answered";
      intent: AssistantIntent;
      intentLabel: string;
      windowDays: number;
      answer: string;
      caveats: string[];
      figures: AssistantDisplayFigure[];
      snapshotAt: string;
    }
  | { status: "refused"; reason: "unsupported" | "ambiguous" | "forbidden"; message: string };

async function insertAssistantAudit(
  db: SupabaseClient<AdminPhase1Db>,
  input: {
    actorId: string;
    intent: AssistantIntent | null;
    windowDays: number;
    questionChars: number;
    status: string;
  },
): Promise<void> {
  // Intent and sizes only — never the question text, which may hold PII.
  const { error } = await db.from("audit_log").insert({
    actor_id: input.actorId,
    action: "admin.intelligence.ask_assistant",
    entity_type: "intelligence",
    entity_id: null,
    metadata: {
      intent: input.intent,
      windowDays: input.windowDays,
      questionChars: input.questionChars,
      status: input.status,
    },
  });
  if (error) {
    console.error("[intelligence] ask_assistant audit insert failed:", error.message);
    throw new AdminBackendError(
      "The answer was generated, but the audit record could not be written. Refresh and try again, then report this.",
    );
  }
}

async function runAssistantIntent(
  db: SupabaseClient<AdminPhase1Db>,
  role: AdminRole,
  intent: AssistantIntent,
  windowDays: number,
): Promise<{ narrationFigures: Record<string, unknown>; display: AssistantDisplayFigure[]; task: string }> {
  const engagement = roleHasPermission(role, "attendees.read");
  switch (intent) {
    case "engagement_by_category": {
      const dist = await fetchIntelligenceDistribution(db, {
        includeEvents: true,
        includeEngagement: engagement,
      });
      const source = dist.rsvpsByCategory ?? dist.eventsByCategory;
      const unit = dist.rsvpsByCategory ? "RSVPs" : "events";
      const top = source?.items.slice(0, 5) ?? [];
      return {
        narrationFigures: {
          rsvpsByCategory: dist.rsvpsByCategory,
          savesByCategory: dist.savesByCategory,
          eventsByCategory: dist.eventsByCategory,
          engagementVisible: engagement,
        },
        display: top.map((row) => ({ label: row.label, value: `${row.count.toLocaleString()} ${unit}` })),
        task: "Answer which event categories receive the most engagement, strictly from these distributions. Name the top categories with their counts. If engagement figures are hidden for this role, say so and use event counts only.",
      };
    }
    case "events_created": {
      const snapshot = await buildIntelligenceSnapshot(db, {
        windowDays,
        include: { events: true, rsvps: false, users: false, organizers: false },
      });
      const created = snapshot.events?.series.points.reduce((sum, point) => sum + point.count, 0) ?? 0;
      const total = snapshot.events?.total ?? 0;
      return {
        narrationFigures: { createdInWindow: created, totalEvents: total, windowDays },
        display: [
          { label: `Events created (last ${windowDays} days)`, value: created.toLocaleString() },
          { label: "Total events", value: total.toLocaleString() },
        ],
        task: `Answer how many events were created in the last ${windowDays} days, strictly from these figures. State the count plainly, even when it is zero.`,
      };
    }
    case "top_rsvp_events": {
      const list = await listEventPerformance(db, {
        q: "",
        limit: INTELLIGENCE_EVENTS_PAGE_LIMIT,
        offset: 0,
        includeEngagement: true,
      });
      const ranked = [...list.events]
        .map((row) => ({ title: row.title, rsvps: row.rsvps ?? 0 }))
        .sort((a, b) => b.rsvps - a.rsvps)
        .slice(0, 5);
      const scannedAll = list.total <= INTELLIGENCE_EVENTS_PAGE_LIMIT;
      return {
        narrationFigures: {
          top: ranked,
          scanned: list.events.length,
          total: list.total,
          scannedAll,
        },
        display: ranked.map((row, index) => ({
          label: `#${index + 1} ${row.title}`,
          value: `${row.rsvps.toLocaleString()} RSVPs`,
        })),
        task: scannedAll
          ? "Answer which events have the highest RSVP activity, strictly from this ranking. List them with counts."
          : `Answer which events have the highest RSVP activity from this ranking of the ${INTELLIGENCE_EVENTS_PAGE_LIMIT} most recent events. Warn that older events outside the scan are not covered.`,
      };
    }
    case "activity_summary": {
      const snapshot = await buildIntelligenceSnapshot(db, {
        windowDays,
        include: {
          events: canSeeMetric(role, "events"),
          rsvps: canSeeMetric(role, "rsvps"),
          users: canSeeMetric(role, "users"),
          organizers: canSeeMetric(role, "organizers"),
        },
      });
      const sum = (points?: Array<{ count: number }>): number | null =>
        points ? points.reduce((total, point) => total + point.count, 0) : null;
      const display: AssistantDisplayFigure[] = [];
      if (snapshot.events) {
        display.push({
          label: `New events (last ${windowDays} days)`,
          value: (sum(snapshot.events.series.points) ?? 0).toLocaleString(),
        });
      }
      if (snapshot.rsvps) {
        display.push({
          label: `New RSVPs (last ${windowDays} days)`,
          value: (sum(snapshot.rsvps.series.points) ?? 0).toLocaleString(),
        });
      }
      if (snapshot.users) {
        display.push({
          label: `New users (last ${windowDays} days)`,
          value: (sum(snapshot.users.series.points) ?? 0).toLocaleString(),
        });
      }
      if (snapshot.organizers) {
        display.push({
          label: `New organizers (last ${windowDays} days)`,
          value: (sum(snapshot.organizers.series.points) ?? 0).toLocaleString(),
        });
      }
      return {
        narrationFigures: buildBriefFigures(snapshot, []),
        display,
        task: `Summarize platform activity over the last ${windowDays} days, strictly from these totals. Mention only metrics present in the figures; say plainly when a metric is hidden for this role or history is thin.`,
      };
    }
    case "reports_trend": {
      const trends = await fetchIntelligenceTrends(db, {
        windowDays,
        include: {
          events: false,
          rsvps: false,
          users: false,
          organizers: false,
          saves: false,
          tickets: false,
          reports: true,
        },
      });
      const points = trends.reports?.points ?? [];
      const mid = Math.floor(points.length / 2);
      const previous = points.slice(0, mid).reduce((sum, point) => sum + point.count, 0);
      const current = points.slice(mid).reduce((sum, point) => sum + point.count, 0);
      return {
        narrationFigures: { previousHalf: previous, currentHalf: current, windowDays, points },
        display: [
          { label: "Reports (first half of window)", value: previous.toLocaleString() },
          { label: "Reports (second half of window)", value: current.toLocaleString() },
        ],
        task: `Answer whether event reports are increasing over the last ${windowDays} days, strictly from these half-window counts. If both halves are zero, say reports are flat at zero — never invent a trend.`,
      };
    }
    case "needs_attention": {
      const [watchlist, recs] = await Promise.all([
        getAnomalyWatchlistData(db, {
          includeRules: allowedRules(role),
          includeVelocityBaseline: engagement,
        }),
        getRecommendationsData(db, { includeKinds: allowedKinds(role) }),
      ]);
      const topFindings = watchlist.findings.slice(0, 5).map((finding) => ({
        title: finding.eventTitle ?? "Platform-wide",
        rule: finding.ruleText,
        severity: finding.severity,
        figures: finding.figures,
      }));
      const topRecs = recs.items.slice(0, 5).map((item) => ({
        title: item.title,
        confidence: item.confidence,
        evidence: item.evidence,
      }));
      return {
        narrationFigures: {
          findingCount: watchlist.findings.length,
          findings: topFindings,
          recommendationCount: recs.items.length,
          recommendations: topRecs,
        },
        display: [
          { label: "Open anomaly findings", value: watchlist.findings.length.toLocaleString() },
          { label: "Advisory recommendations", value: recs.items.length.toLocaleString() },
        ],
        task: "Answer which events deserve administrative attention, strictly from these findings and recommendations. Name the specific items with their severity or evidence strength. If both lists are empty, say nothing needs attention right now.",
      };
    }
  }
}

export const askAssistant = createServerFn({ method: "POST" })
  .validator(z.object({ question: z.string().trim().min(3).max(ASSISTANT_QUESTION_MAX_CHARS) }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AskAssistantResult> => {
    // Every admin role holds events.read, so this grant only proves identity;
    // each intent enforces its own permissions below.
    const grant = await requirePermission(context, "events.read");
    const db = asAdminDb(grant.supabase);
    const classified = classifyAssistantQuestion(data.question);
    if (classified.intent === null) {
      await insertAssistantAudit(db, {
        actorId: grant.userId,
        intent: null,
        windowDays: classified.windowDays,
        questionChars: data.question.length,
        status: classified.reason,
      });
      return {
        status: "refused",
        reason: classified.reason,
        message:
          classified.reason === "ambiguous"
            ? "That question could mean a couple of things. Try asking about one topic — for example, event categories, reports, or anomalies."
            : "I can only answer questions about platform activity: categories, events created, RSVP leaders, reports, anomalies, and recommendations. Try one of the suggested questions.",
      };
    }
    if (!assistantAllowed(classified.intent, grant.role)) {
      await insertAssistantAudit(db, {
        actorId: grant.userId,
        intent: classified.intent,
        windowDays: classified.windowDays,
        questionChars: data.question.length,
        status: "forbidden",
      });
      return {
        status: "refused",
        reason: "forbidden",
        message: `Your role cannot access ${ASSISTANT_INTENT_META[classified.intent].label.toLowerCase()} data.`,
      };
    }
    const run = await runAssistantIntent(db, grant.role, classified.intent, classified.windowDays);
    const text = await narrate<AssistantAnswerText>(
      `${run.task} If the figures show no activity, say so plainly instead of speculating.`,
      { intent: classified.intent, windowDays: classified.windowDays, ...run.narrationFigures },
      "AssistantAnswer",
      ASSISTANT_ANSWER_JSON_SCHEMA,
      (value) => {
        const checked = assistantAnswerSchema.safeParse(value);
        return checked.success ? checked.data : null;
      },
    );
    await insertAssistantAudit(db, {
      actorId: grant.userId,
      intent: classified.intent,
      windowDays: classified.windowDays,
      questionChars: data.question.length,
      status: "answered",
    });
    return {
      status: "answered",
      intent: classified.intent,
      intentLabel: ASSISTANT_INTENT_META[classified.intent].label,
      windowDays: classified.windowDays,
      answer: text.answer,
      caveats: text.caveats,
      figures: run.display,
      snapshotAt: new Date().toISOString(),
    };
  });
