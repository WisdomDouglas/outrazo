// Pure Scout run-engine guards: search-phase completion, manual step retry,
// and the single-row step-persistence contract. This module has zero imports
// so node:test can exercise every guard without server dependencies;
// scout-functions.ts (server-only) calls these helpers.
export interface ScoutDbFailure {
  message: string;
  code?: string;
}

/**
 * Minimal structural shape of the step table client. The real Supabase client
 * satisfies this; tests substitute an in-memory fake. The `.eq("id", ...)`
 * call is part of the contract: persistence must target exactly one row.
 */
export interface ScoutStepUpdateStore {
  from(table: "scout_run_steps"): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: ScoutDbFailure | null }>;
    };
  };
}

/**
 * Search-phase completion rule: the run may advance to extraction only when
 * at least one search step finished successfully. A run whose steps all
 * failed (or were skipped) must report failed, never done.
 */
export function decideSearchCompletion(stepStatuses: readonly string[]): "extracting" | "failed" {
  return stepStatuses.includes("done") ? "extracting" : "failed";
}

export interface RetryRunState {
  status: string;
  tool_calls_made: number;
  max_tool_calls: number;
}

export interface RetryStepState {
  run_id: string;
  status: string;
}

/**
 * Controlled manual-retry guard. Retries are explicit admin actions, never
 * automatic: only failed steps of a halted run with remaining budget qualify.
 * Completed steps are never repeated and other runs are never touched.
 */
export function retryStepGuard(
  run: RetryRunState,
  step: RetryStepState | null,
  runId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!["paused", "failed", "budget_stopped"].includes(run.status)) {
    return {
      ok: false,
      reason: `Run is ${run.status}; only paused, failed, or budget-stopped runs accept step retries.`,
    };
  }
  if (!step || step.run_id !== runId) {
    return { ok: false, reason: "That step does not belong to this run." };
  }
  if (step.status !== "failed") {
    return { ok: false, reason: `Only failed steps can be retried; this step is ${step.status}.` };
  }
  if (run.tool_calls_made >= run.max_tool_calls) {
    return {
      ok: false,
      reason: "This run has spent its search budget; start a new run with a larger budget.",
    };
  }
  return { ok: true };
}

/**
 * Persists one finished search step to exactly the intended row. Returns the
 * raw database error (null on success); the caller converts failures into a
 * user-safe backend error. Never throws on its own.
 */
export async function persistScoutStepDone(
  db: ScoutStepUpdateStore,
  stepId: string,
  values: Record<string, unknown>,
): Promise<ScoutDbFailure | null> {
  const { error } = await db.from("scout_run_steps").update(values).eq("id", stepId);
  return error;
}
