import { Link, useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Avatar } from "@/design-system/components/Avatar";
import { BrandLogo } from "@/design-system/components/BrandLogo";
import { Button } from "@/design-system/components/Button";
import { SearchField } from "@/design-system/components/SearchField";
import { useAuth } from "@/showcase/auth/auth-context";
import { NotificationPanel } from "./NotificationPanel";

export function AppHeader({ title }: { title: string }) {
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
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-xl">
      <div className="flex min-h-16 items-center gap-sm px-md sm:min-h-20 sm:gap-md lg:px-xl">
        <Link to="/app" className="focus-ring type-h3 shrink-0 rounded-sm md:hidden" aria-label="Outrazo home"><BrandLogo /></Link>
        <h1 className="type-h2 hidden shrink-0 md:block">{title}</h1>
        <form onSubmit={submit} className="ml-auto hidden w-full max-w-[480px] sm:block" role="search">
          <SearchField value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Search events" />
        </form>
        <div ref={notificationRef} className="relative ml-auto sm:ml-0">
          <Button type="button" variant="ghost" size="icon" className="relative" aria-label="Open notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}>
            <Bell aria-hidden className="size-5" />
            <span className="absolute right-sm top-sm size-2 rounded-full bg-transactional" aria-label="3 unread notifications" />
          </Button>
          {notificationsOpen ? <NotificationPanel /> : null}
        </div>
        <Link to="/app/profile" className="focus-ring rounded-full" aria-label="Open profile"><Avatar name={displayName} src={profile?.avatar_url ?? undefined} size="md" /></Link>
      </div>
      <form onSubmit={submit} className="px-md pb-md sm:hidden" role="search">
        <SearchField value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Search events" />
      </form>
    </header>
  );
}