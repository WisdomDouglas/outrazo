// Scout dashboard: run history, coverage summary, and new-run setup.
// Admin-triggered only: every run is created, started, resumed, and
// cancelled by an authorized reviewer — nothing runs on a schedule.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

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
import { NIGERIAN_STATES } from "@/showcase/discovery/locations";
import {
  createScoutRun,
  listScoutRuns,
  startScoutRun,
} from "@/showcase/scout/scout-functions";
import { GEO_ZONES } from "@/showcase/scout/scout-zones";
import { SCOUT_EVENT_CATEGORIES } from "@/showcase/scout/scout-review";
import { SCOUT_DEFAULT_MAX_TOOL_CALLS } from "@/showcase/scout/scout-search";

export const Route = createFileRoute("/admin/scout/")({
  head: () => ({ meta: [
    { title: "Scout — Admin Console — Outrazo" },
    { name: "description", content: "AI-assisted discovery of Nigerian events from the web." },
  ] }),
  component: ScoutDashboardPage,
});

type ScopeMode = "nationwide" | "zones" | "states" | "cities";

function statusBadge(status: string) {
  if (status === "done") return <Badge variant="accent">Done</Badge>;
  if (status === "failed" || status === "budget_stopped") {
    return <Badge variant="transactional">{status === "failed" ? "Failed" : "Budget stopped"}</Badge>;
  }
  if (status === "paused" || status === "cancelled") return <Badge variant="neutral">{status === "paused" ? "Paused" : "Cancelled"}</Badge>;
  return <Badge variant="outline">{status === "draft" ? "Draft" : "Running"}</Badge>;
}

function NewRunPanel({ token, onCreated }: { token: string; onCreated: () => void }) {
  const [mode, setMode] = useState<ScopeMode>("nationwide");
  const [zones, setZones] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [categories, setCategories] = useState<string[]>(["tech"]);
  const [maxToolCalls, setMaxToolCalls] = useState(SCOUT_DEFAULT_MAX_TOOL_CALLS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], value: string, set: (next: string[]) => void) => {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  // Worst case: every request spends its 4-call cap.
  const requestCap = Math.max(1, Math.ceil(maxToolCalls / 4));
  const estimatedCents = Math.round((maxToolCalls * 2.5) / 10);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const cities = mode === "cities" && city.trim() ? [city.trim()] : [];
      const { runId } = await createScoutRun({
        data: {
          scope: {
            mode,
            zones: mode === "zones" ? zones : [],
            states: mode === "states" ? states : [],
            cities,
          },
          categories,
          dateFrom: null,
          dateTo: null,
          maxToolCalls,
          maxSources: 60,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      await startScoutRun({ data: { runId }, headers: { Authorization: `Bearer ${token}` } });
      onCreated();
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-md rounded-lg border border-line bg-card p-lg shadow-card">
      <div>
        <h3 className="type-h3">New discovery run</h3>
        <p className="type-body mt-xs text-muted-text">
          Searches run only when you start them. Review the budget before starting.
        </p>
      </div>
      <div className="grid gap-sm sm:grid-cols-4">
        {(["nationwide", "zones", "states", "cities"] as ScopeMode[]).map((value) => (
          <label key={value} className="flex cursor-pointer items-center gap-xs rounded-lg border border-line px-sm py-xs">
            <input
              type="radio"
              name="scope-mode"
              checked={mode === value}
              onChange={() => setMode(value)}
              className="accent-accent"
            />
            <span className="type-body capitalize">{value}</span>
          </label>
        ))}
      </div>
      {mode === "zones" ? (
        <fieldset className="grid gap-xs">
          <legend className="type-body font-semibold">Zones</legend>
          <div className="flex flex-wrap gap-xs">
            {GEO_ZONES.map((zone) => (
              <label key={zone.name} className="flex cursor-pointer items-center gap-xs rounded-full border border-line px-sm py-xs">
                <input
                  type="checkbox"
                  checked={zones.includes(zone.name)}
                  onChange={() => toggle(zones, zone.name, setZones)}
                  className="accent-accent"
                />
                <span className="type-body">{zone.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {mode === "states" ? (
        <div className="grid gap-xs">
          <label htmlFor="scout-states" className="type-body font-semibold">States (up to 37)</label>
          <select
            id="scout-states"
            multiple
            size={6}
            value={states}
            onChange={(event) => setStates([...event.target.selectedOptions].map((option) => option.value))}
            className="focus-ring type-body rounded-lg border border-line-strong bg-canvas px-sm py-xs"
          >
            {NIGERIAN_STATES.map((state) => (
              <option key={state.name} value={state.name}>{state.name}</option>
            ))}
          </select>
        </div>
      ) : null}
      {mode === "cities" ? (
        <div className="grid gap-xs">
          <label htmlFor="scout-city" className="type-body font-semibold">City</label>
          <input
            id="scout-city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="e.g. Uyo"
            className="focus-ring type-body rounded-lg border border-line-strong bg-canvas px-sm py-xs"
          />
        </div>
      ) : null}
      <fieldset className="grid gap-xs">
        <legend className="type-body font-semibold">Categories</legend>
        <div className="flex flex-wrap gap-xs">
          {SCOUT_EVENT_CATEGORIES.map((category) => (
            <label key={category} className="flex cursor-pointer items-center gap-xs rounded-full border border-line px-sm py-xs">
              <input
                type="checkbox"
                checked={categories.includes(category)}
                onChange={() => toggle(categories, category, setCategories)}
                className="accent-accent"
              />
              <span className="type-body capitalize">{category}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-xs sm:grid-cols-2">
        <div className="grid gap-xs">
          <label htmlFor="scout-budget" className="type-body font-semibold">Search-call budget (max 100)</label>
          <input
            id="scout-budget"
            type="number"
            min={1}
            max={100}
            value={maxToolCalls}
            onChange={(event) => setMaxToolCalls(Number(event.target.value))}
            className="focus-ring type-body rounded-lg border border-line-strong bg-canvas px-sm py-xs"
          />
        </div>
        <div className="grid content-end gap-xs rounded-lg border border-dashed border-line p-sm">
          <p className="type-body">Up to {requestCap} search requests, {maxToolCalls} tool calls.</p>
          <p className="type-caption text-muted-text">
            Estimated search fees ≈ ${(estimatedCents / 100).toFixed(2)} (unverified estimate:
            billing units per tool call are unconfirmed). Token usage is metered separately.
          </p>
        </div>
      </div>
      {error ? <p className="type-body text-transactional">{error}</p> : null}
      <div>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Starting…" : "Create and start run"}
        </Button>
      </div>
    </form>
  );
}

function ScoutDashboardPage() {
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof listScoutRuns>>["runs"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canManage = role !== null && roleHasPermission(role, "scout.manage");

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listScoutRuns({
        data: { limit: 20, offset: 0 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setRuns(result.runs);
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
    <div className="grid gap-lg">
      <div className="flex flex-wrap items-end justify-between gap-sm">
        <div>
          <h2 className="type-h2">Outrazo Scout</h2>
          <p className="type-body mt-xs text-muted-text">
            Discover Nigerian events from the web. Humans review everything — Scout never publishes.
          </p>
        </div>
        <Link to="/admin/scout/discoveries" className="focus-ring type-body font-semibold text-accent underline-offset-4 hover:underline">
          Open review queue
        </Link>
      </div>

      {token && canManage ? <NewRunPanel token={token} onCreated={() => void refresh()} /> : null}

      <section aria-label="Run history" className="grid gap-md">
        <h3 className="type-h3">Run history</h3>
        {loading && runs === null ? (
          <div className="grid gap-sm" aria-label="Loading runs">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        ) : error ? (
          <ErrorState title="We couldn't load Scout runs." description={error} onRetry={() => void refresh()} />
        ) : runs && runs.length > 0 ? (
          <ol className="grid gap-sm">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-line bg-card p-md">
                <div className="grid gap-xs">
                  <div className="flex flex-wrap items-center gap-sm">
                    {statusBadge(run.status)}
                    <span className="type-body font-semibold capitalize">{run.scope.mode} run</span>
                  </div>
                  <p className="type-caption text-muted-text">
                    {run.tool_calls_made}/{run.max_tool_calls} calls · {run.discoveries_created} discoveries ·{" "}
                    {new Date(run.created_at).toLocaleString()}
                  </p>
                </div>
                <Link
                  to="/admin/scout/$runId"
                  params={{ runId: run.id }}
                  className="focus-ring type-body font-semibold text-accent underline-offset-4 hover:underline"
                >
                  View run
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            title="No discovery runs yet."
            description="Start your first run above. Each run searches, extracts, and queues candidates for human review."
          />
        )}
      </section>
    </div>
  );
}
