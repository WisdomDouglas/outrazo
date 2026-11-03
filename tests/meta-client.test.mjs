// Shared Meta Model API transport tests. Every caller (Copilot, NL
// discovery, Admin Intelligence) shares this module, so the request shape,
// timeout behavior, and status mapping are pinned here once. Callers keep
// their own prompts, schemas, and user-facing messages.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  META_CHAT_COMPLETIONS_URL,
  META_MODEL,
  MetaError,
  metaChatJson,
} from "@/integrations/meta/client.server";

const TEST_KEY = "test-meta-key-do-not-use";

function withApiKey(run) {
  const previous = process.env["MODEL_API_KEY"];
  process.env["MODEL_API_KEY"] = TEST_KEY;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (previous === undefined) delete process.env["MODEL_API_KEY"];
      else process.env["MODEL_API_KEY"] = previous;
    });
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (typeof body === "string" && body === "NOT-JSON") throw new SyntaxError("bad json");
      return body;
    },
  };
}

const BASE_OPTIONS = {
  messages: [{ role: "developer", content: "be brief" }, { role: "user", content: "hi" }],
  schemaName: "Probe",
  jsonSchema: { type: "object", properties: {} },
  maxTokens: 64,
  timeoutMs: 5000,
  logPrefix: "[probe]",
};

describe("metaChatJson request", () => {
  it("posts the documented chat-completions shape with the server key", async () => {
    await withApiKey(async () => {
      const calls = [];
      const fetchImpl = async (url, init) => {
        calls.push([url, init]);
        return jsonResponse(200, { choices: [] });
      };
      const result = await metaChatJson({ ...BASE_OPTIONS, fetchImpl });
      assert.equal(calls.length, 1);
      const [url, init] = calls[0];
      assert.equal(url, META_CHAT_COMPLETIONS_URL);
      assert.equal(init.method, "POST");
      assert.equal(init.headers["Authorization"], `Bearer ${TEST_KEY}`);
      assert.equal(init.headers["Content-Type"], "application/json");
      const body = JSON.parse(init.body);
      assert.equal(body.model, META_MODEL);
      assert.deepEqual(body.messages, BASE_OPTIONS.messages);
      assert.deepEqual(body.response_format, {
        type: "json_schema",
        json_schema: { name: "Probe", schema: BASE_OPTIONS.jsonSchema },
      });
      assert.equal(body.max_completion_tokens, 64);
      assert.ok(init.signal instanceof AbortSignal);
      assert.deepEqual(result, { status: 200, payload: { choices: [] } });
    });
  });

  it("refuses without a key and never leaks key material in errors", async () => {
    const previous = process.env["MODEL_API_KEY"];
    delete process.env["MODEL_API_KEY"];
    try {
      await assert.rejects(
        metaChatJson({ ...BASE_OPTIONS, fetchImpl: async () => jsonResponse(200, {}) }),
        (error) => {
          assert.ok(error instanceof MetaError);
          assert.equal(error.code, "config");
          assert.ok(!String(error.message).includes(TEST_KEY));
          return true;
        },
      );
    } finally {
      if (previous === undefined) delete process.env["MODEL_API_KEY"];
      else process.env["MODEL_API_KEY"] = previous;
    }
  });
});

describe("metaChatJson failures", () => {
  it("maps timeouts, network faults, and malformed bodies", async () => {
    await withApiKey(async () => {
      const timeout = new DOMException("timed out", "TimeoutError");
      await assert.rejects(
        metaChatJson({
          ...BASE_OPTIONS,
          fetchImpl: async () => { throw timeout; },
        }),
        (error) => error instanceof MetaError && error.code === "timeout",
      );
      await assert.rejects(
        metaChatJson({
          ...BASE_OPTIONS,
          fetchImpl: async () => { throw new Error("socket hangup"); },
        }),
        (error) => error instanceof MetaError && error.code === "network",
      );
      await assert.rejects(
        metaChatJson({
          ...BASE_OPTIONS,
          fetchImpl: async () => jsonResponse(200, "NOT-JSON"),
        }),
        (error) => error instanceof MetaError && error.code === "malformed",
      );
    });
  });

  it("maps HTTP statuses to typed codes with the status attached", async () => {
    await withApiKey(async () => {
      const cases = [
        [401, "unauthorized"],
        [403, "unauthorized"],
        [429, "rate_limited"],
        [500, "server"],
        [503, "server"],
        [400, "bad_request"],
        [422, "bad_request"],
      ];
      for (const [status, code] of cases) {
        await assert.rejects(
          metaChatJson({ ...BASE_OPTIONS, fetchImpl: async () => jsonResponse(status, {}) }),
          (error) => {
            assert.ok(error instanceof MetaError);
            assert.equal(error.code, code);
            assert.equal(error.httpStatus, status);
            return true;
          },
        );
      }
    });
  });
});
