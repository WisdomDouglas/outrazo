// Admin permission-matrix tests: the exact least-privilege contract Phase 1
// enforces server-side. These expectations are written out by hand (not
// derived from the map) so a widening change fails loudly.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  canSeeMetric,
  DASHBOARD_METRICS,
  isAdminRole,
  METRIC_PERMISSIONS,
  ROLE_PERMISSIONS,
  roleHasPermission,
} from "@/showcase/admin/permissions";

describe("admin roles", () => {
  it("defines exactly the four Phase 1 roles", () => {
    assert.deepEqual([...ADMIN_ROLES], [
      "super_admin",
      "finance_admin",
      "moderation_admin",
      "support_readonly",
    ]);
  });

  it("defines exactly the eight admin permissions", () => {
    assert.deepEqual([...ADMIN_PERMISSIONS], [
      "users.read",
      "users.manage",
      "events.read",
      "events.manage",
      "attendees.read",
      "roles.read",
      "roles.manage",
      "audit.read",
    ]);
  });

  it("recognizes only known roles", () => {
    assert.equal(isAdminRole("super_admin"), true);
    assert.equal(isAdminRole("support_readonly"), true);
    assert.equal(isAdminRole("admin"), false);
    assert.equal(isAdminRole("SUPER_ADMIN"), false);
    assert.equal(isAdminRole(null), false);
    assert.equal(isAdminRole(undefined), false);
    assert.equal(isAdminRole(42), false);
  });
});

describe("roleHasPermission", () => {
  it("grants super_admin everything", () => {
    for (const permission of ADMIN_PERMISSIONS) {
      assert.equal(roleHasPermission("super_admin", permission), true, permission);
    }
  });

  it("keeps finance_admin read-only on events, attendees, and audit", () => {
    assert.equal(roleHasPermission("finance_admin", "events.read"), true);
    assert.equal(roleHasPermission("finance_admin", "attendees.read"), true);
    assert.equal(roleHasPermission("finance_admin", "audit.read"), true);
    assert.equal(roleHasPermission("finance_admin", "users.read"), false);
    assert.equal(roleHasPermission("finance_admin", "users.manage"), false);
    assert.equal(roleHasPermission("finance_admin", "events.manage"), false);
    assert.equal(roleHasPermission("finance_admin", "roles.read"), false);
    assert.equal(roleHasPermission("finance_admin", "roles.manage"), false);
  });

  it("gives moderation_admin user and event management, nothing else", () => {
    assert.equal(roleHasPermission("moderation_admin", "users.read"), true);
    assert.equal(roleHasPermission("moderation_admin", "users.manage"), true);
    assert.equal(roleHasPermission("moderation_admin", "events.read"), true);
    assert.equal(roleHasPermission("moderation_admin", "events.manage"), true);
    assert.equal(roleHasPermission("moderation_admin", "attendees.read"), true);
    assert.equal(roleHasPermission("moderation_admin", "roles.read"), false);
    assert.equal(roleHasPermission("moderation_admin", "roles.manage"), false);
    assert.equal(roleHasPermission("moderation_admin", "audit.read"), false);
  });

  it("gives support_readonly the three read views and nothing else", () => {
    assert.equal(roleHasPermission("support_readonly", "users.read"), true);
    assert.equal(roleHasPermission("support_readonly", "events.read"), true);
    assert.equal(roleHasPermission("support_readonly", "attendees.read"), true);
    assert.equal(roleHasPermission("support_readonly", "users.manage"), false);
    assert.equal(roleHasPermission("support_readonly", "events.manage"), false);
    assert.equal(roleHasPermission("support_readonly", "roles.read"), false);
    assert.equal(roleHasPermission("support_readonly", "roles.manage"), false);
    assert.equal(roleHasPermission("support_readonly", "audit.read"), false);
  });

  it("reserves roles.manage for super_admin alone", () => {
    for (const role of ADMIN_ROLES) {
      assert.equal(
        roleHasPermission(role, "roles.manage"),
        role === "super_admin",
        role,
      );
    }
  });

  it("grants events.manage only to super_admin and moderation_admin", () => {
    for (const role of ADMIN_ROLES) {
      assert.equal(
        roleHasPermission(role, "events.manage"),
        role === "super_admin" || role === "moderation_admin",
        role,
      );
    }
  });

  it("grants users.manage only to super_admin and moderation_admin", () => {
    for (const role of ADMIN_ROLES) {
      assert.equal(
        roleHasPermission(role, "users.manage"),
        role === "super_admin" || role === "moderation_admin",
        role,
      );
    }
  });

  it("maps each dashboard metric to its least-privilege permission", () => {
    assert.deepEqual({ ...METRIC_PERMISSIONS }, {
      users: "users.read",
      organizers: "events.read",
      events: "events.read",
      rsvps: "attendees.read",
    });
    assert.deepEqual([...DASHBOARD_METRICS], ["users", "organizers", "events", "rsvps"]);
  });

  it("shows every metric to super_admin and gates the rest per role", () => {
    for (const metric of DASHBOARD_METRICS) {
      assert.equal(canSeeMetric("super_admin", metric), true, metric);
    }
    // support_readonly: users + events + rsvps, no roles/audit (metrics need none of those)
    assert.equal(canSeeMetric("support_readonly", "users"), true);
    assert.equal(canSeeMetric("support_readonly", "organizers"), true);
    assert.equal(canSeeMetric("support_readonly", "events"), true);
    assert.equal(canSeeMetric("support_readonly", "rsvps"), true);
    // moderation_admin: reads users too (needed to moderate accounts)
    assert.equal(canSeeMetric("moderation_admin", "users"), true);
    assert.equal(canSeeMetric("moderation_admin", "organizers"), true);
    assert.equal(canSeeMetric("moderation_admin", "events"), true);
    assert.equal(canSeeMetric("moderation_admin", "rsvps"), true);
    // finance_admin: events + rsvps, no user counts
    assert.equal(canSeeMetric("finance_admin", "users"), false);
    assert.equal(canSeeMetric("finance_admin", "organizers"), true);
    assert.equal(canSeeMetric("finance_admin", "events"), true);
    assert.equal(canSeeMetric("finance_admin", "rsvps"), true);
  });

  it("keeps the static map in sync with the checker", () => {
    for (const role of ADMIN_ROLES) {
      for (const permission of ADMIN_PERMISSIONS) {
        assert.equal(
          ROLE_PERMISSIONS[role].includes(permission),
          roleHasPermission(role, permission),
          `${role} ${permission}`,
        );
      }
    }
  });
});
