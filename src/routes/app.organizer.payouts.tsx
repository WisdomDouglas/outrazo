import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";

import { ComingSoon } from "@/showcase/organizer/ComingSoon";

export const Route = createFileRoute("/app/organizer/payouts")({
  head: () => ({ meta: [
    { title: "Payouts — Organizer Dashboard — Outrazo" },
    { name: "description", content: "Organizer payouts, coming soon." },
  ] }),
  component: OrganizerPayoutsPage,
});

function OrganizerPayoutsPage() {
  return (
    <ComingSoon
      icon={<Wallet aria-hidden className="size-5" />}
      title="Payouts live here soon."
      description="Payouts aren't available yet. No money moves in this release, so there is no payout history to show."
    />
  );
}
