import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { PayoutStatusBadge } from "@/showcase/finance/PayoutStatusBadge";
import { useEarningsSummary, useMyPayouts } from "@/showcase/organizer/use-earnings";
import { formatKoboToNaira } from "@/showcase/promotions/promotion-windows";

export const Route = createFileRoute("/app/organizer/payouts")({
  head: () => ({ meta: [
    { title: "Payouts — Organizer Dashboard — Outrazo" },
    { name: "description", content: "Your payout balance and transfer history." },
  ] }),
  component: OrganizerPayoutsPage,
});

function OrganizerPayoutsPage() {
  const earnings = useEarningsSummary();
  const history = useMyPayouts();

  if (earnings.loading || history.loading) {
    return (
      <div className="grid gap-md" aria-label="Loading payouts">
        {[0, 1].map((key) => (
          <Skeleton key={key} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }
  if (earnings.error || !earnings.snapshot) {
    return (
      <ErrorState
        title="We couldn't load your balance."
        description={earnings.error ?? "Please try again."}
        onRetry={() => {
          earnings.refresh();
          history.refresh();
        }}
      />
    );
  }

  const stats = [
    { label: "Net earnings", value: formatKoboToNaira(earnings.snapshot.netKobo) },
    { label: "Reserved in payouts", value: formatKoboToNaira(earnings.snapshot.reservedKobo) },
    { label: "Available for payout", value: formatKoboToNaira(earnings.snapshot.availableKobo) },
  ];

  return (
    <div className="grid gap-xl">
      <div>
        <h2 className="type-h2">Payouts</h2>
        <p className="type-body mt-xs text-muted-text">
          Outrazo pays organizers by manual bank transfer. Each transfer is recorded here once
          confirmed — nothing moves automatically.
        </p>
      </div>

      <div className="grid gap-md sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-line bg-card p-lg shadow-card">
            <p className="type-h1">{stat.value}</p>
            <p className="type-body mt-xs text-muted-text">{stat.label}</p>
          </div>
        ))}
      </div>

      {history.error ? (
        <ErrorState
          title="We couldn't load your payout history."
          description={history.error}
          onRetry={history.refresh}
        />
      ) : history.payouts.length === 0 ? (
        <EmptyState
          icon={<Wallet aria-hidden className="size-5" />}
          title="No payouts yet."
          description="When Outrazo confirms a bank transfer to you, it appears here with its reference."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {["Amount", "Status", "Reference", "Updated"].map((column) => (
                  <th key={column} scope="col" className="type-caption px-md py-sm font-semibold tracking-wide text-muted-text uppercase">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.payouts.map((payout) => (
                <tr key={payout.id} className="border-b border-line align-top last:border-0">
                  <td className="type-body px-md py-sm font-medium">
                    {formatKoboToNaira(payout.amountKobo)}
                    {payout.statusReason ? (
                      <span className="type-caption mt-xs block text-muted-text">{payout.statusReason}</span>
                    ) : null}
                  </td>
                  <td className="px-md py-sm">
                    <PayoutStatusBadge status={payout.status} />
                  </td>
                  <td className="type-caption px-md py-sm font-mono text-muted-text">
                    {payout.reference ?? "—"}
                  </td>
                  <td className="type-body px-md py-sm whitespace-nowrap text-muted-text">
                    {new Date(payout.paidAt ?? payout.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
