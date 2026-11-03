// Scout search tests (S1). Pure payload parsing and budget arithmetic:
// multi-call payloads, dropped junk rows, citation extraction, usage totals,
// and the halt-before-overspend budget gate. No network, no database.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkScoutBudget,
  parseScoutSearch,
  SCOUT_DEFAULT_MAX_TOOL_CALLS,
  SCOUT_REQUEST_TOOL_CALL_CAP,
} from "@/showcase/scout/scout-search";

function payload() {
  return {
    output: [
      {
        type: "web_search_call",
        status: "completed",
        results: [
          { title: "DevFest PH 2026", url: "https://gdg.example/devfest", snippet: "A dev festival" },
          { title: "Junk row", url: "not a url" },
          { title: null, url: null },
        ],
      },
      { type: "web_search_call", status: "completed", results: [] },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "See DevFest.",
            annotations: [
              { type: "url_citation", url: "https://gdg.example/devfest", title: "DevFest" },
              { type: "other", url: "https://ignored.example" },
            ],
          },
        ],
      },
    ],
    usage: { input_tokens: 1200, output_tokens: 300 },
  };
}

describe("parseScoutSearch", () => {
  it("counts calls, keeps good rows, drops junk", () => {
    const parsed = parseScoutSearch(payload());
    assert.equal(parsed.toolCalls, 2);
    assert.equal(parsed.results.length, 1);
    assert.equal(parsed.results[0].domain, "gdg.example");
    assert.equal(parsed.dropped, 2);
    assert.equal(parsed.inputTokens, 1200);
    assert.equal(parsed.outputTokens, 300);
  });

  it("extracts url citations only", () => {
    const parsed = parseScoutSearch(payload());
    assert.deepEqual(parsed.citations, [
      { url: "https://gdg.example/devfest", title: "DevFest" },
    ]);
  });

  it("tolerates malformed payloads", () => {
    assert.deepEqual(parseScoutSearch(null), {
      toolCalls: 0,
      results: [],
      citations: [],
      inputTokens: 0,
      outputTokens: 0,
      dropped: 0,
    });
    assert.equal(parseScoutSearch({ output: "nope" }).toolCalls, 0);
  });
});

describe("checkScoutBudget", () => {
  it("pins the v1 default budget", () => {
    assert.equal(SCOUT_DEFAULT_MAX_TOOL_CALLS, 24);
    assert.equal(SCOUT_REQUEST_TOOL_CALL_CAP, 4);
  });

  it("halts before issuing past the budget", () => {
    assert.equal(checkScoutBudget(20, 3, 24).allowed, true);
    assert.equal(checkScoutBudget(20, 4, 24).allowed, false);
    assert.equal(checkScoutBudget(24, 0, 24).allowed, false);
  });

  it("estimates search cost in cents", () => {
    // 24 calls x $2.50/1000 = $0.06 = 6 cents (estimate: unit unverified).
    assert.equal(checkScoutBudget(20, 4, 24).estimatedSearchCostCents, 6);
  });
});
