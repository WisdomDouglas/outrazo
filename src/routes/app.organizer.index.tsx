import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarPlus, FolderKanban } from "lucide-react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useOrganizerEvents } from "@/showcase/organizer/use-organizer-events";

export const Route = createFileRoute("/app/organizer/")({
  head: () => ({ meta: [
    { title: "Overview — Organizer Dashboard — Outrazo" },
    { name: "description", content: "Your event counts at a glance: total, published, drafts, and upcoming." },
  ] }),
  component: OrganizerOverviewPage,
});

function OrganizerOverviewPage() {
  const { counts, loading, error, refresh } = useOrganizerEvents();

  if (loading) {
    return (
      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading overview">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState title="We couldn't load your overview." description={error} onRetry={refresh} />;
  }

  const stats = [
    { label: "Total events", value: counts.total },
    { label: "Published", value: counts.published },
    { label: "Drafts", value: counts.drafts },
    { label: "Upcoming", value: counts.upcoming },
  ];

  return (
    <div className="grid gap-xl">
      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-line bg-card p-lg shadow-card">
            <p className="type-h1">{stat.value}</p>
            <p className="type-body mt-xs text-muted-text">{stat.label}</p>
          </div>
        ))}
      </div>
      <p className="type-caption text-muted-text">
        Counts come from your own events in the database. Demo content is never included.
      </p>
      {counts.total === 0 ? (
        <EmptyState
          icon={<FolderKanban aria-hidden className="size-5" />}
          title="No events yet."
          description="Post your first event to see it here with live counts."
          action={
            <Link to="/app/create-event" className="focus-ring rounded-full">
              <Button leadingIcon={<CalendarPlus aria-hidden className="size-4" />}>
                Create an event
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-wrap gap-sm">
          <Link to="/app/organizer/events" className="focus-ring rounded-full">
            <Button leadingIcon={<FolderKanban aria-hidden className="size-4" />}>Manage events</Button>
          </Link>
          <Link to="/app/create-event" className="focus-ring rounded-full">
            <Button variant="outline" leadingIcon={<CalendarPlus aria-hidden className="size-4" />}>
              Create an event
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
