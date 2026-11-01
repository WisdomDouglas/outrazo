// Moderation-report pure-helper tests (Phase 2C-1). The reason/status lists
// mirror the migration CHECK constraints by hand, so drift between the UI and
// the database fails loudly here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkResolutionTransition,
  friendlyFilingError,
  friendlyResolutionError,
  isReportReason,
  isReportResolution,
  isReportStatus,
  REPORT_DAILY_LIMIT,
  REPORT_DETAILS_MAX,
  REPORT_NOTE_MAX,
  REPORT_REASON_DESCRIPTIONS,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  REPORT_RESOLUTIONS,
  REPORT_STATUS_LABELS,
  REPORT_STATUSES,
} from "@/showcase/moderation/report-reasons";

describe("report reasons", () => {
  it("defines exactly the five approved reasons", () => {
    assert.deepEqual([...REPORT_REASONS], [
      "spam",
      "misleading",
      "inappropriate",
      "scam",
      "other",
    ]);
  });

  it("labels and describes every reason", () => {
    assert.deepEqual({ ...REPORT_REASON_LABELS }, {
      spam: "Spam",
      misleading: "Misleading",
      inappropriate: "Inappropriate",
      scam: "Scam",
      other: "Other",
    });
    for (const reason of REPORT_REASONS) {
      assert.ok(
        REPORT_REASON_DESCRIPTIONS[reason].length > 0,
        `missing description for ${reason}`,
      );
    }
  });

  it("recognizes only known reasons", () => {
    assert.equal(isReportReason("spam"), true);
    assert.equal(isReportReason("other"), true);
    assert.equal(isReportReason("abuse"), false);
    assert.equal(isReportReason("SPAM"), false);
    assert.equal(isReportReason(null), false);
    assert.equal(isReportReason(undefined), false);
    assert.equal(isReportReason(42), false);
  });
});

describe("report statuses", () => {
  it("defines the pending-first lifecycle", () => {
    assert.deepEqual([...REPORT_STATUSES], ["pending", "dismissed", "actioned"]);
    assert.deepEqual([...REPORT_RESOLUTIONS], ["dismissed", "actioned"]);
    assert.deepEqual({ ...REPORT_STATUS_LABELS }, {
      pending: "Pending review",
      dismissed: "Dismissed",
      actioned: "Actioned",
    });
  });

  it("recognizes only known statuses and resolutions", () => {
    assert.equal(isReportStatus("pending"), true);
    assert.equal(isReportStatus("actioned"), true);
    assert.equal(isReportStatus("resolved"), false);
    assert.equal(isReportResolution("dismissed"), true);
    assert.equal(isReportResolution("pending"), false);
    assert.equal(isReportResolution("resolved"), false);
  });

  it("keeps the client limits in sync with the migration", () => {
    assert.equal(REPORT_DETAILS_MAX, 1000);
    assert.equal(REPORT_NOTE_MAX, 500);
    assert.equal(REPORT_DAILY_LIMIT, 10);
  });
});

describe("checkResolutionTransition", () => {
  it("allows resolving pending reports", () => {
    assert.equal(checkResolutionTransition("pending"), null);
  });

  it("blocks re-resolving terminal reports", () => {
    for (const status of ["dismissed", "actioned"]) {
      assert.match(
        checkResolutionTransition(status),
        /already resolved/,
        status,
      );
    }
  });
});

describe("friendlyFilingError", () => {
  it("maps known filing failures to safe messages", () => {
    assert.match(friendlyFilingError("Sign in is required to report an event."), /Sign in/);
    assert.match(
      friendlyFilingError("You have already reported this event. Our team will review it."),
      /already reported/,
    );
    assert.match(
      friendlyFilingError("Daily report limit reached. Try again tomorrow."),
      /daily report limit/,
    );
    assert.match(friendlyFilingError("That event no longer exists."), /no longer exists/);
    assert.match(
      friendlyFilingError("Report details are too long (1000 characters maximum)."),
      /1000/,
    );
    assert.match(friendlyFilingError("Unknown report reason."), /valid reason/);
    assert.match(friendlyFilingError("No profile exists for this account."), /profile/);
  });

  it("hides unknown database wording", () => {
    assert.equal(
      friendlyFilingError("duplicate key value violates unique constraint"),
      "Could not submit the report. Please try again.",
    );
  });
});

describe("friendlyResolutionError", () => {
  it("maps known resolution failures to safe messages", () => {
    assert.match(
      friendlyResolutionError("That report was already resolved. Refresh to see its current state."),
      /already resolved/,
    );
    assert.match(friendlyResolutionError("That report no longer exists."), /no longer exists/);
    assert.match(
      friendlyResolutionError("Only a super_admin or moderation_admin may resolve reports."),
      /moderation staff/,
    );
    assert.match(friendlyResolutionError("Sign in is required to resolve reports."), /Sign in/);
    assert.match(
      friendlyResolutionError("Resolution note is too long (500 characters maximum)."),
      /500/,
    );
    assert.match(friendlyResolutionError("Unknown resolution."), /valid resolution/);
    assert.match(
      friendlyResolutionError("Dismissed reports cannot unpublish events."),
      /cannot unpublish/,
    );
  });

  it("hides unknown database wording", () => {
    assert.equal(
      friendlyResolutionError("current transaction is aborted"),
      "Could not resolve the report. Please try again.",
    );
  });
});
