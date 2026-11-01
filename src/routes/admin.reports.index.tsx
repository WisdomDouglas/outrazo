import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { SearchField } from "@/design-system/components/SearchField";
import { Skeleton } from "@/design-system/components/Skeleton";
import { friendlyAdminError, useAccessToken } from "@/showcase/admin/admin-client";
import { listAdminReports, type AdminReportRow } from "@/showcase/admin/admin-functions";
import {
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  REPORT_STATUS_LABELS,
  type ReportReason,
} from "@/showcase/moderation/report-reasons";

export const Route = createFileRoute("/admin/reports/")({
  head: () => ({ meta: [
    { title: "Reports — Admin Console — Outrazo" },
    { name: "description", content: "Staff queue of user-filed event moderation reports." },
  ] }),
  component: AdminReportsPage,
});

const PAGE_SIZE = 20;

type StatusFilter = "pending" | "dismissed" | "actioned" | "all";

interface ReportFilters {
  q: string;
  status: StatusFilter;
  reason: ReportReason | "";
  offset: number;
}

const EMPTY_FILTERS: ReportFilters = { q: "", status: "pending", reason: "", offset: 0 };

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "pending", label: "Pending review" },
  { value: "dismissed", label: "Dismissed" },
  { value: "actioned", label: "Actioned" },
  { value: "all", label: "All statuses" },
];

function statusBadge(status: AdminReportRow["status"]) {
  if (status === "pending") return <Badge variant="transactional">{REPORT_STATUS_LABELS[status]}</Badge>;
  if (status === "actioned") return <Badge variant="accent">{REPORT_STATUS_LABELS[status]}</Badge>;
  return <Badge variant="neutral">{REPORT_STATUS_LABELS[status]}</Badge>;
}

function AdminReportsPage() {
  const token = useAccessToken();
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [reports, setReports] = useState<AdminReportRow[] | null>(null);
  const [total, setTotal] = useState(0);
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
      const result = await listAdminReports({
        data: {
          limit: PAGE_SIZE,
          offset: filters.offset,
          q: filters.q || undefined,
          status: filters.status,
          reason: filters.reason || undefined,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setReports(result.reports);
      setTotal(result.total);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token, filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: draft.trim(), offset: 0 }));
  };

  const clearSearch = () => {
    setDraft("");
    setFilters((current) => ({ ...current, q: "", offset: 0 }));
  };

  const clearFilters = () => {
    setDraft("");
    setFilters(EMPTY_FILTERS);
  };

  const page = Math.floor(filters.offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : filters.offset + 1;
  const to = Math.min(filters.offset + PAGE_SIZE, total);
  const hasFilters = filters.q !== "" || filters.status !== "pending" || filters.reason !== "";

  return (
    <div className="grid gap-md">
      <div>
        <h2 className="type-h2">Reports</h2>
        <p className="type-body mt-xs text-muted-text">
          User-filed flags against events, newest first. Reports are advisory-only: nothing
          changes until staff resolve them.
        </p>
      </div>

      <form onSubmit={submitSearch} className="grid gap-md" role="search">
        <SearchField
          label="Search reports by event title"
          placeholder="Search by event title…"
          value={draft}
          loading={loading && reports !== null}
          onChange={(event) => setDraft(event.target.value)}
          onClear={clearSearch}
        />
        <div className="grid gap-md sm:grid-cols-2">
          <label className="type-caption grid gap-xs font-semibold text-muted-text">
            Status
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as StatusFilter,
                  offset: 0,
                }))
              }
              className="type-body focus-ring rounded-md border border-line bg-card px-md py-sm font-normal"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="type-caption grid gap-xs font-semibold text-muted-text">
            Reason
            <select
              value={filters.reason}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  reason: event.target.value as ReportReason | "",
                  offset: 0,
                }))
              }
              className="type-body focus-ring rounded-md border border-line bg-card px-md py-sm font-normal"
            >
              <option value="">All reasons</option>
              {REPORT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {REPORT_REASON_LABELS[reason]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>

      {loading && reports === null ? (
        <div className="grid gap-md" aria-label="Loading reports">
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : error ? (
        <ErrorState title="We couldn't load reports." description={error} onRetry={() => void refresh()} />
      ) : !reports || reports.length === 0 ? (
        <EmptyState
          icon={<Inbox aria-hidden className="size-5" />}
          title={hasFilters ? "No reports match these filters." : "The queue is clear."}
          description={
            hasFilters
              ? "Try a different search term or clear the filters."
              : filters.status === "pending"
                ? "No pending reports. New user flags will appear here."
                : "No reports with this status yet."
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Reason", "Event", "Reporter", "Status", "Filed"].map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="type-caption px-md py-sm font-semibold tracking-wide text-muted-text uppercase"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b border-line last:border-0">
                    <td className="type-body px-md py-sm font-medium">
                      <Link
                        to="/admin/reports/$reportId"
                        params={{ reportId: report.id }}
                        className="focus-ring rounded-sm underline decoration-accent/50 underline-offset-2 hover:text-accent"
                      >
                        {REPORT_REASON_LABELS[report.reason]}
                      </Link>
                    </td>
                    <td className="type-body px-md py-sm text-muted-text">
                      <Link
                        to="/admin/events/$eventId"
                        params={{ eventId: report.eventId }}
                        className="focus-ring rounded-sm underline decoration-accent/50 underline-offset-2 hover:text-accent"
                      >
                        {report.eventTitle}
                      </Link>
                      {!report.eventPublished ? (
                        <span className="type-caption ml-xs text-muted-text">(draft)</span>
                      ) : null}
                    </td>
                    <td className="type-body px-md py-sm text-muted-text">
                      {report.reporterId === null
                        ? "Deleted user"
                        : (report.reporterName ?? report.reporterEmail ?? "Unknown")}
                    </td>
                    <td className="px-md py-sm">{statusBadge(report.status)}</td>
                    <td className="type-body px-md py-sm whitespace-nowrap text-muted-text">
                      {new Date(report.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <p className="type-body text-muted-text" role="status">
              Showing {from}–{to} of {total} · Page {page} of {pageCount}
            </p>
            <div className="flex gap-xs">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.offset === 0 || loading}
                onClick={() =>
                  setFilters((current) => ({ ...current, offset: current.offset - PAGE_SIZE }))
                }
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.offset + PAGE_SIZE >= total || loading}
                onClick={() =>
                  setFilters((current) => ({ ...current, offset: current.offset + PAGE_SIZE }))
                }
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
