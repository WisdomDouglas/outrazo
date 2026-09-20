import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";

export const Route = createFileRoute("/app/create-event")({
  head: () => ({ meta: [
    { title: "Create your event — Outrazo" }, { name: "description", content: "Create and publish an event on Outrazo." },
    { property: "og:title", content: "Create your event — Outrazo" }, { property: "og:description", content: "Event creation is coming to Outrazo." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: CreateEventPage,
});

function CreateEventPage() { return <div className="mx-auto w-full max-w-[760px] px-md py-xl lg:px-xl lg:py-2xl"><h1 className="type-h1">Create your event</h1><p className="type-body-lg mt-sm text-muted-text">Event creation will be available here.</p><div className="mt-xl flex min-h-[240px] flex-col items-center justify-center gap-md rounded-lg border border-line bg-card p-xl text-center"><span className="grid size-12 place-items-center rounded-full bg-accent/12 text-accent"><CalendarPlus aria-hidden className="size-5" /></span><Badge variant="outline">Coming next</Badge></div></div>; }