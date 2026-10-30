// Server-env regression tests for the privileged Supabase client.
//
// The Admin Console's server functions need SUPABASE_SERVICE_ROLE_KEY at
// runtime. When it is missing, the failure must name the variable and give
// environment-neutral guidance — never reference a specific hosting product.
// These tests drive the REAL client module with controlled process.env and
// no network: client creation alone performs no requests.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function snapshot() {
  return Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
}

function restore(saved) {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

describe("supabaseAdmin environment handling", () => {
  it("fails fast naming the missing variable, with neutral guidance", () => {
    // Runs first: a later test memoizes a successfully created client.
    const saved = snapshot();
    for (const key of KEYS) delete process.env[key];
    try {
      assert.throws(
        () => supabaseAdmin.from,
        (error) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /SUPABASE_SERVICE_ROLE_KEY/);
          assert.match(error.message, /SUPABASE_URL/);
          assert.doesNotMatch(error.message, /lovable/i);
          assert.match(error.message, /server-only/i);
          return true;
        },
      );
    } finally {
      restore(saved);
    }
  });

  it("creates the client without throwing once the variables exist", () => {
    const saved = snapshot();
    process.env["SUPABASE_URL"] = "https://example.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-fake-key-never-a-real-secret";
    try {
      assert.equal(typeof supabaseAdmin.from, "function");
    } finally {
      restore(saved);
    }
  });
});
