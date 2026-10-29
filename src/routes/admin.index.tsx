import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/design-system/components/Button";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import {
  friendlyAdminError,
  useAccessToken,
  useMyAdminRole,
} from "@/showcase/admin/admin-client";
import { listAuditLog, type AuditLogRow } from "@/showcase/admin/admin-functions";
import {
  ADMIN_ROLE_LABELS,
  ROLE_PERMISSIONS,
  roleHasPermission,
} from "@/showcase/admin/permissions";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [
    { title: "Overview — Admin Console — Outrazo" },
    { name: "description", content: "Your admin role, permissions, and recent audit activity." },
  ] }),
  component: AdminOverviewPage,
});

const SECTIONS = [
  { label: "Users", to: "/admin/users", description: "Search and inspect user accounts.", permission: "users.read" },
  { label: "Events", to: "/admin/events", description: "All events across organizers.", permission: "events.read" },
  { label: "RSVPs", to: "/admin/attendees", description: "Reservations across events.", permission: "attendees.read" },
  { label: "Roles", to: "/admin/roles", description: "Grant or revoke staff roles.", permission: "roles.read" },
  { label: "Audit log", to: "/admin/audit", description: "Who changed what, and when.", permission: "audit.read" },
] as const;

function AdminOverviewPage() {
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const [entries, setEntries] = useState<AuditLogRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canReadAudit = role !== null && roleHasPermission(role, "audit.read");

  useEffect(() => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    if (!canReadAudit) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listAuditLog({ data: { limit: 5 }, headers: { Authorization: `Bearer ${token}` } })
      .then((result) => {
        if (!cancelled) setEntries(result.entries);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(friendlyAdminError(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, canReadAudit]);

  if (!role) return null;

  return (
    <div className="grid gap-xl">
      <div className="rounded-lg border border-line bg-card p-lg shadow-card">
        <p className="type-body text-muted-text">Signed in as</p>
        <p className="type-h2 mt-xs">{ADMIN_ROLE_LABELS[role]}</p>
        <div className="mt-md flex flex-wrap gap-xs" aria-label="Your permissions">
          {ROLE_PERMISSIONS[role].map((permission) => (
            <span key={permission} className="rounded-full border border-line bg-card px-md py-xs type-caption text-muted-text">
              {permission}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.filter((section) => roleHasPermission(role, section.permission)).map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className="focus-ring group rounded-lg border border-line bg-card p-lg shadow-card transition-colors hover:border-accent"
          >
            <span className="type-body font-semibold">{section.label}</span>
            <span className="type-body mt-xs block text-muted-text">{section.description}</span>
            <span className="type-body mt-md inline-flex items-center gap-xs text-accent">
              Open <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      {canReadAudit ? (
        <section aria-label="Recent audit activity" className="grid gap-md">
          <div className="flex flex-wrap items-end justify-between gap-sm">
            <div>
              <h2 className="type-h2">Recent activity</h2>
              <p className="type-body mt-xs text-muted-text">The latest audited admin actions.</p>
            </div>
            <Link to="/admin/audit" className="focus-ring rounded-full">
              <Button variant="outline" size="sm">View full log</Button>
            </Link>
          </div>
          {loading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : error ? (
            <ErrorState title="We couldn't load recent activity." description={error} onRetry={() => window.location.reload()} />
          ) : entries && entries.length > 0 ? (
            <ul className="grid gap-xs">
              {entries.map((entry) => (
                <li key={entry.id} className="type-body rounded-lg border border-line bg-card px-md py-sm">
                  <span className="font-semibold">{entry.action}</span>
                  <span className="text-muted-text">
                    {" "}· {entry.actorName ?? "system"} · {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="type-body text-muted-text">No audited actions yet. Role grants will appear here.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
