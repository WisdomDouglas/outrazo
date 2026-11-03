// Scout review queue: pending-first discovery list with search and
// filters. Rejected and dismissed rows stay visible with their reasons.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { SearchField } from "@/design-system/components/SearchField";
import { Skeleton } from "@/design-system/components/Skeleton";
import { friendlyAdminError, useAccessToken } from "@/showcase/admin/admin-client";
import { listScoutDiscoveries } from "@/showcase/scout/scout-functions";

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

function statusBadge(status: string) {
  if (status === "pending") return <Badge variant="transactional">Pending</Badge>;
  if (status === "approved") return <Badge variant="accent">Approved</Badge>;
  if (status === "dismissed") return <Badge variant="neutral">Dismissed</Badge>;
  return <Badge variant="outline">Auto-rejected</Badge>;
}

function ScoutQueuePage() {
  const token = useAccessToken();
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState<QueueFilters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listScoutDiscoveries>>["discoveries"] | null>(null);
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
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token, filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
          <ol className="grid gap-sm">
            {rows.map((row) => (
              <li key={row.id} className="grid gap-xs rounded-lg border border-line bg-card p-md">
                <div className="flex flex-wrap items-center gap-sm">
                  {statusBadge(row.status)}
                  {row.match_confidence ? (
                    <Badge variant="outline">Possible duplicate ({row.match_confidence})</Badge>
                  ) : null}
                  <span className="type-body font-semibold">{row.title ?? "(untitled)"}</span>
                </div>
                <p className="type-body text-muted-text">
                  {[row.city, row.state_code].filter(Boolean).join(", ") || "Location unknown"}
                  {row.starts_at ? ` · ${new Date(row.starts_at).toLocaleDateString()}` : " · Date unknown"}
                  {` · ${row.source_domain}`}
                </p>
                {row.auto_reject_reason ? (
                  <p className="type-caption text-muted-text">Rejected: {row.auto_reject_reason}</p>
                ) : null}
                {row.dismissal_reason ? (
                  <p className="type-caption text-muted-text">Dismissed: {row.dismissal_reason.replaceAll("_", " ")}</p>
                ) : null}
                <div>
                  <Link
                    to="/admin/scout/discoveries/$discoveryId"
                    params={{ discoveryId: row.id }}
                    className="focus-ring type-body font-semibold text-accent underline-offset-4 hover:underline"
                  >
                    Open review
                  </Link>
                </div>
              </li>
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
