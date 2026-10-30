import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { ConfirmAction } from "@/showcase/admin/ConfirmAction";
import {
  friendlyAdminError,
  useAccessToken,
  useMyAdminRole,
} from "@/showcase/admin/admin-client";
import {
  getAdminEvent,
  setAdminEventCancelled,
  setAdminEventPublished,
  type AdminEventDetail,
} from "@/showcase/admin/admin-functions";
import { roleHasPermission } from "@/showcase/admin/permissions";
import { CANCELLED_STATUS } from "@/showcase/admin/event-transitions";

export const Route = createFileRoute("/admin/events/$eventId")({
  head: () => ({ meta: [
    { title: "Event details — Admin Console — Outrazo" },
    { name: "description", content: "Staff view of one event with publish and cancellation actions." },
  ] }),
  component: AdminEventDetailPage,
});

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-xs border-b border-line py-sm last:border-0 sm:grid-cols-[160px_1fr]">
      <dt className="type-caption font-semibold text-muted-text">{label}</dt>
      <dd className="type-body">{children}</dd>
    </div>
  );
}

function AdminEventDetailPage() {
  const { eventId } = Route.useParams();
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const [event, setEvent] = useState<AdminEventDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canManage = role !== null && roleHasPermission(role, "events.manage");

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setMissing(false);
    try {
      const result = await getAdminEvent({
        data: { id: eventId },
        headers: { Authorization: `Bearer ${token}` },
      });
      setEvent(result.event);
    } catch (caught) {
      const friendly = friendlyAdminError(caught);
      if (/no longer exists/i.test(friendly)) {
        setMissing(true);
        setEvent(null);
      } else {
        setError(friendly);
      }
    } finally {
      setLoading(false);
    }
  }, [token, eventId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runMutation = async (kind: "publish" | "unpublish" | "cancel" | "reopen") => {
    if (!token) return;
    setActing(true);
    setMessage(null);
    setActionError(null);
    try {
      if (kind === "publish" || kind === "unpublish") {
        await setAdminEventPublished({
          data: { id: eventId, published: kind === "publish" },
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessage(
          kind === "publish"
            ? "Event published. It is now visible in discovery."
            : "Event unpublished. It is hidden from discovery.",
        );
      } else {
        await setAdminEventCancelled({
          data: { id: eventId, cancelled: kind === "cancel" },
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessage(
          kind === "cancel"
            ? "Event cancelled. RSVPs and ticket tiers are untouched."
            : "Cancellation cleared. The event stays a draft until republished.",
        );
      }
      await refresh();
    } catch (caught) {
      setActionError(friendlyAdminError(caught));
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-md" aria-label="Loading event">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState title="We couldn't load this event." description={error} onRetry={() => void refresh()} />
    );
  }

  if (missing || !event) {
    return (
      <EmptyState
        title="Event not found."
        description="It may have been deleted. Return to the list and try again."
        action={
          <Link to="/admin/events" className="focus-ring rounded-full">
            <Button>Back to events</Button>
          </Link>
        }
      />
    );
  }

  const cancelled = event.status === CANCELLED_STATUS;
  const attendance =
    event.capacity > 0 ? `${event.attendeeCount} / ${event.capacity}` : `${event.attendeeCount}`;

  return (
    <div className="grid gap-xl">
      <div>
        <Link
          to="/admin/events"
          className="focus-ring type-body inline-flex items-center gap-xs rounded-sm text-muted-text hover:text-accent"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back to events
        </Link>
        <div className="mt-sm flex flex-wrap items-center gap-xs">
          <h2 className="type-h2 mr-sm">{event.title}</h2>
          <Badge variant={event.published ? "accent" : "neutral"}>
            {event.published ? "Published" : "Draft"}
          </Badge>
          {cancelled ? <Badge variant="transactional">Cancelled</Badge> : null}
          <Badge variant="outline">{event.category}</Badge>
        </div>
      </div>

      <section aria-label="Event details" className="rounded-lg border border-line bg-card p-lg shadow-card">
        <dl>
          <DetailRow label="Dates">
            {new Date(event.startsAt).toLocaleString()}
            {event.endsAt ? ` – ${new Date(event.endsAt).toLocaleString()}` : " (no end date)"}
          </DetailRow>
          <DetailRow label="Venue">
            {[event.venueName, event.address, event.city].filter(Boolean).join(" · ") || "—"}
          </DetailRow>
          <DetailRow label="Type">{event.eventType}</DetailRow>
          <DetailRow label="Price">
            {event.priceFrom === null ? "Free" : `${event.currency} ${event.priceFrom}`}
          </DetailRow>
          <DetailRow label="Attendance">{attendance} RSVPs</DetailRow>
          <DetailRow label="Organizer">
            {event.organizer ? (
              <>
                {event.organizer.name}{" "}
                {event.organizer.verified ? (
                  <Badge variant="accent">Verified</Badge>
                ) : (
                  <Badge variant="neutral">Unverified</Badge>
                )}
              </>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Created by">
            {event.creator
              ? `${event.creator.name ?? "—"}${event.creator.email ? ` · ${event.creator.email}` : ""}`
              : "—"}
          </DetailRow>
          <DetailRow label="Summary">{event.summary || "—"}</DetailRow>
          <DetailRow label="Event ID">
            <span className="type-caption">{event.id}</span>
          </DetailRow>
          <DetailRow label="Public page">
            <Link
              to="/events/$eventId"
              params={{ eventId: event.id }}
              className="focus-ring rounded-sm underline decoration-accent/50 underline-offset-2 hover:text-accent"
            >
              View as visitors see it
            </Link>
          </DetailRow>
        </dl>
      </section>

      <section aria-label="Ticket tiers" className="grid gap-md">
        <h3 className="type-h3">Ticket tiers ({event.tiers.length})</h3>
        {event.tiers.length === 0 ? (
          <p className="type-body text-muted-text">No ticket tiers. Free events RSVP without tiers.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Tier", "Price", "Quantity"].map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="type-caption px-md py-sm font-semibold tracking-wide text-muted-text uppercase"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {event.tiers.map((tier) => (
                  <tr key={tier.id} className="border-b border-line last:border-0">
                    <td className="type-body px-md py-sm font-medium">{tier.name}</td>
                    <td className="type-body px-md py-sm text-muted-text">
                      {event.currency} {tier.price}
                    </td>
                    <td className="type-body px-md py-sm text-muted-text">{tier.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Recent RSVPs" className="grid gap-md">
        <h3 className="type-h3">Recent RSVPs ({event.attendeeCount} total)</h3>
        {event.recentAttendees.length === 0 ? (
          <p className="type-body text-muted-text">No RSVPs yet.</p>
        ) : (
          <ul className="grid gap-xs">
            {event.recentAttendees.map((attendee) => (
              <li key={`${attendee.userId}-${attendee.createdAt}`} className="type-body rounded-lg border border-line bg-card px-md py-sm">
                <span className="font-medium">{attendee.name ?? "—"}</span>
                <span className="text-muted-text">
                  {attendee.email ? ` · ${attendee.email}` : ""} · {attendee.status} ·{" "}
                  {new Date(attendee.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Administrative actions" className="rounded-lg border border-line bg-card p-lg shadow-card">
        <h3 className="type-h3">Administrative actions</h3>
        <p className="type-body mt-xs text-muted-text">
          Every action is permission-checked on the server and written to the audit log.
        </p>
        {!canManage ? (
          <p className="type-body mt-md rounded-md border border-line p-md text-muted-text">
            You can view events, but only roles with the events.manage permission can change them.
          </p>
        ) : (
          <div className="mt-md flex flex-wrap gap-md">
            {!event.published && !cancelled ? (
              <ConfirmAction
                label="Publish"
                question="Publish this event?"
                disabled={acting}
                onConfirm={() => runMutation("publish")}
              />
            ) : null}
            {event.published ? (
              <ConfirmAction
                label="Unpublish"
                question="Hide this event from discovery?"
                disabled={acting}
                onConfirm={() => runMutation("unpublish")}
              />
            ) : null}
            {!cancelled ? (
              <ConfirmAction
                label="Cancel event"
                question="Cancel this event? RSVPs stay intact."
                disabled={acting}
                onConfirm={() => runMutation("cancel")}
              />
            ) : (
              <ConfirmAction
                label="Reopen"
                question="Clear the cancellation?"
                disabled={acting}
                onConfirm={() => runMutation("reopen")}
              />
            )}
          </div>
        )}
        {message ? (
          <p role="status" className="type-body mt-md font-medium text-accent">
            {message}
          </p>
        ) : null}
        {actionError ? (
          <p role="alert" className="type-body mt-md font-medium text-transactional">
            {actionError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
