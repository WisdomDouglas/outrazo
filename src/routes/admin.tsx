import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  CalendarDays,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Ticket,
  Users,
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
    { name: "description", content: "Staff-only administration: users, events, RSVPs, roles, and audit log." },
  ] }),
  component: AdminLayout,
});

interface AdminTab {
  label: string;
  to:
    | "/admin"
    | "/admin/users"
    | "/admin/events"
    | "/admin/attendees"
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
  { label: "RSVPs", to: "/admin/attendees", icon: Ticket, permission: "attendees.read" },
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
    <div className="mx-auto w-full max-w-[1200px] px-md py-xl lg:px-xl lg:py-2xl">
      <p className="type-caption font-semibold tracking-[0.08em] text-accent uppercase">
        Admin console · {ADMIN_ROLE_LABELS[role]}
      </p>
      <h1 className="type-h1 mt-xs">Administration</h1>
      <p className="type-body mt-xs text-muted-text">
        Staff-only views over real platform data. Every role change is audited.
      </p>
      <nav aria-label="Admin console sections" className="mt-lg flex gap-xs overflow-x-auto pb-xs">
        {visibleTabs(role).map(({ label, to, icon: Icon, exact }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: exact ?? false }}
            activeProps={{ "aria-current": "page" }}
            className="focus-ring inline-flex shrink-0 items-center gap-xs rounded-full border border-line bg-card px-md py-xs type-body text-muted-text transition-colors hover:text-primary-text data-[status=active]:border-accent data-[status=active]:bg-accent/12 data-[status=active]:text-accent"
          >
            <Icon aria-hidden className="size-4" strokeWidth={2.2} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-xl">
        <Outlet />
      </div>
    </div>
  );
}
