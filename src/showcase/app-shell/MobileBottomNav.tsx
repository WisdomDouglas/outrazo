import { Link } from "@tanstack/react-router";
import { Bookmark, Compass, House, Ticket, UserRound, type LucideIcon } from "lucide-react";

interface MobileItem {
  label: string;
  to: "/app" | "/app/explore" | "/app/saved" | "/app/tickets" | "/app/profile";
  icon: LucideIcon;
  exact?: boolean;
}

const ITEMS: MobileItem[] = [
  { label: "Home", to: "/app", icon: House, exact: true },
  { label: "Explore", to: "/app/explore", icon: Compass },
  { label: "Saved", to: "/app/saved", icon: Bookmark },
  { label: "Tickets", to: "/app/tickets", icon: Ticket },
  { label: "Profile", to: "/app/profile", icon: UserRound },
];

export function MobileBottomNav() {
  return (
    <nav className="fixed inset-x-md bottom-md z-40 rounded-lg border border-line bg-card/90 p-xs pb-[max(var(--spacing-xs),env(safe-area-inset-bottom))] shadow-floating backdrop-blur-xl md:hidden" aria-label="Mobile app navigation">
      <div className="grid grid-cols-5 gap-xs">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="focus-ring type-caption flex min-h-14 min-w-0 flex-col items-center justify-center gap-xs rounded-md text-subtle-text transition-[color,background-color,transform] duration-200 active:scale-[0.98]"
              activeProps={{ className: "bg-accent/12 text-accent" }}
            >
              <Icon aria-hidden className="size-5 shrink-0" strokeWidth={2} />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}