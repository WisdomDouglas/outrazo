import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Clock3,
  Flag,
  Megaphone,
  Radar,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

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
  { label: "Users", to: "/admin/users", description: "Search and inspect user accounts.", permission: "users.read", icon: Users },
  { label: "Events", to: "/admin/events", description: "All events across organizers.", permission: "events.read", icon: CalendarDays },
  { label: "Organizers", to: "/admin/organizers", description: "Organizer profiles and their events.", permission: "events.read", icon: Building2 },
  { label: "RSVPs", to: "/admin/attendees", description: "Reservations across events.", permission: "attendees.read", icon: Ticket },
  { label: "Reports", to: "/admin/reports", description: "Review user-filed event flags.", permission: "reports.read", icon: Flag },
  { label: "Promotions", to: "/admin/promotions", description: "Schedule the homepage spotlight.", permission: "promotions.read", icon: Megaphone },
  { label: "Finance", to: "/admin/finance", description: "Review ticket transactions and payouts.", permission: "finance.read", icon: Wallet },
  { label: "Rewards", to: "/admin/rewards", description: "Review the platform rewards program.", permission: "rewards.read", icon: Trophy },
  { label: "Intelligence", to: "/admin/intelligence", description: "Platform activity aggregates and event intelligence.", permission: "events.read", icon: Sparkles },
  { label: "Scout", to: "/admin/scout", description: "Review event discovery runs.", permission: "scout.read", icon: Radar },
  { label: "Roles", to: "/admin/roles", description: "Grant or revoke staff roles.", permission: "roles.read", icon: ShieldCheck },
  { label: "Audit log", to: "/admin/audit", description: "Who changed what, and when.", permission: "audit.read", icon: ScrollText },
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

  const cards: Array<{ label: string; value: number | null; metric: DashboardMetric; caption: string; icon: LucideIcon }> = [
    { label: "Registered users", value: metrics?.users ?? null, metric: "users", caption: "User accounts", icon: Users },
    { label: "Organizers", value: metrics?.organizers ?? null, metric: "organizers", caption: "Organizer profiles", icon: Building2 },
    { label: "Total events", value: metrics?.eventsTotal ?? null, metric: "events", caption: "Drafts and published", icon: CalendarDays },
    { label: "Published events", value: metrics?.eventsPublished ?? null, metric: "events", caption: "Visible in discovery", icon: CalendarCheck2 },
    { label: "Upcoming events", value: metrics?.eventsUpcoming ?? null, metric: "events", caption: "Starting in the future", icon: Clock3 },
    { label: "RSVPs", value: metrics?.rsvps ?? null, metric: "rsvps", caption: "Attendee records", icon: Ticket },
  ];

  return (
    <div className="admin-overview">
      <section className="admin-overview-hero" aria-label="Admin role and permissions">
        <div>
          <p className="admin-section-kicker">Workspace overview</p>
          <h2 className="type-h2 mt-xs">Your platform at a glance</h2>
          <p className="type-body mt-xs text-muted-text">Real-time access to the tools and activity available to your role.</p>
        </div>
        <div className="admin-overview-role">
          <span className="admin-role-chip"><ShieldCheck aria-hidden className="size-4" />{ADMIN_ROLE_LABELS[role]}</span>
          <details className="admin-permissions">
            <summary>{ROLE_PERMISSIONS[role].length} permissions</summary>
            <div className="admin-permission-list" aria-label="Your permissions">
              {ROLE_PERMISSIONS[role].map((permission) => (
                <span key={permission}>{permission}</span>
              ))}
            </div>
          </details>
        </div>
      </section>

      {metricsLoading ? (
        <div className="admin-metric-grid" aria-label="Loading metrics">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <Skeleton key={key} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : metricsError ? (
        <ErrorState
          title="We couldn't load dashboard metrics."
          description={metricsError}
          onRetry={() => void refreshMetrics()}
        />
      ) : (
        <div className="admin-metric-grid">
          {cards.map((card) => (
            <div key={card.label} className="admin-metric-card">
              <span className="admin-metric-icon"><card.icon aria-hidden className="size-5" /></span>
              {card.value === null ? (
                <>
                  <p className="admin-metric-value text-muted-text">Unavailable</p>
                  <p className="admin-metric-label">{card.label}</p>
                  <p className="admin-metric-caption">
                    Requires the {METRIC_PERMISSIONS[card.metric]} permission.
                  </p>
                </>
              ) : (
                <>
                  <p className="admin-metric-value">{new Intl.NumberFormat().format(card.value)}</p>
                  <p className="admin-metric-label">{card.label}</p>
                  <p className="admin-metric-caption">{card.caption}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <section className="admin-shortcuts-section">
        <div className="admin-section-heading">
          <div>
            <p className="admin-section-kicker">Quick access</p>
            <h2 className="type-h2 mt-xs">Manage your platform</h2>
          </div>
          <span className="type-caption text-muted-text">Tools available to your role</span>
        </div>
      <div className="admin-shortcut-grid">
        {SECTIONS.filter((section) => roleHasPermission(role, section.permission)).map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className="admin-shortcut-card focus-ring group"
          >
            <span className="admin-shortcut-icon"><section.icon aria-hidden className="size-5" /></span>
            <span className="admin-shortcut-copy">
              <span className="admin-shortcut-title">{section.label}</span>
              <span className="admin-shortcut-description">{section.description}</span>
            </span>
            <ArrowRight aria-hidden className="admin-shortcut-arrow size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
      </section>

      {canReadAudit ? (
        <section aria-label="Recent audit activity" className="admin-activity-section">
          <div className="flex flex-wrap items-end justify-between gap-sm">
            <div>
              <p className="admin-section-kicker">Accountability</p>
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
