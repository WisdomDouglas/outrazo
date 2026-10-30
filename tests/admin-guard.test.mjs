// Admin guard tests. requirePermission() talks to Supabase only through the
// user-scoped client's `rpc` method, so these tests drive the REAL guard with
// a fake rpc function: no database, no secrets, no network.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AdminAuthError,
  AdminBackendError,
  AdminForbiddenError,
  callGrantRoleRpc,
  callRevokeRoleRpc,
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
      "roles.read",
      "roles.manage",
      "audit.read",
    ]) {
      const grant = await requirePermission(contextWith(okRpc("super_admin")), permission);
      assert.equal(grant.role, "super_admin");
    }
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
