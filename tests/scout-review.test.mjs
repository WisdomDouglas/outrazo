// Scout review tests (S3). Attribution uses the exact approved wording,
// approval dates mirror create-event rules, cover URLs must be the
// reviewer's own bucket uploads, and overrides validate strictly.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  approvalOverridesSchema,
  buildScoutAttribution,
  checkApprovalDates,
  isReviewerCoverUrl,
  scoutDraftSlug,
  SCOUT_EVENT_CATEGORIES,
} from "@/showcase/scout/scout-review";

describe("buildScoutAttribution", () => {
  it("uses the exact approved wording", () => {
    assert.equal(
      buildScoutAttribution({
        organizerName: "GDG Uyo",
        sourceUrl: "https://gdg.example/devfest",
        reviewDateIso: "2026-11-04T10:00:00.000Z",
      }),
      "Community listing discovered by Outrazo Scout. " +
        "Original organizer: GDG Uyo. Source: https://gdg.example/devfest. " +
        "Source reviewed by Outrazo staff on 2026-11-04.",
    );
  });

  it("falls back instead of blanking the organizer", () => {
    const text = buildScoutAttribution({
      organizerName: null,
      sourceUrl: "https://x.example",
      reviewDateIso: "2026-11-04T00:00:00.000Z",
    });
    assert.match(text, /Original organizer: \(unknown organizer\)\./);
  });
});

describe("checkApprovalDates", () => {
  const now = Date.parse("2026-11-04T12:00:00.000Z");
  it("requires future start and end after start", () => {
    assert.deepEqual(
      checkApprovalDates("2026-11-05T09:00:00.000Z", "2026-11-05T17:00:00.000Z", now),
      { ok: true },
    );
    assert.equal(
      checkApprovalDates("2026-11-01T09:00:00.000Z", "2026-11-05T17:00:00.000Z", now).ok,
      false,
    );
    assert.equal(
      checkApprovalDates("2026-11-05T09:00:00.000Z", "2026-11-05T09:00:00.000Z", now).ok,
      false,
    );
  });
});

describe("isReviewerCoverUrl", () => {
  const base = "https://xyz.supabase.co";
  it("accepts only the reviewer's own bucket uploads", () => {
    assert.equal(
      isReviewerCoverUrl(`${base}/storage/v1/object/public/event-covers/u1/d/c.jpg`, base, "u1"),
      true,
    );
    assert.equal(
      isReviewerCoverUrl(`${base}/storage/v1/object/public/event-covers/u2/d/c.jpg`, base, "u1"),
      false,
    );
    assert.equal(isReviewerCoverUrl("https://evil.example/c.jpg", base, "u1"), false);
  });
});

describe("approvalOverridesSchema", () => {
  function valid() {
    return {
      title: "DevFest Uyo 2026",
      summary: "A full day of talks and codelabs for developers.",
      description: "Join us for a full day of talks, codelabs, and networking with the local developer community.",
      category: "tech",
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-01T17:00:00.000Z",
      venueName: "Ibom Hall",
      address: "1 Aka Road",
      city: "Uyo",
      capacity: 500,
      externalTicketUrl: null,
    };
  }
  it("accepts a complete review and pins the category list", () => {
    assert.deepEqual([...SCOUT_EVENT_CATEGORIES], ["parties", "music", "tech", "business", "culture", "food", "sports"]);
    assert.equal(approvalOverridesSchema.safeParse(valid()).success, true);
  });
  it("rejects short fields, bad urls, and non-https tickets", () => {
    assert.equal(approvalOverridesSchema.safeParse({ ...valid(), title: "x" }).success, false);
    assert.equal(approvalOverridesSchema.safeParse({ ...valid(), category: "all" }).success, false);
    assert.equal(
      approvalOverridesSchema.safeParse({ ...valid(), externalTicketUrl: "http://x.example" }).success,
      false,
    );
    assert.equal(
      approvalOverridesSchema.safeParse({ ...valid(), externalTicketUrl: "https://tickets.example/e/1" }).success,
      true,
    );
  });
});

describe("scoutDraftSlug", () => {
  it("mirrors the create-event slug convention", () => {
    assert.equal(
      scoutDraftSlug("DevFest Port Harcourt 2026!", "8dd928b4-162e-4bac-a610-67aed83ec30f"),
      "devfest-port-harcourt-2026-8dd928b4",
    );
  });

  it("trims dashes, caps length, and falls back for symbol-only titles", () => {
    assert.equal(scoutDraftSlug("  --Hello--  ", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), "hello-aaaaaaaa");
    assert.equal(scoutDraftSlug("!!!", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), "event-aaaaaaaa");
    const long = scoutDraftSlug(`${"a".repeat(200)} Party`, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    assert.equal(long, `${"a".repeat(80)}-aaaaaaaa`);
  });
});
