// Admin Intelligence detection tests (Phase 2). Deterministic anomaly and
// recommendation rules over normalized rows: thresholds, small-data guards,
// insufficient baselines, and false-positive prevention. Pure logic only.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRecommendations,
  detectAnomalies,
  findingAllowed,
  findingLink,
  REC_PERMISSIONS,
  recommendationAllowed,
  RULE_PERMISSIONS,
  THRESHOLDS,
} from "@/showcase/admin/intelligence-detection";
import { ADMIN_PERMISSIONS, ROLE_PERMISSIONS } from "@/showcase/admin/permissions";
import { anomalyExplanationSchema } from "@/showcase/admin/intelligence-narration";

const NOW = "2026-11-05T12:00:00.000Z";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (offsetMs) => new Date(Date.parse(NOW) + offsetMs).toISOString();

function event(overrides = {}) {
  return {
    id: "e1",
    title: "Tech Summit",
    category: "tech",
    city: "Lagos",
    published: true,
    status: "active",
    startsAt: at(7 * DAY),
    capacity: 100,
    attendeeCount: 10,
    createdAt: at(-20 * DAY),
    organizerId: "o1",
    ...overrides,
  };
}

function emptyInput(overrides = {}) {
  return {
    events: [],
    rsvps: [],
    saves: [],
    reports: [],
    audits: [],
    organizers: [],
    truncated: { events: false, rsvps: false, saves: false, reports: false, audits: false },
    ...overrides,
  };
}

function rsvps(eventId, count, createdAt) {
  return Array.from({ length: count }, (_, index) => ({
    eventId,
    createdAt: createdAt ?? at(-HOUR),
    id: `rsvp-${eventId}-${index}`,
  }));
}

function reports(eventId, count, { status = "pending", reason = "spam", createdAt = at(-DAY) } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    eventId,
    status,
    reason,
    createdAt,
    id: `rep-${eventId}-${index}`,
  }));
}

describe("detection thresholds", () => {
  it("pins the documented rule floors", () => {
    assert.equal(THRESHOLDS.reportSpikeMedium, 3);
    assert.equal(THRESHOLDS.reportSpikeHigh, 5);
    assert.equal(THRESHOLDS.rsvpSurgeMin24h, 10);
    assert.equal(THRESHOLDS.rsvpSurgeRatioMedium, 3);
    assert.equal(THRESHOLDS.rsvpSurgeRatioHigh, 5);
    assert.equal(THRESHOLDS.overCapacityHighPct, 120);
    assert.equal(THRESHOLDS.churnMedium, 3);
    assert.equal(THRESHOLDS.flappingTransitions, 3);
  });
});

describe("detectAnomalies report spikes", () => {
  it("fires at 3+ pending reports in 7 days, escalating at 5+", () => {
    const base = emptyInput({ events: [event()] });
    const none = detectAnomalies(
      { ...base, reports: reports("e1", 2) },
      NOW,
    );
    assert.deepEqual(none.findings, []);
    const medium = detectAnomalies(
      { ...base, reports: reports("e1", 3) },
      NOW,
    );
    assert.equal(medium.findings.length, 1);
    assert.equal(medium.findings[0].severity, "Medium");
    assert.equal(medium.findings[0].rule, "report_spike");
    assert.equal(medium.findings[0].figures.reports7d, 3);
    const high = detectAnomalies(
      { ...base, reports: reports("e1", 5) },
      NOW,
    );
    assert.equal(high.findings[0].severity, "High");
  });

  it("ignores dismissed and stale reports", () => {
    const input = emptyInput({
      events: [event()],
      reports: [
        ...reports("e1", 2),
        ...reports("e1", 5, { status: "dismissed" }),
        ...reports("e1", 4, { createdAt: at(-10 * DAY) }),
      ],
    });
    assert.deepEqual(detectAnomalies(input, NOW).findings, []);
  });
});

describe("detectAnomalies RSVP surges", () => {
  it("fires on 10+ RSVPs in 24h at 3x the prior mean", () => {
    const prior = Array.from({ length: 7 }, (_, day) => ({
      eventId: "e1",
      createdAt: at(-(day + 2) * DAY),
      id: `old-${day}`,
    }));
    const input = emptyInput({
      events: [event()],
      rsvps: [...prior, ...rsvps("e1", 10, at(-HOUR))],
    });
    const result = detectAnomalies(input, NOW);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].rule, "rsvp_surge");
    assert.equal(result.findings[0].severity, "High");
    assert.equal(result.findings[0].figures.last24h, 10);
  });

  it("refuses thin baselines and small counts", () => {
    // 10 fresh RSVPs but only 2 in the prior week: no baseline, no finding.
    const thin = detectAnomalies(
      emptyInput({
        events: [event()],
        rsvps: [...rsvps("e1", 2, at(-3 * DAY)), ...rsvps("e1", 10, at(-HOUR))],
      }),
      NOW,
    );
    assert.deepEqual(thin.findings, []);
    // Healthy baseline but only 9 fresh RSVPs: under the absolute floor.
    const prior = Array.from({ length: 7 }, (_, day) => ({
      eventId: "e1",
      createdAt: at(-(day + 2) * DAY),
      id: `old-${day}`,
    }));
    const small = detectAnomalies(
      emptyInput({ events: [event()], rsvps: [...prior, ...rsvps("e1", 9, at(-HOUR))] }),
      NOW,
    );
    assert.deepEqual(small.findings, []);
  });

  it("marks the velocity baseline insufficient on quiet platforms", () => {
    const result = detectAnomalies(emptyInput({ events: [event()] }), NOW);
    assert.equal(result.baselines.rsvpVelocity.status, "insufficient");
    assert.ok(result.baselines.rsvpVelocity.have < result.baselines.rsvpVelocity.need);
  });
});

describe("detectAnomalies capacity and churn", () => {
  it("flags over-capacity events by fill band", () => {
    const input = emptyInput({
      events: [
        event({ id: "ok", attendeeCount: 100, capacity: 100 }),
        event({ id: "mid", attendeeCount: 110, capacity: 100 }),
        event({ id: "high", attendeeCount: 130, capacity: 100 }),
        event({ id: "nocap", attendeeCount: 50, capacity: 0 }),
      ],
    });
    const findings = detectAnomalies(input, NOW).findings;
    assert.deepEqual(
      findings.map((finding) => [finding.eventId, finding.severity]),
      [["high", "High"], ["mid", "Medium"]],
    );
    assert.equal(findings[0].figures.fillPct, 130);
  });

  it("flags unpublish/cancel churn and per-event flapping", () => {
    const audits = [
      { action: "admin.event.unpublish", entityType: "events", entityId: "e1", createdAt: at(-DAY) },
      { action: "admin.event.cancel", entityType: "events", entityId: "e2", createdAt: at(-2 * DAY) },
      { action: "admin.event.unpublish", entityType: "events", entityId: "e3", createdAt: at(-3 * DAY) },
      { action: "admin.event.publish", entityType: "events", entityId: "e1", createdAt: at(-DAY) },
    ];
    const churned = detectAnomalies(emptyInput({ audits }), NOW);
    const churn = churned.findings.find((finding) => finding.rule === "publish_churn");
    assert.equal(churn.severity, "Medium");
    assert.equal(churn.eventId, null);
    assert.equal(churn.figures.unpublishes7d, 2);
    assert.equal(churn.figures.cancels7d, 1);
    // Two transitions are ordinary; three in 30 days is flapping.
    const flapAudits = [1, 2, 3].map((day) => ({
      action: day % 2 === 0 ? "admin.event.publish" : "admin.event.unpublish",
      entityType: "events",
      entityId: "e9",
      createdAt: at(-day * DAY),
    }));
    const flapped = detectAnomalies(
      emptyInput({ events: [event({ id: "e9" })], audits: flapAudits }),
      NOW,
    );
    const flap = flapped.findings.find((finding) => finding.rule === "event_flapping");
    assert.equal(flap.eventId, "e9");
    assert.equal(flap.severity, "Medium");
  });

  it("flags suspension bursts and ignores ordinary admin volume", () => {
    const burst = detectAnomalies(
      emptyInput({
        audits: [1, 2, 3].map((hour) => ({
          action: "admin.user.suspend",
          entityType: "profiles",
          entityId: `u${hour}`,
          createdAt: at(-hour * HOUR),
        })),
      }),
      NOW,
    );
    assert.equal(
      burst.findings.find((finding) => finding.rule === "moderation_burst").severity,
      "Medium",
    );
    const calm = detectAnomalies(
      emptyInput({
        audits: [
          { action: "admin.user.suspend", entityType: "profiles", entityId: "u1", createdAt: at(-HOUR) },
          { action: "admin.event.publish", entityType: "events", entityId: "e1", createdAt: at(-HOUR) },
        ],
      }),
      NOW,
    );
    assert.deepEqual(calm.findings, []);
  });
});

describe("finding links", () => {
  it("routes event findings to the event and platform findings to audit", () => {
    assert.deepEqual(findingLink("report_spike", "e1"), {
      to: "/admin/events/e1",
      label: "View event",
    });
    assert.deepEqual(findingLink("publish_churn", null), {
      to: "/admin/audit",
      label: "View audit log",
    });
  });
});

describe("buildRecommendations", () => {
  it("suggests featuring for strong, clean engagement only", () => {
    const strong = buildRecommendations(
      emptyInput({
        events: [event({ id: "e1", attendeeCount: 85, capacity: 100 })],
        rsvps: rsvps("e1", 25, at(-DAY)),
      }),
      NOW,
    );
    const featuring = strong.find((item) => item.kind === "consider_featuring");
    assert.equal(featuring.confidence, "High");
    assert.equal(featuring.eventId, "e1");
    assert.ok(featuring.explanation.includes("85"));
    // Pending reports veto featuring.
    const reported = buildRecommendations(
      emptyInput({
        events: [event({ id: "e1", attendeeCount: 85, capacity: 100 })],
        rsvps: rsvps("e1", 25, at(-DAY)),
        reports: reports("e1", 1),
      }),
      NOW,
    );
    assert.ok(!reported.some((item) => item.kind === "consider_featuring"));
  });

  it("routes report pressure to moderation review", () => {
    const result = buildRecommendations(
      emptyInput({
        events: [event()],
        reports: reports("e1", 2),
      }),
      NOW,
    );
    const review = result.find((item) => item.kind === "moderation_review");
    assert.equal(review.confidence, "Medium");
    assert.deepEqual(review.link, { to: "/admin/reports", label: "Open reports queue" });
    const quiet = buildRecommendations(
      emptyInput({ events: [event()], reports: reports("e1", 1) }),
      NOW,
    );
    assert.ok(!quiet.some((item) => item.kind === "moderation_review"));
  });

  it("spots quiet listings with enough age and no excuses", () => {
    const result = buildRecommendations(
      emptyInput({ events: [event({ id: "quiet" })] }),
      NOW,
    );
    const low = result.find((item) => item.kind === "low_engagement");
    assert.equal(low.eventId, "quiet");
    assert.equal(low.confidence, "Medium");
    // Young, past, draft, or active events are not "quiet".
    const young = buildRecommendations(
      emptyInput({ events: [event({ id: "new", createdAt: at(-3 * DAY) })] }),
      NOW,
    );
    assert.ok(!young.some((item) => item.kind === "low_engagement"));
    const past = buildRecommendations(
      emptyInput({ events: [event({ id: "old", startsAt: at(-DAY) })] }),
      NOW,
    );
    assert.ok(!past.some((item) => item.kind === "low_engagement"));
  });

  it("escalates organizers with concentrated report pressure", () => {
    const result = buildRecommendations(
      emptyInput({
        events: [event({ id: "e1", organizerId: "o9" }), event({ id: "e2", organizerId: "o9" })],
        reports: [...reports("e1", 2), ...reports("e2", 1)],
        organizers: [{ id: "o9", name: "Night Owls" }],
      }),
      NOW,
    );
    const attention = result.find((item) => item.kind === "organizer_attention");
    assert.equal(attention.organizerId, "o9");
    assert.equal(attention.confidence, "Medium");
    assert.ok(attention.explanation.includes("Night Owls"));
    assert.deepEqual(attention.link, { to: "/admin/organizers/o9", label: "View organizer" });
  });
});

describe("detectAnomalies truncation guards", () => {
  it("pauses velocity on capped RSVP reads instead of asserting ratios", () => {
    const prior = Array.from({ length: 7 }, (_, day) => ({
      eventId: "e1",
      createdAt: at(-(day + 2) * DAY),
      id: `old-${day}`,
    }));
    const surgeRsvps = [...prior, ...rsvps("e1", 10, at(-HOUR))];
    const full = detectAnomalies(emptyInput({ events: [event()], rsvps: surgeRsvps }), NOW);
    assert.ok(full.findings.some((finding) => finding.rule === "rsvp_surge"));
    assert.equal(full.baselines.rsvpVelocity.status, "ok");
    const capped = detectAnomalies(
      emptyInput({ events: [event()], rsvps: surgeRsvps, rsvpsTruncated: true }),
      NOW,
    );
    assert.ok(!capped.findings.some((finding) => finding.rule === "rsvp_surge"));
    assert.equal(capped.baselines.rsvpVelocity.status, "insufficient");
    assert.match(capped.baselines.rsvpVelocity.note, /capped/);
  });

  it("ignores unset and sentinel capacities", () => {
    const input = emptyInput({
      events: [
        event({ id: "zero", attendeeCount: 5, capacity: 0 }),
        event({ id: "negative", attendeeCount: 5, capacity: -3 }),
        event({ id: "sentinel", attendeeCount: 5, capacity: 9_999_999_999 }),
        event({ id: "real", attendeeCount: 130, capacity: 100 }),
      ],
    });
    const findings = detectAnomalies(input, NOW).findings;
    assert.deepEqual(
      findings.filter((finding) => finding.rule === "over_capacity").map((finding) => finding.eventId),
      ["real"],
    );
    // Sentinel fill percentages cannot sneak into featuring recommendations either.
    const recs = buildRecommendations(
      emptyInput({
        events: [event({ id: "big", attendeeCount: 60, capacity: 9_999_999_999 })],
        rsvps: rsvps("big", 60, at(-HOUR)),
      }),
      NOW,
    );
    assert.ok(!recs.some((item) => item.kind === "consider_featuring"));
  });
});

describe("watchlist permission maps", () => {
  it("only references real permissions every role understands", () => {
    for (const [, permissions] of Object.entries({ ...RULE_PERMISSIONS, ...REC_PERMISSIONS })) {
      for (const permission of permissions) {
        assert.ok(ADMIN_PERMISSIONS.includes(permission), `${permission} is a real permission`);
      }
    }
    assert.ok(Object.keys(ROLE_PERMISSIONS).length > 0);
  });

  it("shapes each role's watchlist honestly", () => {
    assert.equal(findingAllowed("report_spike", "moderation_admin"), true);
    assert.equal(findingAllowed("publish_churn", "moderation_admin"), false);
    assert.equal(findingAllowed("over_capacity", "support_readonly"), true);
    assert.equal(findingAllowed("report_spike", "support_readonly"), false);
    assert.equal(recommendationAllowed("consider_featuring", "moderation_admin"), true);
    assert.equal(recommendationAllowed("consider_featuring", "finance_admin"), false);
    assert.equal(recommendationAllowed("moderation_review", "moderation_admin"), true);
    assert.equal(recommendationAllowed("moderation_review", "finance_admin"), false);
  });
});

describe("anomaly explanation contract", () => {
  it("holds strict advisory bounds", () => {
    const good = anomalyExplanationSchema.safeParse({
      explanation: "Reports crossed the spike gate for one reason code.",
      limitations: ["Small baseline."],
      nextSteps: ["Open the moderation queue."],
    });
    assert.equal(good.success, true);
    const bad = anomalyExplanationSchema.safeParse({
      explanation: "",
      limitations: ["a", "b", "c", "d"],
      nextSteps: [],
    });
    assert.equal(bad.success, false);
  });
});
