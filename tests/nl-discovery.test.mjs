// Maintained regression checks for NL discovery interpretation helpers.
// Run: npm test
// Uses only Node builtins (node:test, node:assert). Plain JS on purpose so
// the test itself needs no compilation; sources under test are real TS.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveDateBounds } from "../src/showcase/discovery/interpretDiscoveryQuery.ts";
import {
  describeChatPayload,
  describeNLFilters,
  eventDayInLagos,
  extractChatContent,
  isRealCalendarDate,
  lagosWeekday,
  matchNLQuery,
  nlLocationLabel,
} from "../src/showcase/discovery/nl-matching.ts";
import {
  displayLocationLabel,
  filterStates,
  isKnownStateName,
  matchLocationSelection,
  NIGERIAN_STATES,
  POPULAR_STATE_NAMES,
  resolvePlace,
  stateOfCity,
} from "../src/showcase/discovery/locations.ts";

// 2026-10-27 is a Tuesday (Africa/Lagos has no daylight saving, so fixed
// offsets below are exact, not approximations).
const TUE_NOON_UTC = new Date("2026-10-27T12:00:00Z");

describe("Lagos date helpers", () => {
  test("weekday of a known Tuesday", () => {
    assert.equal(lagosWeekday(TUE_NOON_UTC), 2);
  });

  test("event instants map to Lagos calendar days", () => {
    // 23:30 UTC is 00:30 the next day in Lagos.
    assert.equal(eventDayInLagos("2026-10-31T23:30:00Z"), "2026-11-01");
    assert.equal(eventDayInLagos("2026-10-31T10:00:00Z"), "2026-10-31");
    assert.equal(eventDayInLagos("not-a-date"), null);
    assert.equal(eventDayInLagos(""), null);
  });

  test("calendar-date validation rejects impossible dates", () => {
    assert.equal(isRealCalendarDate("2026-10-27"), true);
    assert.equal(isRealCalendarDate("2026-02-30"), false);
    assert.equal(isRealCalendarDate("10/27/2026"), false);
  });
});

describe("resolveDateBounds", () => {
  test("this_weekend from a Tuesday is Sat-Sun", () => {
    assert.deepEqual(resolveDateBounds("this_weekend", "", "", TUE_NOON_UTC), {
      from: "2026-10-31",
      to: "2026-11-01",
    });
  });

  test("this_weekend on a Sunday stays in the current weekend", () => {
    assert.deepEqual(
      resolveDateBounds("this_weekend", "", "", new Date("2026-11-01T12:00:00Z")),
      { from: "2026-10-31", to: "2026-11-01" },
    );
  });

  test("explicit dates win; reversed pairs fall back to the preset", () => {
    assert.deepEqual(resolveDateBounds("any", "2026-12-25", "2026-12-26", TUE_NOON_UTC), {
      from: "2026-12-25",
      to: "2026-12-26",
    });
    assert.deepEqual(resolveDateBounds("today", "2026-12-26", "2026-12-25", TUE_NOON_UTC), {
      from: "2026-10-27",
      to: "2026-10-27",
    });
  });
});

describe("extractChatContent", () => {
  test("accepts plain string content", () => {
    assert.deepEqual(
      extractChatContent({ choices: [{ message: { content: '{"a":1}' }, finish_reason: "stop" }] }),
      { ok: true, content: '{"a":1}' },
    );
  });

  test("joins array content parts", () => {
    assert.deepEqual(
      extractChatContent({
        choices: [
          {
            message: { content: [{ type: "text", text: '{"a":' }, { type: "text", text: "1}" }] },
            finish_reason: "stop",
          },
        ],
      }),
      { ok: true, content: '{"a":1}' },
    );
  });

  test("classifies empty choices", () => {
    assert.deepEqual(extractChatContent({ choices: [] }), { ok: false, reason: "no_choices" });
    assert.deepEqual(extractChatContent({}), { ok: false, reason: "no_choices" });
  });

  test("classifies null or blank content", () => {
    assert.deepEqual(
      extractChatContent({ choices: [{ message: { content: null }, finish_reason: "stop" }] }),
      { ok: false, reason: "empty_content" },
    );
    assert.deepEqual(
      extractChatContent({ choices: [{ message: { content: "   " }, finish_reason: "stop" }] }),
      { ok: false, reason: "empty_content" },
    );
  });

  test("classifies length cutoffs and refusals", () => {
    assert.deepEqual(
      extractChatContent({ choices: [{ message: { content: null }, finish_reason: "length" }] }),
      { ok: false, reason: "length_cutoff" },
    );
    assert.deepEqual(
      extractChatContent({
        choices: [{ message: { content: null, refusal: "no" }, finish_reason: "stop" }],
      }),
      { ok: false, reason: "refusal" },
    );
  });
});

describe("matchNLQuery", () => {
  const baseEvent = {
    id: "x",
    title: "Port Harcourt Developers Meetup",
    imageSrc: "",
    date: "",
    startsAt: "2026-10-31T10:00:00Z",
    location: "GRA, Port Harcourt",
    city: "Port Harcourt",
    organizerId: "nocturne",
    category: "tech",
    attendeeCount: 0,
    attendeeIds: [],
    summary: "Monthly gathering",
    description: "A welcoming evening for developers and builders.",
  };
  const baseFilters = {
    location: "Port Harcourt",
    locationKind: "city",
    category: "tech",
    dateFrom: "2026-10-31",
    dateTo: "2026-11-01",
    price: "free",
    keywords: ["developers"],
  };

  test("matches when every constraint holds", () => {
    assert.equal(matchNLQuery(baseEvent, baseFilters), true);
  });

  test("rejects location, category, price, keyword, and date mismatches", () => {
    assert.equal(matchNLQuery(baseEvent, { ...baseFilters, location: "Lagos" }), false);
    assert.equal(matchNLQuery(baseEvent, { ...baseFilters, category: "music" }), false);
    assert.equal(matchNLQuery({ ...baseEvent, price: "₦1000" }, baseFilters), false);
    assert.equal(
      matchNLQuery({ ...baseEvent, price: "₦1000" }, { ...baseFilters, price: "paid" }),
      true,
    );
    assert.equal(matchNLQuery(baseEvent, { ...baseFilters, keywords: ["yoga"] }), false);
    assert.equal(
      matchNLQuery(baseEvent, { ...baseFilters, dateFrom: "2026-11-05", dateTo: "2026-11-06" }),
      false,
    );
  });

  test("all-any filters match everything; bad bounds are ignored", () => {
    const any = {
      location: null,
      locationKind: "city",
      category: "any",
      dateFrom: null,
      dateTo: null,
      price: "any",
      keywords: [],
    };
    assert.equal(matchNLQuery(baseEvent, any), true);
    assert.equal(
      matchNLQuery(baseEvent, { ...baseFilters, dateFrom: "nonsense", dateTo: "2026-11-01" }),
      true,
    );
    assert.equal(matchNLQuery({ ...baseEvent, startsAt: "junk" }, baseFilters), false);
  });
});

describe("describeChatPayload", () => {
  test("summarizes shapes without leaking text", () => {
    assert.deepEqual(describeChatPayload({ choices: [] }), {
      choiceCount: 0,
      finishReason: null,
      contentKind: "missing",
      contentLength: 0,
    });
    assert.deepEqual(
      describeChatPayload({
        choices: [{ message: { content: "secret text" }, finish_reason: "length" }],
      }),
      { choiceCount: 1, finishReason: "length", contentKind: "string", contentLength: 11 },
    );
    const summary = JSON.stringify(
      describeChatPayload({ choices: [{ message: { content: "secret text" } }] }),
    );
    assert.equal(summary.includes("secret"), false);
  });
});

describe("describeNLFilters", () => {
  test("composes a one-line summary", () => {
    assert.equal(
      describeNLFilters({
        location: "Port Harcourt",
        locationKind: "city",
        category: "tech",
        dateFrom: "2026-10-31",
        dateTo: "2026-11-01",
        price: "free",
        keywords: ["developers"],
      }),
      "Free · Tech · Location: Port Harcourt, Nigeria · 31 Oct – 1 Nov · developers",
    );
  });
});

describe("Nigerian locations source", () => {
  test("covers 36 states plus the FCT", () => {
    assert.equal(NIGERIAN_STATES.length, 37);
    assert.equal(NIGERIAN_STATES.filter((state) => state.kind === "state").length, 36);
    assert.equal(NIGERIAN_STATES.filter((state) => state.kind === "fct").length, 1);
    const names = NIGERIAN_STATES.map((state) => state.name);
    assert.equal(new Set(names).size, names.length);
    for (const state of NIGERIAN_STATES) {
      assert.ok(state.capital, `${state.name} has a capital`);
      assert.ok(state.cities.length > 0, `${state.name} lists cities`);
      assert.ok(state.cities.includes(state.capital), `${state.name} lists its capital`);
    }
  });

  test("popular states stay discoverable and valid", () => {
    assert.deepEqual(POPULAR_STATE_NAMES, ["Lagos", "Rivers", "Federal Capital Territory", "Oyo"]);
    for (const name of POPULAR_STATE_NAMES) {
      assert.ok(isKnownStateName(name), `${name} is known`);
    }
  });

  test("resolvePlace canonicalizes cities, states, and shorthands", () => {
    assert.deepEqual(resolvePlace("Lagos"), { name: "Lagos", kind: "state" });
    assert.deepEqual(resolvePlace("Port Harcourt"), { name: "Port Harcourt", kind: "city" });
    assert.deepEqual(resolvePlace("PH"), { name: "Port Harcourt", kind: "city" });
    assert.deepEqual(resolvePlace("Rivers State"), { name: "Rivers", kind: "state" });
    assert.deepEqual(resolvePlace("FCT"), { name: "Federal Capital Territory", kind: "state" });
    assert.deepEqual(resolvePlace("Enugu"), { name: "Enugu", kind: "state" });
    assert.deepEqual(resolvePlace("Ibadan"), { name: "Ibadan", kind: "city" });
    assert.deepEqual(resolvePlace("Ado-Ekiti"), { name: "Ado Ekiti", kind: "city" });
    assert.equal(resolvePlace("Paris"), null);
    assert.equal(resolvePlace(""), null);
  });

  test("stateOfCity maps known cities only", () => {
    assert.equal(stateOfCity("Ikeja")?.name, "Lagos");
    assert.equal(stateOfCity("Nsukka")?.name, "Enugu");
    assert.equal(stateOfCity("Port Harcourt")?.name, "Rivers");
    assert.equal(stateOfCity("Unknownville"), undefined);
  });

  test("matchLocationSelection keeps legacy cities precise and states wide", () => {
    assert.equal(matchLocationSelection("Port Harcourt", "Port Harcourt"), true);
    assert.equal(matchLocationSelection("Port Harcourt", "Aba"), false);
    assert.equal(matchLocationSelection("Rivers", "Port Harcourt"), true);
    assert.equal(matchLocationSelection("Rivers", "Aba"), false);
    assert.equal(matchLocationSelection("Lagos", "Ikeja"), true);
    assert.equal(matchLocationSelection("Lagos", "Kano"), false);
    assert.equal(matchLocationSelection("Oyo", "Ibadan"), true);
    assert.equal(matchLocationSelection("Ibadan", "Ogbomoso"), false);
    assert.equal(matchLocationSelection("lagos", "LAGOS"), true);
    assert.equal(matchLocationSelection("Federal Capital Territory", "Abuja"), true);
  });

  test("display labels keep legacy values and shorten the FCT", () => {
    assert.equal(displayLocationLabel("Federal Capital Territory"), "FCT (Abuja)");
    assert.equal(displayLocationLabel("Rivers"), "Rivers");
    assert.equal(displayLocationLabel("Port Harcourt"), "Port Harcourt");
    assert.equal(displayLocationLabel(null), "");
  });

  test("filterStates searches names, capitals, and cities", () => {
    const all = filterStates("");
    assert.equal(all.length, 37);
    assert.equal(all[0].name, "Lagos");
    assert.ok(filterStates("lag").some((state) => state.name === "Lagos"));
    assert.ok(filterStates("aba").some((state) => state.name === "Abia"));
    assert.equal(filterStates("xyz-no-such-place").length, 0);
  });
});

describe("NL state-aware locations", () => {
  const makeEvent = (city) => ({
    id: "x",
    title: "E",
    imageSrc: "",
    date: "",
    startsAt: "2026-10-31T10:00:00Z",
    location: city,
    city,
    organizerId: "nocturne",
    category: "tech",
    attendeeCount: 0,
    attendeeIds: [],
  });
  const filtersFor = (location, locationKind) => ({
    location,
    locationKind,
    category: "any",
    dateFrom: null,
    dateTo: null,
    price: "any",
    keywords: [],
  });

  test("state kind matches every mapped city in the state", () => {
    assert.equal(matchNLQuery(makeEvent("Port Harcourt"), filtersFor("Rivers", "state")), true);
    assert.equal(matchNLQuery(makeEvent("Nsukka"), filtersFor("Enugu", "state")), true);
    assert.equal(matchNLQuery(makeEvent("Aba"), filtersFor("Rivers", "state")), false);
  });

  test("city kind matches exactly and case-insensitively", () => {
    assert.equal(
      matchNLQuery(makeEvent("Port Harcourt"), filtersFor("port harcourt", "city")),
      true,
    );
    assert.equal(matchNLQuery(makeEvent("Nsukka"), filtersFor("Enugu", "city")), false);
  });

  test("unknown places match nothing instead of guessing", () => {
    assert.equal(matchNLQuery(makeEvent("Lagos"), filtersFor("Paris", "city")), false);
    assert.equal(matchNLQuery(makeEvent("Lagos"), filtersFor("Atlantis", "state")), false);
  });

  test("location labels name the place for badges and empty states", () => {
    assert.equal(nlLocationLabel(filtersFor("Port Harcourt", "city")), "Port Harcourt");
    assert.equal(nlLocationLabel(filtersFor("Rivers", "state")), "Rivers");
    assert.equal(nlLocationLabel(filtersFor("Federal Capital Territory", "state")), "FCT (Abuja)");
    assert.equal(nlLocationLabel(filtersFor(null, "city")), null);
    assert.equal(describeNLFilters(filtersFor("Rivers", "state")), "Location: Rivers, Nigeria");
  });
});
