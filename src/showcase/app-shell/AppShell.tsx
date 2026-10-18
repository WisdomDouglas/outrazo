import { Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppHeader } from "./AppHeader";
import { DemoModeBanner } from "./DemoModeBanner";
import { MobileBottomNav } from "./MobileBottomNav";

export function AppShell() {
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);

  useEffect(() => {
    try {
      setNavigationCollapsed(window.localStorage.getItem("outrazo-sidebar-collapsed") === "true");
    } catch { /* Navigation remains usable when storage is blocked. */ }
  }, []);

  const toggleNavigation = () => {
    setNavigationCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("outrazo-sidebar-collapsed", String(next));
      } catch { /* Keep the preference for this visit. */ }
      return next;
    });
  };

  return (
    <div className="app-shell flex h-dvh flex-col overflow-hidden bg-canvas text-primary-text">
      <AppHeader collapsed={navigationCollapsed} onToggle={toggleNavigation} />
      <DemoModeBanner />
      <main id="app-scroll-area" className="app-main min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-[calc(88px+var(--spacing-md))] md:pb-0">
        <Outlet />
      </main>
      <MobileBottomNav />
    </div>
  );
}
