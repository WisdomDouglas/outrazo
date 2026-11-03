// Scout server functions (S1 run engine + S2 fetch/extract/validate).
//
// Admin-triggered only: no schedulers, no background jobs. Each call does one
// small unit of work (one search request, one source extraction) so the UI
// polls progress and every request stays fast. Budget is enforced BEFORE each
// search request; failures pause for explicit admin resume (never auto-retry).
//
// RETRY POLICY (deliberate split): search requests are NEVER retried — each
// attempt spends budget, so a failed step pauses the run for explicit admin
// resume or explicit single-step retry (budget re-checked first). Extraction
// gets ONE silent retry for degenerate model output only
// (empty/unparseable JSON), matching the Intelligence convention; transport
// failures pause immediately like searches.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { MetaError, metaChatJson } from "@/integrations/meta/client.server";
import { metaResponsesSearch } from "@/integrations/meta/responses.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  AdminBackendError,
  requirePermission,
} from "@/showcase/admin/require-permission.server";
import {
  checkScoutBudget,
  parseScoutSearch,
  SCOUT_DEFAULT_MAX_TOOL_CALLS,
  SCOUT_MAX_TOOL_CALLS_CEILING,
  SCOUT_REQUEST_TOOL_CALL_CAP,
} from "./scout-search";
import {
  allCoverageNames,
  coverageForStep,
  GEO_ZONES,
  planScoutRun,
  type PlannedStep,
} from "./scout-zones";
import {
  decideSearchCompletion,
  persistScoutStepDone,
  raiseBudgetGuard,
  retryStepGuard, type ScoutStepUpdateStore,
} from "./scout-run-guards";
import {
  checkScoutDates,
  normalizeScoutUrl,
  resolveScoutState,
  scoutDedupeKey,
  scoutScopeSchema,
} from "./scout-validate";
import {
  buildExtractionPrompt,
  pickUnprocessedCandidates,
  SCOUT_EXTRACTION_JSON_SCHEMA,
  scoutExtractionSchema,
} from "./scout-extract";
import { fetchScoutSource } from "./scout-fetch.server";
import {
  approvalOverridesSchema,
  buildScoutAttribution,
  checkApprovalDates,
  isReviewerCoverUrl,
  scoutDraftSlug,
} from "./scout-review";
import { organizerSlug } from "@/showcase/organizers";

// â”€â”€ Scout table shapes (local; mirrors the S0 proposal migration) â”€â”€â”€â”€â”€â”€â”€â”€â”€
type ScoutRunsRow = {
  id: string;
  status: string;
  scope: { mode: string; zones: string[]; states: string[]; cities: string[] };
  categories: string[];
  date_from: string | null;
  date_to: string | null;
  max_tool_calls: number;
  max_sources: number;
  tool_calls_made: number;
  sources_fetched: number;
  discoveries_created: number;
  input_tokens: number;
  output_tokens: number;
  error: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type ScoutStepsRow = {
  id: string;
  run_id: string;
  step_index: number;
  tier: string;
  label: string;
  query: string;
  city: string | null;
  status: string;
  tool_calls: number;
  results: Array<{ title: string | null; url: string; domain: string; snippet: string }>;
  citations: Array<{ url: string; title: string | null }>;
  input_tokens: number;
  output_tokens: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

type ScoutCoverageRow = {
  run_id: string;
  state_name: string;
  status: string;
  requests: number;
  tool_calls: number;
  discoveries: number;
  useful_count: number;
};

type ScoutDiscoveryRow = {
  id: string;
  run_id: string;
  status: string;
  title: string | null;
  summary: string | null;
  description: string | null;
  category: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  state_code: string | null;
  event_type: string | null;
  price_hint: string | null;
  external_ticket_url: string | null;
  capacity: number | null;
  provenance: Record<string, string>;
  external_organizer_name: string | null;
  external_organizer_info: Record<string, string> | null;
  source_url: string;
  source_domain: string;
  source_snapshot: string | null;
  fetch_status: string | null;
  fetched_at: string | null;
  citations: Array<{ url: string; title: string | null }>;
  dedupe_key: string | null;
  matched_event_id: string | null;
  match_confidence: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  dismissal_reason: string | null;
  auto_reject_reason: string | null;
  created_at: string;
};

type ScoutRunsInsert = {
  status?: string;
  scope: ScoutRunsRow["scope"];
  categories?: string[];
  date_from?: string | null;
  date_to?: string | null;
  max_tool_calls?: number;
  max_sources?: number;
  tool_calls_made?: number;
  sources_fetched?: number;
  discoveries_created?: number;
  input_tokens?: number;
  output_tokens?: number;
  error?: string | null;
  created_by?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

type ScoutRunsUpdate = {
  status?: string;
  scope?: ScoutRunsRow["scope"];
  categories?: string[];
  date_from?: string | null;
  date_to?: string | null;
  max_tool_calls?: number;
  max_sources?: number;
  tool_calls_made?: number;
  sources_fetched?: number;
  discoveries_created?: number;
  input_tokens?: number;
  output_tokens?: number;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

type ScoutStepsInsert = {
  run_id: string;
  step_index: number;
  tier: string;
  label: string;
  query: string;
  city?: string | null;
  status?: string;
  tool_calls?: number;
  results?: ScoutStepsRow["results"];
  citations?: ScoutStepsRow["citations"];
  input_tokens?: number;
  output_tokens?: number;
  error?: string | null;
  finished_at?: string | null;
};

type ScoutStepsUpdate = {
  status?: string;
  tool_calls?: number;
  results?: ScoutStepsRow["results"];
  citations?: ScoutStepsRow["citations"];
  input_tokens?: number;
  output_tokens?: number;
  error?: string | null;
  finished_at?: string | null;
};

type ScoutCoverageInsert = {
  run_id: string;
  state_name: string;
  status?: string;
  requests?: number;
  tool_calls?: number;
  discoveries?: number;
  useful_count?: number;
};

type ScoutCoverageUpdate = {
  status?: string;
  requests?: number;
  tool_calls?: number;
  discoveries?: number;
  useful_count?: number;
};

type ScoutDiscoveryInsert = {
  run_id: string;
  source_url: string;
  source_domain: string;
  status?: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  category?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  venue_name?: string | null;
  address?: string | null;
  city?: string | null;
  state_code?: string | null;
  event_type?: string | null;
  price_hint?: string | null;
  external_ticket_url?: string | null;
  capacity?: number | null;
  provenance?: Record<string, string>;
  external_organizer_name?: string | null;
  external_organizer_info?: Record<string, string> | null;
  source_snapshot?: string | null;
  fetch_status?: string | null;
  fetched_at?: string | null;
  citations?: ScoutDiscoveryRow["citations"];
  dedupe_key?: string | null;
  matched_event_id?: string | null;
  match_confidence?: string | null;
  reviewer_id?: string | null;
  reviewed_at?: string | null;
  dismissal_reason?: string | null;
  auto_reject_reason?: string | null;
};

type ScoutDiscoveryUpdate = {
  status?: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  category?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  venue_name?: string | null;
  address?: string | null;
  city?: string | null;
  state_code?: string | null;
  event_type?: string | null;
  price_hint?: string | null;
  external_ticket_url?: string | null;
  capacity?: number | null;
  provenance?: Record<string, string>;
  external_organizer_name?: string | null;
  external_organizer_info?: Record<string, string> | null;
  source_snapshot?: string | null;
  fetch_status?: string | null;
  fetched_at?: string | null;
  citations?: ScoutDiscoveryRow["citations"];
  dedupe_key?: string | null;
  matched_event_id?: string | null;
  match_confidence?: string | null;
  reviewer_id?: string | null;
  reviewed_at?: string | null;
  dismissal_reason?: string | null;
  auto_reject_reason?: string | null;
};

export interface ScoutDb {
  public: {
    Tables: {
      scout_runs: { Row: ScoutRunsRow; Insert: ScoutRunsInsert; Update: ScoutRunsUpdate; Relationships: [] };
      scout_run_steps: { Row: ScoutStepsRow; Insert: ScoutStepsInsert; Update: ScoutStepsUpdate; Relationships: [] };
      scout_run_coverage: { Row: ScoutCoverageRow; Insert: ScoutCoverageInsert; Update: ScoutCoverageUpdate; Relationships: [] };
      scout_discoveries: { Row: ScoutDiscoveryRow; Insert: ScoutDiscoveryInsert; Update: ScoutDiscoveryUpdate; Relationships: [] };
      audit_log: {
        Row: { id: string };
        Insert: { actor_id?: string | null; action: string; entity_type: string; entity_id?: string | null; metadata?: Record<string, unknown> };
        Update: Record<string, never>;
        Relationships: [];
      };
      events: { Row: { id: string; title: string; starts_at: string; city: string | null }; Insert: ScoutEventInsert; Update: { id?: string }; Relationships: [] };
      organizers: {
        Row: { id: string; owner_id: string | null; name: string };
        Insert: { owner_id?: string | null; name?: string; slug?: string; community?: string | null; description?: string | null; location?: string | null };
        Update: { id?: string };
        Relationships: [];
      };
      scout_event_links: { Row: { discovery_id: string; event_id: string }; Insert: { discovery_id: string; event_id: string; created_by?: string | null }; Update: { discovery_id?: string }; Relationships: [] };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: Record<string, never>;
  };
};

type ScoutEventInsert = {
  id: string;
  slug: string;
  organizer_id: string;
  created_by: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  image_url: string;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  address: string;
  city: string;
  event_type: string;
  capacity: number;
  price_from: number;
  currency: string;
  status: string;
  published: boolean;
  external_ticket_url?: string | null;
};

type ScoutClient = SupabaseClient<ScoutDb>;

function asScoutDb(client: SupabaseClient): ScoutClient {
  return client as unknown as ScoutClient;
}

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01";
}

function scoutBackendError(action: string, error: { message: string; code?: string }): AdminBackendError {
  if (isMissingTable(error)) {
    return new AdminBackendError(
      "The Scout backend is not available yet. Apply the pending migration, then try again.",
    );
  }
  console.error(`[scout] ${action} failed:`, error.message);
  return new AdminBackendError("Scout could not complete that action. Please try again.");
}

async function insertScoutAudit(
  db: ScoutClient,
  input: { actorId: string; action: string; entityId: string | null; metadata: Record<string, unknown> },
): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    actor_id: input.actorId,
    action: input.action,
    entity_type: "scout",
    entity_id: input.entityId,
    metadata: input.metadata,
  });
  if (error) throw scoutBackendError("audit", error);
}

async function getRun(db: ScoutClient, runId: string): Promise<ScoutRunsRow> {
  const { data, error } = await db.from("scout_runs").select("*").eq("id", runId).single();
  if (error) throw scoutBackendError("load run", error);
  return data;
}

/** Zones ordered least-recently-swept first, from Tier B step history. */
async function zoneRotation(db: ScoutClient): Promise<string[]> {
  const { data: runs, error: runsError } = await db
    .from("scout_runs")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(12);
  if (runsError) throw scoutBackendError("rotation", runsError);
  const ids = (runs ?? []).map((row) => row.id);
  const sweepCounts = new Map<string, number>(GEO_ZONES.map((zone) => [zone.name, 0]));
  if (ids.length > 0) {
    const { data: rows, error } = await db
      .from("scout_run_steps")
      .select("label")
      .in("run_id", ids)
      .eq("tier", "B")
      .eq("status", "done");
    if (error) throw scoutBackendError("rotation", error);
    for (const row of rows ?? []) {
      const zone = GEO_ZONES.find((candidate) => row.label === `Zone: ${candidate.name}`);
      if (zone) sweepCounts.set(zone.name, (sweepCounts.get(zone.name) ?? 0) + 1);
    }
  }
  return GEO_ZONES.map((zone) => zone.name).sort(
    (a, b) => (sweepCounts.get(a) ?? 0) - (sweepCounts.get(b) ?? 0),
  );
}

const SCOUT_SEARCH_TIMEOUT_MS = 120_000;
const SCOUT_EXTRACT_TIMEOUT_MS = 60_000;
const SCOUT_EXTRACT_TOKENS = 2048;
const SCOUT_EXTRACT_BATCH = 3;
/**
 * Coverage mark for a finished step. Only Tier C explicit state picks earn
 * 'targeted'. Tier B zone sweeps mark members 'zone_only': zone membership
 * must never be presented as individual state coverage.
 */
function mapScoutMetaError(caught: unknown): string {
  if (caught instanceof MetaError) {
    switch (caught.code) {
      case "config": return "Event search is not set up yet.";
      case "timeout": return "The search took too long.";
      case "network": return "Could not reach the search service.";
      case "unauthorized": return "The search service rejected its credentials.";
      case "rate_limited": return "The search service is busy; resume later.";
      case "server": return "The search service is unavailable.";
      default: return "The search service returned an unreadable response.";
    }
  }
  return "The search service returned an unreadable response.";
}

// â”€â”€ S1: run lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const createScoutRun = createServerFn({ method: "POST" })
  .validator(
    z.object({
      scope: scoutScopeSchema,
      categories: z.array(z.string().max(60)).max(10).default([]),
      dateFrom: z.string().date().nullable().default(null),
      dateTo: z.string().date().nullable().default(null),
      maxToolCalls: z.number().int().min(1).max(SCOUT_MAX_TOOL_CALLS_CEILING).default(SCOUT_DEFAULT_MAX_TOOL_CALLS),
      maxSources: z.number().int().min(1).max(500).default(60),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ runId: string; steps: PlannedStep[] }> => {
    const grant = await requirePermission(context, "scout.manage");
    const db = asScoutDb(grant.supabase);
    const rotation = await zoneRotation(db);
    // Budget-derived step cap: each step may spend up to 4 calls.
    const maxSteps = Math.max(1, Math.ceil(data.maxToolCalls / SCOUT_REQUEST_TOOL_CALL_CAP));
    const steps = planScoutRun({
      scope: data.scope,
      categories: data.categories,
      zoneRotation: rotation,
      maxSteps: Math.min(maxSteps, 12),
    });
    if (steps.length === 0) {
      throw new AdminBackendError("That scope produced no searches. Pick a state, city, or nationwide.");
    }
    const { data: run, error: runError } = await db
      .from("scout_runs")
      .insert({
        status: "draft",
        scope: data.scope,
        categories: data.categories,
        date_from: data.dateFrom,
        date_to: data.dateTo,
        max_tool_calls: data.maxToolCalls,
        max_sources: data.maxSources,
        created_by: grant.userId,
      })
      .select("id")
      .single();
    if (runError) throw scoutBackendError("create run", runError);
    const stepRows = steps.map((step, index) => ({
      run_id: run.id,
      step_index: index,
      tier: step.tier,
      label: step.label,
      query: step.query,
      city: step.city,
    }));
    const { error: stepsError } = await db.from("scout_run_steps").insert(stepRows);
    if (stepsError) throw scoutBackendError("plan steps", stepsError);
    const coverageRows = allCoverageNames().map((state_name) => ({
      run_id: run.id,
      state_name,
      status: "unsearched",
    }));
    const { error: coverageError } = await db.from("scout_run_coverage").insert(coverageRows);
    if (coverageError) throw scoutBackendError("coverage", coverageError);
    await insertScoutAudit(db, {
      actorId: grant.userId,
      action: "scout.run.create",
      entityId: run.id,
      metadata: { steps: steps.length, maxToolCalls: data.maxToolCalls, mode: data.scope.mode },
    });
    return { runId: run.id, steps };
  });

export const startScoutRun = createServerFn({ method: "POST" })
  .validator(z.object({ runId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const grant = await requirePermission(context, "scout.manage");
    const db = asScoutDb(grant.supabase);
    const run = await getRun(db, data.runId);
    if (run.status !== "draft") {
      throw new AdminBackendError("Only draft runs can be started.");
    }
    const { error } = await db
      .from("scout_runs")
      .update({ status: "searching", started_at: new Date().toISOString(), error: null })
      .eq("id", data.runId)
      .eq("status", "draft");
    if (error) throw scoutBackendError("start run", error);
    await insertScoutAudit(db, {
      actorId: grant.userId,
      action: "scout.run.start",
      entityId: data.runId,
      metadata: {},
    });
    return { ok: true };
  });

export const cancelScoutRun = createServerFn({ method: "POST" })
  .validator(z.object({ runId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const grant = await requirePermission(context, "scout.manage");
    const db = asScoutDb(grant.supabase);
    const run = await getRun(db, data.runId);
    if (["done", "failed", "cancelled"].includes(run.status)) {
      throw new AdminBackendError("That run already finished.");
    }
    const { error } = await db
      .from("scout_runs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", data.runId);
    if (error) throw scoutBackendError("cancel run", error);
    await insertScoutAudit(db, {
      actorId: grant.userId,
      action: "scout.run.cancel",
      entityId: data.runId,
      metadata: { from: run.status },
    });
    return { ok: true };
  });

export const pauseScoutRun = createServerFn({ method: "POST" })
  .validator(z.object({ runId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const grant = await requirePermission(context, "scout.manage");
    const db = asScoutDb(grant.supabase);
    const run = await getRun(db, data.runId);
    if (!["searching", "extracting"].includes(run.status)) {
      throw new AdminBackendError("Only active runs can be paused.");
    }
    const { error } = await db
      .from("scout_runs")
      .update({ status: "paused" })
      .eq("id", data.runId);
    if (error) throw scoutBackendError("pause run", error);
    await insertScoutAudit(db, {
      actorId: grant.userId,
      action: "scout.run.pause",
      entityId: data.runId,
      metadata: { from: run.status },
    });
    return { ok: true };
  });

export const raiseScoutBudget = createServerFn({ method: "POST" })
  .validator(z.object({ runId: z.string().uuid(), maxToolCalls: z.number().int().min(1) }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; status: string }> => {
    const grant = await requirePermission(context, "scout.manage");
    const db = asScoutDb(grant.supabase);
    const run = await getRun(db, data.runId);
    const guard = raiseBudgetGuard(run, data.maxToolCalls, SCOUT_MAX_TOOL_CALLS_CEILING);
    if (!guard.ok) throw new AdminBackendError(guard.reason);
    const { error: budgetError } = await db
      .from("scout_runs")
      .update({ max_tool_calls: data.maxToolCalls })
      .eq("id", data.runId);
    if (budgetError) throw scoutBackendError("raise budget", budgetError);
    const { error: reviveError } = await db
      .from("scout_run_steps")
      .update({ status: "pending" })
      .eq("run_id", data.runId)
      .eq("status", "skipped_budget");
    if (reviveError) throw scoutBackendError("raise budget", reviveError);
    const { data: pending, error: pendingError } = await db
      .from("scout_run_steps")
      .select("id")
      .eq("run_id", data.runId)
      .eq("status", "pending")
      .limit(1);
    if (pendingError) throw scoutBackendError("raise budget", pendingError);
    let next = "searching";
    if ((pending ?? []).length === 0) {
      const { data: finished, error: finishedError } = await db
        .from("scout_run_steps")
        .select("status")
        .eq("run_id", data.runId);
      if (finishedError) throw scoutBackendError("raise budget", finishedError);
      if (decideSearchCompletion((finished ?? []).map((row) => row.status)) === "failed") {
        const { error: failError } = await db
          .from("scout_runs")
          .update({ status: "failed", error: "Budget raised, but no search in this run succeeded." })
          .eq("id", data.runId);
        if (failError) throw scoutBackendError("raise budget", failError);
        return { ok: true, status: "failed" };
      }
      next = "extracting";
    }
    const { error } = await db
      .from("scout_runs")
      .update({ status: next, error: null })
      .eq("id", data.runId);
    if (error) throw scoutBackendError("raise budget", error);
    await insertScoutAudit(db, {
      actorId: grant.userId,
      action: "scout.budget.raise",
      entityId: data.runId,
      metadata: { from: run.max_tool_calls, to: data.maxToolCalls, status: next },
    });
    return { ok: true, status: next };
  });

export const resumeScoutRun = createServerFn({ method: "POST" })
  .validator(z.object({ runId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; status: string }> => {
    const grant = await requirePermission(context, "scout.manage");
    const db = asScoutDb(grant.supabase);
    const run = await getRun(db, data.runId);
    if (!["paused", "failed", "budget_stopped"].includes(run.status)) {
      throw new AdminBackendError("Only paused, failed, or budget-stopped runs can resume.");
    }
    // Resume where the pipeline stopped: pending steps -> searching, else extracting.
    const { data: pending, error: pendingError } = await db
      .from("scout_run_steps")
      .select("id")
      .eq("run_id", data.runId)
      .eq("status", "pending")
      .limit(1);
    if (pendingError) throw scoutBackendError("resume", pendingError);
    let next = "searching";
    if ((pending ?? []).length === 0) {
      const { data: finished, error: finishedError } = await db
        .from("scout_run_steps")
        .select("status")
        .eq("run_id", data.runId);
      if (finishedError) throw scoutBackendError("resume", finishedError);
      if (decideSearchCompletion((finished ?? []).map((row) => row.status)) === "failed") {
        throw new AdminBackendError("No search in this run succeeded yet. Retry a failed step before resuming.");
      }
      next = "extracting";
    }
    const { error } = await db
      .from("scout_runs")
      .update({ status: next, error: null })
      .eq("id", data.runId);
    if (error) throw scoutBackendError("resume", error);
    await insertScoutAudit(db, {
      actorId: grant.userId,
      action: "scout.run.resume",
      entityId: data.runId,
      metadata: { from: run.status, to: next },
    });
    return { ok: true, status: next };
  });

export const retryScoutStep = createServerFn({ method: "POST" })
  .validator(z.object({ runId: z.string().uuid(), stepIndex: z.number().int().min(0) }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const grant = await requirePermission(context, "scout.manage");
    const db = asScoutDb(grant.supabase);
    const run = await getRun(db, data.runId);
    const { data: step, error: stepError } = await db
      .from("scout_run_steps")
      .select("*")
      .eq("run_id", data.runId)
      .eq("step_index", data.stepIndex)
      .single();
    if (stepError || !step) {
      throw new AdminBackendError("That step does not belong to this run.");
    }
    const guard = retryStepGuard(run, step, data.runId);
    if (!guard.ok) throw new AdminBackendError(guard.reason);
    const { error: resetError } = await db
      .from("scout_run_steps")
      .update({ status: "pending", error: null, finished_at: null })
      .eq("id", step.id);
    if (resetError) throw scoutBackendError("retry step", resetError);
    const { error: runError } = await db
      .from("scout_runs")
      .update({ status: "searching", error: null })
      .eq("id", run.id);
    if (runError) throw scoutBackendError("retry step", runError);
    await insertScoutAudit(db, {
      actorId: grant.userId,
      action: "scout.step.retry",
      entityId: step.id,
      metadata: { runId: run.id, stepIndex: data.stepIndex, from: run.status },
    });
    return { ok: true };
  });

/**
 * Executes exactly ONE pending search step: budget check first, then one
 * Responses request, then persists results + counters + coverage. The UI
 * polls this until no pending steps remain.
 */
export const advanceScoutRun = createServerFn({ method: "POST" })
  .validator(z.object({ runId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ status: string; stepsLeft: number }> => {
    const grant = await requirePermission(context, "scout.manage");
    const db = asScoutDb(grant.supabase);
    const run = await getRun(db, data.runId);
    if (run.status !== "searching") {
      throw new AdminBackendError(`Run is ${run.status}; only searching runs advance.`);
    }
    // Budget gate BEFORE any request.
    if (run.tool_calls_made >= run.max_tool_calls) {
      const { error: haltError } = await db.from("scout_runs").update({ status: "budget_stopped" }).eq("id", run.id);
      if (haltError) throw scoutBackendError("budget halt", haltError);
      const { error } = await db
        .from("scout_run_steps")
        .update({ status: "skipped_budget" })
        .eq("run_id", run.id)
        .eq("status", "pending");
      if (error) throw scoutBackendError("budget halt", error);
      return { status: "budget_stopped", stepsLeft: 0 };
    }
    const { data: step, error: stepError } = await db
      .from("scout_run_steps")
      .select("*")
      .eq("run_id", run.id)
      .eq("status", "pending")
      .order("step_index")
      .limit(1)
      .single();
    if (stepError || !step) {
      // No pending steps: the search phase is over, but it only counts as
      // complete when at least one search actually succeeded. An all-failed
      // run must never advance toward done.
      const { data: finished, error: finishedError } = await db
        .from("scout_run_steps")
        .select("status")
        .eq("run_id", run.id);
      if (finishedError) throw scoutBackendError("finish search", finishedError);
      if (decideSearchCompletion((finished ?? []).map((row) => row.status)) === "failed") {
        const message = "Every search in this run failed. Retry a failed step or start a new run.";
        const { error } = await db.from("scout_runs").update({ status: "failed", error: message }).eq("id", run.id);
        if (error) throw scoutBackendError("finish search", error);
        return { status: "failed", stepsLeft: 0 };
      }
      const { error } = await db.from("scout_runs").update({ status: "extracting" }).eq("id", run.id);
      if (error) throw scoutBackendError("finish search", error);
      return { status: "extracting", stepsLeft: 0 };
    }
    const today = new Date().toISOString().slice(0, 10);
    let payload: unknown;
    try {
      ({ payload } = await metaResponsesSearch({
        input: step.query,
        instructions: `Today is ${today}. List upcoming events only; exclude anything already past. Prefer events in Nigeria. Prefer individual event pages over aggregator, directory, or listing pages.`,
        location: step.city
          ? { country: "NG", city: step.city, timezone: "Africa/Lagos" }
          : { country: "NG", timezone: "Africa/Lagos" },
        maxToolCalls: SCOUT_REQUEST_TOOL_CALL_CAP,
        contextSize: "medium",
        timeoutMs: SCOUT_SEARCH_TIMEOUT_MS,
        logPrefix: "[scout]",
      }));
    } catch (caught) {
      const message = mapScoutMetaError(caught);
      const { error: failError } = await db.from("scout_run_steps").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", step.id);
      if (failError) throw scoutBackendError("save step", failError);
      const { error: pauseError } = await db.from("scout_runs").update({ status: "paused", error: message }).eq("id", run.id);
      if (pauseError) throw scoutBackendError("pause run", pauseError);
      return { status: "paused", stepsLeft: -1 };
    }
    const parsed = parseScoutSearch(payload);
    const budget = checkScoutBudget(run.tool_calls_made, parsed.toolCalls, run.max_tool_calls);
    // Single-row persist: the helper targets exactly this step id, and any
    // database failure below aborts loudly instead of advancing silently.
    const updateError = await persistScoutStepDone(db as unknown as ScoutStepUpdateStore, step.id, {
      status: "done",
      tool_calls: parsed.toolCalls,
      results: parsed.results,
      citations: parsed.citations,
      input_tokens: parsed.inputTokens,
      output_tokens: parsed.outputTokens,
      finished_at: new Date().toISOString(),
    });
    if (updateError) throw scoutBackendError("save step", updateError);
    // Coverage: Tier C state picks earn 'targeted'; Tier B zone sweeps earn
    // 'zone_only' for members (never 'targeted'). Tier A marks nothing here;
    // extraction may later mark resolved states 'nationwide_only'.
    const mark = coverageForStep(step.tier, step.label);
    if (mark.states.length > 0) {
      const { error: coverageError } = await db
        .from("scout_run_coverage")
        .update({ status: mark.status })
        .eq("run_id", run.id)
        .in("state_name", mark.states);
      if (coverageError) throw scoutBackendError("coverage", coverageError);
    }
    const { error: runError } = await db
      .from("scout_runs")
      .update({
        tool_calls_made: budget.callsAfter,
        input_tokens: run.input_tokens + parsed.inputTokens,
        output_tokens: run.output_tokens + parsed.outputTokens,
      })
      .eq("id", run.id);
    if (runError) throw scoutBackendError("counters", runError);
    const { data: remaining, error: remainingError } = await db
      .from("scout_run_steps")
      .select("id")
      .eq("run_id", run.id)
      .eq("status", "pending");
    if (remainingError) throw scoutBackendError("remaining", remainingError);
    const stepsLeft = (remaining ?? []).length;
    let status = "searching";
    if (stepsLeft === 0) {
      status = "extracting";
      const { error } = await db.from("scout_runs").update({ status }).eq("id", run.id);
      if (error) throw scoutBackendError("finish search", error);
    } else if (!budget.allowed) {
      status = "budget_stopped";
      const { error } = await db
        .from("scout_runs")
        .update({ status })
        .eq("id", run.id);
      if (error) throw scoutBackendError("budget halt", error);
      const { error: skipError } = await db
        .from("scout_run_steps")
        .update({ status: "skipped_budget" })
        .eq("run_id", run.id)
        .eq("status", "pending");
      if (skipError) throw scoutBackendError("budget halt", skipError);
      return { status, stepsLeft: 0 };
    }
    return { status, stepsLeft };
  });

// â”€â”€ S2: fetch + extract + validate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface CandidateSource {
  url: string;
  title: string | null;
  domain: string;
  snippet: string;
}

/** Next unprocessed candidate URLs across done steps (dedupe by normalized URL). */
async function nextCandidates(db: ScoutClient, run: ScoutRunsRow, limit: number): Promise<CandidateSource[]> {
  const { data: steps, error: stepsError } = await db
    .from("scout_run_steps")
    .select("results")
    .eq("run_id", run.id)
    .eq("status", "done")
    .order("step_index");
  if (stepsError) throw scoutBackendError("candidates", stepsError);
  const { data: done, error: doneError } = await db
    .from("scout_discoveries")
    .select("source_url")
    .eq("run_id", run.id);
  if (doneError) throw scoutBackendError("candidates", doneError);
  const processed = new Set<string>();
  for (const row of done ?? []) {
    const normalized = normalizeScoutUrl(row.source_url);
    if (normalized) processed.add(normalized);
  }
  return pickUnprocessedCandidates(
    (steps ?? []).map((step) => step.results ?? []),
    processed,
    limit,
    run.max_sources,
  );
}

async function runExtraction(source: { url: string; title: string | null; text: string }): Promise<
  ReturnType<typeof scoutExtractionSchema.safeParse>
> {
  const prompt = buildExtractionPrompt({ ...source, todayIso: new Date().toISOString() });
  let detail = "no usable data";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { payload } = await metaChatJson({
        messages: [
          { role: "developer", content: prompt.instructions },
          { role: "user", content: prompt.input },
        ],
        schemaName: "ScoutExtraction",
        jsonSchema: SCOUT_EXTRACTION_JSON_SCHEMA,
        maxTokens: SCOUT_EXTRACT_TOKENS,
        timeoutMs: SCOUT_EXTRACT_TIMEOUT_MS,
        logPrefix: "[scout]",
      });
      const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })
        ?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        detail = "empty response";
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        detail = "response was not valid JSON";
        continue;
      }
      const checked = scoutExtractionSchema.safeParse(parsed);
      if (checked.success) return checked;
      detail = checked.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ");
    } catch (caught) {
      if (caught instanceof MetaError && ["timeout", "network", "server", "rate_limited"].includes(caught.code)) {
        throw caught;
      }
      // Malformed/degenerate output: one silent retry, then give up.
    }
  }
  const reason = `Extraction produced no usable data (${detail}).`.slice(0, 280);
  return scoutExtractionSchema.safeParse({ isUpcomingEvent: false, eventType: "unknown", notEventReason: reason });
}

/**
 * Extracts one small batch of sources concurrently: fetch, model extraction,
 * deterministic gates, duplicate check, then insert as pending or
 * auto_rejected (transient failures skip the candidate, recorded for
 * re-extract, instead of pausing). One counters update covers the whole
 * batch. The UI polls this until no candidates remain.
 */
export const advanceScoutExtract = createServerFn({ method: "POST" })
  .validator(z.object({ runId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ status: string; extracted: number }> => {
    const grant = await requirePermission(context, "scout.manage");
    const db = asScoutDb(grant.supabase);
    const run = await getRun(db, data.runId);
    if (run.status !== "extracting") {
      throw new AdminBackendError(`Run is ${run.status}; only extracting runs advance.`);
    }
    const batch = await nextCandidates(db, run, SCOUT_EXTRACT_BATCH);
    if (batch.length === 0) {
      const { error } = await db
        .from("scout_runs")
        .update({ status: "done", finished_at: new Date().toISOString() })
        .eq("id", run.id);
      if (error) throw scoutBackendError("finish run", error);
      await insertScoutAudit(db, {
        actorId: grant.userId,
        action: "scout.run.done",
        entityId: run.id,
        metadata: { discoveries: run.discoveries_created, toolCalls: run.tool_calls_made },
      });
      return { status: "done", extracted: run.discoveries_created };
    }
    const today = new Date().toISOString().slice(0, 10);
    const { data: citedSteps, error: citedError } = await db
      .from("scout_run_steps")
      .select("citations")
      .eq("run_id", run.id)
      .eq("status", "done");
    if (citedError) throw scoutBackendError("citations", citedError);
    const allCitations = (citedSteps ?? []).flatMap((step) => step.citations ?? []);
    // One candidate's full pipeline (fetch, extract, gates, insert) as a
    // worker so a small batch runs concurrently below. Workers never touch
    // run counters; the driver applies one update for the whole batch.
    const processOne = async (
      candidate: CandidateSource,
    ): Promise<{ pending: boolean; state: string | null }> => {
    const citations = allCitations.filter((citation) => normalizeScoutUrl(citation.url) === candidate.url);
    const fetched = await fetchScoutSource(candidate.url);
    if (!fetched.ok) {
      await insertDiscovery(db, run.id, {
        status: "auto_rejected",
        source_url: candidate.url,
        source_domain: candidate.domain,
        fetch_status: `fetch_failed:${fetched.reason}`,
        fetched_at: new Date().toISOString(),
        citations,
        auto_reject_reason: `Source ${fetched.detail}`,
      });
      return { pending: false, state: null };
    }
    // Transport errors skip this candidate (recorded, re-extractable) instead
    // of pausing the run; anything else still fails loudly.
    let extraction: Awaited<ReturnType<typeof runExtraction>>;
    try {
      extraction = await runExtraction({ url: candidate.url, title: candidate.title, text: fetched.text });
    } catch (caught) {
      if (!(caught instanceof MetaError && ["timeout", "network", "server", "rate_limited"].includes(caught.code))) {
        throw caught;
      }
      await insertDiscovery(db, run.id, {
        status: "auto_rejected",
        source_url: candidate.url,
        source_domain: candidate.domain,
        source_snapshot: fetched.text.slice(0, 8000),
        fetch_status: "extracted",
        fetched_at: new Date().toISOString(),
        citations,
        auto_reject_reason: `Skipped after a connection failure (${mapScoutMetaError(caught)}). Re-extract to retry.`,
      });
      return { pending: false, state: null };
    }
    if (!extraction.success) {
      await insertDiscovery(db, run.id, {
        status: "auto_rejected",
        source_url: candidate.url,
        source_domain: candidate.domain,
        source_snapshot: fetched.text.slice(0, 8000),
        fetch_status: "extracted",
        fetched_at: new Date().toISOString(),
        citations,
        auto_reject_reason: "Extraction returned unusable data.",
      });
      return { pending: false, state: null };
    }
    const fields = extraction.data;
    if (!fields.isUpcomingEvent) {
      await insertDiscovery(db, run.id, {
        status: "auto_rejected",
        source_url: candidate.url,
        source_domain: candidate.domain,
        source_snapshot: fetched.text.slice(0, 8000),
        fetch_status: "extracted",
        fetched_at: new Date().toISOString(),
        citations,
        auto_reject_reason: fields.notEventReason ?? "Not an upcoming event.",
      });
      return { pending: false, state: null };
    }
    const dates = checkScoutDates(fields.startsAt ?? null, fields.endsAt ?? null, today);
    if (!dates.ok) {
      await insertDiscovery(db, run.id, {
        status: "auto_rejected",
        title: fields.title,
        starts_at: fields.startsAt,
        ends_at: fields.endsAt,
        city: fields.city,
        source_url: candidate.url,
        source_domain: candidate.domain,
        source_snapshot: fetched.text.slice(0, 8000),
        fetch_status: "extracted",
        fetched_at: new Date().toISOString(),
        citations,
        auto_reject_reason: dates.reason,
      });
      return { pending: false, state: null };
    }
    const scope = resolveScoutState(fields.city ?? null, fields.state ?? null);
    if (!scope.ok) {
      await insertDiscovery(db, run.id, {
        status: "auto_rejected",
        title: fields.title,
        starts_at: fields.startsAt,
        ends_at: fields.endsAt,
        city: fields.city,
        source_url: candidate.url,
        source_domain: candidate.domain,
        source_snapshot: fetched.text.slice(0, 8000),
        fetch_status: "extracted",
        fetched_at: new Date().toISOString(),
        citations,
        auto_reject_reason: scope.reason,
      });
      return { pending: false, state: null };
    }
    // Duplicate check against existing Outrazo events (advisory only).
    let matchedEventId: string | null = null;
    let matchConfidence: string | null = null;
    if (fields.title && fields.startsAt) {
      const day = fields.startsAt.slice(0, 10);
      const { data: similar, error: similarError } = await db
        .from("events")
        .select("id,title,starts_at,city")
        .gte("starts_at", `${day}T00:00:00.000Z`)
        .lt("starts_at", `${day}T23:59:59.999Z`)
        .limit(25);
      if (similarError) throw scoutBackendError("dedupe", similarError);
      const needle = fields.title.trim().toLowerCase();
      for (const event of similar ?? []) {
        const hay = event.title.trim().toLowerCase();
        if (hay === needle || (needle.length > 12 && hay.includes(needle)) || (hay.length > 12 && needle.includes(hay))) {
          matchedEventId = event.id;
          matchConfidence = hay === needle ? "high" : "medium";
          break;
        }
      }
    }
    const dedupeKey = fields.title ? scoutDedupeKey(fields.title, fields.startsAt ?? null, fields.city ?? null) : null;
    // Cross-run duplicate check: an event already queued or approved from an
    // earlier run must not consume review twice.
    if (dedupeKey) {
      const { data: prior, error: priorError } = await db
        .from("scout_discoveries")
        .select("run_id")
        .eq("dedupe_key", dedupeKey)
        .in("status", ["pending", "approved"])
        .neq("run_id", run.id)
        .limit(1);
      if (priorError) throw scoutBackendError("dedupe", priorError);
      if (prior && prior.length > 0) {
        await insertDiscovery(db, run.id, {
          status: "auto_rejected",
          title: fields.title,
          summary: fields.summary,
          starts_at: fields.startsAt,
          ends_at: fields.endsAt,
          venue_name: fields.venueName,
          address: fields.address,
          city: fields.city,
          state_code: scope.state,
          event_type: fields.eventType,
          price_hint: fields.priceHint,
          external_ticket_url: fields.externalTicketUrl,
          provenance: fields.provenance as unknown as Record<string, string>,
          external_organizer_name: fields.organizerName,
          source_url: candidate.url,
          source_domain: candidate.domain,
          source_snapshot: fetched.text.slice(0, 8000),
          fetch_status: "extracted",
          fetched_at: new Date().toISOString(),
          citations,
          dedupe_key: dedupeKey,
          matched_event_id: matchedEventId,
          match_confidence: matchConfidence,
          auto_reject_reason: `Duplicate of a discovery from run ${prior[0].run_id.slice(0, 8)}.`,
        });
        return { pending: false, state: null };
      }
    }
    const externalTicketUrl =
      fields.externalTicketUrl && fields.externalTicketUrl.startsWith("https://")
        ? fields.externalTicketUrl.slice(0, 500)
        : null;
    await insertDiscovery(db, run.id, {
      status: "pending",
      title: fields.title,
      summary: fields.summary,
      starts_at: fields.startsAt,
      ends_at: fields.endsAt,
      venue_name: fields.venueName,
      address: fields.address,
      city: fields.city,
      state_code: scope.state,
      event_type: fields.eventType,
      price_hint: fields.priceHint,
      external_ticket_url: externalTicketUrl,
      provenance: fields.provenance as unknown as Record<string, string>,
      external_organizer_name: fields.organizerName,
      source_url: candidate.url,
      source_domain: candidate.domain,
      source_snapshot: fetched.text.slice(0, 8000),
      fetch_status: "extracted",
      fetched_at: new Date().toISOString(),
      citations,
      dedupe_key: dedupeKey,
      matched_event_id: matchedEventId,
      match_confidence: matchConfidence,
    });
    return { pending: true, state: scope.state };
    };
    const settled = await Promise.allSettled(batch.map((entry) => processOne(entry)));
    let completed = 0;
    let queued = 0;
    const queuedStates: string[] = [];
    let transportMessage: string | null = null;
    let fatal: unknown = null;
    for (const item of settled) {
      if (item.status === "fulfilled") {
        completed += 1;
        if (item.value.pending) {
          queued += 1;
          if (item.value.state) queuedStates.push(item.value.state);
        }
      } else if (
        item.reason instanceof MetaError &&
        ["timeout", "network", "server", "rate_limited"].includes(item.reason.code)
      ) {
        transportMessage ??= mapScoutMetaError(item.reason);
      } else {
        fatal ??= item.reason;
      }
    }
    // Nationwide-only coverage: extraction resolved a state the plan never
    // targeted. Never overwrites an explicit 'targeted' mark.
    if (queuedStates.length > 0) {
      const { error: coverageError } = await db
        .from("scout_run_coverage")
        .update({ status: "nationwide_only" })
        .eq("run_id", run.id)
        .in("state_name", [...new Set(queuedStates)])
        .eq("status", "unsearched");
      if (coverageError) throw scoutBackendError("coverage", coverageError);
    }
    const { error: countError } = await db
      .from("scout_runs")
      .update({
        sources_fetched: run.sources_fetched + completed,
        discoveries_created: run.discoveries_created + queued,
      })
      .eq("id", run.id);
    if (countError) throw scoutBackendError("counters", countError);
    if (transportMessage) {
      const { error: pauseError } = await db
        .from("scout_runs")
        .update({ status: "paused", error: transportMessage })
        .eq("id", run.id);
      if (pauseError) throw scoutBackendError("pause run", pauseError);
      return { status: "paused", extracted: run.discoveries_created + queued };
    }
    if (fatal) throw fatal;
    return { status: "extracting", extracted: run.discoveries_created + queued };
  });

async function insertDiscovery(
  db: ScoutClient,
  runId: string,
  row: Omit<ScoutDb["public"]["Tables"]["scout_discoveries"]["Insert"], "run_id">,
): Promise<void> {
  const { error } = await db.from("scout_discoveries").insert({ ...row, run_id: runId });
  if (error) throw scoutBackendError("save discovery", error);
}

// â”€â”€ Reads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ScoutRunDetail {
  run: ScoutRunsRow;
  steps: ScoutStepsRow[];
  coverage: ScoutCoverageRow[];
  counts: { pending: number; approved: number; dismissed: number; autoRejected: number };
}

export const getScoutRun = createServerFn({ method: "GET" })
  .validator(z.object({ runId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ScoutRunDetail> => {
    const grant = await requirePermission(context, "scout.read");
    const db = asScoutDb(grant.supabase);
    const run = await getRun(db, data.runId);
    const { data: steps, error: stepsError } = await db
      .from("scout_run_steps")
      .select("*")
      .eq("run_id", run.id)
      .order("step_index");
    if (stepsError) throw scoutBackendError("load steps", stepsError);
    const { data: coverage, error: coverageError } = await db
      .from("scout_run_coverage")
      .select("*")
      .eq("run_id", run.id)
      .order("state_name");
    if (coverageError) throw scoutBackendError("load coverage", coverageError);
    const { data: discoveries, error: discoveriesError } = await db
      .from("scout_discoveries")
      .select("status")
      .eq("run_id", run.id);
    if (discoveriesError) throw scoutBackendError("load discoveries", discoveriesError);
    const counts = { pending: 0, approved: 0, dismissed: 0, autoRejected: 0 };
    for (const row of discoveries ?? []) {
      if (row.status === "pending") counts.pending += 1;
      else if (row.status === "approved") counts.approved += 1;
      else if (row.status === "dismissed") counts.dismissed += 1;
      else counts.autoRejected += 1;
    }
    return { run, steps: steps ?? [], coverage: coverage ?? [], counts };
  });

export const listScoutRuns = createServerFn({ method: "GET" })
  .validator(
    z.object({
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ runs: ScoutRunsRow[] }> => {
    const grant = await requirePermission(context, "scout.read");
    const db = asScoutDb(grant.supabase);
    const { data: runs, error } = await db
      .from("scout_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw scoutBackendError("list runs", error);
    return { runs: runs ?? [] };
  });

export const listScoutDiscoveries = createServerFn({ method: "GET" })
  .validator(
    z.object({
      runId: z.string().uuid().nullable().default(null),
      q: z.string().max(120).default(""),
      city: z.string().max(80).default(""),
      state: z.string().max(80).default(""),
      status: z.enum(["pending", "approved", "dismissed", "auto_rejected", "all"]).default("pending"),
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ discoveries: ScoutDiscoveryRow[] }> => {
    const grant = await requirePermission(context, "scout.read");
    const db = asScoutDb(grant.supabase);
    let query = db.from("scout_discoveries").select("*");
    if (data.runId) query = query.eq("run_id", data.runId);
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.city) query = query.ilike("city", `%${data.city}%`);
    if (data.state) query = query.ilike("state_code", `%${data.state}%`);
    if (data.q) query = query.or(`title.ilike.%${data.q}%,venue_name.ilike.%${data.q}%`);
    const { data: rows, error } = await query
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw scoutBackendError("list discoveries", error);
    return { discoveries: rows ?? [] };
  });

export const getScoutDiscovery = createServerFn({ method: "GET" })
  .validator(z.object({ discoveryId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ discovery: ScoutDiscoveryRow }> => {
    const grant = await requirePermission(context, "scout.read");
    const db = asScoutDb(grant.supabase);
    const { data: row, error } = await db
      .from("scout_discoveries")
      .select("*")
      .eq("id", data.discoveryId)
      .single();
    if (error) throw scoutBackendError("load discovery", error);
    return { discovery: row };
  });


// S3: review decisions ----------------------------------------------------
// Approval creates an UNPUBLISHED, free, tier-less draft under an organizer
// the reviewer owns. Original extracted values stay on the discovery row;
// the draft carries the reviewer's edited values plus the server-built
// attribution block. Publishing stays a separate explicit action.

export const reextractScoutDiscoveries = createServerFn({ method: "POST" })
  .validator(z.object({ runId: z.string().uuid(), discoveryIds: z.array(z.string().uuid()).min(1).max(10) }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; requeued: number }> => {
    const grant = await requirePermission(context, "scout.manage");
    const db = asScoutDb(grant.supabase);
    const run = await getRun(db, data.runId);
    if (run.status === "cancelled") {
      throw new AdminBackendError("Cancelled runs stay finished.");
    }
    const ids = [...new Set(data.discoveryIds)];
    const { data: rows, error: rowsError } = await db
      .from("scout_discoveries")
      .select("id")
      .eq("run_id", data.runId)
      .eq("status", "auto_rejected")
      .in("id", ids);
    if (rowsError) throw scoutBackendError("re-extract", rowsError);
    if (!rows || rows.length !== ids.length) {
      throw new AdminBackendError("Only rejected discoveries from this run can be re-extracted.");
    }
    const { data: deleted, error: deleteError } = await db
      .from("scout_discoveries")
      .delete()
      .eq("run_id", data.runId)
      .eq("status", "auto_rejected")
      .in("id", ids)
      .select("id");
    if (deleteError) throw scoutBackendError("re-extract", deleteError);
    const requeued = deleted?.length ?? 0;
    const { error: countError } = await db
      .from("scout_runs")
      .update({ sources_fetched: Math.max(0, run.sources_fetched - requeued) })
      .eq("id", data.runId);
    if (countError) throw scoutBackendError("re-extract", countError);
    if (run.status === "done") {
      const { error: reopenError } = await db
        .from("scout_runs")
        .update({ status: "extracting", error: null, finished_at: null })
        .eq("id", data.runId);
      if (reopenError) throw scoutBackendError("re-extract", reopenError);
    }
    await insertScoutAudit(db, {
      actorId: grant.userId,
      action: "scout.reextract",
      entityId: data.runId,
      metadata: { count: requeued, from: run.status },
    });
    return { ok: true, requeued };
  });

export const bulkDismissScoutDiscoveries = createServerFn({ method: "POST" })
  .validator(
    z.object({
      discoveryIds: z.array(z.string().uuid()).min(1).max(20),
      reason: z.enum(["duplicate", "expired", "not_an_event", "insufficient_evidence", "out_of_scope", "other"]),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true; dismissed: number }> => {
    const grant = await requirePermission(context, "scout.manage");
    const db = asScoutDb(grant.supabase);
    const reviewedAt = new Date().toISOString();
    const { data: updated, error } = await db
      .from("scout_discoveries")
      .update({
        status: "dismissed",
        dismissal_reason: data.reason,
        reviewer_id: grant.userId,
        reviewed_at: reviewedAt,
      })
      .in("id", [...new Set(data.discoveryIds)])
      .eq("status", "pending")
      .select("id");
    if (error) throw scoutBackendError("bulk dismiss", error);
    if (!updated || updated.length === 0) {
      throw new AdminBackendError("Only pending discoveries can be dismissed.");
    }
    await insertScoutAudit(db, {
      actorId: grant.userId,
      action: "scout.discovery.bulk_dismiss",
      entityId: null,
      metadata: { count: updated.length, reason: data.reason },
    });
    return { ok: true, dismissed: updated.length };
  });

export const approveScoutDiscovery = createServerFn({ method: "POST" })
  .validator(
    z.object({
      discoveryId: z.string().uuid(),
      organizerName: z.string().trim().min(2).max(100),
      overrides: approvalOverridesSchema,
      coverImageUrl: z.string().url().max(1000),
      attributionConfirmed: z.literal(true),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ eventId: string }> => {
    const grant = await requirePermission(context, "scout.manage");
    const db = asScoutDb(grant.supabase);
    const { data: discovery, error: loadError } = await db
      .from("scout_discoveries")
      .select("*")
      .eq("id", data.discoveryId)
      .single();
    if (loadError) throw scoutBackendError("load discovery", loadError);
    if (discovery.status !== "pending") {
      throw new AdminBackendError("Only pending discoveries can be approved.");
    }
    // Editable organizer name (the form recommends "Outrazo"): reuse the
    // reviewer's organizer with that exact name, or create it. Ownership is
    // guaranteed because both paths scope to the reviewer.
    const organizerName = data.organizerName.trim();
    const { data: existingOrganizer, error: findError } = await db
      .from("organizers")
      .select("id")
      .eq("owner_id", grant.userId)
      .eq("name", organizerName)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (findError) throw scoutBackendError("find organizer", findError);
    let organizerId = existingOrganizer?.id ?? null;
    if (!organizerId) {
      const { data: created, error: createError } = await db
        .from("organizers")
        .insert({
          owner_id: grant.userId,
          name: organizerName,
          slug: organizerSlug(organizerName, grant.userId),
          community: `${data.overrides.city.trim()} events`,
          description: `Events hosted by ${organizerName}.`,
          location: `${data.overrides.city.trim()}, Nigeria`,
        })
        .select("id")
        .single();
      if (createError) {
        if (createError.code === "23505") {
          const retry = await db
            .from("organizers")
            .select("id")
            .eq("owner_id", grant.userId)
            .eq("name", organizerName)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!retry.error && retry.data) {
            organizerId = retry.data.id;
          } else {
            throw new AdminBackendError("That organizer name is too similar to one you already have. Pick another name.");
          }
        } else {
          throw scoutBackendError("create organizer", createError);
        }
      } else {
        organizerId = created.id;
      }
    }
    const dates = checkApprovalDates(data.overrides.startsAt, data.overrides.endsAt, Date.now());
    if (!dates.ok) throw new AdminBackendError(dates.reason);
    const supabaseUrl = process.env["SUPABASE_URL"] ?? "";
    if (!supabaseUrl || !isReviewerCoverUrl(data.coverImageUrl, supabaseUrl, grant.userId)) {
      throw new AdminBackendError("Upload a cover image through the review form first.");
    }
    const reviewedAt = new Date().toISOString();
    const attribution = buildScoutAttribution({
      organizerName: discovery.external_organizer_name,
      sourceUrl: discovery.source_url,
      reviewDateIso: reviewedAt,
    });
    // events.slug is NOT NULL UNIQUE with no default: pre-generate the id
    // so the slug carries the same unique suffix as create-event drafts.
    const eventId = crypto.randomUUID();
    const { data: event, error: eventError } = await db
      .from("events")
      .insert({
        id: eventId,
        slug: scoutDraftSlug(data.overrides.title, eventId),
        organizer_id: organizerId,
        created_by: grant.userId,
        title: data.overrides.title,
        summary: data.overrides.summary,
        description: `${data.overrides.description}\n\n${attribution}`,
        category: data.overrides.category,
        image_url: data.coverImageUrl,
        starts_at: data.overrides.startsAt,
        ends_at: data.overrides.endsAt,
        venue_name: data.overrides.venueName,
        address: data.overrides.address,
        city: data.overrides.city,
        event_type: "free",
        capacity: data.overrides.capacity,
        price_from: 0,
        currency: "NGN",
        status: "upcoming",
        published: false,
        external_ticket_url: data.overrides.externalTicketUrl,
      })
      .select("id")
      .single();
    if (eventError) throw scoutBackendError("create draft", eventError);
    const { error: linkError } = await db.from("scout_event_links").insert({
      discovery_id: discovery.id,
      event_id: event.id,
      created_by: grant.userId,
    });
    if (linkError) throw scoutBackendError("link draft", linkError);
    const { error: updateError } = await db
      .from("scout_discoveries")
      .update({ status: "approved", reviewer_id: grant.userId, reviewed_at: reviewedAt })
      .eq("id", discovery.id)
      .eq("status", "pending");
    if (updateError) throw scoutBackendError("approve", updateError);
    await insertScoutAudit(db, {
      actorId: grant.userId,
      action: "scout.discovery.approve",
      entityId: discovery.id,
      metadata: { eventId: event.id, organizerId },
    });
    return { eventId: event.id };
  });

/**
 * Public, unauthenticated Scout-provenance check for one event. Returns a
 * bare boolean (no discovery rows, no PII) so the public event page can
 * badge Scout-posted events. Follows the discovery interpretation precedent:
 * no auth middleware, safe output only, silent false on any failure.
 */
export const getEventScoutBadge = createServerFn({ method: "GET" })
  .validator(z.object({ eventId: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<{ isScout: boolean }> => {
    if (!/^[0-9a-f-]{36}$/i.test(data.eventId)) return { isScout: false };
    const db = asScoutDb(supabaseAdmin);
    const { data: link, error } = await db
      .from("scout_event_links")
      .select("event_id")
      .eq("event_id", data.eventId)
      .limit(1);
    if (error) {
      console.error("[scout] badge lookup failed:", error.message);
      return { isScout: false };
    }
    return { isScout: (link ?? []).length > 0 };
  });

export const dismissScoutDiscovery = createServerFn({ method: "POST" })
  .validator(
    z.object({
      discoveryId: z.string().uuid(),
      reason: z.enum(["duplicate", "expired", "not_an_event", "insufficient_evidence", "out_of_scope", "other"]),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const grant = await requirePermission(context, "scout.manage");
    const db = asScoutDb(grant.supabase);
    const { data: updated, error } = await db
      .from("scout_discoveries")
      .update({
        status: "dismissed",
        dismissal_reason: data.reason,
        reviewer_id: grant.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.discoveryId)
      .eq("status", "pending")
      .select("id");
    if (error) throw scoutBackendError("dismiss", error);
    if (!updated || updated.length === 0) {
      throw new AdminBackendError("Only pending discoveries can be dismissed.");
    }
    await insertScoutAudit(db, {
      actorId: grant.userId,
      action: "scout.discovery.dismiss",
      entityId: data.discoveryId,
      metadata: { reason: data.reason },
    });
    return { ok: true };
  });
