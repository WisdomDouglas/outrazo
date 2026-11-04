import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark } from "lucide-react";

import exploreHero from "@/assets/explore-hero.jpg";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { EventCardSkeletonGrid } from "@/design-system/components/EventCardSkeleton";
import { useSavedItems } from "@/design-system/lib/use-saved-items";
import { AppEventGrid } from "@/showcase/app-shell/AppEventGrid";
import { SectionHero } from "@/showcase/app-shell/SectionHero";
import { useAuth } from "@/showcase/auth/auth-context";
import { loadSavedEvents } from "@/showcase/saved/saved-events-store";
import { useEventCatalog } from "@/showcase/use-event-catalog";

export const Route = createFileRoute("/app/saved")({
  head: () => ({ meta: [
    { title: "Saved events — Outrazo" }, { name: "description", content: "Your saved Outrazo events." },
    { property: "og:title", content: "Saved events — Outrazo" }, { property: "og:description", content: "Return to the events you saved on Outrazo." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: SavedPage,
});

function SavedPage() {
  const { session, user, loading } = useAuth();
  const { saved, status, demoStatus } = useSavedItems();
  const catalog = useEventCatalog();
  const events = catalog.events.filter((event) => saved.includes(event.id));
  const pending =
    loading ||
    demoStatus === "loading" ||
    (Boolean(session) && (status === "idle" || status === "loading"));

  return (
    <div className="section-page">
      <SectionHero
        image={exploreHero}
        icon={<Bookmark aria-hidden className="size-5" />}
        eyebrow="Your collection"
        title="Saved events"
        description="A little inspiration for later. Pick up where your next great plan begins."
        meta={<span className="section-hero-count">{events.length} {events.length === 1 ? "event" : "events"} saved</span>}
      />
      <div className="section-page-content">
        {session && status === "error" ? (
          <ErrorState
            className="mb-lg"
            description="Unable to load your account-saved events."
            onRetry={() => void loadSavedEvents(user?.id ?? null)}
          />
        ) : null}
        {catalog.error ? (
          <ErrorState
            className="mb-lg"
            description={catalog.error}
            onRetry={catalog.refresh}
          />
        ) : null}
        {pending ? (
          <EventCardSkeletonGrid count={3} className="sm:grid-cols-2 xl:grid-cols-3" />
        ) : events.length ? (
          <section aria-label="Your saved events" className="section-event-list">
            <div className="section-list-heading">
              <div>
                <p className="section-list-eyebrow">Your shortlist</p>
                <h2 className="type-h2 mt-xs">Worth coming back to</h2>
              </div>
              <span className="section-list-count">{events.length} {events.length === 1 ? "event" : "events"}</span>
            </div>
            <AppEventGrid events={events} />
          </section>
        ) : (
          <EmptyState icon={<Bookmark aria-hidden className="size-5" />} title="Nothing saved yet." description="Save events you want to come back to." action={<Link to="/app/explore" className="focus-ring rounded-full"><Button>Explore events</Button></Link>} />
        )}
      </div>
    </div>
  );
}
