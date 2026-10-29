import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AdminTable } from "@/showcase/admin/AdminTable";
import { friendlyAdminError, useAccessToken } from "@/showcase/admin/admin-client";
import { listAdminUsers, type AdminUserRow } from "@/showcase/admin/admin-functions";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [
    { title: "Users — Admin Console — Outrazo" },
    { name: "description", content: "Staff view of user accounts." },
  ] }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const token = useAccessToken();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminUsers({
        data: { limit: 50 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(result.users);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AdminTable
      title="Users"
      description="Real user accounts, newest first. Only the columns staff need are shown."
      columns={["Name", "Email", "Location", "Onboarded", "Joined"]}
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      emptyTitle="No users yet."
      emptyDescription="Accounts will appear here once people sign up."
      isEmpty={!users || users.length === 0}
    >
      {(users ?? []).map((user) => (
        <tr key={user.id} className="border-b border-line last:border-0">
          <td className="type-body px-md py-sm font-medium">{user.name ?? "—"}</td>
          <td className="type-body px-md py-sm text-muted-text">{user.email ?? "—"}</td>
          <td className="type-body px-md py-sm text-muted-text">{user.location ?? "—"}</td>
          <td className="type-body px-md py-sm text-muted-text">{user.onboardingCompleted ? "Yes" : "No"}</td>
          <td className="type-body px-md py-sm text-muted-text">{new Date(user.createdAt).toLocaleDateString()}</td>
        </tr>
      ))}
    </AdminTable>
  );
}
