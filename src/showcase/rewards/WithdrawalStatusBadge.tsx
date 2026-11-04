import { Badge } from "@/design-system/components/Badge";

const WITHDRAWAL_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  paid: "Paid",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Status pill for withdrawal requests, shared by wallet + admin views. */
export function WithdrawalStatusBadge({ status }: { status: string }) {
  const label = WITHDRAWAL_LABELS[status] ?? status;
  if (status === "paid") return <Badge variant="accent">{label}</Badge>;
  if (status === "rejected" || status === "cancelled") {
    return <Badge variant="transactional">{label}</Badge>;
  }
  if (status === "processing") return <Badge variant="outline">{label}</Badge>;
  return <Badge variant="neutral">{label}</Badge>;
}

const LEDGER_LABELS: Record<string, string> = {
  earn: "Earned",
  bonus: "Bonus",
  adjust: "Adjustment",
  withdraw_reserve: "Withdrawal reserved",
  withdraw_complete: "Withdrawal paid",
  withdraw_reversal: "Withdrawal returned",
  cancel_reversal: "Cancellation returned",
};

/** Human label for a ledger entry type. Positive amounts read as credit. */
export function LedgerTypeLabel({ type }: { type: string }) {
  return <>{LEDGER_LABELS[type] ?? type}</>;
}
