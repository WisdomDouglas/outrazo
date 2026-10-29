import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AdminTable } from "@/showcase/admin/AdminTable";
import { friendlyAdminError, useAccessToken } from "@/showcase/admin/admin-client";
import { listAdminAttendees, type AdminAttendeeRow } from "@/showcase/admin/admin-functions";

export const Route = createFileRoute("/admin/attendees")({
  head: () => ({ meta: [
    { title: "RSVPs — Admin Console — Outrazo" },
    { name: "description", content: "Staff view of reservations across events." },
  ] }),
  component: AdminAttendeesPage,
});

function AdminAttendeesPage() {
  const token = useAccessToken();
  const [attendees, setAttendees] = useState<AdminAttendeeRow[] | null>(null);
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
      const result = await listAdminAttendees({
        data: { limit: 50 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setAttendees(result.attendees);
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
      title="RSVPs"
      description="Real reservations across every event, newest first."
      columns={["Attendee", "Event", "Status", "Reserved"]}
      loading={loading}
      error={error}
      onRetry={() => void refresh()}
      emptyTitle="No RSVPs yet."
      emptyDescription="Reservations will appear here once people RSVP to events."
      isEmpty={!attendees || attendees.length === 0}
    >
      {(attendees ?? []).map((attendee) => (
        <tr key={attendee.id} className="border-b border-line last:border-0">
          <td className="type-body px-md py-sm">
            <span className="font-medium">{attendee.attendeeName ?? "—"}</span>
            {attendee.attendeeEmail ? (
              <span className="block text-muted-text">{attendee.attendeeEmail}</span>
            ) : null}
          </td>
          <td className="type-body px-md py-sm text-muted-text">
            <Link
              to="/events/$eventId"
              params={{ eventId: attendee.eventId }}
              className="focus-ring rounded-sm underline decoration-accent/50 underline-offset-2 hover:text-accent"
            >
              {attendee.eventTitle}
            </Link>
          </td>
          <td className="type-body px-md py-sm text-muted-text">{attendee.status}</td>
          <td className="type-body px-md py-sm text-muted-text">{new Date(attendee.createdAt).toLocaleString()}</td>
        </tr>
      ))}
    </AdminTable>
  );
}
