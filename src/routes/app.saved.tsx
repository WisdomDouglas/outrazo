import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark } from "lucide-react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { useSavedItems } from "@/design-system/lib/use-saved-items";
import { AppEventGrid } from "@/showcase/app-shell/AppEventGrid";
import { EVENTS } from "@/showcase/sample-data";

export const Route = createFileRoute("/app/saved")({
  head: () => ({ meta: [
    { title: "Saved events — Outrazo" }, { name: "description", content: "Your saved Outrazo events." },
    { property: "og:title", content: "Saved events — Outrazo" }, { property: "og:description", content: "Return to the events you saved on Outrazo." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: SavedPage,
});

function SavedPage() {
  const { saved } = useSavedItems();
  const events = EVENTS.filter((event) => saved.includes(event.id));
  return <div className="mx-auto w-full max-w-[1320px] px-md py-xl lg:px-xl lg:py-2xl"><h1 className="type-h1">Saved</h1><p className="type-body-lg mt-sm text-muted-text">Events you want to come back to.</p><div className="mt-xl">{events.length ? <AppEventGrid events={events} /> : <EmptyState icon={<Bookmark aria-hidden className="size-5" />} title="No saved events yet." description="Save events you like and they’ll appear here." action={<Link to="/app/explore" className="focus-ring rounded-full"><Button>Explore events</Button></Link>} />}</div></div>;
}