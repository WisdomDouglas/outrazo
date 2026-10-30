// Event-lifecycle helper tests: the stalled-mutation messages and search
// sanitizer used by the admin event-management server functions. Pure logic,
// no database.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTIVE_STATUS,
  CANCELLED_STATUS,
  describeStalledMutation,
  sanitizeSearchTerm,
} from "@/showcase/admin/event-transitions";

describe("status labels", () => {
  it("uses the documented terminal and active labels", () => {
    assert.equal(CANCELLED_STATUS, "cancelled");
    assert.equal(ACTIVE_STATUS, "upcoming");
  });
});

describe("describeStalledMutation", () => {
  it("reports a missing event for every kind", () => {
    for (const kind of ["publish", "unpublish", "cancel", "reopen"]) {
      assert.match(describeStalledMutation(kind, null), /no longer exists/);
    }
  });

  it("names the already-reached state for publish, unpublish, and cancel", () => {
    assert.match(
      describeStalledMutation("publish", { published: true, status: "upcoming" }),
      /already published/,
    );
    assert.match(
      describeStalledMutation("unpublish", { published: false, status: "upcoming" }),
      /already a draft/,
    );
    assert.match(
      describeStalledMutation("cancel", { published: false, status: "cancelled" }),
      /already cancelled/,
    );
  });

  it("handles reopen against cancelled and non-cancelled events", () => {
    assert.match(
      describeStalledMutation("reopen", { published: true, status: "upcoming" }),
      /not cancelled.*nothing to reopen/,
    );
    assert.match(
      describeStalledMutation("reopen", { published: false, status: "cancelled" }),
      /Could not reopen/,
    );
  });

  it("always points at refresh instead of a blind retry", () => {
    const states = [
      null,
      { published: true, status: "upcoming" },
      { published: false, status: "cancelled" },
    ];
    for (const kind of ["publish", "unpublish", "cancel", "reopen"]) {
      for (const state of states) {
        // Reopening a non-cancelled event needs no refresh: that state is known good.
        if (kind === "reopen" && state && state.status !== "cancelled") continue;
        assert.match(describeStalledMutation(kind, state), /[Rr]efresh/);
      }
    }
  });
});

describe("sanitizeSearchTerm", () => {
  it("strips PostgREST .or() metacharacters", () => {
    assert.equal(sanitizeSearchTerm("tech, music"), "tech music");
    assert.equal(sanitizeSearchTerm("100% live_night"), "100 livenight");
    assert.equal(sanitizeSearchTerm("a(b)\\c"), "abc");
  });

  it("trims and caps length at 120 characters", () => {
    assert.equal(sanitizeSearchTerm("  lagos  "), "lagos");
    assert.equal(sanitizeSearchTerm("x".repeat(200)).length, 120);
  });

  it("reduces hostile-only input to an empty search", () => {
    assert.equal(sanitizeSearchTerm(",,%%__"), "");
  });
});
