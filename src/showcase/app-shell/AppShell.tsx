import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppHeader } from "./AppHeader";
import { DemoModeBanner } from "./DemoModeBanner";
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem("outrazo-sidebar-collapsed") === "true");
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("outrazo-sidebar-collapsed", String(next));
      return next;
    });
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-primary-text">
      <AppSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader title={TITLES[pathname] ?? "Outrazo"} />
        <DemoModeBanner />
        <main id="app-scroll-area" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-[calc(var(--spacing-section)+var(--spacing-md))] md:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}