// Promotion window pure-helper tests (Phase 2C-2). The display-status
// boundaries mirror the database range semantics '[)' exactly: a promotion
// becomes active at its start instant and expires at its end instant.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkPromotionWindow,
  computePromotionStatus,
  friendlyPromotionError,
  PROMOTION_DISPLAY_STATUSES,
  PROMOTION_STATUS_LABELS,
} from "@/showcase/promotions/promotion-windows";

const NOW = "2026-11-05T12:00:00.000Z";
const HOUR = 60 * 60 * 1000;
const at = (offsetMs) => new Date(new Date(NOW).getTime() + offsetMs).toISOString();

describe("promotion display statuses", () => {
  it("defines the four lifecycle states", () => {
    assert.deepEqual([...PROMOTION_DISPLAY_STATUSES], [
      "scheduled",
      "active",
      "expired",
      "cancelled",
    ]);
    assert.deepEqual({ ...PROMOTION_STATUS_LABELS }, {
      scheduled: "Scheduled",
      active: "Active now",
      expired: "Expired",
      cancelled: "Cancelled",
    });
  });
});

describe("computePromotionStatus", () => {
  it("reports cancelled rows as cancelled whatever the window", () => {
    assert.equal(
      computePromotionStatus({ status: "cancelled", starts_at: at(-HOUR), ends_at: at(HOUR) }, NOW),
      "cancelled",
    );
  });

  it("derives scheduled, active, and expired from the window", () => {
    assert.equal(
      computePromotionStatus({ status: "active", starts_at: at(HOUR), ends_at: at(2 * HOUR) }, NOW),
      "scheduled",
    );
    assert.equal(
      computePromotionStatus({ status: "active", starts_at: at(-HOUR), ends_at: at(HOUR) }, NOW),
      "active",
    );
    assert.equal(
      computePromotionStatus({ status: "active", starts_at: at(-2 * HOUR), ends_at: at(-HOUR) }, NOW),
      "expired",
    );
  });

  it("activates at the start instant and expires at the end instant", () => {
    assert.equal(
      computePromotionStatus({ status: "active", starts_at: NOW, ends_at: at(HOUR) }, NOW),
      "active",
    );
    assert.equal(
      computePromotionStatus({ status: "active", starts_at: at(-HOUR), ends_at: NOW }, NOW),
      "expired",
    );
  });
});

describe("checkPromotionWindow", () => {
  it("accepts future and effective-now windows", () => {
    assert.equal(checkPromotionWindow(at(HOUR), at(2 * HOUR), NOW), null);
    assert.equal(checkPromotionWindow(NOW, at(HOUR), NOW), null);
    assert.equal(checkPromotionWindow(at(-HOUR), at(HOUR), NOW), null);
  });

  it("rejects missing, invalid, inverted, and already-ended windows", () => {
    assert.match(checkPromotionWindow("", at(HOUR), NOW), /start and end/);
    assert.match(checkPromotionWindow(at(HOUR), "", NOW), /start and end/);
    assert.match(checkPromotionWindow("not-a-date", at(HOUR), NOW), /valid date/);
    assert.match(checkPromotionWindow(at(HOUR), "not-a-date", NOW), /valid date/);
    assert.match(checkPromotionWindow(at(2 * HOUR), at(HOUR), NOW), /before it ends/);
    assert.match(checkPromotionWindow(at(HOUR), at(HOUR), NOW), /before it ends/);
    assert.match(checkPromotionWindow(at(-2 * HOUR), at(-HOUR), NOW), /already ended/);
    assert.match(checkPromotionWindow(at(-HOUR), NOW, NOW), /already ended/);
  });
});

describe("friendlyPromotionError", () => {
  it("maps known promotion failures to safe messages", () => {
    assert.match(
      friendlyPromotionError("That window overlaps an existing promotion."),
      /overlaps an existing promotion for this event/,
    );
    assert.doesNotMatch(
      friendlyPromotionError("That window overlaps an existing promotion."),
      /Only one promotion/,
    );
    assert.match(
      friendlyPromotionError('conflicting key value violates exclusion constraint "event_promotions_no_overlap"'),
      /overlaps/,
    );
    assert.match(
      friendlyPromotionError("Only published, non-cancelled events can be promoted."),
      /published/,
    );
    assert.match(
      friendlyPromotionError("That event no longer exists."),
      /no longer exists/,
    );
    assert.match(
      friendlyPromotionError("That promotion was already cancelled."),
      /already cancelled/,
    );
    assert.match(friendlyPromotionError("That promotion already ended."), /already ended/);
    assert.match(
      friendlyPromotionError("That promotion no longer exists."),
      /no longer exists/,
    );
    assert.match(
      friendlyPromotionError("Promotion must start before it ends."),
      /before it ends/,
    );
    assert.match(
      friendlyPromotionError("Only a super_admin or moderation_admin may manage promotions."),
      /moderation staff/,
    );
    assert.match(friendlyPromotionError("Sign in is required to manage promotions."), /Sign in/);
  });

  it("hides unknown database wording", () => {
    assert.equal(
      friendlyPromotionError("current transaction is aborted"),
      "Could not save the promotion. Please try again.",
    );
  });
});
