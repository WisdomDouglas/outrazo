import { createFileRoute, Link } from "@tanstack/react-router";
import { Ticket } from "lucide-react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";

export const Route = createFileRoute("/app/tickets")({
  head: () => ({ meta: [
    { title: "My Tickets — Outrazo" }, { name: "description", content: "Your Outrazo tickets and RSVPs." },
    { property: "og:title", content: "My Tickets — Outrazo" }, { property: "og:description", content: "View your Outrazo tickets and RSVPs." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: TicketsPage,
});

function TicketsPage() { return <div className="mx-auto w-full max-w-[900px] px-md py-xl lg:px-xl lg:py-2xl"><h1 className="type-h1">My Tickets</h1><p className="type-body-lg mt-sm text-muted-text">Your tickets and confirmed RSVPs will live here.</p><EmptyState className="mt-xl" icon={<Ticket aria-hidden className="size-5" />} title="No tickets yet." description="When you reserve a spot, your ticket will appear here." action={<Link to="/app/explore" className="focus-ring rounded-full"><Button>Find an event</Button></Link>} /></div>; }