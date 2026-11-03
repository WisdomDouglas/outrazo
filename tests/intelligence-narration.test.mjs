// Admin Intelligence narration-contract tests (Phase 1). The prompts,
// output schemas, and small-data rules that keep AI text grounded in
// verified aggregates. Pure logic only — no network, no secrets.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildBriefFigures,
  buildFiguresBlock,
  buildGroundedInstruction,
  categoryObservationsSchema,
  describeNarrationPayload,
  eventSummarySchema,
  extractNarrationContent,
  platformBriefSchema,
  shouldRetryNarration,
  significantChange,
} from "@/showcase/admin/intelligence-narration";

describe("grounded narration contracts", () => {
  it("instructs the model to use only the verified figures", () => {
    const instruction = buildGroundedInstruction("Summarize this event.");
    assert.ok(instruction.includes("Summarize this event."));
    assert.ok(instruction.includes("ONLY"));
    assert.ok(instruction.includes("insufficient"));
    assert.ok(instruction.includes("JSON only"));
  });

  it("serializes figures verbatim into the prompt block", () => {
    const block = buildFiguresBlock({ rsvps: 6, fillPct: null });
    assert.ok(block.includes('"rsvps":6'));
    assert.ok(block.includes('"fillPct":null'));
  });

  it("validates AI outputs with strict bounds", () => {
    assert.ok(
      eventSummarySchema.safeParse({ summary: "Steady.", takeaways: ["A", "B"] }).success,
    );
    // Empty lists are honest at small scale; empty strings are not.
    assert.ok(eventSummarySchema.safeParse({ summary: "Thin data.", takeaways: [] }).success);
    assert.ok(
      platformBriefSchema.safeParse({ headline: "Calm week.", highlights: [] }).success,
    );
    assert.ok(categoryObservationsSchema.safeParse({ observations: [] }).success);
    assert.equal(
      eventSummarySchema.safeParse({ summary: "", takeaways: [] }).success,
      false,
    );
    assert.equal(
      eventSummarySchema.safeParse({ summary: "x".repeat(601), takeaways: [] }).success,
      false,
    );
    assert.equal(
      eventSummarySchema.safeParse({ summary: "Ok.", takeaways: ["", "B"] }).success,
      false,
    );
    assert.equal(
      eventSummarySchema.safeParse({ summary: "Ok.", takeaways: ["1", "2", "3", "4", "5"] })
        .success,
      false,
    );
    assert.equal(
      platformBriefSchema.safeParse({ headline: "", highlights: [] }).success,
      false,
    );
    assert.equal(
      categoryObservationsSchema.safeParse({ observations: ["x".repeat(201)] }).success,
      false,
    );
  });
});

describe("extractNarrationContent", () => {
  const choice = (message, finishReason = "stop") => ({
    choices: [{ message, finish_reason: finishReason }],
  });

  it("resolves string and content-block text", () => {
    assert.deepEqual(extractNarrationContent(choice({ content: '{"a":1}' })), {
      ok: true,
      content: '{"a":1}',
    });
    assert.deepEqual(
      extractNarrationContent(choice({ content: ["{", { text: '"a":1' }, "}"] })),
      { ok: true, content: '{"a":1}' },
    );
  });

  it("classifies every degenerate outcome distinctly", () => {
    assert.deepEqual(extractNarrationContent(choice({ content: "" })), {
      ok: false,
      reason: "empty_content",
    });
    assert.deepEqual(extractNarrationContent(choice({ content: "   " })), {
      ok: false,
      reason: "empty_content",
    });
    assert.deepEqual(extractNarrationContent({ choices: [] }), {
      ok: false,
      reason: "no_choices",
    });
    assert.deepEqual(extractNarrationContent({}), { ok: false, reason: "no_choices" });
    assert.deepEqual(extractNarrationContent(null), { ok: false, reason: "no_choices" });
    assert.deepEqual(
      extractNarrationContent(choice({ content: "", refusal: "no" })),
      { ok: false, reason: "refusal" },
    );
    assert.deepEqual(
      extractNarrationContent(choice({ content: "" }, "length")),
      { ok: false, reason: "length_cutoff" },
    );
    assert.deepEqual(
      extractNarrationContent(choice({ content: { unexpected: true } })),
      { ok: false, reason: "empty_content" },
    );
  });
});

describe("describeNarrationPayload", () => {
  it("reports shapes and sizes without leaking model text", () => {
    const diagnosis = describeNarrationPayload({
      choices: [{ message: { content: "SECRET-MODEL-TEXT" }, finish_reason: "stop" }],
    });
    assert.deepEqual(diagnosis, {
      choiceCount: 1,
      finishReason: "stop",
      contentKind: "string",
      contentLength: 17,
    });
    assert.ok(!JSON.stringify(diagnosis).includes("SECRET-MODEL-TEXT"));
    assert.deepEqual(describeNarrationPayload({ choices: [] }), {
      choiceCount: 0,
      finishReason: null,
      contentKind: "missing",
      contentLength: 0,
    });
  });
});

describe("buildBriefFigures", () => {
  const section = (total, counts) => ({
    total,
    series: { points: counts.map((count, index) => ({ date: `2026-11-0${index + 1}`, count })), truncated: false },
  });

  it("compacts series into verified facts without raw points", () => {
    const figures = buildBriefFigures(
      {
        windowDays: 30,
        generatedAt: "2026-11-05T12:00:00.000Z",
        events: { ...section(3, [1, 0, 2]), published: 2, upcoming: 1 },
        rsvps: section(6, [2, 2, 2]),
        users: section(10, [5, 5, 0]),
        organizers: null,
      },
      [{ metric: "users", current: 5, previous: 5, delta: 0, pct: 0 }],
    );
    assert.equal(figures.windowDays, 30);
    assert.deepEqual(figures.events, { total: 3, published: 2, upcoming: 1, newInWindow: 3 });
    assert.deepEqual(figures.rsvps, { total: 6, newInWindow: 6 });
    assert.deepEqual(figures.users, { total: 10, newInWindow: 10 });
    assert.equal(figures.organizers, null);
    assert.deepEqual(figures.changes, [{ metric: "users", current: 5, previous: 5, delta: 0, pct: 0 }]);
    assert.ok(!JSON.stringify(figures).includes("points"));
  });
});

describe("shouldRetryNarration", () => {
  it("retries degenerate output once, never refusals or repeats", () => {
    for (const reason of ["length_cutoff", "empty_content", "no_choices", "invalid_json"]) {
      assert.equal(shouldRetryNarration(reason, 0), true);
      assert.equal(shouldRetryNarration(reason, 1), false);
    }
    assert.equal(shouldRetryNarration("refusal", 0), false);
    assert.equal(shouldRetryNarration("refusal", 1), false);
  });
});

describe("significantChange", () => {
  it("reports rounded change only on a trustworthy base", () => {
    assert.deepEqual(significantChange(10, 5), { delta: 5, pct: 100 });
    assert.deepEqual(significantChange(7, 10), { delta: -3, pct: -30 });
  });

  it("stays silent on thin bases, flat lines, and bad inputs", () => {
    assert.equal(significantChange(8, 4), null);
    assert.equal(significantChange(2, 1), null);
    assert.equal(significantChange(10, 10), null);
    assert.equal(significantChange(-1, 10), null);
    assert.equal(significantChange(10.5, 10), null);
  });
});
