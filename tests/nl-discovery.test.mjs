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
} from "../src/showcase/discovery/nl-matching.ts";

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
    city: "port harcourt",
    category: "tech",
    dateFrom: "2026-10-31",
    dateTo: "2026-11-01",
    price: "free",
    keywords: ["developers"],
  };

  test("matches when every constraint holds", () => {
    assert.equal(matchNLQuery(baseEvent, baseFilters), true);
  });

  test("rejects city, category, price, keyword, and date mismatches", () => {
    assert.equal(matchNLQuery(baseEvent, { ...baseFilters, city: "Lagos" }), false);
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
      city: null,
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
        city: "Port Harcourt",
        category: "tech",
        dateFrom: "2026-10-31",
        dateTo: "2026-11-01",
        price: "free",
        keywords: ["developers"],
      }),
      "Free · Tech · Port Harcourt · 31 Oct – 1 Nov · developers",
    );
  });
});
