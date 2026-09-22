import { Link } from "@tanstack/react-router";
import { Bookmark, Compass, Home, Ticket, UserRound, type LucideIcon } from "lucide-react";

interface MobileItem {
  label: string;
  to: "/app" | "/app/explore" | "/app/saved" | "/app/tickets" | "/app/profile";
  icon: LucideIcon;
  exact?: boolean;
}

const ITEMS: MobileItem[] = [
  { label: "Home", to: "/app", icon: Home, exact: true },
  { label: "Explore", to: "/app/explore", icon: Compass },
  { label: "Saved", to: "/app/saved", icon: Bookmark },
  { label: "Tickets", to: "/app/tickets", icon: Ticket },
  { label: "Profile", to: "/app/profile", icon: UserRound },
];

export function MobileBottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 px-xs pb-[max(var(--spacing-sm),env(safe-area-inset-bottom))] pt-sm backdrop-blur-md md:hidden" aria-label="Mobile app navigation">
      <div className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="focus-ring type-caption flex min-h-12 flex-col items-center justify-center gap-xs rounded-sm text-subtle-text"
              activeProps={{ className: "text-accent" }}
            >
              <Icon aria-hidden className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}