import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Flag,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  ShieldCheck,
  Radar,
  Sparkles,
  Ticket,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";

import { BrandSplash } from "@/showcase/BrandSplash";
import { useAuth } from "@/showcase/auth/auth-context";
import { rememberReturnTo } from "@/showcase/saved/saved-events-store";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { useMyAdminRole } from "@/showcase/admin/admin-client";
import {
  ADMIN_ROLE_LABELS,
  roleHasPermission,
  type AdminPermission,
  type AdminRole,
} from "@/showcase/admin/permissions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [
    { title: "Admin Console — Outrazo" },
    { name: "description", content: "Staff-only administration: users, events, RSVPs, reports, promotions, roles, and audit log." },
  ] }),
  component: AdminLayout,
});

interface AdminTab {
  label: string;
  to:
    | "/admin"
    | "/admin/users"
    | "/admin/events"
    | "/admin/organizers"
    | "/admin/attendees"
    | "/admin/reports"
    | "/admin/promotions"
    | "/admin/finance"
    | "/admin/rewards"
    | "/admin/intelligence"
    | "/admin/scout"
    | "/admin/roles"
    | "/admin/audit";
  icon: typeof LayoutDashboard;
  permission: AdminPermission | null;
  exact?: boolean;
}

const TABS: AdminTab[] = [
  { label: "Overview", to: "/admin", icon: LayoutDashboard, permission: null, exact: true },
  { label: "Users", to: "/admin/users", icon: Users, permission: "users.read" },
  { label: "Events", to: "/admin/events", icon: CalendarDays, permission: "events.read" },
  { label: "Organizers", to: "/admin/organizers", icon: Building2, permission: "events.read" },
  { label: "RSVPs", to: "/admin/attendees", icon: Ticket, permission: "attendees.read" },
  { label: "Reports", to: "/admin/reports", icon: Flag, permission: "reports.read" },
  { label: "Promotions", to: "/admin/promotions", icon: Megaphone, permission: "promotions.read" },
  { label: "Finance", to: "/admin/finance", icon: Wallet, permission: "finance.read" },
  { label: "Rewards", to: "/admin/rewards", icon: Trophy, permission: "rewards.read" },
  { label: "Intelligence", to: "/admin/intelligence", icon: Sparkles, permission: "events.read" },
  { label: "Scout", to: "/admin/scout", icon: Radar, permission: "scout.read" },
  { label: "Roles", to: "/admin/roles", icon: ShieldCheck, permission: "roles.read" },
  { label: "Audit log", to: "/admin/audit", icon: ScrollText, permission: "audit.read" },
];

function visibleTabs(role: AdminRole): AdminTab[] {
  return TABS.filter(
    (tab) => tab.permission === null || roleHasPermission(role, tab.permission),
  );
}

function AdminLayout() {
  const navigate = useNavigate({ from: "/admin" });
  const { loading, session } = useAuth();
  const { role, loading: roleLoading, error: roleError, refresh: refreshRole } = useMyAdminRole();

  useEffect(() => {
    if (loading || session) return;
    rememberReturnTo("/admin");
    void navigate({ to: "/login", replace: true });
  }, [loading, navigate, session]);

  if (loading || !session) return <BrandSplash />;
  if (roleLoading) return <BrandSplash message="Checking admin access" />;

  if (roleError) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-md py-xl lg:px-xl lg:py-2xl">
        <ErrorState
          title="We couldn't check your admin access."
          description={roleError}
          onRetry={() => void refreshRole()}
        />
      </div>
    );
  }

  // Courtesy gate only: every server function re-verifies the caller, so
  // reaching this screen (or calling the APIs directly) grants nothing.
  if (!role) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-md py-xl lg:px-xl lg:py-2xl">
        <EmptyState
          icon={<ShieldCheck aria-hidden className="size-5" />}
          title="This area is for Outrazo staff."
          description="You are signed in, but your account does not have admin access. If you need access, ask a super admin to grant you a role."
          action={
            <Link to="/app" className="focus-ring rounded-full">
              <Button>Back to the app</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="admin-console">
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-brand focus-ring rounded-lg">
          <span className="admin-brand-mark"><ShieldCheck aria-hidden className="size-5" /></span>
          <span className="admin-brand-copy">
            <span className="admin-brand-name">Outrazo</span>
            <span className="admin-brand-label">ADMIN CONSOLE</span>
          </span>
        </Link>
        <div className="admin-sidebar-section-label">Workspace</div>
        <nav aria-label="Admin console sections" className="admin-sidebar-nav">
          {visibleTabs(role).map(({ label, to, icon: Icon, exact }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: exact ?? false }}
              activeProps={{ "aria-current": "page" }}
              className="admin-nav-link focus-ring"
            >
              <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={2} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <span className="admin-role-chip"><ShieldCheck aria-hidden className="size-4" />{ADMIN_ROLE_LABELS[role]}</span>
          <Link to="/app" className="admin-back-link focus-ring">
            <ArrowLeft aria-hidden className="size-4" />
            Back to app
          </Link>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-title">
            <span className="admin-topbar-kicker">Staff workspace</span>
            <h1 className="admin-topbar-heading">Administration</h1>
          </div>
          <span className="admin-topbar-secure"><ShieldCheck aria-hidden className="size-4" /> Secure console</span>
          <Link to="/app" className="admin-mobile-app-link focus-ring">
            <ArrowLeft aria-hidden className="size-4" />
            Back
          </Link>
        </header>
        <nav aria-label="Admin console sections" className="admin-mobile-nav">
          {visibleTabs(role).map(({ label, to, icon: Icon, exact }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: exact ?? false }}
              activeProps={{ "aria-current": "page" }}
              className="admin-mobile-nav-link focus-ring"
            >
              <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2} />
              {label}
            </Link>
          ))}
        </nav>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
