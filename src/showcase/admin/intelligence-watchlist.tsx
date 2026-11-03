// Admin Intelligence watchlist + recommendations sections (Phase 2).
// Deterministic findings with expandable evidence and on-demand AI
// explanations; advisory recommendations with evidence-strength badges.
// Everything numeric arrived validated from the server — the UI renders,
// never computes.
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import {
  friendlyAdminError,
  useAccessToken,
} from "@/showcase/admin/admin-client";
import {
  explainAnomaly,
  getAnomalyWatchlist,
  getIntelligenceRecommendations,
  type AnomalyExplanationResult,
  type AnomalyWatchlist,
  type IntelligenceRecommendations,
} from "@/showcase/admin/intelligence-functions";
import { findingLink, type AnomalyRule } from "@/showcase/admin/intelligence-detection";

function severityVariant(severity: string): "transactional" | "accent" | "neutral" {
  if (severity === "High") return "transactional";
  if (severity === "Medium") return "accent";
  return "neutral";
}

function figureLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^\w/, (first) => first.toUpperCase());
}

function EvidenceList({ figures }: { figures: Record<string, number | string> }) {
  return (
    <dl className="grid gap-xs sm:grid-cols-2">
      {Object.entries(figures).map(([key, value]) => (
        <div key={key} className="rounded border border-line bg-canvas px-sm py-xs">
          <dt className="type-caption font-semibold tracking-wide text-muted-text uppercase">
            {figureLabel(key)}
          </dt>
          <dd className="type-body mt-2xs font-semibold">
            {typeof value === "number" ? value.toLocaleString() : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ExplainPanel({ rule, eventId }: { rule: AnomalyRule; eventId: string | null }) {
  const token = useAccessToken();
  const [result, setResult] = useState<AnomalyExplanationResult | null>(null);
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
      const explanation = await explainAnomaly({
        data: { rule, eventId },
        headers: { Authorization: `Bearer ${token}` },
      });
      setResult(explanation);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token, rule, eventId]);

  if (result === null && !loading && !error) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => void generate()}>
        Explain this finding
      </Button>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-line bg-canvas p-md">
      <p className="type-caption font-semibold tracking-wide text-muted-text uppercase">
        AI explanation
      </p>
      {loading ? (
        <div className="mt-sm grid gap-xs" aria-label="Generating explanation">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
        </div>
      ) : error ? (
        <div className="mt-sm">
          <p className="type-body text-transactional">{error}</p>
          <Button type="button" variant="outline" size="sm" className="mt-sm" onClick={() => void generate()}>
            Try again
          </Button>
        </div>
      ) : result ? (
        <>
          <p className="type-body mt-sm">{result.explanation}</p>
          {result.limitations.length > 0 ? (
            <>
              <p className="type-caption mt-sm font-semibold tracking-wide text-muted-text uppercase">
                Limits
              </p>
              <ul className="type-body mt-2xs list-disc space-y-2xs pl-md text-muted-text">
                {result.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </>
          ) : null}
          {result.nextSteps.length > 0 ? (
            <>
              <p className="type-caption mt-sm font-semibold tracking-wide text-muted-text uppercase">
                Suggested checks
              </p>
              <ul className="type-body mt-2xs list-disc space-y-2xs pl-md text-muted-text">
                {result.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="type-caption mt-sm text-muted-text">
            Generated {new Date(result.generatedAt).toLocaleString()} from this finding&apos;s
            figures. Advisory only — it changes nothing.
          </p>
        </>
      ) : null}
    </div>
  );
}

export function WatchlistSection() {
  const token = useAccessToken();
  const [watchlist, setWatchlist] = useState<AnomalyWatchlist | null>(null);
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
      const result = await getAnomalyWatchlist({
        headers: { Authorization: `Bearer ${token}` },
      });
      setWatchlist(result);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section aria-label="Anomaly watchlist" className="grid gap-md">
      <div>
        <h3 className="type-h3">Anomaly watchlist</h3>
        <p className="type-body mt-xs text-muted-text">
          Rule-flagged spikes and unusual activity. Detection is deterministic code over
          server aggregates — the AI only explains findings, never creates them.
        </p>
      </div>
      {loading && watchlist === null ? (
        <div className="grid gap-md" aria-label="Loading watchlist">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      ) : error ? (
        <ErrorState title="We couldn't load the watchlist." description={error} onRetry={() => void refresh()} />
      ) : watchlist ? (
        <>
          {watchlist.notes.length > 0 ? (
            <div className="grid gap-xs">
              {watchlist.notes.map((note) => (
                <p key={note} className="type-caption text-muted-text">
                  {note}
                </p>
              ))}
            </div>
          ) : null}
          {watchlist.baselines.rsvpVelocity &&
          watchlist.baselines.rsvpVelocity.status === "insufficient" ? (
            <div className="rounded-lg border border-dashed border-line bg-card p-md">
              <p className="type-body font-semibold">RSVP velocity: insufficient data</p>
              <p className="type-body mt-xs text-muted-text">
                {watchlist.baselines.rsvpVelocity.note} Surge detection stays off until
                enough history exists.
              </p>
            </div>
          ) : null}
          {watchlist.findings.length === 0 ? (
            <EmptyState
              title="No anomalies detected."
              description="Nothing crossed a detection threshold. Quiet platforms show this — it means no alarms, not missing data."
            />
          ) : (
            <ol className="grid gap-md">
              {watchlist.findings.map((finding) => {
                const link = findingLink(finding.rule, finding.eventId);
                return (
                  <li
                    key={finding.key}
                    className="grid gap-sm rounded-lg border border-line bg-card p-lg shadow-card"
                  >
                    <div className="flex flex-wrap items-center gap-sm">
                      <Badge variant={severityVariant(finding.severity)}>
                        {finding.severity} severity
                      </Badge>
                      <p className="type-body font-semibold">
                        {finding.eventTitle ?? "Platform-wide activity"}
                      </p>
                    </div>
                    <p className="type-body text-muted-text">{finding.ruleText}</p>
                    <p className="type-caption text-muted-text">{finding.thresholdText}</p>
                    <details className="group grid gap-sm">
                      <summary className="focus-ring type-body cursor-pointer font-semibold text-accent">
                        Evidence
                      </summary>
                      <EvidenceList figures={finding.figures} />
                      <p className="type-caption text-muted-text">
                        Detected {new Date(finding.detectedAt).toLocaleString()}
                      </p>
                    </details>
                    <div className="flex flex-wrap items-center gap-sm">
                      <ExplainPanel rule={finding.rule} eventId={finding.eventId} />
                      <Link
                        to={link.to}
                        className="focus-ring type-body font-semibold text-accent underline-offset-4 hover:underline"
                      >
                        {link.label}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="type-caption text-muted-text">
            Data as of {new Date(watchlist.generatedAt).toLocaleString()}.
          </p>
        </>
      ) : null}
    </section>
  );
}

const KIND_LABELS: Record<string, string> = {
  consider_featuring: "Featuring candidate",
  moderation_review: "Moderation review",
  low_engagement: "Low engagement",
  organizer_attention: "Organizer attention",
};

export function RecommendationsSection() {
  const token = useAccessToken();
  const [recs, setRecs] = useState<IntelligenceRecommendations | null>(null);
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
      const result = await getIntelligenceRecommendations({
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecs(result);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section aria-label="Recommendations" className="grid gap-md">
      <div>
        <h3 className="type-h3">Recommendations</h3>
        <p className="type-body mt-xs text-muted-text">
          Advisory suggestions for staff, each backed by database evidence. Nothing here
          is applied automatically — every decision stays human.
        </p>
      </div>
      {loading && recs === null ? (
        <div className="grid gap-md" aria-label="Loading recommendations">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      ) : error ? (
        <ErrorState title="We couldn't load recommendations." description={error} onRetry={() => void refresh()} />
      ) : recs ? (
        <>
          {recs.notes.length > 0 ? (
            <div className="grid gap-xs">
              {recs.notes.map((note) => (
                <p key={note} className="type-caption text-muted-text">
                  {note}
                </p>
              ))}
            </div>
          ) : null}
          {recs.items.length === 0 ? (
            <EmptyState
              title="No recommendations right now."
              description="Nothing has enough supporting evidence to suggest. Check back as activity grows."
            />
          ) : (
            <ol className="grid gap-md">
              {recs.items.map((item) => (
                <li
                  key={item.key}
                  className="grid gap-sm rounded-lg border border-line bg-card p-lg shadow-card"
                >
                  <div className="flex flex-wrap items-center gap-sm">
                    <Badge variant="outline">{KIND_LABELS[item.kind] ?? item.kind}</Badge>
                    <Badge variant={severityVariant(item.confidence)}>
                      {item.confidence} evidence
                    </Badge>
                  </div>
                  <p className="type-body font-semibold">{item.title}</p>
                  <p className="type-body text-muted-text">{item.explanation}</p>
                  <details className="group grid gap-sm">
                    <summary className="focus-ring type-body cursor-pointer font-semibold text-accent">
                      Evidence
                    </summary>
                    <EvidenceList figures={item.evidence} />
                  </details>
                  <div>
                    <Link
                      to={item.link.to}
                      className="focus-ring type-body font-semibold text-accent underline-offset-4 hover:underline"
                    >
                      {item.link.label}
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="type-caption text-muted-text">
            Data as of {new Date(recs.generatedAt).toLocaleString()}.
          </p>
        </>
      ) : null}
    </section>
  );
}
