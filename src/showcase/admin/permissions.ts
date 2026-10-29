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
  "events.read",
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
// stay super-admin-only except where noted.
export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  super_admin: [
    "users.read",
    "events.read",
    "attendees.read",
    "roles.read",
    "roles.manage",
    "audit.read",
  ],
  finance_admin: ["events.read", "attendees.read", "audit.read"],
  moderation_admin: ["events.read", "attendees.read"],
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
