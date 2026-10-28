import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";

import { ComingSoon } from "@/showcase/organizer/ComingSoon";

export const Route = createFileRoute("/app/organizer/payment-details")({
  head: () => ({ meta: [
    { title: "Payment Details — Organizer Dashboard — Outrazo" },
    { name: "description", content: "Payout details management, coming soon." },
  ] }),
  component: OrganizerPaymentDetailsPage,
});

function OrganizerPaymentDetailsPage() {
  return (
    <ComingSoon
      icon={<CreditCard aria-hidden className="size-5" />}
      title="Payment details live here soon."
      description="Bank details aren't collected yet. You'll add payout details here in a future release — nothing is stored for now."
    />
  );
}
