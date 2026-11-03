// Scout fetch + extraction tests (S2). SSRF guards (private IPs, bad
// schemes, redirect chains), size/timeout/content limits, HTML-to-text, and
// the extraction contract. Fake fetch + fake resolver: no network.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fetchScoutSource,
  scoutHtmlToText,
} from "@/showcase/scout/scout-fetch.server";
import {
  buildExtractionPrompt,
  pickUnprocessedCandidates,
  scoutExtractionSchema,
} from "@/showcase/scout/scout-extract";
import { normalizeScoutUrl } from "@/showcase/scout/scout-validate";

function fakeResponse({ status = 200, headers = {}, body = "" }) {
  const bytes = new TextEncoder().encode(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  };
}

const publicResolver = async () => "93.184.216.34";

describe("fetchScoutSource SSRF", () => {
  it("blocks private, loopback, and metadata addresses", async () => {
    for (const [host, ip] of [
      ["localhost", "127.0.0.1"],
      ["internal.local", "10.1.2.3"],
      ["corp.local", "192.168.0.5"],
      ["meta.local", "169.254.169.254"],
    ]) {
      const result = await fetchScoutSource(`http://${host}/`, {
        requestImpl: async () => { throw new Error("must not fetch"); },
        resolveHost: async () => ip,
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, "blocked");
    }
  });

  it("blocks non-http schemes and bad redirects", async () => {
    const file = await fetchScoutSource("file:///etc/passwd", { resolveHost: publicResolver });
    assert.equal(file.ok, false);
    const redirect = await fetchScoutSource("https://start.example/", {
      // Echo IP literals like real DNS; names resolve public.
      resolveHost: async (host) => (/^[0-9.]+$/.test(host) ? host : "93.184.216.34"),
      requestImpl: async (url) =>
        url === "https://start.example/"
          ? fakeResponse({ status: 302, headers: { location: "http://169.254.169.254/x" } })
          : fakeResponse({ body: "x" }),
    });
    assert.equal(redirect.ok, false);
    assert.equal(redirect.reason, "blocked");
  });

  it("rejects oversized and non-text responses", async () => {
    const big = await fetchScoutSource("https://big.example/", {
      resolveHost: publicResolver,
      requestImpl: async () => fakeResponse({ headers: { "content-type": "text/html" }, body: "x".repeat(600 * 1024) }),
    });
    assert.equal(big.ok, false);
    assert.equal(big.reason, "too_large");
    const pdf = await fetchScoutSource("https://doc.example/f.pdf", {
      resolveHost: publicResolver,
      requestImpl: async () => fakeResponse({ headers: { "content-type": "application/pdf" }, body: "%PDF" }),
    });
    assert.equal(pdf.ok, false);
    assert.equal(pdf.reason, "bad_content");
  });

  it("pins the connection to the validated IP (rebinding-safe)", async () => {
    let seenIp = null;
    let calls = 0;
    const result = await fetchScoutSource("https://shifty.example/", {
      // Evil resolver: public first, private on any re-resolution.
      resolveHost: async () => (++calls === 1 ? "93.184.216.34" : "169.254.169.254"),
      requestImpl: async (url, ip) => {
        seenIp = ip;
        return fakeResponse({ headers: { "content-type": "text/html" }, body: "<p>ok</p>" });
      },
    });
    assert.equal(result.ok, true);
    assert.equal(seenIp, "93.184.216.34");
  });

  it("fetches and cleans a normal page", async () => {
    const good = await fetchScoutSource("https://event.example/devfest", {
      resolveHost: publicResolver,
      requestImpl: async () =>
        fakeResponse({
          headers: { "content-type": "text/html" },
          body: "<html><head><script>evil()</script><style>.x{}</style></head><body><h1>DevFest</h1><p>Dec 1 &amp; 2</p></body></html>",
        }),
    });
    assert.equal(good.ok, true);
    assert.equal(good.text, "DevFest Dec 1 & 2");
  });
});
describe("scoutHtmlToText", () => {
  it("strips tags and decodes entities", () => {
    assert.equal(scoutHtmlToText("<p>Hello&nbsp;&lt;world&gt;</p>"), "Hello <world>");
  });
});

describe("scout extraction contract", () => {
  it("accepts a full extraction and a not-event verdict", () => {
    const full = scoutExtractionSchema.safeParse({
      isUpcomingEvent: true,
      notEventReason: null,
      title: "DevFest",
      summary: null,
      startsAt: "2026-12-01T09:00:00Z",
      endsAt: null,
      venueName: "Hall",
      address: null,
      city: "Uyo",
      state: null,
      category: "technology",
      eventType: "free",
      priceHint: null,
      externalTicketUrl: null,
      organizerName: "GDG",
      provenance: { title: "confirmed", startsAt: "confirmed", venue: "confirmed", city: "confirmed", organizer: "ambiguous" },
    });
    assert.equal(full.success, true);
    const nope = scoutExtractionSchema.safeParse({
      isUpcomingEvent: false,
      eventType: "unknown",
      provenance: { title: "missing", startsAt: "missing", venue: "missing", city: "missing", organizer: "missing" },
    });
    assert.equal(nope.success, true);
  });

  it("lets not-event verdicts omit provenance but requires it for events", () => {
    const bareNope = scoutExtractionSchema.safeParse({
      isUpcomingEvent: false,
      notEventReason: "Category listing page.",
      eventType: "unknown",
    });
    assert.equal(bareNope.success, true);
    const nullProvenance = scoutExtractionSchema.safeParse({
      isUpcomingEvent: false,
      eventType: "unknown",
      provenance: null,
    });
    assert.equal(nullProvenance.success, true);
    const bareEvent = scoutExtractionSchema.safeParse({
      isUpcomingEvent: true,
      title: "DevFest",
      eventType: "free",
    });
    assert.equal(bareEvent.success, false);
  });

  it("accepts the extraction fallback verdict shape", () => {
    const fallback = scoutExtractionSchema.safeParse({
      isUpcomingEvent: false,
      eventType: "unknown",
      notEventReason: "Extraction produced no usable data (response was not valid JSON).",
    });
    assert.equal(fallback.success, true);
    if (fallback.success) {
      assert.equal(fallback.data.isUpcomingEvent, false);
    }
  });

  it("builds a grounded prompt with today's date", () => {
    const prompt = buildExtractionPrompt({ url: "https://x.example", title: null, text: "hello", todayIso: "2026-11-03T00:00:00.000Z" });
    assert.match(prompt.instructions, /2026-11-03/);
    assert.match(prompt.instructions, /Never invent/);
    assert.match(prompt.input, /https:\/\/x\.example/);
  });
});

describe("pickUnprocessedCandidates", () => {
  const row = (url) => ({ url, title: "T", domain: "x.example", snippet: "S" });

  it("picks in plan order up to the batch limit", () => {
    const picks = pickUnprocessedCandidates(
      [[row("https://a.example/1"), row("https://a.example/2")], [row("https://b.example/1")]],
      new Set(),
      2,
    );
    assert.deepEqual(picks.map((pick) => pick.url), ["https://a.example/1", "https://a.example/2"]);
  });

  it("skips processed urls, in-batch dupes, and unusable urls", () => {
    const processed = new Set([normalizeScoutUrl("https://a.example/done?utm_source=x")].filter(Boolean));
    const picks = pickUnprocessedCandidates(
      [[
        row("https://a.example/done"),
        row("https://a.example/new"),
        row("https://a.example/new"),
        row("not a url"),
      ]],
      processed,
      3,
    );
    assert.deepEqual(picks.map((pick) => pick.url), ["https://a.example/new"]);
  });

  it("returns every remaining candidate when fewer than the limit", () => {
    const picks = pickUnprocessedCandidates([[], [row("https://a.example/only")]], new Set(), 3);
    assert.equal(picks.length, 1);
    assert.equal(picks[0].title, "T");
  });
});
