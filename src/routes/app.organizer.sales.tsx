import { createFileRoute } from "@tanstack/react-router";
import { Ticket } from "lucide-react";

import { ComingSoon } from "@/showcase/organizer/ComingSoon";

export const Route = createFileRoute("/app/organizer/sales")({
  head: () => ({ meta: [
    { title: "Ticket Sales — Organizer Dashboard — Outrazo" },
    { name: "description", content: "Ticket sales reporting, coming soon." },
  ] }),
  component: OrganizerSalesPage,
});

function OrganizerSalesPage() {
  return (
    <ComingSoon
      icon={<Ticket aria-hidden className="size-5" />}
      title="Ticket sales live here soon."
      description="Online ticket sales aren't available yet, so there's nothing to report. This section will show orders and revenue per event."
    />
  );
}
