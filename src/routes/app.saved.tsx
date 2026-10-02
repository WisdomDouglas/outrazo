import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bookmark } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { EventCardSkeletonGrid } from "@/design-system/components/EventCardSkeleton";
import { useSavedItems } from "@/design-system/lib/use-saved-items";
import { AppEventGrid } from "@/showcase/app-shell/AppEventGrid";
import { useAuth } from "@/showcase/auth/auth-context";
import { loadSavedEvents, rememberReturnTo } from "@/showcase/saved/saved-events-store";
import { EVENTS } from "@/showcase/sample-data";

export const Route = createFileRoute("/app/saved")({
  head: () => ({ meta: [
    { title: "Saved events — Outrazo" }, { name: "description", content: "Your saved Outrazo events." },
    { property: "og:title", content: "Saved events — Outrazo" }, { property: "og:description", content: "Return to the events you saved on Outrazo." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: SavedPage,
});

function SavedPage() {
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();
  const { saved, status } = useSavedItems();

  useEffect(() => {
    if (!loading && !session) {
      rememberReturnTo("/app/saved");
      void navigate({ to: "/login", replace: true });
    }
  }, [loading, session, navigate]);

  const events = saved.map((id) => EVENTS.find((event) => event.id === id)).filter((event): event is (typeof EVENTS)[number] => Boolean(event));
  const pending = loading || !session || status === "idle" || status === "loading";

  return (
    <div className="mx-auto w-full max-w-[1320px] px-md py-xl lg:px-xl lg:py-2xl">
      <h1 className="type-h1">Saved events</h1>
      <p className="type-body-lg mt-sm text-muted-text">Events you don’t want to miss.</p>
      <div className="mt-xl">
        {status === "error" ? (
          <ErrorState description="Unable to load your saved events." onRetry={() => void loadSavedEvents(user?.id ?? null)} />
        ) : pending ? (
          <EventCardSkeletonGrid count={3} className="sm:grid-cols-2 xl:grid-cols-3" />
        ) : events.length ? (
          <AppEventGrid events={events} />
        ) : (
          <EmptyState icon={<Bookmark aria-hidden className="size-5" />} title="Nothing saved yet." description="Save events you want to come back to." action={<Link to="/app/explore" className="focus-ring rounded-full"><Button>Explore events</Button></Link>} />
        )}
      </div>
    </div>
  );
}
