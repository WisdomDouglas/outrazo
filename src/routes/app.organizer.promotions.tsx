import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";

import { ComingSoon } from "@/showcase/organizer/ComingSoon";

export const Route = createFileRoute("/app/organizer/promotions")({
  head: () => ({ meta: [
    { title: "Promotions — Organizer Dashboard — Outrazo" },
    { name: "description", content: "Event promotions, coming soon." },
  ] }),
  component: OrganizerPromotionsPage,
});

function OrganizerPromotionsPage() {
  return (
    <ComingSoon
      icon={<Megaphone aria-hidden className="size-5" />}
      title="Promotions live here soon."
      description="Discount codes and featured placements are coming soon. Your published events already appear in discovery."
    />
  );
}
