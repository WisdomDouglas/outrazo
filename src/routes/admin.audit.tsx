import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AdminTable } from "@/showcase/admin/AdminTable";
import { friendlyAdminError, useAccessToken } from "@/showcase/admin/admin-client";
import { listAuditLog, type AuditLogRow } from "@/showcase/admin/admin-functions";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({ meta: [
    { title: "Audit log — Admin Console — Outrazo" },
    { name: "description", content: "Audited record of admin role changes." },
  ] }),
  component: AdminAuditPage,
});

function AdminAuditPage() {
  const token = useAccessToken();
  const [entries, setEntries] = useState<AuditLogRow[] | null>(null);
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
      const result = await listAuditLog({
        data: { limit: 50 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setEntries(result.entries);
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
      title="Audit log"
      description="Append-only record of bootstrap and role changes. Entries are never edited or deleted."
      columns={["When", "Actor", "Action", "Details"]}
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      emptyTitle="No audited actions yet."
      emptyDescription="Bootstrap and role grants will appear here."
      isEmpty={!entries || entries.length === 0}
    >
      {(entries ?? []).map((entry) => (
        <tr key={entry.id} className="border-b border-line align-top last:border-0">
          <td className="type-body px-md py-sm whitespace-nowrap text-muted-text">
            {new Date(entry.createdAt).toLocaleString()}
          </td>
          <td className="type-body px-md py-sm">
            <span className="font-medium">{entry.actorName ?? "system"}</span>
          </td>
          <td className="type-body px-md py-sm font-medium">{entry.action}</td>
          <td className="type-body px-md py-sm text-muted-text">
            <details>
              <summary className="focus-ring cursor-pointer rounded-sm">
                {entry.entityType}
                {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}…` : ""}
              </summary>
              <pre className="type-caption mt-xs overflow-x-auto rounded-md border border-line bg-card p-sm">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </details>
          </td>
        </tr>
      ))}
    </AdminTable>
  );
}
