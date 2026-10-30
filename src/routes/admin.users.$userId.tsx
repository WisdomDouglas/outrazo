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
  getAdminUser,
  setAdminUserSuspended,
  type AdminUserDetail,
} from "@/showcase/admin/admin-functions";
import { roleHasPermission } from "@/showcase/admin/permissions";

export const Route = createFileRoute("/admin/users/$userId")({
  head: () => ({ meta: [
    { title: "User details — Admin Console — Outrazo" },
    { name: "description", content: "Staff view of one user with account activity and moderation." },
  ] }),
  component: AdminUserDetailPage,
});

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-xs border-b border-line py-sm last:border-0 sm:grid-cols-[160px_1fr]">
      <dt className="type-caption font-semibold text-muted-text">{label}</dt>
      <dd className="type-body">{children}</dd>
    </div>
  );
}

function AdminUserDetailPage() {
  const { userId } = Route.useParams();
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canManage = role !== null && roleHasPermission(role, "users.manage");

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
      const result = await getAdminUser({
        data: { id: userId },
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(result.user);
    } catch (caught) {
      const friendly = friendlyAdminError(caught);
      if (/no longer exists/i.test(friendly)) {
        setMissing(true);
        setUser(null);
      } else {
        setError(friendly);
      }
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runSuspension = async (suspended: boolean) => {
    if (!token) return;
    setActing(true);
    setMessage(null);
    setActionError(null);
    try {
      await setAdminUserSuspended({
        data: { id: userId, suspended },
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage(
        suspended
          ? "Account suspended. The user cannot sign in. Their events and RSVPs are untouched."
          : "Account restored. The user can sign in again.",
      );
      await refresh();
    } catch (caught) {
      setActionError(friendlyAdminError(caught));
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-md" aria-label="Loading user">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState title="We couldn't load this user." description={error} onRetry={() => void refresh()} />
    );
  }

  if (missing || !user) {
    return (
      <EmptyState
        title="User not found."
        description="The account may have been deleted. Return to the list and try again."
        action={
          <Link to="/admin/users" className="focus-ring rounded-full">
            <Button>Back to users</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-xl">
      <div>
        <Link
          to="/admin/users"
          className="focus-ring type-body inline-flex items-center gap-xs rounded-sm text-muted-text hover:text-accent"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back to users
        </Link>
        <div className="mt-sm flex flex-wrap items-center gap-xs">
          <h2 className="type-h2 mr-sm">{user.name ?? "Unnamed user"}</h2>
          {user.suspended === null ? (
            <Badge variant="neutral">Status unknown</Badge>
          ) : user.suspended ? (
            <Badge variant="transactional">Suspended</Badge>
          ) : (
            <Badge variant="accent">Active</Badge>
          )}
          <Badge variant="outline">{user.onboardingCompleted ? "Onboarded" : "Onboarding pending"}</Badge>
        </div>
      </div>

      <section aria-label="Account details" className="rounded-lg border border-line bg-card p-lg shadow-card">
        <dl>
          <DetailRow label="Email">{user.email ?? "—"}</DetailRow>
          <DetailRow label="Location">{user.location ?? "—"}</DetailRow>
          <DetailRow label="Joined">{new Date(user.createdAt).toLocaleString()}</DetailRow>
          {user.bannedUntil ? (
            <DetailRow label="Suspended until">{new Date(user.bannedUntil).toLocaleString()}</DetailRow>
          ) : null}
          <DetailRow label="User ID">
            <span className="type-caption">{user.id}</span>
          </DetailRow>
        </dl>
      </section>

      <section aria-label="Moderation" className="rounded-lg border border-line bg-card p-lg shadow-card">
        <h3 className="type-h3">Moderation</h3>
        <p className="type-body mt-xs text-muted-text">
          Suspension blocks sign-in at the auth server. Events, RSVPs, and history are never
          deleted. Every action is audited.
        </p>
        {!canManage ? (
          <p className="type-body mt-md rounded-md border border-line p-md text-muted-text">
            You can view accounts, but only roles with the users.manage permission can suspend or
            restore them.
          </p>
        ) : user.suspended === null ? (
          <p className="type-body mt-md rounded-md border border-line p-md text-muted-text">
            The login status could not be verified, so actions are disabled. Refresh and try again.
          </p>
        ) : (
          <div className="mt-md flex flex-wrap gap-md">
            {user.suspended ? (
              <ConfirmAction
                label="Restore account"
                question="Allow this user to sign in again?"
                disabled={acting}
                onConfirm={() => runSuspension(false)}
              />
            ) : (
              <ConfirmAction
                label="Suspend account"
                question="Block this user from signing in?"
                disabled={acting}
                onConfirm={() => runSuspension(true)}
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

      <section aria-label="Created events" className="grid gap-md">
        <h3 className="type-h3">Created events ({user.eventCount})</h3>
        {user.createdEvents.length === 0 ? (
          <p className="type-body text-muted-text">This user has not created any events.</p>
        ) : (
          <ul className="grid gap-xs">
            {user.createdEvents.map((event) => (
              <li key={event.id} className="type-body rounded-lg border border-line bg-card px-md py-sm">
                <Link
                  to="/admin/events/$eventId"
                  params={{ eventId: event.id }}
                  className="focus-ring rounded-sm font-medium underline decoration-accent/50 underline-offset-2 hover:text-accent"
                >
                  {event.title}
                </Link>
                <span className="text-muted-text">
                  {" "}· {event.published ? "Published" : "Draft"} ·{" "}
                  {new Date(event.startsAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="RSVPs" className="grid gap-md">
        <h3 className="type-h3">RSVPs ({user.rsvpCount})</h3>
        {user.rsvps.length === 0 ? (
          <p className="type-body text-muted-text">This user has no reservations.</p>
        ) : (
          <ul className="grid gap-xs">
            {user.rsvps.map((rsvp) => (
              <li key={`${rsvp.eventId}-${rsvp.createdAt}`} className="type-body rounded-lg border border-line bg-card px-md py-sm">
                <Link
                  to="/admin/events/$eventId"
                  params={{ eventId: rsvp.eventId }}
                  className="focus-ring rounded-sm font-medium underline decoration-accent/50 underline-offset-2 hover:text-accent"
                >
                  {rsvp.eventTitle}
                </Link>
                <span className="text-muted-text">
                  {" "}· {rsvp.status} · {new Date(rsvp.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Organizers owned" className="grid gap-md">
        <h3 className="type-h3">Organizers owned ({user.organizers.length})</h3>
        {user.organizers.length === 0 ? (
          <p className="type-body text-muted-text">This user owns no organizer profiles.</p>
        ) : (
          <ul className="grid gap-xs">
            {user.organizers.map((organizer) => (
              <li key={organizer.id} className="type-body rounded-lg border border-line bg-card px-md py-sm">
                <Link
                  to="/admin/organizers/$organizerId"
                  params={{ organizerId: organizer.id }}
                  className="focus-ring rounded-sm font-medium underline decoration-accent/50 underline-offset-2 hover:text-accent"
                >
                  {organizer.name}
                </Link>
                <span className="text-muted-text">
                  {" "}· {organizer.verified ? "Verified" : "Unverified"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
