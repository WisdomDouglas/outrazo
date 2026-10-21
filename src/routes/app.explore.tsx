import { createFileRoute, Link } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/design-system/components/Button";
import { ErrorState } from "@/design-system/components/ErrorState";
import { AppEventGrid } from "@/showcase/app-shell/AppEventGrid";
import { useEventCatalog } from "@/showcase/use-event-catalog";

export const Route = createFileRoute("/app/explore")({
  head: () => ({
    meta: [
      { title: "Explore — Outrazo" },
      { name: "description", content: "Explore events across Outrazo." },
      { property: "og:title", content: "Explore — Outrazo" },
      { property: "og:description", content: "Discover events across Nigeria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppExplore,
});

function AppExplore() {
  const catalog = useEventCatalog();

  return (
    <div className="mx-auto w-full max-w-[1320px] px-md py-xl lg:px-xl lg:py-2xl">
      <div className="mb-xl flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="type-h1">Explore events</h1>
          <p className="type-body-lg mt-sm text-muted-text">Discover what&apos;s happening near you.</p>
        </div>
        <Link to="/events" search={{}} className="focus-ring rounded-full">
          <Button variant="outline" leadingIcon={<SlidersHorizontal aria-hidden className="size-4" />}>
            Open all filters
          </Button>
        </Link>
      </div>
      {catalog.error ? (
        <ErrorState
          className="mb-xl"
          title="Some events may be missing."
          description={catalog.error}
          onRetry={catalog.refresh}
        />
      ) : null}
      <AppEventGrid events={catalog.events} />
    </div>
  );
}
