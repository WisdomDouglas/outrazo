import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Input } from "@/design-system/components/Input";
import { Skeleton } from "@/design-system/components/Skeleton";
import { ConfirmAction } from "@/showcase/admin/ConfirmAction";
import {
  friendlyAdminError,
  useAccessToken,
  useMyAdminRole,
} from "@/showcase/admin/admin-client";
import {
  adminTransitionWithdrawal,
  creditUserPoints,
  getRewardsOverview,
  getWithdrawalDetail,
  listRewardSettings,
  listWithdrawals,
  setRewardSetting,
  type AdminWithdrawalDetail,
  type AdminWithdrawalRow,
  type RewardsOverview,
} from "@/showcase/admin/admin-functions";
import { roleHasPermission } from "@/showcase/admin/permissions";
import { formatKoboToNaira } from "@/showcase/promotions/promotion-windows";
import {
  isWithdrawalStatus,
  nextWithdrawalStatuses,
  type WithdrawalStatus,
} from "@/showcase/rewards/reward-points";
import { WithdrawalStatusBadge } from "@/showcase/rewards/WithdrawalStatusBadge";

export const Route = createFileRoute("/admin/rewards")({
  head: () => ({ meta: [
    { title: "Rewards — Admin Console — Outrazo" },
    { name: "description", content: "Points issuance, withdrawal queue, and rewards settings." },
  ] }),
  component: AdminRewardsPage,
});

const PAGE_SIZE = 20;

function AdminRewardsPage() {
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const canManage = role !== null && roleHasPermission(role, "rewards.manage");

  return (
    <div className="grid gap-xl">
      <div>
        <h2 className="type-h2">Rewards & withdrawals</h2>
        <p className="type-body mt-xs text-muted-text">
          Points issuance, the manual withdrawal queue, and rewards settings. Bank transfers
          happen outside Outrazo — this console only records confirmed transfers.
        </p>
      </div>
      <OverviewSection token={token} />
      <QueueSection token={token} canManage={canManage} />
      <CreditSection token={token} canManage={canManage} />
      <SettingsSection token={token} canManage={canManage} />
    </div>
  );
}

function OverviewSection({ token }: { token: string | null }) {
  const [overview, setOverview] = useState<RewardsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setOverview(await getRewardsOverview({ headers: { Authorization: `Bearer ${token}` } }));
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) return <Skeleton className="h-32 rounded-lg" />;
  if (error || !overview) {
    return (
      <ErrorState title="We couldn't load the rewards overview." description={error ?? "Please try again."} onRetry={() => void refresh()} />
    );
  }
  const stats = [
    { label: "Points issued", value: overview.totalIssuedPoints.toLocaleString() },
    { label: "Points outstanding", value: overview.totalOutstandingPoints.toLocaleString() },
    { label: "Points redeemed", value: overview.totalRedeemedPoints.toLocaleString() },
    { label: "Pending value", value: formatKoboToNaira(overview.pendingNairaKobo) },
    { label: "Pending requests", value: String(overview.pendingCount) },
    { label: "Completed", value: String(overview.completedCount) },
    { label: "Rejected", value: String(overview.rejectedCount) },
  ];
  return (
    <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border border-line bg-card p-lg shadow-card">
          <p className="type-h1">{stat.value}</p>
          <p className="type-body mt-xs text-muted-text">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

type QueueSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

function QueueSection({ token, canManage }: { token: string | null; canManage: boolean }) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<QueueSort>("date_desc");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AdminWithdrawalRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listWithdrawals({
        data: {
          limit: PAGE_SIZE,
          offset,
          status: status === "all" ? undefined : status,
          search: appliedSearch || undefined,
          from: from || undefined,
          to: to || undefined,
          sort,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setRows(result.withdrawals);
      setTotal(result.total);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, from, offset, sort, status, to, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section aria-label="Withdrawal queue" className="grid gap-md">
      <h3 className="type-h3">Withdrawal queue</h3>
      <form
        className="flex flex-wrap items-end gap-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setOffset(0);
          setAppliedSearch(search.trim());
        }}
      >
        <Input
          label="Search user, email, or ID"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name, email, or user ID"
        />
        <label className="grid gap-sm">
          <span className="type-caption text-muted-text">Status</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.currentTarget.value);
              setOffset(0);
            }}
            className="type-body h-12 rounded-md border border-line bg-card px-md text-primary-text outline-none focus:border-accent"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <Input label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Input label="To" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <label className="grid gap-sm">
          <span className="type-caption text-muted-text">Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.currentTarget.value as QueueSort)}
            className="type-body h-12 rounded-md border border-line bg-card px-md text-primary-text outline-none focus:border-accent"
          >
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="amount_desc">Largest amount</option>
            <option value="amount_asc">Smallest amount</option>
          </select>
        </label>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {loading ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : error ? (
        <ErrorState title="We couldn't load withdrawals." description={error} onRetry={() => void refresh()} />
      ) : !rows || rows.length === 0 ? (
        <EmptyState title="No withdrawals found." description="Withdrawal requests appear here once users submit them." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
            <table className="w-full min-w-[840px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {["User", "Amount", "Destination", "Status", "Requested", ""].map((column) => (
                    <th key={column || "open"} scope="col" className="type-caption px-md py-sm font-semibold tracking-wide text-muted-text uppercase">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line align-top last:border-0">
                    <td className="type-body px-md py-sm font-medium">
                      {row.userName ?? "Unknown user"}
                      {row.userEmail ? (
                        <span className="type-caption block font-normal text-muted-text">{row.userEmail}</span>
                      ) : null}
                    </td>
                    <td className="type-body px-md py-sm font-medium">
                      {formatKoboToNaira(row.nairaAmountKobo)}
                      <span className="type-caption block font-normal text-muted-text">
                        {row.points.toLocaleString()} pts
                      </span>
                    </td>
                    <td className="type-body px-md py-sm text-muted-text">
                      {row.bankName} · •••• {row.accountLast4}
                    </td>
                    <td className="px-md py-sm">
                      <WithdrawalStatusBadge status={row.status} />
                    </td>
                    <td className="type-body px-md py-sm whitespace-nowrap text-muted-text">
                      {new Date(row.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-md py-sm">
                      <Button type="button" variant="outline" size="sm" onClick={() => setDetailId(row.id)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-sm">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((n) => Math.max(0, n - PAGE_SIZE))}>
              Previous
            </Button>
            <span className="type-body text-muted-text">
              {total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset((n) => n + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      {detailId ? (
        <WithdrawalDetailDialog
          token={token}
          requestId={detailId}
          canManage={canManage}
          onClose={() => setDetailId(null)}
          onMoved={() => {
            setDetailId(null);
            void refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function WithdrawalDetailDialog({
  token,
  requestId,
  canManage,
  onClose,
  onMoved,
}: {
  token: string | null;
  requestId: string;
  canManage: boolean;
  onClose: () => void;
  onMoved: () => void;
}) {
  const [detail, setDetail] = useState<AdminWithdrawalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toStatus, setToStatus] = useState<WithdrawalStatus | "">("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getWithdrawalDetail({
      data: { requestId },
      headers: { Authorization: `Bearer ${token}` },
    }).then(
      (result) => {
        if (!active) return;
        setDetail(result);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(friendlyAdminError(caught));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [requestId, token]);

  const move = async () => {
    if (!token || !detail || acting || !toStatus) return;
    setActionError(null);
    if (toStatus === "paid") {
      if (!reference.trim()) {
        setActionError("Record the bank transfer reference before marking paid.");
        return;
      }
      const parsed = Number(paidAmount.trim());
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setActionError("Enter the amount actually paid.");
        return;
      }
      if (Math.round(parsed * 100) !== detail.nairaAmountKobo) {
        setActionError(
          `The recorded amount must match the approved ${formatKoboToNaira(detail.nairaAmountKobo)}.`,
        );
        return;
      }
    }
    if ((toStatus === "rejected" || toStatus === "cancelled") && !reason.trim()) {
      setActionError("Record why the withdrawal was not paid.");
      return;
    }
    setActing(true);
    try {
      await adminTransitionWithdrawal({
        data: {
          requestId,
          toStatus,
          reason: reason.trim() ? reason.trim() : undefined,
          reference: toStatus === "paid" ? reference.trim() : undefined,
          paidAmountNaira: toStatus === "paid" ? Number(paidAmount.trim()) : undefined,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      onMoved();
    } catch (caught) {
      setActionError(friendlyAdminError(caught));
    } finally {
      setActing(false);
    }
  };

  const next = detail && isWithdrawalStatus(detail.status) ? nextWithdrawalStatuses(detail.status) : [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-md backdrop-blur-sm" onClick={onClose} role="presentation">
      <div
        className="mx-auto my-[6vh] grid w-full max-w-[640px] gap-md rounded-xl border border-line bg-card p-lg shadow-card"
        role="dialog"
        aria-modal="true"
        aria-label="Withdrawal request"
        onClick={(event) => event.stopPropagation()}
      >
        {loading ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : error || !detail ? (
          <ErrorState title="We couldn't load the withdrawal." description={error ?? "Please try again."} onRetry={onClose} />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div>
                <h3 className="type-h3">{formatKoboToNaira(detail.nairaAmountKobo)}</h3>
                <p className="type-body mt-xs text-muted-text">
                  {detail.userName ?? "Unknown user"}
                  {detail.userEmail ? ` · ${detail.userEmail}` : ""}
                </p>
              </div>
              <WithdrawalStatusBadge status={detail.status} />
            </div>
            <dl className="grid gap-sm rounded-lg border border-line bg-canvas p-md sm:grid-cols-2">
              <div>
                <dt className="type-caption text-muted-text">Points</dt>
                <dd className="type-body font-medium">{detail.points.toLocaleString()} pts</dd>
              </div>
              <div>
                <dt className="type-caption text-muted-text">Rate snapshot</dt>
                <dd className="type-body font-medium">1 pt = ₦{detail.nairaPerPoint.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="type-caption text-muted-text">Bank</dt>
                <dd className="type-body font-medium">{detail.bankName}</dd>
              </div>
              <div>
                <dt className="type-caption text-muted-text">Account holder</dt>
                <dd className="type-body font-medium">{detail.accountName}</dd>
              </div>
              <div>
                <dt className="type-caption text-muted-text">Account number</dt>
                <dd className="type-body font-mono font-medium">{detail.accountNumber}</dd>
              </div>
              <div>
                <dt className="type-caption text-muted-text">Verified</dt>
                <dd className="type-body font-medium">{detail.bankVerified ? "Yes" : "No — user-supplied"}</dd>
              </div>
              <div>
                <dt className="type-caption text-muted-text">Requested</dt>
                <dd className="type-body font-medium">{new Date(detail.createdAt).toLocaleString()}</dd>
              </div>
              {detail.paidReference ? (
                <div>
                  <dt className="type-caption text-muted-text">Payment reference</dt>
                  <dd className="type-body font-mono font-medium">{detail.paidReference}</dd>
                </div>
              ) : null}
              {detail.paidByName ? (
                <div>
                  <dt className="type-caption text-muted-text">Confirmed by</dt>
                  <dd className="type-body font-medium">
                    {detail.paidByName}
                    {detail.paidAt ? ` · ${new Date(detail.paidAt).toLocaleString()}` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
            {detail.statusReason ? (
              <p className="type-body text-muted-text">Note: {detail.statusReason}</p>
            ) : null}
            {detail.ledger.length > 0 ? (
              <details>
                <summary className="type-body focus-ring cursor-pointer text-muted-text">
                  Ledger entries ({detail.ledger.length})
                </summary>
                <ul className="mt-sm grid gap-xs">
                  {detail.ledger.map((entry) => (
                    <li key={entry.id} className="type-body flex justify-between gap-md text-muted-text">
                      <span>
                        {entry.type} · {entry.description || "—"}
                      </span>
                      <span className="shrink-0 font-medium text-primary-text">
                        {entry.points > 0 ? "+" : ""}
                        {entry.points.toLocaleString()} pts
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {canManage && next.length > 0 ? (
              <div className="grid gap-sm border-t border-line pt-md">
                <label className="grid max-w-xs gap-sm">
                  <span className="type-caption text-muted-text">Move to</span>
                  <select
                    value={toStatus}
                    onChange={(event) => setToStatus(event.currentTarget.value as WithdrawalStatus | "")}
                    className="type-body h-12 rounded-md border border-line bg-card px-md text-primary-text outline-none focus:border-accent"
                  >
                    <option value="">Choose a status</option>
                    {next.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                {toStatus === "paid" ? (
                  <>
                    <p className="type-body text-muted-text">
                      Confirm you already completed the bank transfer of{" "}
                      {formatKoboToNaira(detail.nairaAmountKobo)} outside Outrazo, then record it.
                    </p>
                    <Input
                      label="Amount actually paid (NGN)"
                      value={paidAmount}
                      onChange={(event) => setPaidAmount(event.target.value)}
                      placeholder={(detail.nairaAmountKobo / 100).toLocaleString()}
                      inputMode="decimal"
                    />
                    <Input
                      label="Bank transfer reference"
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      placeholder="Transaction ID or reference"
                      maxLength={120}
                    />
                  </>
                ) : null}
                {toStatus === "rejected" || toStatus === "cancelled" ? (
                  <Input
                    label="Reason (shown to the user)"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Why was this not paid?"
                    maxLength={500}
                  />
                ) : null}
                {actionError ? (
                  <p className="type-body text-transactional" role="alert">
                    {actionError}
                  </p>
                ) : null}
                <div>
                  <ConfirmAction
                    label={toStatus === "paid" ? "Record payment & mark paid" : "Move withdrawal"}
                    question={toStatus === "paid" ? "Transfer completed and recorded?" : `Move to ${toStatus}?`}
                    disabled={acting || !toStatus}
                    onConfirm={move}
                  />
                </div>
              </div>
            ) : null}
            <div>
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CreditSection({ token, canManage }: { token: string | null; canManage: boolean }) {
  const [userId, setUserId] = useState("");
  const [points, setPoints] = useState("");
  const [type, setType] = useState("bonus");
  const [description, setDescription] = useState("");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    if (!token || acting) return;
    setError(null);
    setNotice(null);
    const parsed = Number(points.trim());
    if (!userId.trim()) {
      setError("Enter the user's ID.");
      return;
    }
    if (!Number.isInteger(parsed) || parsed === 0) {
      setError("Enter a whole, non-zero points amount (negative allowed for corrections).");
      return;
    }
    if (description.trim().length < 3) {
      setError("Describe why these points are issued.");
      return;
    }
    setActing(true);
    try {
      await creditUserPoints({
        data: { userId: userId.trim(), points: parsed, type: type as "bonus" | "adjust" | "earn", description: description.trim() },
        headers: { Authorization: `Bearer ${token}` },
      });
      setPoints("");
      setDescription("");
      setNotice(`Credited ${parsed.toLocaleString()} points. Recorded in the ledger and audit log.`);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setActing(false);
    }
  };

  if (!canManage) return null;
  return (
    <section aria-label="Credit points" className="grid gap-md rounded-lg border border-line bg-card p-lg shadow-card">
      <div>
        <h3 className="type-h3">Credit points</h3>
        <p className="type-body mt-xs text-muted-text">
          Issue bonuses or corrections. Every credit writes a ledger entry and an audit record —
          no automatic earning rules exist yet.
        </p>
      </div>
      <div className="grid max-w-md gap-sm">
        <Input label="User ID" value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="UUID from the Users page" />
        <Input label="Points (negative allowed)" value={points} onChange={(event) => setPoints(event.target.value)} placeholder="100" inputMode="numeric" />
        <label className="grid gap-sm">
          <span className="type-caption text-muted-text">Type</span>
          <select
            value={type}
            onChange={(event) => setType(event.currentTarget.value)}
            className="type-body h-12 rounded-md border border-line bg-card px-md text-primary-text outline-none focus:border-accent"
          >
            <option value="bonus">Bonus</option>
            <option value="earn">Earned</option>
            <option value="adjust">Adjustment</option>
          </select>
        </label>
        <Input label="Description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Campaign name or correction reason" maxLength={200} />
        <div>
          <ConfirmAction label="Credit points" question={`Credit ${points.trim() || "?"} points?`} disabled={acting} onConfirm={submit} />
        </div>
      </div>
      {error ? <p className="type-body text-transactional" role="alert">{error}</p> : null}
      {notice ? <p className="type-body text-accent" role="status">{notice}</p> : null}
    </section>
  );
}

const SETTING_FIELDS = [
  { key: "naira_per_point", label: "Naira per point", kind: "number" as const, hint: "Opening: 10 (100 points = ₦1,000)." },
  { key: "min_withdrawal_naira", label: "Minimum withdrawal (₦)", kind: "number" as const, hint: "Opening: 3000. Applies to new requests only." },
  { key: "max_withdrawal_naira", label: "Maximum withdrawal (₦, empty = none)", kind: "optional-number" as const, hint: "Caps a single request." },
  { key: "daily_limit_naira", label: "Daily limit (₦, empty = none)", kind: "optional-number" as const, hint: "Caps one user's requests per day." },
  { key: "monthly_limit_naira", label: "Monthly limit (₦, empty = none)", kind: "optional-number" as const, hint: "Caps one user's requests per month." },
  { key: "rewards_enabled", label: "Rewards system enabled", kind: "boolean" as const, hint: "Master switch for the wallet." },
  { key: "withdrawals_enabled", label: "Withdrawals enabled", kind: "boolean" as const, hint: "Pause new requests without touching balances." },
];

function SettingsSection({ token, canManage }: { token: string | null; canManage: boolean }) {
  const [settings, setSettings] = useState<{ key: string; value: number | boolean | null; updatedByName: string | null; updatedAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listRewardSettings({ headers: { Authorization: `Bearer ${token}` } });
      setSettings(result.settings);
      const next: Record<string, string> = {};
      for (const row of result.settings) {
        next[row.key] = row.value === null ? "" : String(row.value);
      }
      setDrafts(next);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (key: string, kind: "number" | "optional-number" | "boolean") => {
    if (!token || actingKey) return;
    setFormError(null);
    setNotice(null);
    const raw = (drafts[key] ?? "").trim();
    let value: number | boolean | null;
    if (kind === "boolean") {
      value = raw === "true";
    } else if (raw === "") {
      if (kind === "number") {
        setFormError("Enter a number above zero.");
        return;
      }
      value = null;
    } else {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setFormError("Enter a number above zero.");
        return;
      }
      value = parsed;
    }
    setActingKey(key);
    try {
      await setRewardSetting({
        data: { key: key as "naira_per_point", value },
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotice(`Saved ${key}. Applies to new transactions; history is untouched.`);
      await refresh();
    } catch (caught) {
      setFormError(friendlyAdminError(caught));
    } finally {
      setActingKey(null);
    }
  };

  return (
    <section aria-label="Rewards settings" className="grid gap-md rounded-lg border border-line bg-card p-lg shadow-card">
      <div>
        <h3 className="type-h3">Rewards settings</h3>
        <p className="type-body mt-xs text-muted-text">
          Conversion rate, limits, and switches. Changes apply to new transactions only and
          are audited with your name attached.
        </p>
      </div>
      {loading ? (
        <Skeleton className="h-40 rounded-md" />
      ) : error ? (
        <ErrorState title="We couldn't load settings." description={error} onRetry={() => void refresh()} />
      ) : (
        <ul className="grid gap-md">
          {SETTING_FIELDS.map((field) => {
            const current = settings.find((row) => row.key === field.key);
            return (
              <li key={field.key} className="grid gap-sm border-b border-line pb-md last:border-0 last:pb-0">
                <div className="flex flex-wrap items-end gap-sm">
                  {field.kind === "boolean" ? (
                    <label className="grid gap-sm">
                      <span className="type-caption text-muted-text">{field.label}</span>
                      <select
                        value={drafts[field.key] ?? ""}
                        onChange={(event) => setDrafts((d) => ({ ...d, [field.key]: event.currentTarget.value }))}
                        disabled={!canManage}
                        className="type-body h-12 rounded-md border border-line bg-card px-md text-primary-text outline-none focus:border-accent disabled:opacity-50"
                      >
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </select>
                    </label>
                  ) : (
                    <Input
                      label={field.label}
                      value={drafts[field.key] ?? ""}
                      onChange={(event) => setDrafts((d) => ({ ...d, [field.key]: event.target.value }))}
                      inputMode="decimal"
                      disabled={!canManage}
                    />
                  )}
                  {canManage ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={actingKey === field.key}
                      disabled={actingKey !== null}
                      onClick={() => void save(field.key, field.kind)}
                    >
                      Save
                    </Button>
                  ) : null}
                </div>
                <p className="type-caption text-muted-text">
                  {field.hint}
                  {current?.updatedByName ? ` Last set by ${current.updatedByName}.` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {!canManage ? (
        <p className="type-body text-muted-text">Only super admins and finance admins may change settings.</p>
      ) : null}
      {formError ? <p className="type-body text-transactional" role="alert">{formError}</p> : null}
      {notice ? <p className="type-body text-accent" role="status">{notice}</p> : null}
    </section>
  );
}
