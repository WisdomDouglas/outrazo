import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  Megaphone,
  Settings,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";

import { BrandSplash } from "@/showcase/BrandSplash";
import { useAuth } from "@/showcase/auth/auth-context";
import { rememberReturnTo } from "@/showcase/saved/saved-events-store";

export const Route = createFileRoute("/app/organizer")({
  head: () => ({ meta: [
    { title: "Organizer Dashboard — Outrazo" },
    { name: "description", content: "Manage your events, tickets, attendees, and payouts." },
  ] }),
  component: OrganizerDashboardLayout,
});

interface DashboardTab {
  label: string;
  to:
    | "/app/organizer"
    | "/app/organizer/events"
    | "/app/organizer/sales"
    | "/app/organizer/attendees"
    | "/app/organizer/payouts"
    | "/app/organizer/payment-details"
    | "/app/organizer/promotions"
    | "/app/organizer/settings";
  icon: typeof LayoutDashboard;
  exact?: boolean;
}

const TABS: DashboardTab[] = [
  { label: "Overview", to: "/app/organizer", icon: LayoutDashboard, exact: true },
  { label: "My Events", to: "/app/organizer/events", icon: CalendarDays },
  { label: "Ticket Sales", to: "/app/organizer/sales", icon: Ticket },
  { label: "Attendees", to: "/app/organizer/attendees", icon: Users },
  { label: "Payouts", to: "/app/organizer/payouts", icon: Wallet },
  { label: "Payment Details", to: "/app/organizer/payment-details", icon: CreditCard },
  { label: "Promotions", to: "/app/organizer/promotions", icon: Megaphone },
  { label: "Settings", to: "/app/organizer/settings", icon: Settings },
];

function OrganizerDashboardLayout() {
  const navigate = useNavigate({ from: "/app/organizer" });
  const { loading, session } = useAuth();

  useEffect(() => {
    if (loading || session) return;
    rememberReturnTo("/app/organizer");
    void navigate({ to: "/login", replace: true });
  }, [loading, navigate, session]);

  if (loading || !session) return <BrandSplash />;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-md py-xl lg:px-xl lg:py-2xl">
      <p className="type-caption font-semibold tracking-[0.08em] text-accent uppercase">
        Organizer dashboard
      </p>
      <h1 className="type-h1 mt-xs">Manage your events</h1>
      <p className="type-body mt-xs text-muted-text">
        Everything here reads from and writes to your own events in the database.
      </p>
      <nav aria-label="Organizer dashboard sections" className="mt-lg flex gap-xs overflow-x-auto pb-xs">
        {TABS.map(({ label, to, icon: Icon, exact }) => (
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
