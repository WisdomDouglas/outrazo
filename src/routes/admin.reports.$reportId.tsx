import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { ConfirmAction } from "@/showcase/admin/ConfirmAction";
import {
  friendlyAdminError,
  useAccessToken,
  useMyAdminRole,
} from "@/showcase/admin/admin-client";
import {
  getAdminReport,
  resolveAdminReport,
  type AdminReportDetail,
} from "@/showcase/admin/admin-functions";
import { roleHasPermission } from "@/showcase/admin/permissions";
import {
  REPORT_NOTE_MAX,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  type ReportResolution,
} from "@/showcase/moderation/report-reasons";

export const Route = createFileRoute("/admin/reports/$reportId")({
  head: () => ({ meta: [
    { title: "Report details — Admin Console — Outrazo" },
    { name: "description", content: "Staff view of one moderation report with resolution actions." },
  ] }),
  component: AdminReportDetailPage,
});

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-xs border-b border-line py-sm last:border-0 sm:grid-cols-[160px_1fr]">
      <dt className="type-caption font-semibold text-muted-text">{label}</dt>
      <dd className="type-body">{children}</dd>
    </div>
  );
}

function AdminReportDetailPage() {
  const { reportId } = Route.useParams();
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const [report, setReport] = useState<AdminReportDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ReportResolution>("dismissed");
  const [unpublish, setUnpublish] = useState(false);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canManage = role !== null && roleHasPermission(role, "reports.manage");

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setMissing(false);
    try {
      const result = await getAdminReport({
        data: { id: reportId },
        headers: { Authorization: `Bearer ${token}` },
      });
      setReport(result.report);
    } catch (caught) {
      const friendly = friendlyAdminError(caught);
      if (/no longer exists/i.test(friendly)) {
        setMissing(true);
        setReport(null);
      } else {
        setError(friendly);
      }
    } finally {
      setLoading(false);
    }
  }, [token, reportId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runResolve = async () => {
    if (!token || !report) return;
    setActing(true);
    setMessage(null);
    setActionError(null);
    try {
      await resolveAdminReport({
        data: {
          id: reportId,
          resolution,
          unpublish,
          note: note.trim() ? note.trim() : undefined,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage(
        resolution === "dismissed"
          ? "Report dismissed. The event is unchanged."
          : unpublish
            ? "Report actioned and the event unpublished. RSVPs and ticket tiers are untouched."
            : "Report actioned. The event itself is unchanged.",
      );
      setUnpublish(false);
      setNote("");
      await refresh();
    } catch (caught) {
      setActionError(friendlyAdminError(caught));
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-md" aria-label="Loading report">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState title="We couldn't load this report." description={error} onRetry={() => void refresh()} />
    );
  }

  if (missing || !report) {
    return (
      <EmptyState
        title="Report not found."
        description="It may have been removed. Return to the list and try again."
        action={
          <Link to="/admin/reports" className="focus-ring rounded-full">
            <Button>Back to reports</Button>
          </Link>
        }
      />
    );
  }

  const isPending = report.status === "pending";

  return (
    <div className="grid gap-lg">
      <div>
        <Link
          to="/admin/reports"
          className="focus-ring type-body inline-flex min-h-11 items-center gap-xs rounded-full text-muted-text hover:text-primary-text"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back to reports
        </Link>
        <div className="mt-sm flex flex-wrap items-center gap-sm">
          <h2 className="type-h2">{REPORT_REASON_LABELS[report.reason]} report</h2>
          <Badge variant={isPending ? "transactional" : report.status === "actioned" ? "accent" : "neutral"}>
            {REPORT_STATUS_LABELS[report.status]}
          </Badge>
        </div>
        <p className="type-body mt-xs text-muted-text">
          Filed {new Date(report.createdAt).toLocaleString()}
        </p>
      </div>

      {message ? (
        <p className="type-body rounded-lg border border-line bg-card px-md py-sm" role="status">
          {message}
        </p>
      ) : null}
      {actionError ? (
        <p className="type-body rounded-lg border border-line bg-card px-md py-sm" role="alert">
          {actionError}
        </p>
      ) : null}

      <dl className="rounded-lg border border-line bg-card px-md shadow-card">
        <DetailRow label="Event">
          {report.event ? (
            <span className="inline-flex flex-wrap items-center gap-xs">
              <Link
                to="/admin/events/$eventId"
                params={{ eventId: report.event.id }}
                className="focus-ring rounded-sm font-medium underline decoration-accent/50 underline-offset-2 hover:text-accent"
              >
                {report.event.title}
              </Link>
              <Badge variant={report.event.published ? "accent" : "neutral"}>
                {report.event.published ? "Published" : "Draft"}
              </Badge>
            </span>
          ) : (
            <span className="text-muted-text">The event is unavailable.</span>
          )}
        </DetailRow>
        <DetailRow label="Reporter">
          {report.reporter.id === null ? (
            <span className="text-muted-text">Deleted user (report preserved).</span>
          ) : (
            <>
              <Link
                to="/admin/users/$userId"
                params={{ userId: report.reporter.id }}
                className="focus-ring rounded-sm font-medium underline decoration-accent/50 underline-offset-2 hover:text-accent"
              >
                {report.reporter.name ?? report.reporter.email ?? "Unknown user"}
              </Link>
              {report.reporter.name && report.reporter.email ? (
                <span className="text-muted-text"> · {report.reporter.email}</span>
              ) : null}
            </>
          )}
        </DetailRow>
        <DetailRow label="Details">{report.details ?? <span className="text-muted-text">No details provided.</span>}</DetailRow>
        {isPending ? null : (
          <>
            <DetailRow label="Resolved">
              {report.resolvedAt ? new Date(report.resolvedAt).toLocaleString() : "—"}
              {report.resolvedBy ? (
                <span className="text-muted-text"> by {report.resolvedBy.name ?? "staff"}</span>
              ) : null}
            </DetailRow>
            <DetailRow label="Resolution note">
              {report.resolutionNote ?? <span className="text-muted-text">No note recorded.</span>}
            </DetailRow>
          </>
        )}
      </dl>

      {isPending ? (
        <section aria-label="Resolve report" className="grid gap-md rounded-lg border border-line bg-card p-lg shadow-card">
          <div>
            <h3 className="type-h3">Resolve this report</h3>
            <p className="type-body mt-xs text-muted-text">
              Dismissing closes the report with no event change. Acting on it records staff
              action and can also unpublish the event. Either way the decision is audited.
            </p>
          </div>
          {canManage ? (
            <div className="grid gap-md">
              <fieldset>
                <legend className="type-body font-semibold">Decision</legend>
                <div className="mt-sm grid gap-xs sm:grid-cols-2">
                  <label className="focus-ring flex cursor-pointer items-center gap-sm rounded-md border border-line px-md py-sm has-checked:border-accent has-checked:bg-accent/8">
                    <input
                      type="radio"
                      name="resolution"
                      value="dismissed"
                      checked={resolution === "dismissed"}
                      onChange={() => {
                        setResolution("dismissed");
                        setUnpublish(false);
                      }}
                      className="accent-(--color-accent)"
                    />
                    <span className="type-body font-medium">Dismiss (no violation)</span>
                  </label>
                  <label className="focus-ring flex cursor-pointer items-center gap-sm rounded-md border border-line px-md py-sm has-checked:border-accent has-checked:bg-accent/8">
                    <input
                      type="radio"
                      name="resolution"
                      value="actioned"
                      checked={resolution === "actioned"}
                      onChange={() => setResolution("actioned")}
                      className="accent-(--color-accent)"
                    />
                    <span className="type-body font-medium">Mark actioned</span>
                  </label>
                </div>
              </fieldset>

              <label className="focus-ring flex cursor-pointer items-start gap-sm rounded-md border border-line px-md py-sm">
                <input
                  type="checkbox"
                  checked={unpublish}
                  onChange={(event) => setUnpublish(event.target.checked)}
                  disabled={!report.event?.published || resolution === "dismissed"}
                  className="mt-xs accent-(--color-accent)"
                />
                <span>
                  <span className="type-body font-medium">Also unpublish the event</span>
                  <span className="type-body mt-xs block text-muted-text">
                    {resolution === "dismissed"
                      ? "Unavailable: dismissed reports never unpublish. Choose Mark actioned to unpublish."
                      : report.event?.published
                        ? "Hides the event from discovery immediately. RSVPs and ticket tiers stay intact."
                        : "Unavailable: the event is already a draft."}
                  </span>
                </span>
              </label>

              <label className="grid gap-xs" htmlFor="resolution-note">
                <span className="type-body font-semibold">
                  Resolution note <span className="font-normal text-muted-text">(optional)</span>
                </span>
                <textarea
                  id="resolution-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, REPORT_NOTE_MAX))}
                  rows={2}
                  maxLength={REPORT_NOTE_MAX}
                  placeholder="Why this decision was made…"
                  className="type-body focus-ring min-h-16 rounded-md border border-line bg-canvas px-md py-sm"
                />
                <span className="type-caption text-muted-text" role="status">
                  {note.length}/{REPORT_NOTE_MAX}
                </span>
              </label>

              <div>
                <ConfirmAction
                  label={resolution === "dismissed" ? "Dismiss report" : "Resolve as actioned"}
                  question="Apply this resolution?"
                  disabled={acting}
                  onConfirm={runResolve}
                />
              </div>
            </div>
          ) : (
            <p className="type-body text-muted-text">
              You can view reports, but resolving them requires the reports.manage permission.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
