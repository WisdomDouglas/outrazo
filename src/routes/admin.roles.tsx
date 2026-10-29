import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { ErrorState } from "@/design-system/components/ErrorState";
import { AdminTable } from "@/showcase/admin/AdminTable";
import { friendlyAdminError, useAccessToken, useMyAdminRole } from "@/showcase/admin/admin-client";
import {
  grantAdminRole,
  listAdminRoles,
  revokeAdminRole,
  type AdminRoleRow,
} from "@/showcase/admin/admin-functions";
import {
  ADMIN_ROLES,
  ADMIN_ROLE_LABELS,
  roleHasPermission,
  type AdminRole,
} from "@/showcase/admin/permissions";

export const Route = createFileRoute("/admin/roles")({
  head: () => ({ meta: [
    { title: "Roles — Admin Console — Outrazo" },
    { name: "description", content: "Grant or revoke staff admin roles. Every change is audited." },
  ] }),
  component: AdminRolesPage,
});

function AdminRolesPage() {
  const token = useAccessToken();
  const { role: myRole } = useMyAdminRole();
  const [roles, setRoles] = useState<AdminRoleRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [newRole, setNewRole] = useState<AdminRole>("support_readonly");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const canManage = myRole !== null && roleHasPermission(myRole, "roles.manage");

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminRoles({
        data: { limit: 100 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setRoles(result.roles);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitGrant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    if (!email.trim() && !userId.trim()) {
      setFormError("Enter the person's email address or user id.");
      return;
    }
    setSaving(true);
    setFormError(null);
    setFormMessage(null);
    try {
      await grantAdminRole({
        data: {
          email: email.trim() || undefined,
          userId: userId.trim() || undefined,
          role: newRole,
          note: note.trim() || undefined,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setFormMessage(`Granted ${ADMIN_ROLE_LABELS[newRole]}. The change was written to the audit log.`);
      setEmail("");
      setUserId("");
      setNote("");
      void refresh();
    } catch (caught) {
      setFormError(friendlyAdminError(caught));
    } finally {
      setSaving(false);
    }
  };

  const submitRevoke = async (row: AdminRoleRow) => {
    if (!token) return;
    const label = row.name ?? row.email ?? row.userId;
    if (!window.confirm(`Remove the ${ADMIN_ROLE_LABELS[row.role]} role from ${label}? This is audited.`)) {
      return;
    }
    setSaving(true);
    setFormError(null);
    setFormMessage(null);
    try {
      await revokeAdminRole({
        data: { userId: row.userId },
        headers: { Authorization: `Bearer ${token}` },
      });
      setFormMessage(`Removed the role from ${label}. The change was written to the audit log.`);
      void refresh();
    } catch (caught) {
      setFormError(friendlyAdminError(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-xl">
      {canManage ? (
        <section aria-label="Grant a role" className="rounded-lg border border-line bg-card p-lg shadow-card">
          <h2 className="type-h2">Grant a role</h2>
          <p className="type-body mt-xs text-muted-text">
            Only super admins can grant roles. The grant and your identity are recorded in the audit log.
            You cannot change your own role.
          </p>
          <form onSubmit={(event) => void submitGrant(event)} className="mt-md grid gap-md sm:grid-cols-2">
            <div className="grid gap-xs">
              <label htmlFor="grant-email" className="type-caption font-semibold text-muted-text">
                Email address
              </label>
              <input
                id="grant-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="person@example.com"
                className="type-body focus-ring rounded-md border border-line bg-card px-md py-sm"
              />
            </div>
            <div className="grid gap-xs">
              <label htmlFor="grant-user-id" className="type-caption font-semibold text-muted-text">
                Or user id
              </label>
              <input
                id="grant-user-id"
                type="text"
                autoComplete="off"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="uuid (only if you know it)"
                className="type-body focus-ring rounded-md border border-line bg-card px-md py-sm"
              />
            </div>
            <div className="grid gap-xs">
              <label htmlFor="grant-role" className="type-caption font-semibold text-muted-text">
                Role
              </label>
              <select
                id="grant-role"
                value={newRole}
                onChange={(event) => setNewRole(event.target.value as AdminRole)}
                className="type-body focus-ring rounded-md border border-line bg-card px-md py-sm"
              >
                {ADMIN_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ADMIN_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-xs">
              <label htmlFor="grant-note" className="type-caption font-semibold text-muted-text">
                Note (optional)
              </label>
              <input
                id="grant-note"
                type="text"
                autoComplete="off"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why is this person getting access?"
                maxLength={280}
                className="type-body focus-ring rounded-md border border-line bg-card px-md py-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" loading={saving}>
                Grant role
              </Button>
            </div>
          </form>
          {formMessage ? (
            <p role="status" className="type-body mt-md font-medium text-accent">
              {formMessage}
            </p>
          ) : null}
          {formError ? (
            <div className="mt-md">
              <ErrorState title="Could not save the role." description={formError} />
            </div>
          ) : null}
        </section>
      ) : (
        <p className="type-body rounded-lg border border-line bg-card p-lg text-muted-text">
          You can view roles, but only a super admin can grant or revoke them.
        </p>
      )}

      <AdminTable
        title="Current roles"
        description="Everyone with admin access. Revoking the last super admin is blocked."
        columns={["Person", "Role", "Granted", "Note", canManage ? "Actions" : ""]}
        loading={loading}
        error={error}
        onRetry={() => void refresh()}
        emptyTitle="No admin roles yet."
        emptyDescription="Run the one-time bootstrap to create the first super admin."
        isEmpty={!roles || roles.length === 0}
      >
        {(roles ?? []).map((row) => (
          <tr key={row.userId} className="border-b border-line align-top last:border-0">
            <td className="type-body px-md py-sm">
              <span className="font-medium">{row.name ?? "—"}</span>
              {row.email ? <span className="block text-muted-text">{row.email}</span> : null}
            </td>
            <td className="type-body px-md py-sm font-medium">{ADMIN_ROLE_LABELS[row.role] ?? row.role}</td>
            <td className="type-body px-md py-sm whitespace-nowrap text-muted-text">
              {new Date(row.grantedAt).toLocaleDateString()}
            </td>
            <td className="type-body px-md py-sm text-muted-text">{row.note ?? "—"}</td>
            {canManage ? (
              <td className="type-body px-md py-sm">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => void submitRevoke(row)}
                  aria-label={`Revoke admin role from ${row.name ?? row.email ?? row.userId}`}
                >
                  Revoke
                </Button>
              </td>
            ) : (
              <td className="px-md py-sm" />
            )}
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
