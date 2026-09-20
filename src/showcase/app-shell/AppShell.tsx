import { Outlet, useRouterState } from "@tanstack/react-router";

import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";

const TITLES: Record<string, string> = {
  "/app": "Home",
  "/app/explore": "Explore",
  "/app/saved": "Saved",
  "/app/tickets": "My Tickets",
  "/app/profile": "Profile",
  "/app/settings": "Settings",
  "/app/create-event": "Create your event",
};

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-primary-text">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader title={TITLES[pathname] ?? "Outrazo"} />
        <main id="app-scroll-area" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-[calc(var(--spacing-section)+var(--spacing-md))] md:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}