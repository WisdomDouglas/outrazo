import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CircleUserRound, Compass, House, Plus, TicketCheck } from "lucide-react";

const SCROLL_SETTLE_MS = 180;

const ICON_CLASS = "size-[22px]";
const ICON_STROKE = 2.2;

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Respect reduced-motion: the dock simply stays put instead of sliding.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const scrollArea = document.getElementById("app-scroll-area");
    let settleTimer: number | undefined;
    const onScroll = () => {
      setHidden(true);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => setHidden(false), SCROLL_SETTLE_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    scrollArea?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      scrollArea?.removeEventListener("scroll", onScroll);
      window.clearTimeout(settleTimer);
    };
  }, []);

  // The create-event form is a focused task screen; the dock stays out of its way.
  if (pathname.startsWith("/app/create-event")) return null;

  const activeProps = {
    className: "app-mobile-nav-item--active",
    "aria-current": "page",
  } as const;

  return (
    <nav
      className={`app-mobile-nav focus-ring${hidden ? " app-mobile-nav--hidden" : ""}`}
      aria-label="Mobile app navigation"
    >
      <Link
        to="/app"
        activeOptions={{ exact: true }}
        activeProps={activeProps}
        className="app-mobile-nav-item app-mobile-nav-item--side"
        aria-label="Home"
      >
        <House aria-hidden className={ICON_CLASS} strokeWidth={ICON_STROKE} />
      </Link>
      <div className="app-mobile-nav-pill">
        <Link
          to="/app/explore"
          activeProps={activeProps}
          className="app-mobile-nav-item"
          aria-label="Explore"
        >
          <Compass aria-hidden className={ICON_CLASS} strokeWidth={ICON_STROKE} />
        </Link>
        <Link
          to="/app/create-event"
          className="app-mobile-nav-item"
          aria-label="Create an event"
        >
          <Plus aria-hidden className={ICON_CLASS} strokeWidth={ICON_STROKE} />
        </Link>
        <Link
          to="/app/tickets"
          activeProps={activeProps}
          className="app-mobile-nav-item"
          aria-label="Tickets"
        >
          <TicketCheck aria-hidden className={ICON_CLASS} strokeWidth={ICON_STROKE} />
        </Link>
      </div>
      <Link
        to="/app/profile"
        activeProps={activeProps}
        className="app-mobile-nav-item app-mobile-nav-item--side"
        aria-label="Profile"
      >
        <CircleUserRound aria-hidden className={ICON_CLASS} strokeWidth={ICON_STROKE} />
      </Link>
    </nav>
  );
}
