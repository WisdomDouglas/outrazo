// Pure anomaly + recommendation rules for Admin Intelligence (safe to import
// anywhere: no secrets, no network, no database).
//
// Detection is deterministic code over bounded server reads — the AI never
// creates findings or sets severity. Every rule carries absolute floors so
// Outrazo's small dataset cannot manufacture alarms: thin baselines yield
// "insufficient data", never suspicion. Ordinary low activity is never
// flagged; only threshold crossings with supporting figures become findings.
import { roleHasPermission, type AdminPermission, type AdminRole } from "./permissions";
export const THRESHOLDS = {
  reportSpikeMedium: 3,
  reportSpikeHigh: 5,
  reportSpikeWindowDays: 7,
  rsvpSurgeMin24h: 10,
  rsvpSurgeRatioMedium: 3,
  rsvpSurgeRatioHigh: 5,
  rsvpSurgeBaselineMin: 5,
  rsvpSurgeBaselineDays: 7,
  rsvpVelocityPlatformMin28d: 10,
  overCapacityHighPct: 120,
  churnWindowDays: 7,
  churnMedium: 3,
  churnHigh: 5,
  flappingWindowDays: 30,
  flappingTransitions: 3,
  suspendWindowHours: 24,
  suspendMedium: 3,
  suspendHigh: 5,
  featuringFillMedium: 60,
  featuringFillHigh: 80,
  featuringRsvpsMedium: 10,
  featuringRsvpsHigh: 20,
  reviewMedium: 2,
  reviewHigh: 4,
  quietMinAgeDays: 14,
  organizerAttentionMedium: 3,
  organizerAttentionHigh: 5,
} as const;

export type AnomalyRule =
  | "report_spike"
  | "rsvp_surge"
  | "over_capacity"
  | "publish_churn"
  | "event_flapping"
  | "moderation_burst";

export type Severity = "Low" | "Medium" | "High";

export interface DetectionEvent {
  id: string;
  title: string;
  category: string;
  city: string | null;
  published: boolean;
  status: string;
  startsAt: string | null;
  capacity: number;
  attendeeCount: number;
  createdAt: string | null;
  organizerId: string;
}

export interface DetectionInput {
  events: DetectionEvent[];
  rsvps: Array<{ eventId: string; createdAt: string }>;
  saves: Array<{ eventId: string }>;
  reports: Array<{ eventId: string; status: string; reason: string; createdAt: string }>;
  audits: Array<{ action: string; entityType: string; entityId: string | null; createdAt: string }>;
  organizers: Array<{ id: string; name: string }>;
  /** True when the RSVP read hit its cap: ratios would lie, so velocity pauses. */
  rsvpsTruncated?: boolean;
}

/** Permissions required to see (and explain) each rule's findings. */
export const RULE_PERMISSIONS: Record<AnomalyRule, AdminPermission[]> = {
  report_spike: ["reports.read"],
  rsvp_surge: ["events.read", "attendees.read"],
  over_capacity: ["events.read"],
  publish_churn: ["audit.read"],
  event_flapping: ["events.read", "audit.read"],
  moderation_burst: ["audit.read"],
};

export const REC_PERMISSIONS: Record<RecommendationKind, AdminPermission[]> = {
  consider_featuring: ["events.read", "attendees.read", "reports.read"],
  moderation_review: ["reports.read"],
  low_engagement: ["events.read", "attendees.read"],
  organizer_attention: ["events.read", "reports.read"],
};

export function findingAllowed(rule: AnomalyRule, role: AdminRole): boolean {
  return RULE_PERMISSIONS[rule].every((permission) => roleHasPermission(role, permission));
}

export function recommendationAllowed(kind: RecommendationKind, role: AdminRole): boolean {
  return REC_PERMISSIONS[kind].every((permission) => roleHasPermission(role, permission));
}

export interface AnomalyFinding {
  key: string;
  rule: AnomalyRule;
  eventId: string | null;
  eventTitle: string | null;
  severity: Severity;
  figures: Record<string, number | string>;
  ruleText: string;
  thresholdText: string;
  detectedAt: string;
}

export interface BaselineStatus {
  status: "ok" | "insufficient";
  have: number;
  need: number;
  note: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function parseTime(value: string): number | null {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function since(now: number, ms: number, createdAt: string): boolean {
  const time = parseTime(createdAt);
  return time !== null && time >= now - ms && time <= now;
}

function findingLinkFor(rule: AnomalyRule, eventId: string | null): { to: string; label: string } {
  if (eventId) return { to: `/admin/events/${eventId}`, label: "View event" };
  return { to: "/admin/audit", label: "View audit log" };
}

/** Deep link for a finding: event findings open the event, platform ones open audit. */
export function findingLink(
  rule: AnomalyRule,
  eventId: string | null,
): { to: string; label: string } {
  return findingLinkFor(rule, eventId);
}

function findingKey(rule: AnomalyRule, eventId: string | null): string {
  return `${rule}:${eventId ?? "platform"}`;
}

export interface WatchlistEvaluation {
  findings: AnomalyFinding[];
  baselines: { rsvpVelocity: BaselineStatus };
}

export function detectAnomalies(input: DetectionInput, nowIso: string): WatchlistEvaluation {
  const now = Date.parse(nowIso);
  const at = Number.isNaN(now) ? Date.now() : now;
  const detectedAt = new Date(at).toISOString();
  const eventsById = new Map(input.events.map((event) => [event.id, event]));
  const findings: AnomalyFinding[] = [];
  const titleOf = (eventId: string): string => eventsById.get(eventId)?.title ?? "Unknown event";

  // ── Report spikes: pending reports per event in 7 days. ──
  const pendingByEvent = new Map<string, Array<{ reason: string }>>();
  for (const report of input.reports) {
    if (report.status !== "pending") continue;
    if (!since(at, THRESHOLDS.reportSpikeWindowDays * DAY_MS, report.createdAt)) continue;
    const list = pendingByEvent.get(report.eventId) ?? [];
    list.push({ reason: report.reason });
    pendingByEvent.set(report.eventId, list);
  }
  for (const [eventId, items] of pendingByEvent) {
    if (items.length < THRESHOLDS.reportSpikeMedium) continue;
    const reasons: Record<string, number> = {};
    for (const item of items) reasons[item.reason] = (reasons[item.reason] ?? 0) + 1;
    findings.push({
      key: findingKey("report_spike", eventId),
      rule: "report_spike",
      eventId,
      eventTitle: titleOf(eventId),
      severity: items.length >= THRESHOLDS.reportSpikeHigh ? "High" : "Medium",
      figures: { reports7d: items.length, ...prefixKeys("reasons", reasons) },
      ruleText: "Unusual spike in pending event reports",
      thresholdText: `Flags at ${THRESHOLDS.reportSpikeMedium}+ pending reports in ${THRESHOLDS.reportSpikeWindowDays} days`,
      detectedAt,
    });
  }

  // ── RSVP velocity surges: 24h volume vs the prior 7-day mean. ──
  const day24 = HOUR_MS * 24;
  const baselineStart = at - day24 - THRESHOLDS.rsvpSurgeBaselineDays * DAY_MS;
  const last24hByEvent = new Map<string, number>();
  const priorByEvent = new Map<string, number>();
  let platform28d = 0;
  for (const rsvp of input.rsvps) {
    const time = parseTime(rsvp.createdAt);
    if (time === null || time > at) continue;
    if (time >= at - 28 * DAY_MS) platform28d += 1;
    if (time >= at - day24) {
      last24hByEvent.set(rsvp.eventId, (last24hByEvent.get(rsvp.eventId) ?? 0) + 1);
    } else if (time >= baselineStart) {
      priorByEvent.set(rsvp.eventId, (priorByEvent.get(rsvp.eventId) ?? 0) + 1);
    }
  }
  const velocityOk =
    !input.rsvpsTruncated && platform28d >= THRESHOLDS.rsvpVelocityPlatformMin28d;
  if (velocityOk) {
    for (const [eventId, fresh] of last24hByEvent) {
      if (fresh < THRESHOLDS.rsvpSurgeMin24h) continue;
      const prior = priorByEvent.get(eventId) ?? 0;
      if (prior < THRESHOLDS.rsvpSurgeBaselineMin) continue;
      const mean = prior / THRESHOLDS.rsvpSurgeBaselineDays;
      const ratio = fresh / mean;
      if (ratio < THRESHOLDS.rsvpSurgeRatioMedium) continue;
      findings.push({
        key: findingKey("rsvp_surge", eventId),
        rule: "rsvp_surge",
        eventId,
        eventTitle: titleOf(eventId),
        severity: ratio > THRESHOLDS.rsvpSurgeRatioHigh ? "High" : "Medium",
        figures: {
          last24h: fresh,
          prior7d: prior,
          dailyMean: Math.round(mean * 10) / 10,
          multiple: Math.round(ratio * 10) / 10,
        },
        ruleText: "Sudden RSVP velocity increase",
        thresholdText: `Flags at ${THRESHOLDS.rsvpSurgeMin24h}+ RSVPs in 24h at ${THRESHOLDS.rsvpSurgeRatioMedium}x+ the prior 7-day daily mean`,
        detectedAt,
      });
    }
  }

  // ── Over capacity: arithmetic, no baseline needed. ──
  for (const event of input.events) {
    // Capacities at/below zero mean "unset"; absurdly large values are data-entry
    // sentinels. Neither can support an over-capacity claim.
    if (event.capacity <= 0 || event.capacity > 1_000_000) continue;
    if (event.attendeeCount <= event.capacity) continue;
    const fillPct = Math.round((event.attendeeCount / event.capacity) * 100);
    findings.push({
      key: findingKey("over_capacity", event.id),
      rule: "over_capacity",
      eventId: event.id,
      eventTitle: event.title,
      severity: fillPct > THRESHOLDS.overCapacityHighPct ? "High" : "Medium",
      figures: { attendeeCount: event.attendeeCount, capacity: event.capacity, fillPct },
      ruleText: "Event exceeds its stated capacity",
      thresholdText: "Flags when attendance passes 100% of capacity",
      detectedAt,
    });
  }

  // ── Publish churn (platform) + per-event flapping from the audit trail. ──
  const churnWindow = THRESHOLDS.churnWindowDays * DAY_MS;
  let unpublishes = 0;
  let cancels = 0;
  const transitionsByEvent = new Map<string, number>();
  const flapWindow = THRESHOLDS.flappingWindowDays * DAY_MS;
  for (const audit of input.audits) {
    const time = parseTime(audit.createdAt);
    if (time === null || time > at) continue;
    if (
      (audit.action === "admin.event.unpublish" || audit.action === "admin.event.cancel") &&
      time >= at - churnWindow
    ) {
      if (audit.action === "admin.event.unpublish") unpublishes += 1;
      else cancels += 1;
    }
    if (
      audit.entityType === "events" &&
      audit.entityId &&
      (audit.action === "admin.event.publish" ||
        audit.action === "admin.event.unpublish" ||
        audit.action === "admin.event.cancel" ||
        audit.action === "admin.event.reopen") &&
      time >= at - flapWindow
    ) {
      transitionsByEvent.set(audit.entityId, (transitionsByEvent.get(audit.entityId) ?? 0) + 1);
    }
  }
  const churnTotal = unpublishes + cancels;
  if (churnTotal >= THRESHOLDS.churnMedium) {
    findings.push({
      key: findingKey("publish_churn", null),
      rule: "publish_churn",
      eventId: null,
      eventTitle: null,
      severity: churnTotal >= THRESHOLDS.churnHigh ? "High" : "Medium",
      figures: { unpublishes7d: unpublishes, cancels7d: cancels, total7d: churnTotal },
      ruleText: "Unusual unpublish/cancel activity platform-wide",
      thresholdText: `Flags at ${THRESHOLDS.churnMedium}+ unpublishes/cancels in ${THRESHOLDS.churnWindowDays} days`,
      detectedAt,
    });
  }
  for (const [eventId, transitions] of transitionsByEvent) {
    if (transitions < THRESHOLDS.flappingTransitions) continue;
    findings.push({
      key: findingKey("event_flapping", eventId),
      rule: "event_flapping",
      eventId,
      eventTitle: titleOf(eventId),
      severity: "Medium",
      figures: { transitions30d: transitions },
      ruleText: "Event repeatedly published, unpublished, or cancelled",
      thresholdText: `Flags at ${THRESHOLDS.flappingTransitions}+ publish-state transitions in ${THRESHOLDS.flappingWindowDays} days`,
      detectedAt,
    });
  }

  // ── Suspension bursts: concentrated staff suspensions. ──
  let suspends = 0;
  for (const audit of input.audits) {
    if (audit.action !== "admin.user.suspend") continue;
    if (!since(at, THRESHOLDS.suspendWindowHours * HOUR_MS, audit.createdAt)) continue;
    suspends += 1;
  }
  if (suspends >= THRESHOLDS.suspendMedium) {
    findings.push({
      key: findingKey("moderation_burst", null),
      rule: "moderation_burst",
      eventId: null,
      eventTitle: null,
      severity: suspends >= THRESHOLDS.suspendHigh ? "High" : "Medium",
      figures: { suspends24h: suspends },
      ruleText: "Unusual burst of account suspensions",
      thresholdText: `Flags at ${THRESHOLDS.suspendMedium}+ suspensions in ${THRESHOLDS.suspendWindowHours} hours`,
      detectedAt,
    });
  }

  findings.sort((a, b) =>
    a.severity === b.severity
      ? a.rule.localeCompare(b.rule)
      : severityRank(b.severity) - severityRank(a.severity),
  );
  return {
    findings,
    baselines: {
      rsvpVelocity: velocityOk
        ? {
            status: "ok",
            have: platform28d,
            need: THRESHOLDS.rsvpVelocityPlatformMin28d,
            note: "Velocity baseline available.",
          }
        : {
            status: "insufficient",
            have: platform28d,
            need: THRESHOLDS.rsvpVelocityPlatformMin28d,
            note: input.rsvpsTruncated
              ? "RSVP history was capped; velocity ratios would be unreliable."
              : `Needs ${THRESHOLDS.rsvpVelocityPlatformMin28d}+ platform RSVPs in 28 days (has ${platform28d}).`,
          },
    },
  };
}

function severityRank(severity: Severity): number {
  if (severity === "High") return 3;
  if (severity === "Medium") return 2;
  return 1;
}

function prefixKeys(prefix: string, counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(counts)) out[`${prefix}_${key}`] = count;
  return out;
}

export type RecommendationKind =
  | "consider_featuring"
  | "moderation_review"
  | "low_engagement"
  | "organizer_attention";

export type Confidence = "Low" | "Medium" | "High";

export interface Recommendation {
  key: string;
  kind: RecommendationKind;
  title: string;
  explanation: string;
  evidence: Record<string, number | string>;
  confidence: Confidence;
  eventId: string | null;
  eventTitle: string | null;
  organizerId: string | null;
  organizerName: string | null;
  link: { to: string; label: string };
}

export function buildRecommendations(
  input: DetectionInput,
  nowIso: string,
): Recommendation[] {
  const now = Date.parse(nowIso);
  const at = Number.isNaN(now) ? Date.now() : now;
  const items: Recommendation[] = [];
  const rsvpsByEvent = new Map<string, number>();
  for (const rsvp of input.rsvps) {
    rsvpsByEvent.set(rsvp.eventId, (rsvpsByEvent.get(rsvp.eventId) ?? 0) + 1);
  }
  const savesByEvent = new Map<string, number>();
  for (const save of input.saves) {
    savesByEvent.set(save.eventId, (savesByEvent.get(save.eventId) ?? 0) + 1);
  }
  const pendingByEvent = new Map<string, number>();
  for (const report of input.reports) {
    if (report.status !== "pending") continue;
    if (!since(at, 30 * DAY_MS, report.createdAt)) continue;
    pendingByEvent.set(report.eventId, (pendingByEvent.get(report.eventId) ?? 0) + 1);
  }

  for (const event of input.events) {
    const rsvps = rsvpsByEvent.get(event.id) ?? 0;
    const saves = savesByEvent.get(event.id) ?? 0;
    const pending = pendingByEvent.get(event.id) ?? 0;
    const startsAt = event.startsAt ? parseTime(event.startsAt) : null;
    const upcoming = startsAt !== null && startsAt > at;
    const createdAt = event.createdAt ? parseTime(event.createdAt) : null;
    const ageDays = createdAt === null ? null : Math.floor((at - createdAt) / DAY_MS);
    const fillPct =
      event.capacity > 0 && event.capacity <= 1_000_000
        ? Math.round((event.attendeeCount / event.capacity) * 100)
        : null;

    // Strong, clean engagement worth a human look for featuring.
    if (
      event.published &&
      event.status !== "cancelled" &&
      upcoming &&
      fillPct !== null &&
      fillPct >= THRESHOLDS.featuringFillMedium &&
      rsvps >= THRESHOLDS.featuringRsvpsMedium &&
      pending === 0
    ) {
      const strong =
        fillPct >= THRESHOLDS.featuringFillHigh && rsvps >= THRESHOLDS.featuringRsvpsHigh;
      items.push({
        key: `consider_featuring:${event.id}`,
        kind: "consider_featuring",
        title: `Consider featuring “${event.title}”`,
        explanation:
          `Strong engagement (${rsvps} RSVPs, ${fillPct}% full) with no pending reports. ` +
          `A human should decide whether it deserves the Spotlight.`,
        evidence: { rsvps, fillPct, pendingReports30d: pending },
        confidence: strong ? "High" : "Medium",
        eventId: event.id,
        eventTitle: event.title,
        organizerId: null,
        organizerName: null,
        link: { to: `/admin/events/${event.id}`, label: "View event" },
      });
    }

    // Report pressure needing moderation review.
    if (pending >= THRESHOLDS.reviewMedium) {
      items.push({
        key: `moderation_review:${event.id}`,
        kind: "moderation_review",
        title: `Review reports on “${event.title}”`,
        explanation:
          `${pending} pending reports in the last 30 days need a moderation decision. ` +
          `Nothing is resolved automatically.`,
        evidence: { pendingReports30d: pending },
        confidence: pending >= THRESHOLDS.reviewHigh ? "High" : "Medium",
        eventId: event.id,
        eventTitle: event.title,
        organizerId: null,
        organizerName: null,
        link: { to: "/admin/reports", label: "Open reports queue" },
      });
    }

    // Published, upcoming, old enough to judge, and completely quiet.
    if (
      event.published &&
      event.status !== "cancelled" &&
      upcoming &&
      ageDays !== null &&
      ageDays >= THRESHOLDS.quietMinAgeDays &&
      rsvps === 0 &&
      saves === 0
    ) {
      items.push({
        key: `low_engagement:${event.id}`,
        kind: "low_engagement",
        title: `“${event.title}” has no engagement after ${ageDays} days`,
        explanation:
          `Published ${ageDays} days ago with no RSVPs or saves. The organizer may benefit ` +
          `from promotion tips or a listing review — low signal, not a verdict.`,
        evidence: { ageDays, rsvps, saves },
        confidence: "Medium",
        eventId: event.id,
        eventTitle: event.title,
        organizerId: null,
        organizerName: null,
        link: { to: `/admin/events/${event.id}`, label: "View event" },
      });
    }
  }

  // Organizers with concentrated pending-report pressure.
  const pendingByOrganizer = new Map<string, { reports: number; events: Set<string> }>();
  const organizerOf = new Map(input.events.map((event) => [event.id, event.organizerId]));
  for (const [eventId, count] of pendingByEvent) {
    const organizerId = organizerOf.get(eventId);
    if (!organizerId) continue;
    const entry = pendingByOrganizer.get(organizerId) ?? { reports: 0, events: new Set<string>() };
    entry.reports += count;
    entry.events.add(eventId);
    pendingByOrganizer.set(organizerId, entry);
  }
  const organizerNames = new Map(input.organizers.map((organizer) => [organizer.id, organizer.name]));
  for (const [organizerId, entry] of pendingByOrganizer) {
    if (entry.reports < THRESHOLDS.organizerAttentionMedium) continue;
    const name = organizerNames.get(organizerId) ?? "Unknown organizer";
    items.push({
      key: `organizer_attention:${organizerId}`,
      kind: "organizer_attention",
      title: `Check in with ${name}`,
      explanation:
        `${name} has ${entry.reports} pending reports across ${entry.events.size} ` +
        `event${entry.events.size === 1 ? "" : "s"} in 30 days. A human should review whether ` +
        `guidance or enforcement is needed.`,
      evidence: { pendingReports30d: entry.reports, eventsAffected: entry.events.size },
      confidence:
        entry.reports >= THRESHOLDS.organizerAttentionHigh ? "High" : "Medium",
      eventId: null,
      eventTitle: null,
      organizerId,
      organizerName: name,
      link: { to: `/admin/organizers/${organizerId}`, label: "View organizer" },
    });
  }

  const confidenceRank = (confidence: Confidence): number =>
    confidence === "High" ? 3 : confidence === "Medium" ? 2 : 1;
  items.sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence));
  return items;
}
