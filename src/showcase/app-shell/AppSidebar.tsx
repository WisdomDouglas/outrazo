import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  CalendarPlus,
  Compass,
  Home,
  Settings,
  Ticket,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { Avatar } from "@/design-system/components/Avatar";
import { cn } from "@/design-system/lib/utils";
import { useAuth } from "@/showcase/auth/auth-context";

interface NavItem {
  label: string;
  to: "/app" | "/app/explore" | "/app/saved" | "/app/tickets" | "/app/create-event" | "/app/profile" | "/app/settings";
  icon: LucideIcon;
  exact?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { label: "Home", to: "/app", icon: Home, exact: true },
  { label: "Explore", to: "/app/explore", icon: Compass },
  { label: "Saved", to: "/app/saved", icon: Bookmark },
  { label: "My Tickets", to: "/app/tickets", icon: Ticket },
];

const ACCOUNT_NAV: NavItem[] = [
  { label: "Profile", to: "/app/profile", icon: UserRound },
  { label: "Settings", to: "/app/settings", icon: Settings },
];

function SidebarLink({ item, emphasis = false }: { item: NavItem; emphasis?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.exact }}
      className={cn(
        "focus-ring type-body flex min-h-11 items-center gap-md rounded-md px-md font-medium text-muted-text transition-colors hover:bg-primary-text/5 hover:text-primary-text md:justify-center md:px-sm xl:justify-start xl:px-md",
        emphasis && "text-accent",
      )}
      activeProps={{ className: "bg-accent/12 text-accent" }}
      title={item.label}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      <span className="md:hidden xl:inline">{item.label}</span>
    </Link>
  );
}

export function AppSidebar() {
  const { displayName, profile } = useAuth();
  return (
    <aside className="hidden h-dvh w-section shrink-0 flex-col border-r border-line bg-card md:flex xl:w-[calc(var(--spacing-section)*2.5)]">
      <div className="flex min-h-20 items-center px-lg md:justify-center md:px-sm xl:justify-start xl:px-lg">
        <Link to="/app" className="focus-ring type-h3 rounded-sm text-primary-text" aria-label="Outrazo home">
          <span className="md:hidden xl:inline">OUTRAZO</span>
          <span className="text-accent md:inline xl:hidden">O.</span>
          <span className="text-accent md:hidden xl:inline">.</span>
        </Link>
      </div>

      <nav className="flex flex-col gap-xs px-sm" aria-label="App navigation">
        {PRIMARY_NAV.map((item) => <SidebarLink key={item.to} item={item} />)}
        <div className="my-sm border-t border-line" />
        <SidebarLink item={{ label: "Post Your Event", to: "/app/create-event", icon: CalendarPlus }} emphasis />
      </nav>

      <nav className="mt-auto flex flex-col gap-xs border-t border-line p-sm" aria-label="Account navigation">
        {ACCOUNT_NAV.map((item) => <SidebarLink key={item.to} item={item} />)}
        <Link
          to="/app/profile"
          className="focus-ring mt-sm flex min-h-14 items-center gap-sm rounded-md bg-elevated px-sm md:justify-center xl:justify-start"
        >
          <Avatar name={displayName} src={profile?.avatar_url ?? undefined} size="md" />
          <span className="min-w-0 md:hidden xl:block">
            <strong className="type-body block truncate">{displayName}</strong>
            <span className="type-caption block truncate text-muted-text">View profile</span>
          </span>
        </Link>
      </nav>
    </aside>
  );
}