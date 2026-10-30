// Admin Console Phase 1: roles and permissions (pure module, safe to import anywhere).
//
// This is the single source of truth for "which role may do what". The
// server-side guard (require-permission.server.ts) enforces it on every
// protected server function; the UI only uses these labels for display and
// never for access decisions.

export const ADMIN_ROLES = [
  "super_admin",
  "finance_admin",
  "moderation_admin",
  "support_readonly",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_PERMISSIONS = [
  "users.read",
  "users.manage",
  "events.read",
  "events.manage",
  "attendees.read",
  "roles.read",
  "roles.manage",
  "audit.read",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super admin",
  finance_admin: "Finance admin",
  moderation_admin: "Moderation admin",
  support_readonly: "Support (read-only)",
};

// Least-privilege map. Phase 1 has no finance data yet, so finance_admin can
// only read events, attendees, and the audit log; roles.manage and audit.read
// stay super-admin-only except where noted. events.manage (Phase 2A) covers
// content writes on others' events — publish, unpublish, cancel, reopen —
// and belongs to super_admin plus moderation_admin only.
export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  super_admin: [
    "users.read",
    "users.manage",
    "events.read",
    "events.manage",
    "attendees.read",
    "roles.read",
    "roles.manage",
    "audit.read",
  ],
  finance_admin: ["events.read", "attendees.read", "audit.read"],
  moderation_admin: ["users.read", "users.manage", "events.read", "events.manage", "attendees.read"],
  support_readonly: ["users.read", "events.read", "attendees.read"],
};

export function isAdminRole(value: unknown): value is AdminRole {
  return (
    typeof value === "string" &&
    (ADMIN_ROLES as readonly string[]).includes(value)
  );
}

export function roleHasPermission(
  role: AdminRole,
  permission: AdminPermission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// Dashboard metrics reuse the existing read permissions instead of adding new
// ones: each metric is visible only to roles holding its mapped permission,
// and the server returns null (shown as "Unavailable") otherwise — never a
// misleading zero.
export const DASHBOARD_METRICS = ["users", "organizers", "events", "rsvps"] as const;

export type DashboardMetric = (typeof DASHBOARD_METRICS)[number];

export const METRIC_PERMISSIONS: Record<DashboardMetric, AdminPermission> = {
  users: "users.read",
  organizers: "events.read",
  events: "events.read",
  rsvps: "attendees.read",
};

export function canSeeMetric(role: AdminRole, metric: DashboardMetric): boolean {
  return roleHasPermission(role, METRIC_PERMISSIONS[metric]);
}
