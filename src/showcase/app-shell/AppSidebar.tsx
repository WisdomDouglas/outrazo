import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Compass,
  Home,
  Settings,
  Ticket,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { Avatar } from "@/design-system/components/Avatar";
import { BrandLogo } from "@/design-system/components/BrandLogo";
import { Button } from "@/design-system/components/Button";
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

function SidebarLink({ item, emphasis = false, collapsed = false }: { item: NavItem; emphasis?: boolean; collapsed?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.exact }}
      className={cn(
        "focus-ring type-body group/nav flex min-h-12 items-center gap-md rounded-md px-md font-medium text-muted-text transition-[background-color,color,transform] duration-200 hover:bg-primary-text/5 hover:text-primary-text",
        collapsed ? "justify-center px-sm" : "justify-start",
        emphasis && "text-accent",
      )}
      activeProps={{ className: "bg-accent/12 text-accent" }}
      title={item.label}
      aria-label={item.label}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-sm transition-colors group-hover/nav:bg-accent/10"><Icon aria-hidden className="size-5" /></span>
      {collapsed ? null : <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { displayName, profile } = useAuth();
  return (
    <aside className={`relative hidden h-dvh shrink-0 flex-col border-r border-line bg-card transition-[width] duration-300 ease-out md:flex ${collapsed ? "w-section" : "w-[calc(var(--spacing-section)*2.5)]"}`}>
      <div className={`flex min-h-20 items-center ${collapsed ? "justify-center px-sm" : "justify-start px-lg"}`}>
        <Link to="/app" className="focus-ring type-h3 rounded-sm text-primary-text" aria-label="Outrazo home">
          {collapsed ? <BrandLogo compact /> : <BrandLogo />}
        </Link>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={onToggle} className="absolute right-0 top-section z-20 size-11 translate-x-1/2 rounded-full bg-card p-0 shadow-card" aria-label={collapsed ? "Expand navigation" : "Minimize navigation"} title={collapsed ? "Expand navigation" : "Minimize navigation"}>
        {collapsed ? <ChevronRight aria-hidden className="size-4" /> : <ChevronLeft aria-hidden className="size-4" />}
      </Button>

      <nav className="flex flex-col gap-xs px-sm" aria-label="App navigation">
        {PRIMARY_NAV.map((item) => <SidebarLink key={item.to} item={item} collapsed={collapsed} />)}
        <div className="my-sm border-t border-line" />
        <SidebarLink item={{ label: "Post Your Event", to: "/app/create-event", icon: CalendarPlus }} emphasis collapsed={collapsed} />
      </nav>

      <nav className="mt-auto flex flex-col gap-xs border-t border-line p-sm" aria-label="Account navigation">
        {ACCOUNT_NAV.map((item) => <SidebarLink key={item.to} item={item} collapsed={collapsed} />)}
        <Link
          to="/app/profile"
          aria-label="View profile"
          title="View profile"
          activeProps={{ className: "ring-1 ring-accent" }}
          className={`focus-ring mt-sm flex min-h-14 items-center gap-sm rounded-md bg-elevated px-sm ${collapsed ? "justify-center" : "justify-start"}`}
        >
          <Avatar name={displayName} src={profile?.avatar_url ?? undefined} size="md" />
          {collapsed ? null : <span className="min-w-0">
            <strong className="type-body block truncate">{displayName}</strong>
            <span className="type-caption block truncate text-muted-text">View profile</span>
          </span>}
        </Link>
      </nav>
    </aside>
  );
}