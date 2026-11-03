// Scout run detail: live progress, step evidence, 37-state coverage grid,
// budget usage, and run controls (advance, resume, cancel).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import {
  friendlyAdminError,
  useAccessToken,
  useMyAdminRole,
} from "@/showcase/admin/admin-client";
import { roleHasPermission } from "@/showcase/admin/permissions";
import {
  advanceScoutExtract,
  advanceScoutRun,
  cancelScoutRun,
  getScoutRun,
  listScoutDiscoveries,
  resumeScoutRun,
  retryScoutStep,
  type ScoutRunDetail,
} from "@/showcase/scout/scout-functions";

export const Route = createFileRoute("/admin/scout/$runId")({
  head: () => ({ meta: [
    { title: "Scout run — Admin Console — Outrazo" },
    { name: "description", content: "Discovery run progress, evidence, and coverage." },
  ] }),
  component: ScoutRunPage,
});

const ACTIVE = new Set(["searching", "extracting"]);

type SourceRow = Awaited<ReturnType<typeof listScoutDiscoveries>>["discoveries"][number];

function sourceStatusBadge(status: string) {
  if (status === "pending") return <Badge variant="transactional">Pending</Badge>;
  if (status === "approved") return <Badge variant="accent">Approved</Badge>;
  if (status === "dismissed") return <Badge variant="neutral">Dismissed</Badge>;
  return <Badge variant="outline">Auto-rejected</Badge>;
}

function CoverageGrid({ coverage }: { coverage: ScoutRunDetail["coverage"] }) {
  return (
    <ol className="grid grid-cols-2 gap-xs sm:grid-cols-4 lg:grid-cols-6" aria-label="State coverage">
      {coverage.map((row) => (
        <li
          key={row.state_name}
          className="rounded border border-line bg-canvas px-xs py-xs"
          title={`${row.state_name}: ${row.status.replace("_", " ")}`}
        >
          <p className="type-caption truncate font-semibold">{row.state_name}</p>
          <p className="type-caption text-muted-text">
            {row.status === "targeted" ? "Targeted"
              : row.status === "zone_only" ? "Zone sweep"
              : row.status === "nationwide_only" ? "Sweep hit"
              : "Unsearched"}
          </p>
        </li>
      ))}
    </ol>
  );
}

function ScoutRunPage() {
  const { runId } = Route.useParams();
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const [detail, setDetail] = useState<ScoutRunDetail | null>(null);
  const [sources, setSources] = useState<SourceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const advancing = useRef(false);
  const settled = useRef(false);
  const canManage = role !== null && roleHasPermission(role, "scout.manage");

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return null;
    }
    try {
      const result = await getScoutRun({
        data: { runId },
        headers: { Authorization: `Bearer ${token}` },
      });
      setDetail(result);
      try {
        const sourcesResult = await listScoutDiscoveries({
          data: { runId, q: "", city: "", state: "", status: "all", limit: 50, offset: 0 },
          headers: { Authorization: `Bearer ${token}` },
        });
        setSources(sourcesResult.discoveries);
      } catch {
        setSources(null);
      }
      setError(null);
      return result;
    } catch (caught) {
      setError(friendlyAdminError(caught));
      return null;
    } finally {
      setLoading(false);
    }
  }, [token, runId]);

  // Advance loop: one unit of work per tick (one search, then one
  // extraction), guarded against overlap. Stops on terminal states.
  useEffect(() => {
    if (!token || !canManage) return;
    let cancelled = false;
    const tick = async () => {
      if (advancing.current || cancelled) return;
      advancing.current = true;
      try {
        const current = await getScoutRun({
          data: { runId },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        setDetail(current);
        if (!ACTIVE.has(current.run.status)) settled.current = true;
        if (current.run.status === "searching") {
          const next = await advanceScoutRun({
            data: { runId },
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!cancelled && (next.status === "searching" || next.status === "extracting")) {
            await refresh();
          } else {
            await refresh();
          }
        } else if (current.run.status === "extracting") {
          await advanceScoutExtract({
            data: { runId },
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!cancelled) await refresh();
        } else {
          await refresh();
        }
      } catch {
        if (!cancelled) await refresh();
      } finally {
        advancing.current = false;
      }
    };
    void tick();
    const timer = setInterval(() => {
      if (!advancing.current && !cancelled && !settled.current) void tick();
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canManage, runId]);

  const act = async (action: () => Promise<unknown>) => {
    if (!token) return;
    setWorking(true);
    setError(null);
    settled.current = false;
    try {
      await action();
      await refresh();
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setWorking(false);
    }
  };

  if (loading && detail === null) {
    return (
      <div className="grid gap-md" aria-label="Loading run">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }
  if (error && detail === null) {
    return <ErrorState title="We couldn't load this run." description={error} onRetry={() => void refresh()} />;
  }
  if (!detail) return null;
  const { run, steps, coverage, counts } = detail;
  const estimatedCents = Math.round((run.tool_calls_made * 2.5) / 10);

  return (
    <div className="grid gap-lg">
      <div>
        <Link to="/admin/scout" className="focus-ring type-body font-semibold text-accent underline-offset-4 hover:underline">
          ← All runs
        </Link>
        <h2 className="type-h2 mt-sm capitalize">{run.scope.mode} run</h2>
        <div className="mt-sm flex flex-wrap items-center gap-sm">
          <Badge variant={run.status === "done" ? "accent" : run.status === "failed" || run.status === "budget_stopped" ? "transactional" : "neutral"}>
            {run.status.replace("_", " ")}
          </Badge>
          <span className="type-caption text-muted-text">
            Started {run.started_at ? new Date(run.started_at).toLocaleString() : "—"}
          </span>
        </div>
        {run.error ? <p className="type-body mt-sm text-transactional">{run.error}</p> : null}
        {error ? <p className="type-body mt-sm text-transactional">{error}</p> : null}
      </div>

      {canManage && !["done", "failed", "cancelled"].includes(run.status) ? (
        <div className="flex flex-wrap gap-sm">
          {["paused", "failed", "budget_stopped"].includes(run.status) ? (
            <Button type="button" variant="primary" disabled={working} onClick={() => void act(async () => { if (token) await resumeScoutRun({ data: { runId }, headers: { Authorization: `Bearer ${token}` } }); })}>
              {working ? "Working…" : "Resume run"}
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={working} onClick={() => void act(async () => { if (token) await cancelScoutRun({ data: { runId }, headers: { Authorization: `Bearer ${token}` } }); })}>
            Cancel run
          </Button>
        </div>
      ) : null}

      <section aria-label="Budget and usage" className="grid gap-sm rounded-lg border border-line bg-card p-lg">
        <h3 className="type-h3">Budget and usage</h3>
        <dl className="grid gap-xs sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="type-caption text-muted-text">Search calls</dt><dd className="type-body font-semibold">{run.tool_calls_made}/{run.max_tool_calls}</dd></div>
          <div><dt className="type-caption text-muted-text">Sources fetched</dt><dd className="type-body font-semibold">{run.sources_fetched}</dd></div>
          <div><dt className="type-caption text-muted-text">Discoveries</dt><dd className="type-body font-semibold">{run.discoveries_created}</dd></div>
          <div><dt className="type-caption text-muted-text">Queue</dt><dd className="type-body font-semibold">{counts.pending} pending · {counts.approved} approved</dd></div>
        </dl>
        <p className="type-body">
          Estimated search fees ≈ ${(estimatedCents / 100).toFixed(2)}{" "}
          <span className="type-caption text-muted-text">(unverified estimate)</span>
        </p>
        <p className="type-body">
          Metered tokens: {run.input_tokens.toLocaleString()} in / {run.output_tokens.toLocaleString()} out
        </p>
      </section>

      <section aria-label="Search steps" className="grid gap-sm">
        <h3 className="type-h3">Search steps</h3>
        {steps.length === 0 ? (
          <EmptyState title="No steps planned." description="This run has no search steps." />
        ) : (
          <ol className="grid gap-sm">
            {steps.map((step) => (
              <li key={step.id} className="grid gap-xs rounded-lg border border-line bg-card p-md">
                <div className="flex flex-wrap items-center gap-sm">
                  <Badge variant="outline">Tier {step.tier}</Badge>
                  <Badge variant={step.status === "done" ? "accent" : step.status === "failed" ? "transactional" : "neutral"}>
                    {step.status.replace("_", " ")}
                  </Badge>
                  <span className="type-body font-semibold">{step.label}</span>
                </div>
                <p className="type-body text-muted-text">{step.query}</p>
                <p className="type-caption text-muted-text">
                  {step.tool_calls} calls · {step.results.length} results · {step.citations.length} citations
                  {step.error ? ` · ${step.error}` : ""}
                </p>
                {canManage && step.status === "failed" && ["paused", "failed", "budget_stopped"].includes(run.status) ? (
                  <div>
                    <Button type="button" variant="outline" disabled={working} onClick={() => void act(async () => { if (token) await retryScoutStep({ data: { runId, stepIndex: step.step_index }, headers: { Authorization: `Bearer ${token}` } }); })}>
                      Retry this step
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Sources" className="grid gap-sm">
        <h3 className="type-h3">Sources</h3>
        <p className="type-body text-muted-text">
          {run.sources_fetched === 0
            ? "No sources processed yet. They appear here live as extraction works through the search results."
            : `${counts.pending} in review · ${counts.autoRejected} rejected · ${run.sources_fetched} processed`}
        </p>
        {sources === null ? (
          <p className="type-body text-muted-text">Could not load sources.</p>
        ) : sources.length === 0 ? (
          <EmptyState title="No sources yet." description="Processed sources will show here with their verdicts." />
        ) : (
          <>
            <ol className="grid gap-sm">
              {sources.map((row) => (
                <li key={row.id} className="grid gap-xs rounded-lg border border-line bg-card p-md">
                  <div className="flex flex-wrap items-center gap-sm">
                    {sourceStatusBadge(row.status)}
                    <span className="type-body font-semibold">{row.title ?? row.source_domain}</span>
                  </div>
                  <p className="type-body text-muted-text">
                    {[row.city, row.state_code].filter(Boolean).join(", ") || "Location unknown"}
                    {row.starts_at ? ` · ${new Date(row.starts_at).toLocaleDateString()}` : ""}
                    {` · ${row.source_domain}`}
                  </p>
                  {row.auto_reject_reason ? (
                    <p className="type-caption text-muted-text">Rejected: {row.auto_reject_reason}</p>
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
            {run.sources_fetched > sources.length ? (
              <p className="type-caption text-muted-text">
                Showing the latest {sources.length} of {run.sources_fetched} processed sources.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section aria-label="Coverage" className="grid gap-sm">
        <h3 className="type-h3">Coverage — 36 states + FCT</h3>
        <p className="type-body text-muted-text">
          “Targeted” means an explicit state search. Zone sweeps and nationwide hits are
          marked separately and never counted as targeted coverage.
        </p>
        <CoverageGrid coverage={coverage} />
      </section>
    </div>
  );
}
