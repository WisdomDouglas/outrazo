// Shared Scout UI atoms: status badges, progress bars, and the discovery
// card used by the run page and the review queue. Presentation only — no
// data fetching, no state, no behavior changes.
import { Link } from "@tanstack/react-router";

import { Badge } from "@/design-system/components/Badge";

export function ScoutRunStatusBadge({ status }: { status: string }) {
  if (status === "done") return <Badge variant="accent">Done</Badge>;
  if (status === "failed") return <Badge variant="transactional">Failed</Badge>;
  if (status === "budget_stopped") return <Badge variant="transactional">Budget stopped</Badge>;
  if (status === "paused") return <Badge variant="neutral">Paused</Badge>;
  if (status === "cancelled") return <Badge variant="neutral">Cancelled</Badge>;
  if (status === "draft") return <Badge variant="outline">Draft</Badge>;
  return <Badge variant="outline">Running</Badge>;
}

export function ScoutDiscoveryStatusBadge({ status }: { status: string }) {
  if (status === "pending") return <Badge variant="transactional">Pending</Badge>;
  if (status === "approved") return <Badge variant="accent">Approved</Badge>;
  if (status === "dismissed") return <Badge variant="neutral">Dismissed</Badge>;
  return <Badge variant="outline">Auto-rejected</Badge>;
}

export function ScoutProgress({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  return (
    <div className="grid gap-xs">
      <div className="flex items-baseline justify-between gap-sm">
        <span className="type-caption font-semibold text-muted-text">{label}</span>
        <span className="type-caption font-semibold whitespace-nowrap">
          {value} / {max}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-2 overflow-hidden rounded-full bg-primary-text/10"
      >
        <div
          className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export interface ScoutDiscoveryCardRow {
  id: string;
  title: string | null;
  city: string | null;
  state_code: string | null;
  starts_at: string | null;
  source_domain: string;
  status: string;
  auto_reject_reason: string | null;
  dismissal_reason: string | null;
  match_confidence: string | null;
}

export function ScoutDiscoveryCard({
  row,
  selectable,
}: {
  row: ScoutDiscoveryCardRow;
  selectable?: { checked: boolean; onChange: () => void; label: string };
}) {
  return (
    <li className="grid gap-xs rounded-lg border border-line bg-card p-md">
      <div className="flex flex-wrap items-center gap-sm">
        {selectable ? (
          <input
            type="checkbox"
            checked={selectable.checked}
            onChange={selectable.onChange}
            aria-label={selectable.label}
            className="accent-accent"
          />
        ) : null}
        <ScoutDiscoveryStatusBadge status={row.status} />
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
  );
}
