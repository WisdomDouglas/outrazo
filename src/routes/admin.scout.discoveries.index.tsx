// Scout review queue: pending-first discovery list with search and
// filters. Rejected and dismissed rows stay visible with their reasons.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { SearchField } from "@/design-system/components/SearchField";
import { Skeleton } from "@/design-system/components/Skeleton";
import { friendlyAdminError, useAccessToken, useMyAdminRole } from "@/showcase/admin/admin-client";
import { roleHasPermission } from "@/showcase/admin/permissions";
import { bulkDismissScoutDiscoveries, listScoutDiscoveries } from "@/showcase/scout/scout-functions";
import { ScoutDiscoveryCard } from "@/showcase/scout/scout-ui";

export const Route = createFileRoute("/admin/scout/discoveries/")({
  head: () => ({ meta: [
    { title: "Scout queue — Admin Console — Outrazo" },
    { name: "description", content: "Human review queue for discovered events." },
  ] }),
  component: ScoutQueuePage,
});

const PAGE_SIZE = 20;

type StatusFilter = "pending" | "approved" | "dismissed" | "auto_rejected" | "all";

interface QueueFilters {
  q: string;
  city: string;
  state: string;
  status: StatusFilter;
  offset: number;
}

const EMPTY_FILTERS: QueueFilters = { q: "", city: "", state: "", status: "pending", offset: 0 };

function ScoutQueuePage() {
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState<QueueFilters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listScoutDiscoveries>>["discoveries"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState("duplicate");
  const [bulkBusy, setBulkBusy] = useState(false);
  const canManage = role !== null && roleHasPermission(role, "scout.manage");

  const toggleSelected = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listScoutDiscoveries({
        data: {
          runId: null,
          q: filters.q,
          city: filters.city,
          state: filters.state,
          status: filters.status,
          limit: PAGE_SIZE,
          offset: filters.offset,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setRows(result.discoveries);
      setSelected([]);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token, filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const bulkDismiss = async () => {
    if (!token || selected.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      await bulkDismissScoutDiscoveries({
        data: { discoveryIds: selected.slice(0, 20), reason: bulkReason as "duplicate" },
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelected([]);
      await refresh();
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setBulkBusy(false);
    }
  };

  const page = Math.floor(filters.offset / PAGE_SIZE) + 1;
  const hasMore = (rows?.length ?? 0) >= PAGE_SIZE;

  return (
    <div className="grid gap-lg">
      <div>
        <Link to="/admin/scout" className="focus-ring type-body font-semibold text-accent underline-offset-4 hover:underline">
          ← Scout dashboard
        </Link>
        <h2 className="type-h2 mt-sm">Review queue</h2>
        <p className="type-body mt-xs text-muted-text">
          Every discovery waits for a human. Nothing here is published, and nothing is deleted —
          rejections keep their reasons.
        </p>
      </div>

      <form
        className="grid gap-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters((current) => ({ ...current, q: draft.trim(), offset: 0 }));
        }}
      >
        <div className="grid gap-sm sm:grid-cols-[1fr_auto]">
          <SearchField
            label="Search discoveries"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onClear={() => {
              setDraft("");
              setFilters((current) => ({ ...current, q: "", offset: 0 }));
            }}
            placeholder="Title or venue…"
          />
          <Button type="submit" variant="outline">Search</Button>
        </div>
        <div className="grid gap-sm sm:grid-cols-3">
          <label className="grid gap-xs">
            <span className="type-body font-semibold">City</span>
            <input
              value={filters.city}
              onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value, offset: 0 }))}
              placeholder="Any city"
              className="focus-ring type-body rounded-lg border border-line-strong bg-canvas px-sm py-xs"
            />
          </label>
          <label className="grid gap-xs">
            <span className="type-body font-semibold">State</span>
            <input
              value={filters.state}
              onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value, offset: 0 }))}
              placeholder="Any state"
              className="focus-ring type-body rounded-lg border border-line-strong bg-canvas px-sm py-xs"
            />
          </label>
          <label className="grid gap-xs">
            <span className="type-body font-semibold">Status</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as StatusFilter, offset: 0 }))}
              className="focus-ring type-body rounded-lg border border-line-strong bg-canvas px-sm py-xs"
            >
              <option value="pending">Pending review</option>
              <option value="approved">Approved</option>
              <option value="dismissed">Dismissed</option>
              <option value="auto_rejected">Auto-rejected</option>
              <option value="all">All statuses</option>
            </select>
          </label>
        </div>
      </form>

      {loading && rows === null ? (
        <div className="grid gap-sm" aria-label="Loading queue">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      ) : error ? (
        <ErrorState title="We couldn't load the queue." description={error} onRetry={() => void refresh()} />
      ) : rows && rows.length > 0 ? (
        <>
          <p className="type-body text-muted-text" aria-live="polite">
            Showing {rows.length} result{rows.length === 1 ? "" : "s"} · Page {page}
          </p>
          {canManage && selected.length > 0 ? (
            <div className="flex flex-wrap items-end gap-sm rounded-lg border border-dashed border-line p-sm">
              <p className="type-body font-semibold">{selected.length} selected</p>
              <div className="grid gap-xs">
                <label htmlFor="bulk-reason" className="type-caption font-semibold text-muted-text">
                  Dismiss reason
                </label>
                <select
                  id="bulk-reason"
                  value={bulkReason}
                  onChange={(event) => setBulkReason(event.target.value)}
                  className="focus-ring type-body rounded-lg border border-line-strong bg-canvas px-sm py-xs"
                >
                  {["duplicate", "expired", "not_an_event", "insufficient_evidence", "out_of_scope", "other"].map((reason) => (
                    <option key={reason} value={reason}>{reason.replaceAll("_", " ")}</option>
                  ))}
                </select>
              </div>
              <Button type="button" variant="outline" size="sm" loading={bulkBusy} onClick={() => void bulkDismiss()}>
                Dismiss selected
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={bulkBusy} onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>
          ) : null}
          <ol className="grid gap-sm">
            {rows.map((row) => (
              <ScoutDiscoveryCard
                key={row.id}
                row={row}
                selectable={
                  canManage && row.status === "pending"
                    ? { checked: selected.includes(row.id), onChange: () => toggleSelected(row.id), label: `Select ${row.title ?? row.source_domain}` }
                    : undefined
                }
              />
            ))}
          </ol>
          <div className="flex items-center gap-sm">
            <Button
              type="button"
              variant="outline"
              disabled={filters.offset === 0 || loading}
              onClick={() => setFilters((current) => ({ ...current, offset: Math.max(0, current.offset - PAGE_SIZE) }))}
            >
              Previous
            </Button>
            <span className="type-body text-muted-text">Page {page}</span>
            <Button
              type="button"
              variant="outline"
              disabled={!hasMore || loading}
              onClick={() => setFilters((current) => ({ ...current, offset: current.offset + PAGE_SIZE }))}
            >
              Next
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          title="Queue is clear."
          description="No discoveries match these filters. Pending items appear here as runs finish extracting."
        />
      )}
    </div>
  );
}
