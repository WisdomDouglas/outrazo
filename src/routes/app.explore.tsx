import { createFileRoute, Link } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/design-system/components/Button";
import { AppEventGrid } from "@/showcase/app-shell/AppEventGrid";
import { EVENTS } from "@/showcase/sample-data";

export const Route = createFileRoute("/app/explore")({
  head: () => ({ meta: [
    { title: "Explore — Outrazo" }, { name: "description", content: "Explore events across Outrazo." },
    { property: "og:title", content: "Explore — Outrazo" }, { property: "og:description", content: "Discover events across Nigeria." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: AppExplore,
});

function AppExplore() {
  return <div className="mx-auto w-full max-w-[1320px] px-md py-xl lg:px-xl lg:py-2xl"><div className="mb-xl flex flex-wrap items-end justify-between gap-md"><div><h1 className="type-h1">Explore events</h1><p className="type-body-lg mt-sm text-muted-text">Discover what&apos;s happening near you.</p></div><Link to="/events" search={{}} className="focus-ring rounded-full"><Button variant="outline" leadingIcon={<SlidersHorizontal aria-hidden className="size-4" />}>Open all filters</Button></Link></div><AppEventGrid events={EVENTS} /></div>;
}