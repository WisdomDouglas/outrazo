import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Coins, Landmark, ReceiptText, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Input } from "@/design-system/components/Input";
import { Skeleton } from "@/design-system/components/Skeleton";
import { formatKoboToNaira } from "@/showcase/promotions/promotion-windows";
import {
  maskAccountNumber,
  minPointsForNaira,
  pointsToKobo,
  validateWithdrawalInput,
} from "@/showcase/rewards/reward-points";
import {
  useMyBankDetails,
  useMyLedger,
  useMyWallet,
  useMyWithdrawals,
  useWithdrawalActions,
} from "@/showcase/rewards/use-rewards";
import { LedgerTypeLabel, WithdrawalStatusBadge } from "@/showcase/rewards/WithdrawalStatusBadge";

export const Route = createFileRoute("/app/rewards")({
  head: () => ({ meta: [
    { title: "Rewards — Outrazo" },
    { name: "description", content: "Your Outrazo Points wallet, transactions, and withdrawals." },
  ] }),
  component: RewardsPage,
});

function RewardsPage() {
  const wallet = useMyWallet();
  const ledger = useMyLedger(20);
  const withdrawals = useMyWithdrawals();
  const bank = useMyBankDetails();
  const [dialogOpen, setDialogOpen] = useState(false);

  const refreshAll = () => {
    wallet.refresh();
    ledger.refresh();
    withdrawals.refresh();
    bank.refresh();
  };

  if (wallet.loading) {
    return (
      <div className="mx-auto grid w-full max-w-[760px] gap-md px-md py-xl" aria-label="Loading rewards">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    );
  }
  if (wallet.error || !wallet.settings) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-md py-xl">
        <ErrorState
          title="We couldn't load your rewards."
          description={wallet.error ?? "Please try again."}
          onRetry={refreshAll}
        />
      </div>
    );
  }

  const settings = wallet.settings;
  const minPoints = minPointsForNaira(settings.minWithdrawalNaira, settings.nairaPerPoint);
  const maxPoints = settings.maxWithdrawalNaira
    ? Math.floor(settings.maxWithdrawalNaira / settings.nairaPerPoint)
    : null;
  const eligible =
    settings.withdrawalsEnabled && wallet.hasBankDetails && wallet.balancePoints >= minPoints;

  return (
    <div className="mx-auto grid w-full max-w-[760px] gap-xl px-md py-xl lg:px-xl">
      <div>
        <Link to="/app/profile" className="focus-ring inline-flex items-center gap-xs rounded-sm text-accent">
          <ArrowLeft aria-hidden className="size-4" /> Back to profile
        </Link>
        <h1 className="type-h1 mt-sm">Rewards</h1>
        <p className="type-body-lg mt-xs text-muted-text">
          Earn Outrazo Points, then withdraw real Naira to your bank.
        </p>
      </div>

      <section
        aria-label="Points balance"
        className="relative overflow-hidden rounded-xl border border-line bg-card p-lg shadow-card sm:p-xl"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-accent/10 blur-2xl"
        />
        <div className="flex flex-wrap items-end justify-between gap-md">
          <div>
            <p className="flex items-center gap-xs text-muted-text">
              <Coins aria-hidden className="size-4 text-accent" />
              <span className="type-caption">Available balance</span>
            </p>
            <p className="type-h1 mt-xs">
              {wallet.balancePoints.toLocaleString()}{" "}
              <span className="type-body font-normal text-muted-text">pts</span>
            </p>
            <p className="type-h3 mt-xs text-accent">
              ≈ {formatKoboToNaira(pointsToKobo(wallet.balancePoints, settings.nairaPerPoint))}
            </p>
          </div>
          <Button type="button" size="lg" disabled={!eligible} onClick={() => setDialogOpen(true)}>
            Withdraw
          </Button>
        </div>
        <dl className="mt-lg grid grid-cols-3 gap-sm border-t border-line pt-md">
          {[
            { label: "Lifetime earned", value: `${wallet.lifetimeEarned.toLocaleString()} pts` },
            { label: "Redeemed", value: `${wallet.redeemedPoints.toLocaleString()} pts` },
            { label: "Rate", value: `1 pt = ₦${settings.nairaPerPoint.toLocaleString()}` },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="type-caption text-muted-text">{stat.label}</dt>
              <dd className="type-body mt-xs font-semibold">{stat.value}</dd>
            </div>
          ))}
        </dl>
        {!settings.withdrawalsEnabled ? (
          <p className="type-body mt-md text-muted-text" role="note">
            Withdrawals are currently paused. Your points are safe and remain in your wallet.
          </p>
        ) : !wallet.hasBankDetails ? (
          <p className="type-body mt-md text-muted-text" role="note">
            <Link to="/app/settings" className="focus-ring rounded-sm text-accent">
              Add your bank details in Settings
            </Link>{" "}
            to unlock withdrawals.
          </p>
        ) : wallet.balancePoints < minPoints ? (
          <p className="type-body mt-md text-muted-text" role="note">
            Withdrawals open at {minPoints.toLocaleString()} points (
            {formatKoboToNaira(pointsToKobo(minPoints, settings.nairaPerPoint))}). Keep earning.
          </p>
        ) : null}
      </section>

      <section aria-label="Withdrawal requests" className="grid gap-md">
        <h2 className="type-h2 flex items-center gap-sm">
          <Wallet aria-hidden className="size-5 text-accent" /> Withdrawals
        </h2>
        {withdrawals.loading ? (
          <Skeleton className="h-28 rounded-xl" />
        ) : withdrawals.error ? (
          <ErrorState
            title="We couldn't load your withdrawals."
            description={withdrawals.error}
            onRetry={withdrawals.refresh}
          />
        ) : withdrawals.withdrawals.length === 0 ? (
          <EmptyState
            icon={<Wallet aria-hidden className="size-5" />}
            title="No withdrawals yet."
            description="When you withdraw points, each request and its status appears here."
          />
        ) : (
          <ul className="grid gap-sm">
            {withdrawals.withdrawals.map((row) => (
              <WithdrawalCard key={row.id} row={row} onCancel={withdrawals.refresh} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Reward transactions" className="grid gap-md">
        <h2 className="type-h2 flex items-center gap-sm">
          <ReceiptText aria-hidden className="size-5 text-accent" /> Transactions
        </h2>
        {ledger.loading ? (
          <Skeleton className="h-28 rounded-xl" />
        ) : ledger.error ? (
          <ErrorState
            title="We couldn't load your transactions."
            description={ledger.error}
            onRetry={ledger.refresh}
          />
        ) : ledger.entries.length === 0 ? (
          <EmptyState
            icon={<ReceiptText aria-hidden className="size-5" />}
            title="No transactions yet."
            description="Points you earn and withdraw are recorded here, entry by entry."
          />
        ) : (
          <ul className="grid gap-sm">
            {ledger.entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-md rounded-lg border border-line bg-card px-md py-sm"
              >
                <div className="min-w-0">
                  <p className="type-body font-medium">
                    <LedgerTypeLabel type={entry.type} />
                  </p>
                  <p className="type-caption truncate text-muted-text">
                    {entry.description || new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
                <p
                  className={`type-body shrink-0 font-semibold ${entry.points > 0 ? "text-accent" : "text-primary-text"}`}
                >
                  {entry.points > 0 ? "+" : ""}
                  {entry.points.toLocaleString()} pts
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialogOpen ? (
        <WithdrawDialog
          balancePoints={wallet.balancePoints}
          minPoints={minPoints}
          maxPoints={maxPoints}
          nairaPerPoint={settings.nairaPerPoint}
          bankName={bank.details?.bankName ?? null}
          accountLast4={
            bank.details ? maskAccountNumber(bank.details.accountNumber) : null
          }
          onClose={() => setDialogOpen(false)}
          onDone={() => {
            setDialogOpen(false);
            refreshAll();
          }}
        />
      ) : null}

      <p className="type-caption flex items-center gap-xs text-muted-text">
        <Landmark aria-hidden className="size-4" />
        Withdrawals are paid by manual bank transfer. Staff confirm each transfer before a
        request is marked paid.
      </p>
    </div>
  );
}

function WithdrawalCard({
  row,
  onCancel,
}: {
  row: {
    id: string;
    points: number;
    nairaAmountKobo: number;
    bankName: string;
    accountLast4: string;
    status: string;
    statusReason: string | null;
    paidReference: string | null;
    createdAt: string;
  };
  onCancel: () => void;
}) {
  const actions = useWithdrawalActions(onCancel);
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="grid gap-sm rounded-lg border border-line bg-card px-md py-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="type-body font-semibold">
          {formatKoboToNaira(row.nairaAmountKobo)}{" "}
          <span className="font-normal text-muted-text">({row.points.toLocaleString()} pts)</span>
        </p>
        <WithdrawalStatusBadge status={row.status} />
      </div>
      <p className="type-caption text-muted-text">
        {row.bankName} · •••• {row.accountLast4} · {new Date(row.createdAt).toLocaleString()}
      </p>
      {row.statusReason ? <p className="type-body text-muted-text">{row.statusReason}</p> : null}
      {row.paidReference ? (
        <p className="type-caption font-mono text-muted-text">Ref: {row.paidReference}</p>
      ) : null}
      {row.status === "pending" ? (
        confirming ? (
          <span className="flex flex-wrap items-center gap-sm">
            <span className="type-body">Cancel this request? The points return to your wallet.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={actions.busy}
              disabled={actions.busy}
              onClick={() => void actions.cancel(row.id)}
            >
              Confirm cancel
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </span>
        ) : (
          <span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              Cancel request
            </Button>
          </span>
        )
      ) : null}
      {actions.error ? (
        <p className="type-body text-transactional" role="alert">
          {actions.error}
        </p>
      ) : null}
    </li>
  );
}

function WithdrawDialog({
  balancePoints,
  minPoints,
  maxPoints,
  nairaPerPoint,
  bankName,
  accountLast4,
  onClose,
  onDone,
}: {
  balancePoints: number;
  minPoints: number;
  maxPoints: number | null;
  nairaPerPoint: number;
  bankName: string | null;
  accountLast4: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pointsInput, setPointsInput] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const actions = useWithdrawalActions(onDone);

  const parsed = useMemo(() => {
    const cleaned = pointsInput.replace(/[^0-9]/g, "");
    if (!cleaned) return null;
    const value = Number(cleaned);
    return Number.isSafeInteger(value) ? value : null;
  }, [pointsInput]);

  const startReview = () => {
    setLocalError(null);
    if (parsed === null) {
      setLocalError("Enter a whole points amount above zero.");
      return;
    }
    const validated = validateWithdrawalInput({
      points: parsed,
      balancePoints,
      minPoints,
      maxPoints,
    });
    if (!validated.ok) {
      setLocalError(validated.error);
      return;
    }
    setReviewing(true);
  };

  const submit = () => {
    if (parsed === null) return;
    void actions.submit(parsed);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-md backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="mx-auto my-[10vh] grid w-full max-w-[440px] gap-md rounded-xl border border-line bg-card p-lg shadow-card"
        role="dialog"
        aria-modal="true"
        aria-label="Request a withdrawal"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="type-h2">Withdraw points</h2>
        {!reviewing ? (
          <>
            <p className="type-body text-muted-text">
              Available: {balancePoints.toLocaleString()} pts (≈{" "}
              {formatKoboToNaira(pointsToKobo(balancePoints, nairaPerPoint))})
            </p>
            <Input
              label="Points to withdraw"
              value={pointsInput}
              onChange={(event) => setPointsInput(event.target.value)}
              placeholder={String(minPoints)}
              inputMode="numeric"
            />
            {parsed !== null && parsed > 0 ? (
              <p className="type-body" role="status">
                You receive ≈ {formatKoboToNaira(pointsToKobo(parsed, nairaPerPoint))}
              </p>
            ) : null}
            {localError ? (
              <p className="type-body text-transactional" role="alert">
                {localError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-sm">
              <Button type="button" disabled={!parsed} onClick={startReview}>
                Review
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <dl className="grid gap-sm rounded-lg border border-line bg-canvas p-md">
              <div className="flex justify-between gap-md">
                <dt className="type-body text-muted-text">Points</dt>
                <dd className="type-body font-semibold">{parsed?.toLocaleString()} pts</dd>
              </div>
              <div className="flex justify-between gap-md">
                <dt className="type-body text-muted-text">You receive</dt>
                <dd className="type-body font-semibold">
                  {formatKoboToNaira(pointsToKobo(parsed ?? 0, nairaPerPoint))}
                </dd>
              </div>
              <div className="flex justify-between gap-md">
                <dt className="type-body text-muted-text">Destination</dt>
                <dd className="type-body font-semibold">
                  {bankName} · {accountLast4}
                </dd>
              </div>
            </dl>
            <p className="type-caption text-muted-text">
              The points reserve immediately and return to your wallet if the request is
              rejected or cancelled. Staff transfer the money manually, then mark it paid.
            </p>
            {actions.error ? (
              <p className="type-body text-transactional" role="alert">
                {actions.error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-sm">
              <Button type="button" loading={actions.busy} disabled={actions.busy} onClick={submit}>
                Confirm withdrawal
              </Button>
              <Button type="button" variant="ghost" onClick={() => setReviewing(false)}>
                Back
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
