// Scout zones/planner/validate tests (S1+S2). Zone coverage is exhaustive,
// plans are deterministic and bounded, URLs normalize, dates expire
// deterministically, and unknown places fail closed. Pure logic only.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allCoverageNames,
  GEO_ZONES,
  planScoutRun,
  zoneOfState,
} from "@/showcase/scout/scout-zones";
import {
  checkScoutDates,
  normalizeScoutUrl,
  resolveScoutState,
  scoutDedupeKey,
} from "@/showcase/scout/scout-validate";
import { NIGERIAN_STATES } from "@/showcase/discovery/locations";

describe("scout zones", () => {
  it("covers all 36 states plus FCT exactly once", () => {
    assert.equal(GEO_ZONES.length, 6);
    assert.equal(allCoverageNames().length, 37);
    assert.equal(NIGERIAN_STATES.length, 37);
    const assigned = GEO_ZONES.flatMap((zone) => zone.states).sort();
    assert.deepEqual(assigned, [...allCoverageNames()].sort());
    for (const state of NIGERIAN_STATES) {
      assert.ok(zoneOfState(state.name), state.name);
    }
  });
});

describe("planScoutRun", () => {
  it("plans nationwide + two rotating zones", () => {
    const steps = planScoutRun({
      scope: { mode: "nationwide", zones: [], states: [], cities: [] },
      categories: ["technology"],
      zoneRotation: ["South-South", "North-West", "South-West"],
      maxSteps: 6,
    });
    assert.equal(steps.length, 3);
    assert.equal(steps[0].tier, "A");
    assert.deepEqual(steps[1].states.length > 0, true);
    assert.equal(steps[1].label, "Zone: South-South");
    assert.equal(steps[2].label, "Zone: North-West");
    // Nationwide sweep targets nothing explicitly.
    assert.deepEqual(steps[0].states, []);
  });

  it("targets explicit states and cities without sweeping", () => {
    const states = planScoutRun({
      scope: { mode: "states", zones: [], states: ["Kano", "Enugu"], cities: [] },
      categories: [],
      zoneRotation: [],
      maxSteps: 6,
    });
    assert.equal(states.length, 2);
    assert.ok(states.every((step) => step.tier === "C"));
    assert.deepEqual(states[0].states, ["Kano"]);
    const cities = planScoutRun({
      scope: { mode: "cities", zones: [], states: [], cities: ["Uyo"] },
      categories: [],
      zoneRotation: [],
      maxSteps: 6,
    });
    assert.equal(cities.length, 1);
    assert.equal(cities[0].city, "Uyo");
  });

  it("respects the step cap deterministically", () => {
    const input = {
      scope: { mode: "nationwide", zones: [], states: [], cities: [] },
      categories: [],
      zoneRotation: ["South-South", "North-West"],
      maxSteps: 2,
    };
    assert.deepEqual(planScoutRun(input), planScoutRun(input));
    assert.equal(planScoutRun(input).length, 2);
  });
});

describe("scout url + dedupe", () => {
  it("normalizes tracking params and case", () => {
    assert.equal(
      normalizeScoutUrl("https://Example.com/e/1?utm_source=x&gclid=y#frag"),
      "https://example.com/e/1",
    );
    assert.equal(normalizeScoutUrl("ftp://x.com/y"), null);
    assert.equal(normalizeScoutUrl("not a url"), null);
  });

  it("builds stable dedupe keys", () => {
    const a = scoutDedupeKey("DevFest PH 2026", "2026-12-01T09:00:00Z", "Port Harcourt");
    const b = scoutDedupeKey("devfest  ph 2026!", "2026-12-01T18:00:00Z", "port-harcourt");
    assert.equal(a, b);
  });
});

describe("scout scope + dates", () => {
  it("resolves cities and states, fails closed on unknowns", () => {
    assert.deepEqual(resolveScoutState("Uyo", null), { ok: true, state: "Akwa Ibom" });
    assert.deepEqual(resolveScoutState(null, "kano"), { ok: true, state: "Kano" });
    assert.equal(resolveScoutState("Lagos, Louisiana", null).ok, false);
    assert.equal(resolveScoutState(null, null).ok, false);
  });

  it("accepts the natural X State form the model writes", () => {
    assert.deepEqual(resolveScoutState(null, "Cross River State"), { ok: true, state: "Cross River" });
    assert.deepEqual(resolveScoutState(null, "Lagos State"), { ok: true, state: "Lagos" });
    assert.deepEqual(resolveScoutState(null, "Federal Capital Territory"), { ok: true, state: "Federal Capital Territory" });
    assert.equal(resolveScoutState(null, "Atlantis State").ok, false);
  });

  it("rejects provably expired events only", () => {
    assert.equal(checkScoutDates("2026-11-10T00:00:00Z", null, "2026-11-03").ok, true);
    assert.equal(
      checkScoutDates("2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z", "2026-11-03").ok,
      false,
    );
    assert.equal(
      checkScoutDates("2026-09-01T00:00:00Z", null, "2026-11-03").ok,
      false,
    );
    // Missing dates fail open to human review.
    assert.equal(checkScoutDates(null, null, "2026-11-03").ok, true);
  });
});
