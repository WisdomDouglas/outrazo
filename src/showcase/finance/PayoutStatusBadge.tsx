import { Badge } from "@/design-system/components/Badge";

const PAYOUT_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  processing: "Processing",
  paid: "Paid",
  on_hold: "On hold",
  failed: "Failed",
};

/** Status pill for manual payout records, shared by organizer + admin views. */
export function PayoutStatusBadge({ status }: { status: string }) {
  const label = PAYOUT_LABELS[status] ?? status;
  if (status === "paid") return <Badge variant="accent">{label}</Badge>;
  if (status === "failed") return <Badge variant="transactional">{label}</Badge>;
  if (status === "processing" || status === "approved") {
    return <Badge variant="outline">{label}</Badge>;
  }
  return <Badge variant="neutral">{label}</Badge>;
}
