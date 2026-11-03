// Active-promotion selection, Explore placement, and carousel-logic tests.
//
// These cover the multi-promotion storefront: which promotion rows are live,
// where promoted cards land in Explore, and how the Spotlight carousel
// advances. Pure logic only — no database, no DOM.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  boostPromotedPlacement,
  nextSlideIndex,
  selectActivePromotions,
  shouldAutoplay,
} from "@/showcase/promotions/active-promotions";

const NOW = "2026-11-05T12:00:00.000Z";
const HOUR = 3_600_000;
const at = (offsetMs) => new Date(new Date(NOW).getTime() + offsetMs).toISOString();

function row(id, eventId, startsAt, endsAt, status = "active") {
  return { id, event_id: eventId, starts_at: startsAt, ends_at: endsAt, status };
}

const live = (id, eventId, startOffset = -HOUR, endOffset = HOUR) =>
  row(id, eventId, at(startOffset), at(endOffset));

describe("selectActivePromotions", () => {
  it("returns every live promotion, ending-soonest first", () => {
    const rows = [
      live("p-late", "event-b", -HOUR, 4 * HOUR),
      live("p-early", "event-a", -HOUR, 1 * HOUR),
      live("p-mid", "event-c", -HOUR, 2 * HOUR),
    ];
    const selected = selectActivePromotions(rows, NOW);
    assert.deepEqual(
      selected.map((promotion) => promotion.id),
      ["p-early", "p-mid", "p-late"],
    );
    assert.deepEqual(selected[0], {
      id: "p-early",
      eventId: "event-a",
      startsAt: at(-HOUR),
      endsAt: at(1 * HOUR),
    });
  });

  it("returns a single live promotion as-is", () => {
    const selected = selectActivePromotions([live("p-only", "event-a")], NOW);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].eventId, "event-a");
  });

  it("returns an empty list when nothing is live", () => {
    assert.deepEqual(selectActivePromotions([], NOW), []);
    assert.deepEqual(
      selectActivePromotions(
        [
          row("p-expired", "event-a", at(-3 * HOUR), at(-HOUR)),
          row("p-future", "event-b", at(HOUR), at(2 * HOUR)),
          row("p-cancelled", "event-c", at(-HOUR), at(HOUR), "cancelled"),
        ],
        NOW,
      ),
      [],
    );
  });

  it("honors the '[)' window bounds at the exact instants", () => {
    // Starts exactly now: live. Ends exactly now: already expired.
    const selected = selectActivePromotions(
      [
        row("p-start-edge", "event-a", NOW, at(HOUR)),
        row("p-end-edge", "event-b", at(-HOUR), NOW),
      ],
      NOW,
    );
    assert.deepEqual(
      selected.map((promotion) => promotion.id),
      ["p-start-edge"],
    );
  });

  it("keeps one window per event, preferring the earliest end", () => {
    const selected = selectActivePromotions(
      [
        live("p-long", "event-a", -HOUR, 6 * HOUR),
        live("p-short", "event-a", -HOUR, 2 * HOUR),
        live("p-other", "event-b", -HOUR, 3 * HOUR),
      ],
      NOW,
    );
    assert.deepEqual(
      selected.map((promotion) => promotion.id),
      ["p-short", "p-other"],
    );
  });

  it("respects the display limit", () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      live(`p-${index}`, `event-${index}`, -HOUR, (index + 1) * HOUR),
    );
    const selected = selectActivePromotions(rows, NOW, 3);
    assert.deepEqual(
      selected.map((promotion) => promotion.id),
      ["p-0", "p-1", "p-2"],
    );
  });

  it("drops rows with unreadable windows instead of crashing", () => {
    const selected = selectActivePromotions(
      [row("p-broken", "event-a", "not-a-date", "also-not-a-date"), live("p-ok", "event-b")],
      NOW,
    );
    assert.deepEqual(
      selected.map((promotion) => promotion.id),
      ["p-ok"],
    );
  });
});

describe("boostPromotedPlacement", () => {
  const ids = (feed) => feed.map((slot) => slot.item.id);
  const flags = (feed) => feed.map((slot) => (slot.promoted ? "P" : "o"));

  it("tags promoted cards in place and never repeats or drops", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const feed = boostPromotedPlacement(items, (item) => item.id === "b");
    assert.deepEqual(ids(feed), ["a", "b", "c", "d"]);
    assert.deepEqual(flags(feed), ["o", "P", "o", "o"]);
  });

  it("moves one late promotion into the early slot", () => {
    const items = Array.from({ length: 10 }, (_, index) => ({ id: `e-${index}` }));
    const feed = boostPromotedPlacement(items, (item) => item.id === "e-8");
    assert.deepEqual(ids(feed).slice(0, 5), ["e-0", "e-1", "e-2", "e-8", "e-3"]);
    assert.equal(feed[3].promoted, true);
    assert.equal(ids(feed).length, 10);
  });

  it("leaves the feed alone when a promotion already shows early", () => {
    const items = Array.from({ length: 10 }, (_, index) => ({ id: `e-${index}` }));
    const feed = boostPromotedPlacement(items, (item) => item.id === "e-1");
    assert.deepEqual(ids(feed), items.map((item) => item.id));
    assert.equal(feed[1].promoted, true);
  });

  it("fills a second slot deeper in long feeds", () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ id: `e-${index}` }));
    const feed = boostPromotedPlacement(
      items,
      (item) => item.id === "e-17" || item.id === "e-18",
    );
    assert.equal(feed[3].item.id, "e-17");
    assert.equal(feed[3].promoted, true);
    assert.equal(feed[11].item.id, "e-18");
    assert.equal(feed[11].promoted, true);
  });

  it("never creates consecutive promoted cards", () => {
    const items = Array.from({ length: 12 }, (_, index) => ({ id: `e-${index}` }));
    const feed = boostPromotedPlacement(
      items,
      (item) => ["e-2", "e-9"].includes(item.id),
    );
    // e-2 already neighbors the early slot, so e-9 must not move next to it.
    assert.deepEqual(ids(feed), items.map((item) => item.id));
    for (let index = 1; index < feed.length; index += 1) {
      assert.ok(
        !(feed[index].promoted && feed[index - 1].promoted),
        `consecutive promoted at ${index - 1}/${index}`,
      );
    }
  });

  it("handles empty and tiny feeds without crashing", () => {
    assert.deepEqual(boostPromotedPlacement([], () => true), []);
    const single = boostPromotedPlacement([{ id: "solo" }], () => true);
    assert.deepEqual(ids(single), ["solo"]);
    assert.equal(single[0].promoted, true);
  });
});

describe("nextSlideIndex", () => {
  it("wraps forward and backward", () => {
    assert.equal(nextSlideIndex(0, 3, 1), 1);
    assert.equal(nextSlideIndex(2, 3, 1), 0);
    assert.equal(nextSlideIndex(0, 3, -1), 2);
  });

  it("stays put with zero or one slide", () => {
    assert.equal(nextSlideIndex(0, 1, 1), 0);
    assert.equal(nextSlideIndex(0, 0, 1), 0);
  });
});

describe("shouldAutoplay", () => {
  it("plays only with several slides, motion allowed, and no pause", () => {
    assert.equal(
      shouldAutoplay(3, { reducedMotion: false, paused: false }),
      true,
    );
    assert.equal(
      shouldAutoplay(1, { reducedMotion: false, paused: false }),
      false,
    );
    assert.equal(
      shouldAutoplay(3, { reducedMotion: true, paused: false }),
      false,
    );
    assert.equal(
      shouldAutoplay(3, { reducedMotion: false, paused: true }),
      false,
    );
  });
});
