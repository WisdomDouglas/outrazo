import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, CalendarDays, ChevronDown, Compass, Home, PanelLeftClose, PanelLeftOpen, Ticket } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Avatar } from "@/design-system/components/Avatar";
import { BrandLogo } from "@/design-system/components/BrandLogo";
import { Button } from "@/design-system/components/Button";
import { SearchField } from "@/design-system/components/SearchField";
import { useAuth } from "@/showcase/auth/auth-context";
import { NotificationPanel } from "./NotificationPanel";

const HEADER_LINKS = [
  { label: "Home", to: "/app" as const, icon: Home, exact: true },
  { label: "Explore", to: "/app/explore" as const, icon: Compass },
  { label: "Categories", to: "/events" as const, icon: CalendarDays },
  { label: "My Tickets", to: "/app/tickets" as const, icon: Ticket },
];

export function AppHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const navigate = useNavigate();
  const { displayName, profile } = useAuth();
  const [query, setQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notificationsOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [notificationsOpen]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate({ to: "/events", search: query.trim() ? { q: query.trim() } : {} });
  };

  return (
    <header className="app-header sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur-xl">
      <div className="app-header-inner mx-auto flex min-h-[72px] w-full max-w-[1480px] items-center gap-md px-md sm:px-lg lg:min-h-[80px] lg:px-xl">
        <Link to="/app" className="focus-ring shrink-0 rounded-sm" aria-label="Outrazo home">
          <BrandLogo />
        </Link>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="app-header-collapse hidden shrink-0 text-muted-text"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? <PanelLeftOpen aria-hidden className="size-4" /> : <PanelLeftClose aria-hidden className="size-4" />}
        </Button>

        <nav className={`app-header-nav ${collapsed ? "app-header-nav--collapsed" : ""}`} aria-label="Main navigation">
          {HEADER_LINKS.map(({ label, to, icon: Icon, exact }) => (
            <Link
              key={label}
              to={to}
              {...(to === "/events" ? { search: {} } : {})}
              activeOptions={{ exact: exact ?? false }}
              className="app-header-link focus-ring"
              activeProps={{ className: "app-header-link--active" }}
              title={label}
            >
              <Icon aria-hidden className="size-[17px] shrink-0" strokeWidth={2} />
              <span className="app-header-link-label">{label}</span>
              {label === "Categories" && !collapsed ? <ChevronDown aria-hidden className="app-header-chevron size-3.5" /> : null}
            </Link>
          ))}
        </nav>

        <form onSubmit={submit} className="app-header-search ml-auto hidden w-full max-w-[430px] lg:block" role="search">
          <SearchField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery("")}
            placeholder="Search events, places, or communities..."
            className="h-[50px] rounded-full bg-white px-lg"
          />
        </form>

        <div ref={notificationRef} className="relative ml-auto lg:ml-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative text-primary-text"
            aria-label="Open notifications"
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen((open) => !open)}
          >
            <Bell aria-hidden className="size-5" />
            <span className="absolute right-sm top-sm size-2 rounded-full bg-transactional" aria-label="3 unread notifications" />
          </Button>
          {notificationsOpen ? <NotificationPanel /> : null}
        </div>
        <Link to="/app/profile" className="focus-ring rounded-full" aria-label="Open profile">
          <Avatar name={displayName} src={profile?.avatar_url ?? undefined} size="md" className="app-header-avatar" />
        </Link>
      </div>
    </header>
  );
}
