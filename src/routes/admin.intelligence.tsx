import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { Button } from "@/design-system/components/Button";
import {
  friendlyAdminError,
  useAccessToken,
  useMyAdminRole,
} from "@/showcase/admin/admin-client";
import { CATEGORIES } from "@/showcase/discovery/categories";
import {
  DistributionBars,
  TREND_COLORS,
  TrendMini,
} from "@/showcase/admin/intelligence-charts";
import { EventPerformanceSection } from "@/showcase/admin/intelligence-events";
import { AssistantSection } from "@/showcase/admin/intelligence-assistant-panel";
import {
  RecommendationsSection,
  WatchlistSection,
} from "@/showcase/admin/intelligence-watchlist";
import {
  generateCategoryObservations,
  generatePlatformBrief,
  getIntelligenceDistribution,
  getIntelligenceSnapshot,
  getIntelligenceTrends,
  type CategoryObservationsResult,
  type IntelligenceDistribution,
  type IntelligenceSnapshot,
  type IntelligenceTrends,
  type PlatformBriefResult,
} from "@/showcase/admin/intelligence-functions";
import {
  canSeeMetric,
  type DashboardMetric,
} from "@/showcase/admin/permissions";

export const Route = createFileRoute("/admin/intelligence")({
  head: () => ({ meta: [
    { title: "Event Intelligence — Admin Console — Outrazo" },
    { name: "description", content: "Platform activity aggregates and AI event intelligence." },
  ] }),
  component: AdminIntelligencePage,
});

const WINDOW_OPTIONS = [7, 30, 90] as const;



function seriesNew(points: Array<{ count: number }>): number {
  return points.reduce((sum, point) => sum + point.count, 0);
}

function MetricCard({
  label,
  value,
  detail,
  visible,
}: {
  label: string;
  value: string;
  detail: string;
  visible: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-card p-lg shadow-card">
      <p className="type-caption font-semibold tracking-wide text-muted-text uppercase">{label}</p>
      {visible ? (
        <>
          <p className="type-h2 mt-xs">{value}</p>
          <p className="type-body mt-xs text-muted-text">{detail}</p>
        </>
      ) : (
        <p className="type-body mt-xs text-muted-text">Unavailable for your role.</p>
      )}
    </div>
  );
}

function categoryLabel(id: string): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

function BriefSection({ token, windowDays }: { token: string | null; windowDays: number }) {
  const [brief, setBrief] = useState<PlatformBriefResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await generatePlatformBrief({
        data: { windowDays },
        headers: { Authorization: `Bearer ${token}` },
      });
      setBrief(result);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token, windowDays]);

  return (
    <section aria-label="AI platform brief" className="grid gap-md">
      <div>
        <h3 className="type-h3">AI platform brief</h3>
        <p className="type-body mt-xs text-muted-text">
          A concise overview written from the verified figures above. Changes are
          mentioned only when enough history exists to trust them.
        </p>
      </div>
      {brief === null && !loading && !error ? (
        <div>
          <Button type="button" variant="outline" onClick={() => void generate()}>
            Generate brief
          </Button>
        </div>
      ) : loading ? (
        <div className="grid gap-xs" aria-label="Generating brief">
          <Skeleton className="h-6 w-2/3 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
        </div>
      ) : error ? (
        <ErrorState title="We couldn't generate the brief." description={error} onRetry={() => void generate()} />
      ) : brief ? (
        <div className="rounded-lg border border-line bg-card p-lg shadow-card">
          <p className="type-body font-semibold">{brief.headline}</p>
          {brief.highlights.length > 0 ? (
            <ul className="type-body mt-sm list-disc space-y-2xs pl-md text-muted-text">
              {brief.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          ) : (
            <p className="type-body mt-sm text-muted-text">
              No further highlights — history is too thin for trends.
            </p>
          )}
          <p className="type-caption mt-sm text-muted-text">
            Generated {new Date(brief.generatedAt).toLocaleString()} · Last {brief.windowDays} days.
          </p>
        </div>
      ) : null}
    </section>
  );
}

const TREND_PANELS = [
  { key: "events", title: "Events created" },
  { key: "rsvps", title: "RSVPs" },
  { key: "users", title: "New users" },
  { key: "organizers", title: "New organizers" },
  { key: "saves", title: "Saves" },
  { key: "tickets", title: "Ticket orders" },
  { key: "reports", title: "Reports filed" },
] as const;

function TrendsSection({ token, windowDays }: { token: string | null; windowDays: number }) {
  const [trends, setTrends] = useState<IntelligenceTrends | null>(null);
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
      const result = await getIntelligenceTrends({
        data: { windowDays },
        headers: { Authorization: `Bearer ${token}` },
      });
      setTrends(result);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token, windowDays]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section aria-label="Platform trends" className="grid gap-md">
      <div>
        <h3 className="type-h3">Platform trends</h3>
        <p className="type-body mt-xs text-muted-text">
          Daily activity over the selected window, aggregated on the server.
        </p>
      </div>
      {loading && trends === null ? (
        <div className="grid gap-md sm:grid-cols-2" aria-label="Loading trends">
          <Skeleton className="h-56 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
      ) : error ? (
        <ErrorState title="We couldn't load trends." description={error} onRetry={() => void refresh()} />
      ) : trends ? (
        <div className="grid gap-md sm:grid-cols-2">
          {TREND_PANELS.map((panel) => (
            <TrendMini
              key={panel.key}
              title={panel.title}
              points={trends[panel.key]?.points ?? null}
              color={TREND_COLORS[panel.key]}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function InsightsSection({ token }: { token: string | null }) {
  const [dist, setDist] = useState<IntelligenceDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [observations, setObservations] = useState<CategoryObservationsResult | null>(null);
  const [obsLoading, setObsLoading] = useState(false);
  const [obsError, setObsError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getIntelligenceDistribution({
        headers: { Authorization: `Bearer ${token}` },
      });
      setDist(result);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = useCallback(async () => {
    if (!token) {
      setObsError("Sign in to use the admin console.");
      return;
    }
    setObsLoading(true);
    setObsError(null);
    try {
      const result = await generateCategoryObservations({
        headers: { Authorization: `Bearer ${token}` },
      });
      setObservations(result);
    } catch (caught) {
      setObsError(friendlyAdminError(caught));
    } finally {
      setObsLoading(false);
    }
  }, [token]);

  const labeled = (rows: Array<{ label: string; count: number }> | null | undefined) =>
    rows === null || rows === undefined
      ? null
      : rows.map((row) => ({ label: categoryLabel(row.label), count: row.count }));

  return (
    <section aria-label="Category and location insights" className="grid gap-md">
      <div>
        <h3 className="type-h3">Category &amp; location insights</h3>
        <p className="type-body mt-xs text-muted-text">
          Where events live and where audience activity concentrates.
        </p>
      </div>
      {loading && dist === null ? (
        <div className="grid gap-md sm:grid-cols-2" aria-label="Loading insights">
          <Skeleton className="h-56 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
      ) : error ? (
        <ErrorState title="We couldn't load insights." description={error} onRetry={() => void refresh()} />
      ) : dist ? (
        <>
          <div className="grid gap-md sm:grid-cols-2">
            <DistributionBars
              title="Events by category"
              rows={labeled(dist.eventsByCategory?.items)}
              other={dist.eventsByCategory?.other ?? 0}
              truncated={dist.eventsByCategory?.truncated ?? false}
              visible={dist.eventsByCategory !== null}
            />
            <DistributionBars
              title="Events by city"
              rows={dist.eventsByCity?.items ?? null}
              other={dist.eventsByCity?.other ?? 0}
              truncated={dist.eventsByCity?.truncated ?? false}
              visible={dist.eventsByCity !== null}
            />
            <DistributionBars
              title="RSVPs by category"
              rows={labeled(dist.rsvpsByCategory?.items)}
              other={dist.rsvpsByCategory?.other ?? 0}
              truncated={dist.rsvpsByCategory?.truncated ?? false}
              visible={dist.rsvpsByCategory !== null}
            />
            <DistributionBars
              title="Saves by category"
              rows={labeled(dist.savesByCategory?.items)}
              other={dist.savesByCategory?.other ?? 0}
              truncated={dist.savesByCategory?.truncated ?? false}
              visible={dist.savesByCategory !== null}
            />
          </div>
          {observations === null && !obsLoading && !obsError ? (
            <div>
              <Button type="button" variant="outline" onClick={() => void generate()}>
                Generate AI observations
              </Button>
            </div>
          ) : obsLoading ? (
            <div className="grid gap-xs" aria-label="Generating observations">
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-2/3 rounded" />
            </div>
          ) : obsError ? (
            <ErrorState
              title="We couldn't generate observations."
              description={obsError}
              onRetry={() => void generate()}
            />
          ) : observations ? (
            <div className="rounded-lg border border-dashed border-line bg-canvas p-md">
              <p className="type-caption font-semibold tracking-wide text-muted-text uppercase">
                AI observations
              </p>
              {observations.observations.length > 0 ? (
                <ul className="type-body mt-sm list-disc space-y-2xs pl-md text-muted-text">
                  {observations.observations.map((observation) => (
                    <li key={observation}>{observation}</li>
                  ))}
                </ul>
              ) : (
                <p className="type-body mt-sm text-muted-text">
                  Nothing conclusive yet — the mix is too thin to interpret.
                </p>
              )}
              <p className="type-caption mt-sm text-muted-text">
                Generated {new Date(observations.generatedAt).toLocaleString()} from the
                distributions above.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function AdminIntelligencePage() {
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const [windowDays, setWindowDays] = useState<number>(30);
  const [snapshot, setSnapshot] = useState<IntelligenceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canSee = useCallback(
    (metric: DashboardMetric) => role !== null && canSeeMetric(role, metric),
    [role],
  );

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getIntelligenceSnapshot({
        data: { windowDays },
        headers: { Authorization: `Bearer ${token}` },
      });
      setSnapshot(result);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token, windowDays]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="grid gap-lg">
      <div>
        <h2 className="type-h2">Event Intelligence</h2>
        <p className="type-body mt-xs text-muted-text">
          Platform activity at a glance. Every figure below comes from a live
          database aggregate — nothing here is estimated or written by AI.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-sm" role="group" aria-label="Activity window">
        {WINDOW_OPTIONS.map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => setWindowDays(days)}
            aria-pressed={windowDays === days}
            className={`focus-ring rounded-full border px-md py-xs type-body transition-colors ${
              windowDays === days
                ? "border-accent bg-accent/12 text-accent"
                : "border-line bg-card text-muted-text hover:text-primary-text"
            }`}
          >
            Last {days} days
          </button>
        ))}
      </div>

      {loading && snapshot === null ? (
        <div className="grid gap-md sm:grid-cols-2" aria-label="Loading intelligence">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      ) : error ? (
        <ErrorState
          title="We couldn't load intelligence."
          description={error}
          onRetry={() => void refresh()}
        />
      ) : snapshot === null ? (
        <EmptyState
          title="No intelligence data yet."
          description="Refresh to load the latest platform aggregates."
        />
      ) : (
        <>
          <div className="grid gap-md sm:grid-cols-2">
            <MetricCard
              label="Events"
              value={snapshot.events ? String(snapshot.events.total) : "—"}
              detail={
                snapshot.events
                  ? `${snapshot.events.published} published · ${snapshot.events.upcoming} upcoming · ${seriesNew(snapshot.events.series.points)} new in window`
                  : ""
              }
              visible={canSee("events")}
            />
            <MetricCard
              label="RSVPs"
              value={snapshot.rsvps ? String(snapshot.rsvps.total) : "—"}
              detail={
                snapshot.rsvps
                  ? `${seriesNew(snapshot.rsvps.series.points)} new in window`
                  : ""
              }
              visible={canSee("rsvps")}
            />
            <MetricCard
              label="Users"
              value={snapshot.users ? String(snapshot.users.total) : "—"}
              detail={
                snapshot.users
                  ? `${seriesNew(snapshot.users.series.points)} joined in window`
                  : ""
              }
              visible={canSee("users")}
            />
            <MetricCard
              label="Organizers"
              value={snapshot.organizers ? String(snapshot.organizers.total) : "—"}
              detail={
                snapshot.organizers
                  ? `${seriesNew(snapshot.organizers.series.points)} new in window`
                  : ""
              }
              visible={canSee("organizers")}
            />
          </div>
          <p className="type-caption text-muted-text">
            Data as of {new Date(snapshot.generatedAt).toLocaleString()} · Window: last {snapshot.windowDays} days.
          </p>
        </>
      )}

      <BriefSection token={token} windowDays={windowDays} />

      <TrendsSection token={token} windowDays={windowDays} />

      <InsightsSection token={token} />

      <EventPerformanceSection />

      <WatchlistSection />

      <RecommendationsSection />

      <AssistantSection />
    </div>
  );
}
