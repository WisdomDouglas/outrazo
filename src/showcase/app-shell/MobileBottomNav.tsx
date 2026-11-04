import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CircleUserRound, Compass, House, Plus, TicketCheck } from "lucide-react";

const SCROLL_SETTLE_MS = 180;

const ICON_CLASS = "size-[22px]";
const ICON_STROKE = 2.2;

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [hidden, setHidden] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [footerTop, setFooterTop] = useState<number | null>(null);

  useEffect(() => {
    const scrollArea = document.getElementById("app-scroll-area");
    const footer = scrollArea?.querySelector<HTMLElement>(".compact-footer");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let settleTimer: number | undefined;
    const updateFooterVisibility = () => {
      if (!scrollArea || !footer) {
        setFooterVisible(false);
        setFooterTop(null);
        scrollArea?.classList.remove("app-main--footer-visible");
        return false;
      }

      const mainBounds = scrollArea.getBoundingClientRect();
      const footerBounds = footer.getBoundingClientRect();
      const visible =
        footerBounds.top < mainBounds.bottom &&
        footerBounds.bottom > mainBounds.top;
      setFooterVisible(visible);
      setFooterTop(visible ? footerBounds.top : null);
      scrollArea.classList.toggle("app-main--footer-visible", visible);
      return visible;
    };
    const onScroll = () => {
      const isFooterVisible = updateFooterVisibility();
      if (isFooterVisible) {
        setHidden(false);
        return;
      }
      if (reducedMotion) return;
      setHidden(true);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => setHidden(false), SCROLL_SETTLE_MS);
    };
    updateFooterVisibility();
    window.addEventListener("scroll", onScroll, { passive: true });
    scrollArea?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateFooterVisibility);
    return () => {
      window.removeEventListener("scroll", onScroll);
      scrollArea?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateFooterVisibility);
      scrollArea?.classList.remove("app-main--footer-visible");
      window.clearTimeout(settleTimer);
    };
  }, [pathname]);

  // The create-event form is a focused task screen; the dock stays out of its way.
  if (pathname.startsWith("/app/create-event")) return null;

  const activeProps = {
    className: "app-mobile-nav-item--active",
    "aria-current": "page",
  } as const;

  return (
    <nav
      className={`app-mobile-nav focus-ring${hidden && !footerVisible ? " app-mobile-nav--hidden" : ""}`}
      aria-label="Mobile app navigation"
      style={footerVisible && footerTop !== null
        ? { bottom: `calc(100dvh - ${footerTop}px + 10px)` }
        : undefined}
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
