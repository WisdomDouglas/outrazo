import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { friendlyAdminError, useAccessToken } from "@/showcase/admin/admin-client";
import {
  getAdminOrganizer,
  type AdminOrganizerDetail,
  type AdminOrganizerEventSample,
} from "@/showcase/admin/admin-functions";

export const Route = createFileRoute("/admin/organizers/$organizerId")({
  head: () => ({ meta: [
    { title: "Organizer details — Admin Console — Outrazo" },
    { name: "description", content: "Staff view of one organizer with grouped events." },
  ] }),
  component: AdminOrganizerDetailPage,
});

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-xs border-b border-line py-sm last:border-0 sm:grid-cols-[160px_1fr]">
      <dt className="type-caption font-semibold text-muted-text">{label}</dt>
      <dd className="type-body">{children}</dd>
    </div>
  );
}

function EventGroup({ title, events }: { title: string; events: AdminOrganizerEventSample[] }) {
  return (
    <section aria-label={title} className="grid gap-md">
      <h3 className="type-h3">
        {title} ({events.length})
      </h3>
      {events.length === 0 ? (
        <p className="type-body text-muted-text">None.</p>
      ) : (
        <ul className="grid gap-xs">
          {events.map((event) => (
            <li key={event.id} className="type-body rounded-lg border border-line bg-card px-md py-sm">
              <Link
                to="/admin/events/$eventId"
                params={{ eventId: event.id }}
                className="focus-ring rounded-sm font-medium underline decoration-accent/50 underline-offset-2 hover:text-accent"
              >
                {event.title}
              </Link>
              <span className="text-muted-text">
                {" "}· {new Date(event.startsAt).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AdminOrganizerDetailPage() {
  const { organizerId } = Route.useParams();
  const token = useAccessToken();
  const [organizer, setOrganizer] = useState<AdminOrganizerDetail | null>(null);
  const [missing, setMissing] = useState(false);
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
    setMissing(false);
    try {
      const result = await getAdminOrganizer({
        data: { id: organizerId },
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrganizer(result.organizer);
    } catch (caught) {
      const friendly = friendlyAdminError(caught);
      if (/no longer exists/i.test(friendly)) {
        setMissing(true);
        setOrganizer(null);
      } else {
        setError(friendly);
      }
    } finally {
      setLoading(false);
    }
  }, [token, organizerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="grid gap-md" aria-label="Loading organizer">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState title="We couldn't load this organizer." description={error} onRetry={() => void refresh()} />
    );
  }

  if (missing || !organizer) {
    return (
      <EmptyState
        title="Organizer not found."
        description="It may have been deleted. Return to the list and try again."
        action={
          <Link to="/admin/organizers" className="focus-ring rounded-full">
            <Button>Back to organizers</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-xl">
      <div>
        <Link
          to="/admin/organizers"
          className="focus-ring type-body inline-flex items-center gap-xs rounded-sm text-muted-text hover:text-accent"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back to organizers
        </Link>
        <div className="mt-sm flex flex-wrap items-center gap-xs">
          <h2 className="type-h2 mr-sm">{organizer.name}</h2>
          {organizer.verified ? (
            <Badge variant="accent">Verified</Badge>
          ) : (
            <Badge variant="neutral">Unverified</Badge>
          )}
        </div>
      </div>

      <section aria-label="Organizer details" className="rounded-lg border border-line bg-card p-lg shadow-card">
        <dl>
          <DetailRow label="Owner">
            {organizer.owner ? (
              <>
                <Link
                  to="/admin/users/$userId"
                  params={{ userId: organizer.owner.id }}
                  className="focus-ring rounded-sm font-medium underline decoration-accent/50 underline-offset-2 hover:text-accent"
                >
                  {organizer.owner.name ?? "Unnamed user"}
                </Link>
                <span className="text-muted-text">
                  {organizer.owner.email ? ` · ${organizer.owner.email}` : ""}
                </span>{" "}
                {organizer.ownerSuspended === null ? (
                  <Badge variant="neutral">Status unknown</Badge>
                ) : organizer.ownerSuspended ? (
                  <Badge variant="transactional">Owner suspended</Badge>
                ) : (
                  <Badge variant="accent">Owner active</Badge>
                )}
              </>
            ) : (
              "No owner assigned"
            )}
          </DetailRow>
          <DetailRow label="Community">{organizer.community ?? "—"}</DetailRow>
          <DetailRow label="Location">{organizer.location ?? "—"}</DetailRow>
          <DetailRow label="Website">
            {organizer.website ? (
              <a
                href={organizer.website}
                target="_blank"
                rel="noreferrer"
                className="focus-ring rounded-sm underline decoration-accent/50 underline-offset-2 hover:text-accent"
              >
                {organizer.website}
              </a>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Description">{organizer.description || "—"}</DetailRow>
          <DetailRow label="Events">
            {organizer.counts.total} total · {organizer.counts.published} published ·{" "}
            {organizer.counts.drafts} drafts · {organizer.counts.cancelled} cancelled
          </DetailRow>
          <DetailRow label="Created">{new Date(organizer.createdAt).toLocaleString()}</DetailRow>
          <DetailRow label="Organizer ID">
            <span className="type-caption">{organizer.id}</span>
          </DetailRow>
        </dl>
      </section>

      <section aria-label="Publishing status" className="rounded-lg border border-line bg-card p-lg shadow-card">
        <h3 className="type-h3">Publishing status</h3>
        <p className="type-body mt-xs text-muted-text">
          {organizer.ownerSuspended
            ? "The owner is suspended, so this organizer cannot publish: event creation requires a signed-in owner."
            : "Publishing is allowed. Restricting a single organizer while its owner stays active needs a pending database change — see the Phase 2B report."}
        </p>
      </section>

      <EventGroup title="Published events" events={organizer.publishedEvents} />
      <EventGroup title="Drafts" events={organizer.draftEvents} />
      <EventGroup title="Cancelled events" events={organizer.cancelledEvents} />
    </div>
  );
}
