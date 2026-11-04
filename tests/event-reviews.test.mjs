import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { averageRating, REVIEW_BODY_MAX, validateReview } from "@/showcase/reviews/event-reviews";

const EVENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("review validation", () => {
  it("accepts a rating with an optional body", () => {
    const rated = validateReview({ eventId: EVENT_ID, rating: 5, body: "  Loved it  " });
    assert.equal(rated.ok, true);
    if (rated.ok) {
      assert.equal(rated.value.rating, 5);
      assert.equal(rated.value.body, "Loved it");
    }
    const silent = validateReview({ eventId: EVENT_ID, rating: 3, body: "" });
    assert.equal(silent.ok, true);
  });

  it("rejects missing ratings, long bodies, and bad event ids", () => {
    const noRating = validateReview({ eventId: EVENT_ID, rating: 0, body: "" });
    assert.equal(noRating.ok, false);
    if (!noRating.ok) assert.match(noRating.error, /rating/i);

    const tooHigh = validateReview({ eventId: EVENT_ID, rating: 6, body: "" });
    assert.equal(tooHigh.ok, false);

    const tooLong = validateReview({ eventId: EVENT_ID, rating: 4, body: "x".repeat(REVIEW_BODY_MAX + 1) });
    assert.equal(tooLong.ok, false);
    if (!tooLong.ok) assert.match(tooLong.error, new RegExp(String(REVIEW_BODY_MAX)));

    const badEvent = validateReview({ eventId: "not-a-uuid", rating: 4, body: "" });
    assert.equal(badEvent.ok, false);
  });
});

describe("average rating", () => {
  it("returns null without reviews and one decimal otherwise", () => {
    assert.equal(averageRating([]), null);
    assert.equal(averageRating([5]), 5);
    assert.equal(averageRating([5, 4]), 4.5);
    assert.equal(averageRating([5, 5, 4]), 4.7);
  });
});
