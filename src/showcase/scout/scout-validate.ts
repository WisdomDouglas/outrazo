// Scout deterministic validation (pure module: no secrets, no network,
// no database).
//
// Every gate here is code, never the model: URL normalization, dedupe keys,
// expiry checks, and scope checks. Uncertain matches are flagged for humans,
// never auto-merged.
import { z } from "zod";

import {
  findStateByName,
  NIGERIAN_STATES,
  normalizePlace,
  stateOfCity,
} from "@/showcase/discovery/locations";

/** Canonical URL for dedupe: lowercase host, no tracking params, no hash. */
export function normalizeScoutUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";
  const drop = new Set([
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
    "aff",
  ]);
  const kept = new URLSearchParams();
  for (const [key, value] of parsed.searchParams) {
    if (!drop.has(key.toLowerCase())) kept.append(key, value);
  }
  parsed.search = kept.toString();
  return parsed.toString();
}

/** Dedupe key: normalized title + event day + normalized city. */
export function scoutDedupeKey(title: string, startsAt: string | null, city: string | null): string {
  const day = startsAt ? startsAt.slice(0, 10) : "nodate";
  return [normalizePlace(title), day, city ? normalizePlace(city) : "nocity"].join("|");
}

export type ScopeVerdict =
  | { ok: true; state: string }
  | { ok: false; reason: string };

/**
 * Resolves a discovery's city/state to a canonical Nigerian state.
 * Unknown places fail closed: the discovery is auto-rejected for humans to
 * review in the rejections list. Accepts the natural "X State" form the
 * model writes ("Cross River State") as well as the bare name.
 */
export function resolveScoutState(
  city: string | null,
  state: string | null,
): ScopeVerdict {
  if (state) {
    const found = findStateByName(state) ?? findStateByName(state.replace(/\s+state$/i, ""));
    if (found) return { ok: true, state: found.name };
    return { ok: false, reason: `Unrecognized state "${state}".` };
  }
  if (city) {
    const found = stateOfCity(city);
    if (found) return { ok: true, state: found.name };
    return { ok: false, reason: `City "${city}" is not a known Nigerian city.` };
  }
  return { ok: false, reason: "No city or state supplied." };
}

export function isKnownScoutState(value: string): boolean {
  return NIGERIAN_STATES.some((state) => normalizePlace(state.name) === normalizePlace(value));
}

export type DateVerdict =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Expiry gate against "today" (UTC day). Unparseable or missing end dates
 * fail OPEN to human review (auto_reject only what is provably expired);
 * provably past events are rejected deterministically.
 */
export function checkScoutDates(
  startsAt: string | null,
  endsAt: string | null,
  todayIso: string,
): DateVerdict {
  const today = todayIso.slice(0, 10);
  const endDay = endsAt ? Date.parse(endsAt) : Number.NaN;
  if (!Number.isNaN(endDay)) {
    const end = new Date(endDay).toISOString().slice(0, 10);
    if (end < today) return { ok: false, reason: `Ended ${end} (before ${today}).` };
    return { ok: true };
  }
  const startDay = startsAt ? Date.parse(startsAt) : Number.NaN;
  if (!Number.isNaN(startDay)) {
    const start = new Date(startDay).toISOString().slice(0, 10);
    // A start more than a day past with no end date is provably expired.
    const startDate = new Date(`${start}T00:00:00.000Z`).getTime();
    const todayDate = new Date(`${today}T00:00:00.000Z`).getTime();
    if (startDate < todayDate - 86_400_000) {
      return { ok: false, reason: `Started ${start} with no end date.` };
    }
  }
  return { ok: true };
}

export const scoutScopeSchema = z.object({
  mode: z.enum(["nationwide", "zones", "states", "cities"]),
  zones: z.array(z.string().max(40)).max(6),
  states: z.array(z.string().max(60)).max(37),
  cities: z.array(z.string().max(80)).max(20),
});

export type ScoutScopeInput = z.infer<typeof scoutScopeSchema>;
