import { Link } from "@tanstack/react-router";
import { CircleUserRound, Compass, House, Plus, TicketCheck } from "lucide-react";

const ITEMS = [
  { label: "Home", to: "/app" as const, icon: House, exact: true },
  { label: "Explore", to: "/app/explore" as const, icon: Compass },
  { label: "Create", to: "/app/create-event" as const, icon: Plus, primary: true },
  { label: "Tickets", to: "/app/tickets" as const, icon: TicketCheck },
  { label: "Profile", to: "/app/profile" as const, icon: CircleUserRound },
];

export function MobileBottomNav() {
  return (
    <nav className="app-mobile-nav" aria-label="Mobile app navigation">
      {ITEMS.map(({ label, to, icon: Icon, exact, primary }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: exact ?? false }}
          className={`app-mobile-nav-item focus-ring ${primary ? "app-mobile-nav-item--primary" : ""}`}
          activeProps={{ className: "app-mobile-nav-item--active" }}
          aria-label={primary ? "Create an event" : label}
        >
          <span className="app-mobile-nav-icon">
            <Icon aria-hidden className={primary ? "size-6" : "size-[22px]"} strokeWidth={2.2} />
          </span>
          <span className="app-mobile-nav-label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
