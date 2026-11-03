// Scout persistence + completion regression tests. Covers the zero-discovery
// root cause: the search-step update must target exactly one row by id and
// surface database failures; a run with no successful search must report
// failed, never done. Uses an in-memory fake of the step table that requires
// a filter before applying an update (mirroring the safety contract). No
// network, no database.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decideSearchCompletion,
  persistScoutStepDone,
  raiseBudgetGuard,
  retryStepGuard,
} from "@/showcase/scout/scout-run-guards";
import { checkScoutBudget } from "@/showcase/scout/scout-search";
import { coverageForStep } from "@/showcase/scout/scout-zones";

/** In-memory scout_run_steps stand-in. update() without .eq() throws. */
function fakeStepStore(rows, failWith = null) {
  const calls = [];
  return {
    calls,
    rows,
    from(table) {
      assert.equal(table, "scout_run_steps");
      return {
        update(values) {
          return {
            eq(column, value) {
              calls.push({ column, value, values });
              if (failWith) return Promise.resolve({ error: failWith });
              assert.equal(column, "id");
              let touched = 0;
              for (const row of rows) {
                if (row.id === value) {
                  Object.assign(row, values);
                  touched += 1;
                }
              }
              return Promise.resolve({ error: null, touched });
            },
          };
        },
      };
    },
  };
}

function stepRow(id, runId, index, status = "pending") {
  return { id, run_id: runId, step_index: index, status, tool_calls: 0, results: [], citations: [] };
}

describe("persistScoutStepDone", () => {
  it("persists results to exactly the intended step", async () => {
    const target = stepRow("step-1", "run-a", 0);
    const store = fakeStepStore([target, stepRow("step-2", "run-a", 1), stepRow("step-3", "run-b", 0)]);
    const values = { status: "done", tool_calls: 2, results: [{ url: "https://x.example/e" }] };
    const error = await persistScoutStepDone(store, "step-1", values);
    assert.equal(error, null);
    assert.equal(store.calls.length, 1);
    assert.deepEqual(store.calls[0].column, "id");
    assert.deepEqual(store.calls[0].value, "step-1");
    assert.equal(target.status, "done");
    assert.equal(target.tool_calls, 2);
    assert.deepEqual(target.results, values.results);
  });

  it("leaves other steps and other runs untouched", async () => {
    const other = stepRow("step-2", "run-a", 1);
    const foreign = stepRow("step-3", "run-b", 0);
    const before = JSON.stringify([other, foreign]);
    const store = fakeStepStore([stepRow("step-1", "run-a", 0), other, foreign]);
    await persistScoutStepDone(store, "step-1", { status: "done" });
    assert.equal(JSON.stringify([other, foreign]), before);
  });

  it("surfaces a failed persistence operation to the caller", async () => {
    const store = fakeStepStore([stepRow("step-1", "run-a", 0)], { message: "connection reset", code: "XX000" });
    const error = await persistScoutStepDone(store, "step-1", { status: "done" });
    assert.deepEqual(error, { message: "connection reset", code: "XX000" });
  });
});

describe("decideSearchCompletion", () => {
  it("moves to extraction when at least one step succeeded", () => {
    assert.equal(decideSearchCompletion(["done", "failed", "pending"]), "extracting");
    assert.equal(decideSearchCompletion(["failed", "done"]), "extracting");
  });

  it("fails the run when every step failed", () => {
    assert.equal(decideSearchCompletion(["failed", "failed"]), "failed");
  });

  it("fails the run when steps were only skipped or empty", () => {
    assert.equal(decideSearchCompletion(["skipped_budget", "failed"]), "failed");
    assert.equal(decideSearchCompletion([]), "failed");
  });
});

describe("retryStepGuard", () => {
  const run = (overrides = {}) => ({ status: "paused", tool_calls_made: 3, max_tool_calls: 24, ...overrides });
  const step = (overrides = {}) => ({ run_id: "run-a", status: "failed", ...overrides });

  it("allows retrying a failed step on a halted run with budget left", () => {
    assert.deepEqual(retryStepGuard(run(), step(), "run-a"), { ok: true });
    assert.deepEqual(retryStepGuard(run({ status: "failed" }), step(), "run-a"), { ok: true });
  });

  it("rejects retries on active or finished runs", () => {
    for (const status of ["draft", "searching", "extracting", "done", "cancelled"]) {
      const result = retryStepGuard(run({ status }), step(), "run-a");
      assert.equal(result.ok, false);
    }
  });

  it("never repeats a completed step", () => {
    for (const status of ["pending", "done", "skipped_budget"]) {
      const result = retryStepGuard(run(), step({ status }), "run-a");
      assert.equal(result.ok, false);
    }
  });

  it("rejects steps from another run and exhausted budgets", () => {
    assert.equal(retryStepGuard(run(), null, "run-a").ok, false);
    assert.equal(retryStepGuard(run(), step({ run_id: "run-b" }), "run-a").ok, false);
    assert.equal(retryStepGuard(run({ tool_calls_made: 24 }), step(), "run-a").ok, false);
  });
});

describe("raiseBudgetGuard", () => {
  it("allows forward-only raises within the ceiling", () => {
    assert.deepEqual(raiseBudgetGuard({ status: "budget_stopped", max_tool_calls: 24 }, 40, 100), { ok: true });
    assert.deepEqual(raiseBudgetGuard({ status: "searching", max_tool_calls: 24 }, 25, 100), { ok: true });
  });

  it("rejects finished runs, sideways raises, and over-ceiling raises", () => {
    assert.equal(raiseBudgetGuard({ status: "done", max_tool_calls: 24 }, 40, 100).ok, false);
    assert.equal(raiseBudgetGuard({ status: "cancelled", max_tool_calls: 24 }, 40, 100).ok, false);
    assert.equal(raiseBudgetGuard({ status: "paused", max_tool_calls: 24 }, 24, 100).ok, false);
    assert.equal(raiseBudgetGuard({ status: "paused", max_tool_calls: 24 }, 10, 100).ok, false);
    assert.equal(raiseBudgetGuard({ status: "paused", max_tool_calls: 24 }, 101, 100).ok, false);
  });
});

describe("budget and coverage accounting", () => {
  it("keeps the halt-before-overspend budget gate intact", () => {
    assert.equal(checkScoutBudget(23, 1, 24).allowed, false);
    assert.equal(checkScoutBudget(20, 1, 24).allowed, true);
    assert.equal(checkScoutBudget(20, 1, 24).callsAfter, 21);
  });

  it("marks Tier C picks targeted and Tier B members zone_only", () => {
    const targeted = coverageForStep("C", "Targeted: Lagos State");
    assert.deepEqual(targeted, { states: ["Lagos"], status: "targeted" });
    const zone = coverageForStep("B", "Zone: South-West");
    assert.equal(zone.status, "zone_only");
    assert.ok(zone.states.includes("Lagos"));
    assert.ok(!zone.states.includes("Kano"));
  });

  it("marks nothing for Tier A and unknown labels", () => {
    assert.deepEqual(coverageForStep("A", "Nationwide sweep"), { states: [], status: "unsearched" });
    assert.deepEqual(coverageForStep("B", "Zone: Atlantis"), { states: [], status: "zone_only" });
  });
});
