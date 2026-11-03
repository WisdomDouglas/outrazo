// Scout geography + search planner (pure module: no secrets, no network,
// no database).
//
// Nigeria's 36 states + FCT grouped into the six geopolitical zones, each
// with an anchor city for user_location. The planner turns an admin's scope
// choice into a bounded, ordered step list: Tier A (one nationwide sweep),
// Tier B (two rotating zones), Tier C (explicit state/city follow-ups).
// Cities are never searched independently unless the admin names them.
import { NIGERIAN_STATES } from "@/showcase/discovery/locations";

export interface GeoZone {
  name: string;
  anchorCity: string;
  states: string[];
}

export const GEO_ZONES: GeoZone[] = [
  {
    name: "North-Central",
    anchorCity: "Abuja",
    states: ["Benue", "Kogi", "Kwara", "Nasarawa", "Niger", "Plateau", "Federal Capital Territory"],
  },
  {
    name: "North-East",
    anchorCity: "Maiduguri",
    states: ["Adamawa", "Bauchi", "Borno", "Gombe", "Taraba", "Yobe"],
  },
  {
    name: "North-West",
    anchorCity: "Kano",
    states: ["Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Sokoto", "Zamfara"],
  },
  {
    name: "South-East",
    anchorCity: "Enugu",
    states: ["Abia", "Anambra", "Ebonyi", "Enugu", "Imo"],
  },
  {
    name: "South-South",
    anchorCity: "Port Harcourt",
    states: ["Akwa Ibom", "Bayelsa", "Cross River", "Delta", "Edo", "Rivers"],
  },
  {
    name: "South-West",
    anchorCity: "Lagos",
    states: ["Ekiti", "Lagos", "Ogun", "Ondo", "Osun", "Oyo"],
  },
];

/** Every canonical state appears in exactly one zone. */
export function zoneOfState(stateName: string): GeoZone | undefined {
  return GEO_ZONES.find((zone) => zone.states.includes(stateName));
}

export function allCoverageNames(): string[] {
  return NIGERIAN_STATES.map((state) => state.name);
}

export interface ScoutScope {
  mode: "nationwide" | "zones" | "states" | "cities";
  zones: string[];
  states: string[];
  cities: string[];
}

export interface PlannedStep {
  tier: "A" | "B" | "C";
  label: string;
  query: string;
  city: string | null;
  /** States this step explicitly targets (coverage ledger). */
  states: string[];
}

export interface PlanInput {
  scope: ScoutScope;
  categories: string[];
  /** Zone names ordered least-recently-targeted first (from ledger). */
  zoneRotation: string[];
  maxSteps: number;
}

function categoryPhrase(categories: string[]): string {
  if (categories.length === 0) return "events";
  if (categories.length === 1) return `${categories[0]} events`;
  return `${categories.slice(0, 3).join(", ")} events`;
}

/**
 * Builds the ordered request plan. Pure and deterministic: the same input
 * always yields the same steps, so the UI can preview the exact plan (and
 * its budget) before the admin starts the run.
 */
export function planScoutRun(input: PlanInput): PlannedStep[] {
  const steps: PlannedStep[] = [];
  const phrase = categoryPhrase(input.categories);
  const push = (step: PlannedStep): void => {
    if (steps.length < input.maxSteps) steps.push(step);
  };

  if (input.scope.mode === "cities" && input.scope.cities.length > 0) {
    for (const city of input.scope.cities) {
      push({
        tier: "C",
        label: `Targeted: ${city}`,
        query: `Upcoming ${phrase} in ${city}, Nigeria.`,
        city,
        states: [],
      });
    }
    return steps;
  }

  if (input.scope.mode === "states" && input.scope.states.length > 0) {
    for (const state of input.scope.states) {
      const zone = zoneOfState(state);
      push({
        tier: "C",
        label: `Targeted: ${state} State`,
        query: `Upcoming ${phrase} in ${state} State, Nigeria.`,
        city: zone?.anchorCity ?? null,
        states: [state],
      });
    }
    return steps;
  }

  const zones =
    input.scope.mode === "zones" && input.scope.zones.length > 0
      ? input.scope.zones
      : input.zoneRotation;
  if (input.scope.mode === "nationwide" || zones.length === 0) {
    push({
      tier: "A",
      label: "Nationwide sweep",
      query: `Upcoming ${phrase} across Nigeria.`,
      city: null,
      states: [],
    });
  }
  // Tier B: two rotating zones per run, bounded by maxSteps.
  for (const zoneName of zones.slice(0, 2)) {
    const zone = GEO_ZONES.find((candidate) => candidate.name === zoneName);
    if (!zone) continue;
    push({
      tier: "B",
      label: `Zone: ${zone.name}`,
      query: `Upcoming ${phrase} in ${zone.states.join(", ")}, Nigeria.`,
      city: zone.anchorCity,
      states: [...zone.states],
    });
  }
  return steps;
}

/**
 * Coverage mark earned by one finished search step. Tier C state picks earn
 * 'targeted'; Tier B zone sweeps earn 'zone_only' for every member state
 * (never 'targeted'). Tier A marks nothing here; extraction may later mark
 * resolved states 'nationwide_only'.
 */
export function coverageForStep(tier: string, label: string): { states: string[]; status: string } {
  if (tier === "B" && label.startsWith("Zone: ")) {
    const zone = GEO_ZONES.find((candidate) => candidate.name === label.slice("Zone: ".length));
    return { states: zone ? [...zone.states] : [], status: "zone_only" };
  }
  if (tier === "C" && label.startsWith("Targeted: ") && label.endsWith(" State")) {
    return { states: [label.slice("Targeted: ".length, -" State".length)], status: "targeted" };
  }
  return { states: [], status: "unsearched" };
}
