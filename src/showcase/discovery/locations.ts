/**
 * Canonical Nigerian location source of truth.
 *
 * All 36 states plus the Federal Capital Territory (a territory, not a
 * state). Every location selector, the NL discovery interpretation, and all
 * location matching derive from this module so names stay consistent.
 *
 * Event and profile records carry free-text city strings and have no state
 * column, so matching maps known cities to their states. Unknown places
 * never match by guess: they fall back to exact comparison, which yields
 * honest empty results instead of unrelated events.
 */

export interface NigerianState {
  /** Canonical name, also used as the stored selection value. */
  name: string;
  kind: "state" | "fct";
  capital: string;
  /** Capital plus other major cities, used for state-aware matching. */
  cities: string[];
}

export const NIGERIAN_STATES: NigerianState[] = [
  { name: "Abia", kind: "state", capital: "Umuahia", cities: ["Umuahia", "Aba"] },
  { name: "Adamawa", kind: "state", capital: "Yola", cities: ["Yola", "Mubi"] },
  { name: "Akwa Ibom", kind: "state", capital: "Uyo", cities: ["Uyo", "Eket", "Ikot Ekpene"] },
  { name: "Anambra", kind: "state", capital: "Awka", cities: ["Awka", "Onitsha", "Nnewi"] },
  { name: "Bauchi", kind: "state", capital: "Bauchi", cities: ["Bauchi", "Azare"] },
  { name: "Bayelsa", kind: "state", capital: "Yenagoa", cities: ["Yenagoa", "Brass"] },
  { name: "Benue", kind: "state", capital: "Makurdi", cities: ["Makurdi", "Gboko", "Otukpo"] },
  { name: "Borno", kind: "state", capital: "Maiduguri", cities: ["Maiduguri"] },
  { name: "Cross River", kind: "state", capital: "Calabar", cities: ["Calabar"] },
  { name: "Delta", kind: "state", capital: "Asaba", cities: ["Asaba", "Warri", "Sapele"] },
  { name: "Ebonyi", kind: "state", capital: "Abakaliki", cities: ["Abakaliki", "Afikpo"] },
  { name: "Edo", kind: "state", capital: "Benin City", cities: ["Benin City", "Auchi"] },
  { name: "Ekiti", kind: "state", capital: "Ado Ekiti", cities: ["Ado Ekiti"] },
  { name: "Enugu", kind: "state", capital: "Enugu", cities: ["Enugu", "Nsukka"] },
  { name: "Gombe", kind: "state", capital: "Gombe", cities: ["Gombe"] },
  { name: "Imo", kind: "state", capital: "Owerri", cities: ["Owerri", "Orlu"] },
  { name: "Jigawa", kind: "state", capital: "Dutse", cities: ["Dutse", "Hadejia"] },
  { name: "Kaduna", kind: "state", capital: "Kaduna", cities: ["Kaduna", "Zaria"] },
  { name: "Kano", kind: "state", capital: "Kano", cities: ["Kano"] },
  { name: "Katsina", kind: "state", capital: "Katsina", cities: ["Katsina", "Daura"] },
  { name: "Kebbi", kind: "state", capital: "Birnin Kebbi", cities: ["Birnin Kebbi"] },
  { name: "Kogi", kind: "state", capital: "Lokoja", cities: ["Lokoja", "Okene"] },
  { name: "Kwara", kind: "state", capital: "Ilorin", cities: ["Ilorin", "Offa"] },
  {
    name: "Lagos",
    kind: "state",
    capital: "Ikeja",
    cities: ["Lagos", "Ikeja", "Lekki", "Victoria Island", "Ikoyi"],
  },
  { name: "Nasarawa", kind: "state", capital: "Lafia", cities: ["Lafia", "Keffi"] },
  { name: "Niger", kind: "state", capital: "Minna", cities: ["Minna", "Bida"] },
  { name: "Ogun", kind: "state", capital: "Abeokuta", cities: ["Abeokuta", "Ijebu Ode", "Sagamu"] },
  { name: "Ondo", kind: "state", capital: "Akure", cities: ["Akure", "Ondo", "Owo"] },
  { name: "Osun", kind: "state", capital: "Osogbo", cities: ["Osogbo", "Ile-Ife", "Ilesa"] },
  { name: "Oyo", kind: "state", capital: "Ibadan", cities: ["Ibadan", "Ogbomoso"] },
  { name: "Plateau", kind: "state", capital: "Jos", cities: ["Jos"] },
  { name: "Rivers", kind: "state", capital: "Port Harcourt", cities: ["Port Harcourt"] },
  { name: "Sokoto", kind: "state", capital: "Sokoto", cities: ["Sokoto"] },
  { name: "Taraba", kind: "state", capital: "Jalingo", cities: ["Jalingo"] },
  { name: "Yobe", kind: "state", capital: "Damaturu", cities: ["Damaturu", "Potiskum"] },
  { name: "Zamfara", kind: "state", capital: "Gusau", cities: ["Gusau"] },
  // Territory, not a state: listed separately, never counted among the 36.
  { name: "Federal Capital Territory", kind: "fct", capital: "Abuja", cities: ["Abuja", "Gwagwalada"] },
];

/** States kept easiest to reach: the pre-expansion coverage, as states. */
export const POPULAR_STATE_NAMES = ["Lagos", "Rivers", "Federal Capital Territory", "Oyo"];

/** Common shorthands and variant spellings, each mapped to a canonical place. */
const PLACE_ALIAS_GROUPS: Array<{ name: string; kind: "city" | "state"; spellings: string[] }> = [
  { name: "Port Harcourt", kind: "city", spellings: ["PH", "PH City", "PHC"] },
  { name: "Benin City", kind: "city", spellings: ["Benin"] },
  { name: "Osogbo", kind: "city", spellings: ["Oshogbo"] },
  { name: "Federal Capital Territory", kind: "state", spellings: ["FCT"] },
];

/** Normalized shorthand -> canonical place. Applied symmetrically in matching. */
const PLACE_ALIASES: Record<string, { name: string; kind: "city" | "state" }> =
  Object.fromEntries(
    PLACE_ALIAS_GROUPS.flatMap((group) =>
      group.spellings.map((spelling) => [
        normalizePlace(spelling),
        { name: group.name, kind: group.kind },
      ]),
    ),
  );

/** Case-, space-, and punctuation-insensitive comparison key. */
export function normalizePlace(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const stateByNormalizedName = new Map<string, NigerianState>(
  NIGERIAN_STATES.map((state) => [normalizePlace(state.name), state]),
);

const stateByNormalizedCity = new Map<string, NigerianState>();
for (const state of NIGERIAN_STATES) {
  for (const city of state.cities) {
    const key = normalizePlace(city);
    if (!stateByNormalizedCity.has(key)) stateByNormalizedCity.set(key, state);
  }
}

export function findStateByName(value: string): NigerianState | undefined {
  return stateByNormalizedName.get(normalizePlace(value));
}

export function isKnownStateName(value: string): boolean {
  return stateByNormalizedName.has(normalizePlace(value));
}

/** Canonical state for a known city (aliases included), else undefined. */
export function stateOfCity(city: string): NigerianState | undefined {
  const key = normalizePlace(city);
  const alias = PLACE_ALIASES[key];
  if (alias?.kind === "city") {
    return stateByNormalizedCity.get(normalizePlace(alias.name));
  }
  return stateByNormalizedCity.get(key);
}

export interface ResolvedPlace {
  name: string;
  kind: "city" | "state";
}

/**
 * Resolves a free-text place to its canonical name and kind. State names win
 * over same-named cities ("Enugu" reads as the state: the safe superset that
 * still includes the capital's events). Returns null when unknown.
 */
export function resolvePlace(value: string): ResolvedPlace | null {
  const key = normalizePlace(value);
  if (!key) return null;
  const alias = PLACE_ALIASES[key];
  if (alias) return { ...alias };
  const state = stateByNormalizedName.get(key);
  if (state) return { name: state.name, kind: "state" };
  const cityState = stateByNormalizedCity.get(key);
  if (cityState) {
    const city = cityState.cities.find((entry) => normalizePlace(entry) === key);
    if (city) return { name: city, kind: "city" };
  }
  // Tolerate a trailing "State" ("Rivers State" -> Rivers).
  const withoutStateSuffix = key.replace(/state$/, "");
  if (withoutStateSuffix !== key) {
    const stateBySuffix = stateByNormalizedName.get(withoutStateSuffix);
    if (stateBySuffix) return { name: stateBySuffix.name, kind: "state" };
  }
  return null;
}

/** Short display label for a canonical state name. */
export function shortStateLabel(stateName: string): string {
  const state = findStateByName(stateName);
  if (!state) return stateName.trim();
  return state.kind === "fct" ? "FCT (Abuja)" : state.name;
}

/**
 * Display label for any stored or selected location value. Known states get
 * their short label; legacy city values and anything else pass through
 * unchanged so saved data keeps displaying as before.
 */
export function displayLocationLabel(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (isKnownStateName(trimmed)) return shortStateLabel(trimmed);
  return trimmed;
}

/**
 * True when an event's free-text city satisfies a selected location, which
 * may be a state name or a legacy city value. Exact matches always count
 * (preserving legacy city selections precisely); otherwise a known city
 * matches its state ("Port Harcourt" events match "Rivers"). Unknown places
 * never match by guess.
 */
export function matchLocationSelection(selection: string, eventCity: string): boolean {
  if (normalizePlace(eventCity) === normalizePlace(selection)) return true;
  const eventState = stateOfCity(eventCity);
  if (!eventState) return false;
  return normalizePlace(eventState.name) === normalizePlace(selection);
}

/** True when an event's city belongs to the named state (exact or mapped). */
export function stateMatchesEventCity(stateName: string, eventCity: string): boolean {
  return matchLocationSelection(stateName, eventCity);
}

/** Compact states-and-cities reference for the discovery prompt (single source). */
export function placesPromptReference(): string {
  const lines = NIGERIAN_STATES.map(
    (state) => `${state.name}: ${state.cities.join(", ")}`,
  );
  const aliasLines = PLACE_ALIAS_GROUPS.map(
    (group) =>
      `${group.spellings.map((spelling) => `"${spelling}"`).join(", ")} mean${group.spellings.length > 1 ? "" : "s"} ${group.name}`,
  );
  return [
    "Nigerian states and major cities (state: cities). The FCT is a territory, not a state:",
    ...lines,
    `Common shorthands: ${aliasLines.join("; ")}.`,
  ].join("\n");
}

/** States matching a search string (name, capital, or cities), popular first. */
export function filterStates(query: string): NigerianState[] {
  const needle = normalizePlace(query);
  const popularOrder = new Map(POPULAR_STATE_NAMES.map((name, index) => [normalizePlace(name), index]));
  return NIGERIAN_STATES.filter((state) => {
    if (!needle) return true;
    const haystack = normalizePlace(
      `${state.name} ${state.capital} ${state.cities.join(" ")}`,
    );
    return haystack.includes(needle);
  }).sort((a, b) => {
    const aPopular = popularOrder.get(normalizePlace(a.name)) ?? Number.MAX_SAFE_INTEGER;
    const bPopular = popularOrder.get(normalizePlace(b.name)) ?? Number.MAX_SAFE_INTEGER;
    if (aPopular !== bPopular) return aPopular - bPopular;
    return a.name.localeCompare(b.name);
  });
}
