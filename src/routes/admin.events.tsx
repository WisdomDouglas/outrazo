import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AdminTable } from "@/showcase/admin/AdminTable";
import { friendlyAdminError, useAccessToken } from "@/showcase/admin/admin-client";
import { listAdminEvents, type AdminEventRow } from "@/showcase/admin/admin-functions";

export const Route = createFileRoute("/admin/events")({
  head: () => ({ meta: [
    { title: "Events — Admin Console — Outrazo" },
    { name: "description", content: "Staff view of every event across organizers." },
  ] }),
  component: AdminEventsPage,
});

function AdminEventsPage() {
  const token = useAccessToken();
  const [events, setEvents] = useState<AdminEventRow[] | null>(null);
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
      const result = await listAdminEvents({
        data: { limit: 50 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setEvents(result.events);
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
      title="Events"
      description="Every event in the database, newest first, across all organizers."
      columns={["Title", "Category", "City", "Starts", "Status", "RSVPs"]}
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      emptyTitle="No events yet."
      emptyDescription="Published and draft events will appear here."
      isEmpty={!events || events.length === 0}
    >
      {(events ?? []).map((event) => (
        <tr key={event.id} className="border-b border-line last:border-0">
          <td className="type-body px-md py-sm font-medium">
            <Link
              to="/events/$eventId"
              params={{ eventId: event.id }}
              className="focus-ring rounded-sm underline decoration-accent/50 underline-offset-2 hover:text-accent"
            >
              {event.title}
            </Link>
          </td>
          <td className="type-body px-md py-sm text-muted-text">{event.category ?? "—"}</td>
          <td className="type-body px-md py-sm text-muted-text">{event.city ?? "—"}</td>
          <td className="type-body px-md py-sm text-muted-text">{new Date(event.startsAt).toLocaleString()}</td>
          <td className="type-body px-md py-sm">
            <span className={event.published ? "text-accent" : "text-muted-text"}>
              {event.published ? "Published" : "Draft"}
            </span>
          </td>
          <td className="type-body px-md py-sm text-muted-text">{event.attendeeCount}</td>
        </tr>
      ))}
    </AdminTable>
  );
}
