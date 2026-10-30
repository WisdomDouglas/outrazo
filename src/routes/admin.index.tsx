import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/design-system/components/Button";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import {
  friendlyAdminError,
  useAccessToken,
  useMyAdminRole,
} from "@/showcase/admin/admin-client";
import {
  getAdminDashboardMetrics,
  listAuditLog,
  type AdminDashboardMetrics,
  type AuditLogRow,
} from "@/showcase/admin/admin-functions";
import {
  ADMIN_ROLE_LABELS,
  METRIC_PERMISSIONS,
  ROLE_PERMISSIONS,
  roleHasPermission,
  type DashboardMetric,
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
  { label: "Organizers", to: "/admin/organizers", description: "Organizer profiles and their events.", permission: "events.read" },
  { label: "RSVPs", to: "/admin/attendees", description: "Reservations across events.", permission: "attendees.read" },
  { label: "Roles", to: "/admin/roles", description: "Grant or revoke staff roles.", permission: "roles.read" },
  { label: "Audit log", to: "/admin/audit", description: "Who changed what, and when.", permission: "audit.read" },
] as const;

function AdminOverviewPage() {
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [entries, setEntries] = useState<AuditLogRow[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);

  const canReadAudit = role !== null && roleHasPermission(role, "audit.read");

  const refreshMetrics = useCallback(async () => {
    if (!token) {
      setMetricsError("Sign in to use the admin console.");
      setMetricsLoading(false);
      return;
    }
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const result = await getAdminDashboardMetrics({
        headers: { Authorization: `Bearer ${token}` },
      });
      setMetrics(result);
    } catch (caught) {
      setMetricsError(friendlyAdminError(caught));
    } finally {
      setMetricsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refreshMetrics();
  }, [refreshMetrics]);

  useEffect(() => {
    if (!token) {
      setAuditError("Sign in to use the admin console.");
      setAuditLoading(false);
      return;
    }
    if (!canReadAudit) {
      setAuditLoading(false);
      return;
    }
    let cancelled = false;
    setAuditLoading(true);
    setAuditError(null);
    listAuditLog({ data: { limit: 5 }, headers: { Authorization: `Bearer ${token}` } })
      .then((result) => {
        if (!cancelled) setEntries(result.entries);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setAuditError(friendlyAdminError(caught));
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, canReadAudit]);

  if (!role) return null;

  const cards: Array<{ label: string; value: number | null; metric: DashboardMetric; caption: string }> = [
    { label: "Registered users", value: metrics?.users ?? null, metric: "users", caption: "User accounts" },
    { label: "Organizers", value: metrics?.organizers ?? null, metric: "organizers", caption: "Organizer profiles" },
    { label: "Total events", value: metrics?.eventsTotal ?? null, metric: "events", caption: "Drafts and published" },
    { label: "Published events", value: metrics?.eventsPublished ?? null, metric: "events", caption: "Visible in discovery" },
    { label: "Upcoming events", value: metrics?.eventsUpcoming ?? null, metric: "events", caption: "Starting in the future" },
    { label: "RSVPs", value: metrics?.rsvps ?? null, metric: "rsvps", caption: "Attendee records" },
  ];

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

      {metricsLoading ? (
        <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading metrics">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <Skeleton key={key} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : metricsError ? (
        <ErrorState
          title="We couldn't load dashboard metrics."
          description={metricsError}
          onRetry={() => void refreshMetrics()}
        />
      ) : (
        <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border border-line bg-card p-lg shadow-card">
              {card.value === null ? (
                <>
                  <p className="type-h3 text-muted-text">Unavailable</p>
                  <p className="type-body mt-xs font-medium">{card.label}</p>
                  <p className="type-caption mt-xs text-muted-text">
                    Requires the {METRIC_PERMISSIONS[card.metric]} permission.
                  </p>
                </>
              ) : (
                <>
                  <p className="type-h1">{card.value}</p>
                  <p className="type-body mt-xs font-medium">{card.label}</p>
                  <p className="type-caption mt-xs text-muted-text">{card.caption}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}

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
          {auditLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : auditError ? (
            <ErrorState title="We couldn't load recent activity." description={auditError} onRetry={() => window.location.reload()} />
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
