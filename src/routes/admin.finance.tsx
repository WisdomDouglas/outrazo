import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Input } from "@/design-system/components/Input";
import { Skeleton } from "@/design-system/components/Skeleton";
import { TicketStatusBadge } from "@/showcase/tickets/TicketOrderStatusPanel";
import { ConfirmAction } from "@/showcase/admin/ConfirmAction";
import {
  friendlyAdminError,
  useAccessToken,
  useMyAdminRole,
} from "@/showcase/admin/admin-client";
import {
  createPayout,
  getCommissionDefault,
  listOrganizerBalances,
  listPayouts,
  listTicketTransactions,
  setCommissionDefault,
  transitionPayout,
  type AdminCommissionRow,
  type AdminPayoutRow,
  type AdminTicketTransactionRow,
} from "@/showcase/admin/admin-functions";
import { roleHasPermission } from "@/showcase/admin/permissions";
import { nextPayoutStatuses, type PayoutStatus } from "@/showcase/finance/commission";
import { PayoutStatusBadge } from "@/showcase/finance/PayoutStatusBadge";
import {
  formatKoboToNaira,
  parsePriceNairaToKobo,
} from "@/showcase/promotions/promotion-windows";

export const Route = createFileRoute("/admin/finance")({
  head: () => ({ meta: [
    { title: "Finance — Admin Console — Outrazo" },
    { name: "description", content: "Ticket transactions, commission default, and manual payouts." },
  ] }),
  component: AdminFinancePage,
});

const PAGE_SIZE = 20;

type TxStatus = "all" | "paid" | "pending" | "failed" | "expired";

const TX_OPTIONS: { value: TxStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "expired", label: "Expired" },
];

function AdminFinancePage() {
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const canSetCommission = role !== null && roleHasPermission(role, "finance.commission");
  const canMovePayouts = role !== null && roleHasPermission(role, "finance.payouts");

  return (
    <div className="grid gap-xl">
      <div>
        <h2 className="type-h2">Finance</h2>
        <p className="type-body mt-xs text-muted-text">
          Real ticket money: every order, the platform fee each event locked, and manual payout
          records. Nothing here moves money automatically.
        </p>
      </div>
      <TransactionsSection token={token} />
      <CommissionSection token={token} canSetCommission={canSetCommission} />
      <PayoutsSection token={token} canMovePayouts={canMovePayouts} />
    </div>
  );
}

function TransactionsSection({ token }: { token: string | null }) {
  const [status, setStatus] = useState<TxStatus>("all");
  const [offset, setOffset] = useState(0);
  const [orders, setOrders] = useState<AdminTicketTransactionRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({ paidCount: 0, paidGrossKobo: 0, paidFeeKobo: 0, paidNetKobo: 0 });
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
      const result = await listTicketTransactions({
        data: { limit: PAGE_SIZE, offset, status },
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(result.orders);
      setTotal(result.total);
      setTotals({
        paidCount: result.paidCount,
        paidGrossKobo: result.paidGrossKobo,
        paidFeeKobo: result.paidFeeKobo,
        paidNetKobo: result.paidNetKobo,
      });
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [offset, status, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section aria-label="Ticket transactions" className="grid gap-md">
      <h3 className="type-h3">Ticket transactions</h3>
      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Gross collected", value: formatKoboToNaira(totals.paidGrossKobo) },
          { label: "Platform fees", value: formatKoboToNaira(totals.paidFeeKobo) },
          { label: "Organizer share", value: formatKoboToNaira(totals.paidNetKobo) },
          { label: "Paid orders", value: String(totals.paidCount) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-line bg-card p-lg shadow-card">
            <p className="type-h1">{stat.value}</p>
            <p className="type-body mt-xs text-muted-text">{stat.label}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-sm">
        <label className="type-caption text-muted-text" htmlFor="tx-status">Status</label>
        <select
          id="tx-status"
          value={status}
          onChange={(event) => {
            setStatus(event.currentTarget.value as TxStatus);
            setOffset(0);
          }}
          className="type-body h-11 rounded-md border border-line bg-card px-md text-primary-text outline-none focus:border-accent"
        >
          {TX_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : error ? (
        <ErrorState title="We couldn't load transactions." description={error} onRetry={() => void refresh()} />
      ) : !orders || orders.length === 0 ? (
        <EmptyState title="No transactions yet." description="Paid and pending ticket orders will appear here." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Reference", "Event", "Buyer", "Total", "Fee", "Status", "Date"].map((column) => (
                    <th key={column} scope="col" className="type-caption px-md py-sm font-semibold tracking-wide text-muted-text uppercase">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-line align-top last:border-0">
                    <td className="type-caption px-md py-sm font-mono text-muted-text">{order.reference}</td>
                    <td className="type-body px-md py-sm font-medium">
                      {order.eventTitle}
                      <span className="type-caption mt-xs block font-normal text-muted-text">
                        {order.ratePct}% locked
                      </span>
                    </td>
                    <td className="type-body px-md py-sm text-muted-text">
                      {order.buyerName ?? "Unknown buyer"}
                      {order.buyerEmail ? (
                        <span className="type-caption block">{order.buyerEmail}</span>
                      ) : null}
                    </td>
                    <td className="type-body px-md py-sm font-medium">{formatKoboToNaira(order.totalKobo)}</td>
                    <td className="type-body px-md py-sm text-muted-text">{formatKoboToNaira(order.feeKobo)}</td>
                    <td className="px-md py-sm"><TicketStatusBadge status={order.status} /></td>
                    <td className="type-body px-md py-sm whitespace-nowrap text-muted-text">
                      {new Date(order.paidAt ?? order.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-sm">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            >
              Previous
            </Button>
            <span className="type-body text-muted-text">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function CommissionSection({ token, canSetCommission }: { token: string | null; canSetCommission: boolean }) {
  const [current, setCurrent] = useState<AdminCommissionRow | null>(null);
  const [history, setHistory] = useState<AdminCommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getCommissionDefault({
        headers: { Authorization: `Bearer ${token}` },
      });
      setCurrent(result.current);
      setHistory(result.history);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    if (!token || saving) return;
    setNotice(null);
    const parsed = Number(rateInput.trim());
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setFormError("Enter a rate between 0 and 100 percent.");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await setCommissionDefault({
        data: { ratePct: Math.round(parsed * 100) / 100 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setRateInput("");
      setNotice(`Default set to ${parsed}%. New publishes lock this rate; existing events keep theirs.`);
      await refresh();
    } catch (caught) {
      setFormError(friendlyAdminError(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Commission default" className="grid gap-md rounded-lg border border-line bg-card p-lg shadow-card">
      <div>
        <h3 className="type-h3">Commission default</h3>
        <p className="type-body mt-xs text-muted-text">
          The rate a publish locks for new events. A change affects new publishes only — locked
          event rates never move.
        </p>
      </div>
      {loading ? (
        <Skeleton className="h-20 rounded-md" />
      ) : error ? (
        <ErrorState title="We couldn't load the default." description={error} onRetry={() => void refresh()} />
      ) : (
        <>
          <p className="type-h1">{current ? `${current.ratePct}%` : "Not set"}</p>
          {current?.createdByName ? (
            <p className="type-caption text-muted-text">
              Set by {current.createdByName} · {new Date(current.effectiveAt).toLocaleString()}
            </p>
          ) : null}
          {history.length > 0 ? (
            <details>
              <summary className="type-body focus-ring cursor-pointer text-muted-text">Rate history</summary>
              <ul className="type-body mt-sm grid gap-xs text-muted-text">
                {history.map((row) => (
                  <li key={row.id}>
                    {row.ratePct}% · {new Date(row.effectiveAt).toLocaleDateString()}
                    {row.createdByName ? ` · ${row.createdByName}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
      {canSetCommission ? (
        <div className="grid gap-sm">
          <div className="flex max-w-md flex-col gap-sm">
            <Input
              label="New default rate (percent)"
              value={rateInput}
              onChange={(event) => setRateInput(event.target.value)}
              placeholder="10"
              inputMode="decimal"
            />
            <div>
              <ConfirmAction
                label="Save new default"
                question={`Set the default to ${rateInput.trim() || "?"}%?`}
                disabled={saving || rateInput.trim() === ""}
                onConfirm={save}
              />
            </div>
          </div>
          {formError ? <p className="type-body text-transactional" role="alert">{formError}</p> : null}
          {notice ? <p className="type-body text-accent" role="status">{notice}</p> : null}
        </div>
      ) : (
        <p className="type-body text-muted-text">Only super admins and finance admins may change the default.</p>
      )}
    </section>
  );
}

interface OrganizerBalance {
  organizerId: string;
  organizerName: string | null;
  netKobo: number;
  reservedKobo: number;
  availableKobo: number;
}

function PayoutsSection({ token, canMovePayouts }: { token: string | null; canMovePayouts: boolean }) {
  const [balances, setBalances] = useState<OrganizerBalance[]>([]);
  const [payouts, setPayouts] = useState<AdminPayoutRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizerId, setOrganizerId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<PayoutStatus | "">("");
  const [moveDetail, setMoveDetail] = useState("");

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [balanceResult, payoutResult] = await Promise.all([
        listOrganizerBalances({ headers: { Authorization: `Bearer ${token}` } }),
        listPayouts({
          data: { limit: PAGE_SIZE, offset },
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setBalances(balanceResult.organizers);
      setPayouts(payoutResult.payouts);
      setTotal(payoutResult.total);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [offset, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedBalance = balances.find((row) => row.organizerId === organizerId) ?? null;

  const record = async () => {
    if (!token || acting) return;
    setNotice(null);
    if (!organizerId) {
      setFormError("Choose an organizer.");
      return;
    }
    const parsed = parsePriceNairaToKobo(amountInput);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    if (selectedBalance && parsed.kobo > selectedBalance.availableKobo) {
      setFormError(
        `That exceeds the available balance of ${formatKoboToNaira(selectedBalance.availableKobo)}.`,
      );
      return;
    }
    setFormError(null);
    setActing(true);
    try {
      await createPayout({
        data: {
          organizerId,
          amountKobo: parsed.kobo,
          adminNote: noteInput.trim() ? noteInput.trim() : undefined,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setAmountInput("");
      setNoteInput("");
      setNotice("Payout recorded as pending. Move it along once the transfer progresses.");
      await refresh();
    } catch (caught) {
      setFormError(friendlyAdminError(caught));
    } finally {
      setActing(false);
    }
  };

  const move = async (payout: AdminPayoutRow) => {
    if (!token || acting || !moveTo) return;
    setNotice(null);
    if (moveTo === "paid" && !moveDetail.trim()) {
      setFormError("Record the bank transfer reference before marking paid.");
      return;
    }
    if (moveTo === "failed" && !moveDetail.trim()) {
      setFormError("Record why the payout failed.");
      return;
    }
    setFormError(null);
    setActing(true);
    try {
      await transitionPayout({
        data: {
          payoutId: payout.id,
          toStatus: moveTo,
          reference: moveTo === "paid" ? moveDetail.trim() : undefined,
          adminNote: moveTo !== "paid" && moveDetail.trim() ? moveDetail.trim() : undefined,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setMoveFor(null);
      setMoveTo("");
      setMoveDetail("");
      setNotice(`Payout moved to ${moveTo.replace("_", " ")}.`);
      await refresh();
    } catch (caught) {
      setFormError(friendlyAdminError(caught));
    } finally {
      setActing(false);
    }
  };

  return (
    <section aria-label="Manual payouts" className="grid gap-md">
      <div>
        <h3 className="type-h3">Manual payouts</h3>
        <p className="type-body mt-xs text-muted-text">
          Record bank transfers you execute outside Outrazo, then move each record along: pending →
          approved → processing → paid. Only a confirmed transfer with its reference may become paid.
        </p>
      </div>

      {canMovePayouts ? (
        <div className="grid gap-md rounded-lg border border-line bg-card p-lg shadow-card">
          <h4 className="type-h3">Record a payout</h4>
          <div className="grid max-w-md gap-sm">
            <label className="grid gap-sm">
              <span className="type-caption text-muted-text">Organizer</span>
              <select
                value={organizerId}
                onChange={(event) => setOrganizerId(event.currentTarget.value)}
                className="type-body h-12 rounded-md border border-line bg-card px-md text-primary-text outline-none focus:border-accent"
              >
                <option value="">Choose an organizer</option>
                {balances.map((row) => (
                  <option key={row.organizerId} value={row.organizerId}>
                    {row.organizerName ?? "Unknown organizer"} · {formatKoboToNaira(row.availableKobo)} available
                  </option>
                ))}
              </select>
            </label>
            {selectedBalance ? (
              <p className="type-caption text-muted-text">
                Net {formatKoboToNaira(selectedBalance.netKobo)} · reserved{" "}
                {formatKoboToNaira(selectedBalance.reservedKobo)} · available{" "}
                {formatKoboToNaira(selectedBalance.availableKobo)}
              </p>
            ) : null}
            <Input
              label="Amount (NGN)"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              placeholder="50000"
              inputMode="decimal"
            />
            <Input
              label="Note (optional)"
              value={noteInput}
              onChange={(event) => setNoteInput(event.target.value)}
              placeholder="January batch, batch 3"
            />
            <div>
              <ConfirmAction
                label="Record payout"
                question={`Record ${amountInput.trim() || "?"} NGN as pending?`}
                disabled={acting || !organizerId || !amountInput.trim()}
                onConfirm={record}
              />
            </div>
          </div>
          {formError ? <p className="type-body text-transactional" role="alert">{formError}</p> : null}
          {notice ? <p className="type-body text-accent" role="status">{notice}</p> : null}
        </div>
      ) : null}

      {loading ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : error ? (
        <ErrorState title="We couldn't load payouts." description={error} onRetry={() => void refresh()} />
      ) : !payouts || payouts.length === 0 ? (
        <EmptyState title="No payouts recorded." description="Recorded manual transfers will appear here." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Organizer", "Amount", "Status", "Reference", "Updated", canMovePayouts ? "Move" : ""].map(
                    (column) => (
                      <th key={column || "move"} scope="col" className="type-caption px-md py-sm font-semibold tracking-wide text-muted-text uppercase">
                        {column}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.id} className="border-b border-line align-top last:border-0">
                    <td className="type-body px-md py-sm font-medium">
                      {payout.organizerName ?? "Unknown organizer"}
                      {payout.adminNote ? (
                        <span className="type-caption mt-xs block font-normal text-muted-text">{payout.adminNote}</span>
                      ) : null}
                      {payout.statusReason ? (
                        <span className="type-caption mt-xs block font-normal text-muted-text">{payout.statusReason}</span>
                      ) : null}
                    </td>
                    <td className="type-body px-md py-sm font-medium">{formatKoboToNaira(payout.amountKobo)}</td>
                    <td className="px-md py-sm">
                      <PayoutStatusBadge status={payout.status} />
                    </td>
                    <td className="type-caption px-md py-sm font-mono text-muted-text">
                      {payout.reference ?? "—"}
                    </td>
                    <td className="type-body px-md py-sm whitespace-nowrap text-muted-text">
                      {new Date(payout.paidAt ?? payout.updatedAt).toLocaleDateString()}
                    </td>
                    {canMovePayouts ? (
                      <td className="px-md py-sm">
                        {moveFor === payout.id ? (
                          <span className="inline-flex flex-wrap items-center gap-xs">
                            <select
                              value={moveTo}
                              onChange={(event) => setMoveTo(event.currentTarget.value as PayoutStatus | "")}
                              aria-label="Move payout to"
                              className="type-body h-11 rounded-md border border-line bg-card px-sm text-primary-text outline-none focus:border-accent"
                            >
                              <option value="">Move to…</option>
                              {(nextPayoutStatuses(payout.status as PayoutStatus) ?? []).map((next) => (
                                <option key={next} value={next}>{next.replace("_", " ")}</option>
                              ))}
                            </select>
                            {(moveTo === "paid" || moveTo === "failed" || moveTo === "on_hold") ? (
                              <input
                                value={moveDetail}
                                onChange={(event) => setMoveDetail(event.target.value)}
                                placeholder={moveTo === "paid" ? "Bank reference" : "Reason"}
                                aria-label={moveTo === "paid" ? "Bank transfer reference" : "Reason"}
                                className="type-body h-11 w-40 rounded-md border border-line bg-card px-sm text-primary-text outline-none placeholder:text-subtle-text focus:border-accent"
                              />
                            ) : null}
                            <Button
                              variant="outline"
                              size="sm"
                              loading={acting}
                              disabled={acting || !moveTo}
                              onClick={() => void move(payout)}
                            >
                              Apply
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => { setMoveFor(null); setMoveTo(""); setMoveDetail(""); }}>
                              Cancel
                            </Button>
                          </span>
                        ) : (nextPayoutStatuses(payout.status as PayoutStatus) ?? []).length > 0 ? (
                          <Button variant="outline" size="sm" onClick={() => { setMoveFor(payout.id); setMoveTo(""); setMoveDetail(""); }}>
                            Move
                          </Button>
                        ) : (
                          <span className="type-caption text-muted-text">Terminal</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-sm">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            >
              Previous
            </Button>
            <span className="type-body text-muted-text">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
