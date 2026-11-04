// Admin guard tests. requirePermission() talks to Supabase only through the
// user-scoped client's `rpc` method, so these tests drive the REAL guard with
// a fake rpc function: no database, no secrets, no network.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AdminAuthError,
  AdminBackendError,
  AdminForbiddenError,
  callCancelPromotionRpc,
  callCreatePromotionRpc,
  callGrantRoleRpc,
  callRevokeRoleRpc,
  callResolveReportRpc,
  getCallerRole,
  requirePermission,
} from "@/showcase/admin/require-permission.server";

function contextWith(rpc) {
  return { supabase: { rpc }, userId: "user-1" };
}

const okRpc = (role) => async () => ({ data: role, error: null });
const failingRpc = (message) => async () => ({ data: null, error: { message } });

describe("getCallerRole", () => {
  it("returns the caller's role", async () => {
    const role = await getCallerRole({ rpc: okRpc("support_readonly") });
    assert.equal(role, "support_readonly");
  });

  it("returns null for ordinary users", async () => {
    const role = await getCallerRole({ rpc: okRpc(null) });
    assert.equal(role, null);
  });

  it("reports a backend problem when the RPC fails", async () => {
    await assert.rejects(
      getCallerRole({ rpc: failingRpc('function "my_admin_role" does not exist') }),
      (error) => {
        assert.ok(error instanceof AdminBackendError);
        assert.match(error.message, /not available yet/);
        return true;
      },
    );
  });

  it("rejects an unknown role value instead of trusting it", async () => {
    await assert.rejects(getCallerRole({ rpc: okRpc("root") }), AdminBackendError);
  });
});

describe("requirePermission", () => {
  it("rejects missing or malformed auth context", async () => {
    for (const context of [null, undefined, {}, { userId: "user-1" }, { supabase: {} }]) {
      await assert.rejects(requirePermission(context, "users.read"), AdminAuthError);
    }
  });

  it("rejects ordinary users at the guard, before any data access", async () => {
    await assert.rejects(
      requirePermission(contextWith(okRpc(null)), "users.read"),
      (error) => {
        assert.ok(error instanceof AdminForbiddenError);
        assert.match(error.message, /do not have permission/);
        return true;
      },
    );
  });

  it("rejects admins lacking the specific permission", async () => {
    await assert.rejects(
      requirePermission(contextWith(okRpc("support_readonly")), "roles.manage"),
      (error) => {
        assert.ok(error instanceof AdminForbiddenError);
        assert.match(error.message, /roles\.manage/);
        return true;
      },
    );
  });

  it("rejects read-only support staff from user moderation", async () => {
    await assert.rejects(
      requirePermission(contextWith(okRpc("support_readonly")), "users.manage"),
      (error) => {
        assert.ok(error instanceof AdminForbiddenError);
        assert.match(error.message, /users\.manage/);
        return true;
      },
    );
  });

  it("passes the service client only after the check succeeds", async () => {
    const grant = await requirePermission(contextWith(okRpc("support_readonly")), "users.read");
    assert.equal(grant.role, "support_readonly");
    assert.equal(grant.userId, "user-1");
    assert.ok(grant.supabase, "expected a database client on the grant");
    assert.ok(grant.userClient, "expected the caller client on the grant");
  });

  it("lets super_admin through every permission", async () => {
    for (const permission of [
      "users.read",
      "users.manage",
      "events.read",
      "events.manage",
      "attendees.read",
      "reports.read",
      "reports.manage",
      "promotions.read",
      "promotions.manage",
      "promotions.pricing",
      "roles.read",
      "roles.manage",
      "audit.read",
    ]) {
      const grant = await requirePermission(contextWith(okRpc("super_admin")), permission);
      assert.equal(grant.role, "super_admin");
    }
  });

  it("lets moderation_admin read and resolve reports", async () => {
    for (const permission of ["reports.read", "reports.manage"]) {
      const grant = await requirePermission(contextWith(okRpc("moderation_admin")), permission);
      assert.equal(grant.role, "moderation_admin");
    }
  });

  it("rejects support and finance staff from the reports queue", async () => {
    for (const role of ["support_readonly", "finance_admin"]) {
      for (const permission of ["reports.read", "reports.manage"]) {
        await assert.rejects(
          requirePermission(contextWith(okRpc(role)), permission),
          AdminForbiddenError,
        );
      }
    }
  });

  it("lets moderation_admin read and manage promotions", async () => {
    for (const permission of ["promotions.read", "promotions.manage"]) {
      const grant = await requirePermission(contextWith(okRpc("moderation_admin")), permission);
      assert.equal(grant.role, "moderation_admin");
    }
  });

  it("rejects support staff from promotions and pricing", async () => {
    for (const permission of ["promotions.read", "promotions.manage", "promotions.pricing"]) {
      await assert.rejects(
        requirePermission(contextWith(okRpc("support_readonly")), permission),
        AdminForbiddenError,
      );
    }
  });

  it("lets finance_admin read promotions and manage pricing, but not schedule them", async () => {
    for (const permission of ["promotions.read", "promotions.pricing"]) {
      const grant = await requirePermission(contextWith(okRpc("finance_admin")), permission);
      assert.equal(grant.role, "finance_admin");
    }
    await assert.rejects(
      requirePermission(contextWith(okRpc("finance_admin")), "promotions.manage"),
      AdminForbiddenError,
    );
  });

  it("rejects moderation_admin from promotion pricing", async () => {
    await assert.rejects(
      requirePermission(contextWith(okRpc("moderation_admin")), "promotions.pricing"),
      AdminForbiddenError,
    );
  });

  it("surfaces backend failures distinctly from denials", async () => {
    await assert.rejects(
      requirePermission(contextWith(failingRpc("connection reset")), "users.read"),
      AdminBackendError,
    );
  });
});

describe("role RPC mapping", () => {
  it("resolves quietly on success", async () => {
    await callGrantRoleRpc(
      { rpc: async () => ({ error: null }) },
      { userId: "user-2", role: "support_readonly", note: null },
    );
    await callRevokeRoleRpc({ rpc: async () => ({ error: null }) }, "user-2");
  });

  it("maps database guard rails to friendly errors", async () => {
    const cases = [
      ["Only a super_admin may grant roles.", AdminForbiddenError, /super admin/],
      ["Administrators cannot change their own role.", AdminForbiddenError, /own role/],
      ["Cannot remove the last super_admin.", AdminForbiddenError, /last super admin/],
      ["No such user.", AdminAuthError, /No user/],
      ["That user is not an administrator.", AdminAuthError, /not an administrator/],
    ];
    for (const [message, Kind, pattern] of cases) {
      await assert.rejects(
        callGrantRoleRpc(
          { rpc: failingRpc(message) },
          { userId: "user-2", role: "support_readonly", note: null },
        ),
        (error) => {
          assert.ok(error instanceof Kind, message);
          assert.match(error.message, pattern);
          return true;
        },
      );
    }
  });

  it("hides unexpected database wording behind a retry message", async () => {
    await assert.rejects(
      callGrantRoleRpc(
        { rpc: failingRpc("permission denied for table admin_roles") },
        { userId: "user-2", role: "support_readonly", note: null },
      ),
      (error) => {
        assert.ok(error instanceof AdminBackendError);
        assert.doesNotMatch(error.message, /admin_roles/);
        return true;
      },
    );
  });
});

describe("resolve report RPC mapping", () => {
  const input = { reportId: "report-1", resolution: "dismissed", unpublish: false, note: null };

  it("resolves quietly on success", async () => {
    await callResolveReportRpc({ rpc: async () => ({ error: null }) }, input);
  });

  it("maps database guard rails to friendly errors", async () => {
    const cases = [
      ["Only a super_admin or moderation_admin may resolve reports.", AdminForbiddenError, /moderation staff/],
      ["That report was already resolved. Refresh to see its current state.", AdminBackendError, /already resolved/],
      ["That report no longer exists.", AdminBackendError, /no longer exists/],
      ["Resolution note is too long (500 characters maximum).", AdminBackendError, /too long/],
      ["Unknown resolution.", AdminBackendError, /Unknown resolution/],
      ["Dismissed reports cannot unpublish events.", AdminBackendError, /cannot unpublish/],
    ];
    for (const [message, Kind, pattern] of cases) {
      await assert.rejects(
        callResolveReportRpc({ rpc: failingRpc(message) }, input),
        (error) => {
          assert.ok(error instanceof Kind, message);
          assert.match(error.message, pattern);
          return true;
        },
      );
    }
  });

  it("hides unexpected database wording behind a retry message", async () => {
    await assert.rejects(
      callResolveReportRpc(
        { rpc: failingRpc("permission denied for table event_reports") },
        input,
      ),
      (error) => {
        assert.ok(error instanceof AdminBackendError);
        assert.doesNotMatch(error.message, /event_reports/);
        return true;
      },
    );
  });
});

describe("promotion RPC mapping", () => {
  const createInput = { eventId: "event-1", startsAt: "2026-11-05T12:00:00Z", endsAt: "2026-11-06T12:00:00Z" };

  it("resolves quietly on success", async () => {
    const id = await callCreatePromotionRpc(
      { rpc: async () => ({ data: "promo-1", error: null }) },
      createInput,
    );
    assert.equal(id, "promo-1");
    await callCancelPromotionRpc({ rpc: async () => ({ error: null }) }, "promo-1");
  });

  it("maps database guard rails to friendly errors", async () => {
    const createCases = [
      ["Only a super_admin or moderation_admin may manage promotions.", AdminForbiddenError, /moderation staff/],
      ["Only published, non-cancelled events can be promoted.", AdminBackendError, /published/],
      ["That window overlaps an existing promotion.", AdminBackendError, /overlaps/],
      ['conflicting key value violates exclusion constraint "event_promotions_no_overlap"', AdminBackendError, /overlaps/],
      ["That event no longer exists.", AdminBackendError, /no longer exists/],
      ["Promotion must start before it ends.", AdminBackendError, /before it ends/],
      ["That window already ended. Choose an end time in the future.", AdminBackendError, /already ended/],
    ];
    for (const [message, Kind, pattern] of createCases) {
      await assert.rejects(
        callCreatePromotionRpc({ rpc: failingRpc(message) }, createInput),
        (error) => {
          assert.ok(error instanceof Kind, message);
          assert.match(error.message, pattern);
          return true;
        },
      );
    }
    const cancelCases = [
      ["That promotion was already cancelled. Refresh to see its current state.", AdminBackendError, /already cancelled/],
      ["That promotion already ended.", AdminBackendError, /already ended/],
      ["That promotion no longer exists.", AdminBackendError, /no longer exists/],
    ];
    for (const [message, Kind, pattern] of cancelCases) {
      await assert.rejects(
        callCancelPromotionRpc({ rpc: failingRpc(message) }, "promo-1"),
        (error) => {
          assert.ok(error instanceof Kind, message);
          assert.match(error.message, pattern);
          return true;
        },
      );
    }
  });

  it("hides unexpected database wording behind a retry message", async () => {
    await assert.rejects(
      callCreatePromotionRpc(
        { rpc: failingRpc("permission denied for table event_promotions") },
        createInput,
      ),
      (error) => {
        assert.ok(error instanceof AdminBackendError);
        assert.doesNotMatch(error.message, /event_promotions/);
        return true;
      },
    );
  });
});
