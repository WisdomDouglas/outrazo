// Bachs server-client tests (P2 Step 2).
//
// The client under test is server-only and network-free here: every test
// injects a fake fetch implementation, and process.env is controlled per
// test with fake sandbox credentials. No test touches the network or a
// real secret.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BachsError,
  createCheckout,
  decimalStringToKobo,
  koboToDecimalString,
  verifyPayment,
} from "@/integrations/bachs/client.server";

const FAKE_KEY = "sk_sandbox_test-only-never-a-real-secret";
const SANDBOX = "https://sandbox-api.bachs.io";

const ENV_KEYS = ["BACHS_API_KEY", "BACHS_BASE_URL"];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(saved) {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function useSandboxEnv() {
  const saved = snapshotEnv();
  process.env["BACHS_API_KEY"] = FAKE_KEY;
  delete process.env["BACHS_BASE_URL"];
  return saved;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function validInput(overrides = {}) {
  return {
    orderReference: "promo-order-0001",
    amountKobo: 200_000,
    currency: "NGN",
    customerEmail: "organizer@example.com",
    successUrl: "https://example.com/promotions/return",
    cancelUrl: "https://example.com/promotions/cancel",
    orderId: "11111111-2222-3333-4444-555555555555",
    ...overrides,
  };
}

function validCheckoutBody(overrides = {}) {
  return {
    checkout_id: "chk_test123",
    checkout_url: "https://checkout.bachs.io/c/test123",
    status: "open",
    ...overrides,
  };
}

function validVerifyBody(overrides = {}) {
  return {
    status: "completed",
    payment_status: "succeeded",
    amount: "2000.00",
    currency: "NGN",
    reference: "promo-order-0001",
    metadata: { order_id: "11111111-2222-3333-4444-555555555555" },
    ...overrides,
  };
}

describe("kobo to decimal-string conversion", () => {
  it("converts with integer math, exactly two fraction digits", () => {
    assert.equal(koboToDecimalString(10_000), "100.00");
    assert.equal(koboToDecimalString(200_000), "2000.00");
    assert.equal(koboToDecimalString(1_400_000), "14000.00");
    assert.equal(koboToDecimalString(200_001), "2000.01");
    assert.equal(koboToDecimalString(99), "0.99");
    assert.equal(koboToDecimalString(1), "0.01");
  });

  it("rejects non-positive and non-integer amounts", () => {
    for (const bad of [0, -50, 2.5, Number.NaN]) {
      assert.throws(() => koboToDecimalString(bad), BachsError);
    }
  });
});

describe("decimal-string to kobo conversion", () => {
  it("parses exact decimal strings without floating point", () => {
    assert.equal(decimalStringToKobo("100.00"), 10_000);
    assert.equal(decimalStringToKobo("2000.00"), 200_000);
    assert.equal(decimalStringToKobo("0.99"), 99);
    assert.equal(decimalStringToKobo("14000.00"), 1_400_000);
  });

  it("returns null for anything malformed or unsafe", () => {
    for (const bad of [
      "42",
      "42.0",
      "42.000",
      "-5.00",
      "abc",
      "",
      " 2000.00",
      "2000.00 ",
      "999999999999999999999.00",
      null,
      undefined,
      2000,
    ]) {
      assert.equal(decimalStringToKobo(bad), null, `expected null for ${String(bad)}`);
    }
  });
});

describe("createCheckout request shape", () => {
  it("sends the verified URL, headers, and dynamic-pricing body", async () => {
    const saved = useSandboxEnv();
    try {
      const seen = {};
      const fetchImpl = async (url, init) => {
        seen.url = url;
        seen.init = init;
        return jsonResponse(validCheckoutBody());
      };
      const result = await createCheckout(validInput(), fetchImpl);
      assert.deepEqual(result, {
        checkoutId: "chk_test123",
        checkoutUrl: "https://checkout.bachs.io/c/test123",
      });
      assert.equal(seen.url, `${SANDBOX}/v1/checkout-sessions`);
      assert.equal(seen.init.method, "POST");
      assert.equal(seen.init.headers["Authorization"], `Bearer ${FAKE_KEY}`);
      assert.equal(seen.init.headers["Content-Type"], "application/json");
      assert.equal(
        seen.init.headers["Idempotency-Key"],
        "11111111-2222-3333-4444-555555555555",
      );
      assert.deepEqual(JSON.parse(seen.init.body), {
        pricing: { currency: "NGN", amount: "2000.00" },
        reference: "promo-order-0001",
        metadata: { order_id: "11111111-2222-3333-4444-555555555555" },
        customer: { email: "organizer@example.com" },
        success_url: "https://example.com/promotions/return",
        cancel_url: "https://example.com/promotions/cancel",
        expires_in_minutes: 1440,
      });
      assert.ok(seen.init.signal instanceof AbortSignal);
    } finally {
      restoreEnv(saved);
    }
  });
});

describe("createCheckout validation", () => {
  it("enforces the NGN 100 minimum transaction", async () => {
    const saved = useSandboxEnv();
    try {
      await assert.rejects(
        createCheckout(validInput({ amountKobo: 9_999 }), async () => {
          throw new Error("must not reach the network");
        }),
        /NGN 100 minimum/,
      );
      const ok = await createCheckout(
        validInput({ amountKobo: 10_000 }),
        async () => jsonResponse(validCheckoutBody()),
      );
      assert.equal(ok.checkoutId, "chk_test123");
    } finally {
      restoreEnv(saved);
    }
  });

  it("enforces the 128-character reference limit", async () => {
    const saved = useSandboxEnv();
    try {
      await assert.rejects(
        createCheckout(validInput({ orderReference: "r".repeat(129) }), async () => {
          throw new Error("must not reach the network");
        }),
        BachsError,
      );
      const ok = await createCheckout(
        validInput({ orderReference: "r".repeat(128) }),
        async () => jsonResponse(validCheckoutBody()),
      );
      assert.equal(ok.checkoutId, "chk_test123");
    } finally {
      restoreEnv(saved);
    }
  });

  it("rejects invalid emails, URLs, and non-NGN currency", async () => {
    const saved = useSandboxEnv();
    try {
      const never = async () => {
        throw new Error("must not reach the network");
      };
      await assert.rejects(
        createCheckout(validInput({ customerEmail: "not-an-email" }), never),
        BachsError,
      );
      await assert.rejects(
        createCheckout(validInput({ successUrl: "not-a-url" }), never),
        BachsError,
      );
      await assert.rejects(
        createCheckout(validInput({ currency: "USD" }), never),
        BachsError,
      );
    } finally {
      restoreEnv(saved);
    }
  });
});

describe("createCheckout response handling", () => {
  it("rejects missing or malformed checkout URLs", async () => {
    const saved = useSandboxEnv();
    try {
      for (const body of [
        {},
        { checkout_id: "chk_x" },
        { checkout_url: "https://checkout.bachs.io/c/x" },
        { checkout_id: "chk_x", checkout_url: "not-a-url" },
        { checkout_id: "", checkout_url: "https://checkout.bachs.io/c/x" },
      ]) {
        await assert.rejects(
          createCheckout(validInput(), async () => jsonResponse(body)),
          /checkout_id and checkout_url/,
        );
      }
    } finally {
      restoreEnv(saved);
    }
  });
});

describe("verifyPayment states", () => {
  it("reports a succeeded NGN payment as paid with parsed evidence", async () => {
    const saved = useSandboxEnv();
    try {
      const seen = {};
      const result = await verifyPayment("chk_test123", async (url, init) => {
        seen.url = url;
        seen.init = init;
        return jsonResponse(validVerifyBody());
      });
      assert.equal(seen.url, `${SANDBOX}/v1/checkout-sessions/chk_test123`);
      assert.equal(seen.init.method, "GET");
      assert.equal(seen.init.headers["Authorization"], `Bearer ${FAKE_KEY}`);
      assert.deepEqual(result, {
        checkoutId: "chk_test123",
        status: "completed",
        paymentStatus: "succeeded",
        paid: true,
        amountKobo: 200_000,
        currency: "NGN",
        reference: "promo-order-0001",
        metadata: { order_id: "11111111-2222-3333-4444-555555555555" },
      });
    } finally {
      restoreEnv(saved);
    }
  });

  it("never reports open or expired checkouts as paid", async () => {
    const saved = useSandboxEnv();
    try {
      const open = await verifyPayment(
        "chk_open",
        async () =>
          jsonResponse(
            validVerifyBody({ status: "open", payment_status: null, amount: null }),
          ),
      );
      assert.equal(open.paid, false);
      assert.equal(open.status, "open");
      assert.equal(open.amountKobo, null);

      const expired = await verifyPayment(
        "chk_expired",
        async () =>
          jsonResponse(
            validVerifyBody({ status: "expired", payment_status: null }),
          ),
      );
      assert.equal(expired.paid, false);
      assert.equal(expired.status, "expired");
    } finally {
      restoreEnv(saved);
    }
  });

  it("reports failed and canceled payments as unpaid with raw states kept", async () => {
    const saved = useSandboxEnv();
    try {
      for (const payment_status of ["failed", "canceled"]) {
        const result = await verifyPayment(
          "chk_x",
          async () => jsonResponse(validVerifyBody({ payment_status })),
        );
        assert.equal(result.paid, false);
        assert.equal(result.paymentStatus, payment_status);
        assert.equal(result.amountKobo, 200_000);
      }
    } finally {
      restoreEnv(saved);
    }
  });

  it("reports amounts faithfully and refuses non-NGN as paid", async () => {
    const saved = useSandboxEnv();
    try {
      // A different-but-wellformed amount is reported exactly: matching it
      // against the order snapshot is the caller's job (Step 3 + the
      // activation RPC enforce the exact match before delivery).
      const mismatch = await verifyPayment(
        "chk_x",
        async () => jsonResponse(validVerifyBody({ amount: "1999.00" })),
      );
      assert.equal(mismatch.amountKobo, 199_900);
      assert.equal(mismatch.paid, true);

      const foreign = await verifyPayment(
        "chk_x",
        async () => jsonResponse(validVerifyBody({ currency: "USD" })),
      );
      assert.equal(foreign.currency, "USD");
      assert.equal(foreign.paid, false);

      const unparseable = await verifyPayment(
        "chk_x",
        async () => jsonResponse(validVerifyBody({ amount: "bogus" })),
      );
      assert.equal(unparseable.amountKobo, null);
      assert.equal(unparseable.paid, false);
    } finally {
      restoreEnv(saved);
    }
  });

  it("keeps payment evidence decisive under unknown session states", async () => {
    const saved = useSandboxEnv();
    try {
      const result = await verifyPayment(
        "chk_x",
        async () => jsonResponse(validVerifyBody({ status: "mystery" })),
      );
      assert.equal(result.status, "unknown");
      assert.equal(result.paid, true);
    } finally {
      restoreEnv(saved);
    }
  });

  it("requires a checkout ID", async () => {
    const saved = useSandboxEnv();
    try {
      await assert.rejects(
        verifyPayment("", async () => {
          throw new Error("must not reach the network");
        }),
        /checkout ID/,
      );
    } finally {
      restoreEnv(saved);
    }
  });
});

describe("provider failure handling", () => {
  it("rejects malformed provider responses without trusting them", async () => {
    const saved = useSandboxEnv();
    try {
      await assert.rejects(
        createCheckout(
          validInput(),
          async () => new Response("not json{{", { status: 200 }),
        ),
        /unreadable/,
      );
      await assert.rejects(
        verifyPayment(
          "chk_x",
          async () => jsonResponse({ unexpected: "shape" }),
        ),
        /without a usable status/,
      );
    } finally {
      restoreEnv(saved);
    }
  });

  it("maps network errors, timeouts, and HTTP errors to safe codes", async () => {
    const saved = useSandboxEnv();
    try {
      await assert.rejects(
        createCheckout(validInput(), async () => {
          throw new TypeError("fetch failed");
        }),
        (error) => {
          assert.ok(error instanceof BachsError);
          assert.equal(error.code, "network");
          assert.match(error.message, /uncertain/);
          return true;
        },
      );

      const timeout = new DOMException("The operation timed out.", "TimeoutError");
      await assert.rejects(
        verifyPayment("chk_x", async () => {
          throw timeout;
        }),
        (error) => {
          assert.ok(error instanceof BachsError);
          assert.equal(error.code, "timeout");
          return true;
        },
      );

      await assert.rejects(
        verifyPayment(
          "chk_x",
          async () =>
            jsonResponse(
              { detail: "Invalid API key.", error_code: "AUTH_ERROR" },
              401,
            ),
        ),
        (error) => {
          assert.ok(error instanceof BachsError);
          assert.equal(error.code, "http");
          assert.equal(error.httpStatus, 401);
          assert.match(error.message, /HTTP 401/);
          assert.match(error.message, /Invalid API key/);
          assert.doesNotMatch(error.message, new RegExp(FAKE_KEY));
          return true;
        },
      );

      await assert.rejects(
        createCheckout(
          validInput(),
          async () => new Response("boom", { status: 500 }),
        ),
        (error) => {
          assert.ok(error instanceof BachsError);
          assert.equal(error.code, "http");
          assert.equal(error.httpStatus, 500);
          return true;
        },
      );
    } finally {
      restoreEnv(saved);
    }
  });
});

describe("Bachs environment handling", () => {
  it("fails fast naming BACHS_API_KEY with neutral guidance", async () => {
    const saved = snapshotEnv();
    delete process.env["BACHS_API_KEY"];
    delete process.env["BACHS_BASE_URL"];
    try {
      await assert.rejects(
        verifyPayment("chk_x", async () => {
          throw new Error("must not reach the network");
        }),
        (error) => {
          assert.ok(error instanceof BachsError);
          assert.equal(error.code, "config");
          assert.match(error.message, /BACHS_API_KEY/);
          assert.match(error.message, /server-only/i);
          return true;
        },
      );
    } finally {
      restoreEnv(saved);
    }
  });

  it("refuses live keys in this phase", async () => {
    const saved = snapshotEnv();
    process.env["BACHS_API_KEY"] = "sk_live_test-only-never-a-real-secret";
    delete process.env["BACHS_BASE_URL"];
    try {
      await assert.rejects(
        createCheckout(validInput(), async () => {
          throw new Error("must not reach the network");
        }),
        /Live Bachs keys are not enabled/,
      );
    } finally {
      restoreEnv(saved);
    }
  });

  it("requires an explicit base URL for unknown key prefixes", async () => {
    const saved = snapshotEnv();
    process.env["BACHS_API_KEY"] = "weird-prefix-test-key";
    delete process.env["BACHS_BASE_URL"];
    try {
      await assert.rejects(
        verifyPayment("chk_x", async () => {
          throw new Error("must not reach the network");
        }),
        /BACHS_BASE_URL/,
      );
    } finally {
      restoreEnv(saved);
    }
  });

  it("honors loopback BACHS_BASE_URL overrides for local testing", async () => {
    const saved = snapshotEnv();
    process.env["BACHS_API_KEY"] = FAKE_KEY;
    process.env["BACHS_BASE_URL"] = "http://localhost:8080/bachs/";
    try {
      const seen = {};
      await verifyPayment("chk_x", async (url) => {
        seen.url = url;
        return jsonResponse(validVerifyBody());
      });
      assert.equal(
        seen.url,
        "http://localhost:8080/bachs/v1/checkout-sessions/chk_x",
      );
    } finally {
      restoreEnv(saved);
    }
  });

  it("treats missing, empty, or whitespace BACHS_BASE_URL as sandbox default", async () => {
    for (const [label, value] of [
      ["unset", undefined],
      ["empty", ""],
      ["whitespace", "   \t  "],
    ]) {
      const saved = snapshotEnv();
      process.env["BACHS_API_KEY"] = FAKE_KEY;
      if (value === undefined) delete process.env["BACHS_BASE_URL"];
      else process.env["BACHS_BASE_URL"] = value;
      try {
        const seen = {};
        await verifyPayment("chk_x", async (url) => {
          seen.url = url;
          return jsonResponse(validVerifyBody());
        });
        assert.equal(
          seen.url,
          "https://sandbox-api.bachs.io/v1/checkout-sessions/chk_x",
          label,
        );
      } finally {
        restoreEnv(saved);
      }
    }
  });

  it("honors an explicit sandbox BACHS_BASE_URL", async () => {
    for (const baseUrl of [
      "https://sandbox-api.bachs.io",
      "https://sandbox-api.bachs.io/",
    ]) {
      const saved = snapshotEnv();
      process.env["BACHS_API_KEY"] = FAKE_KEY;
      process.env["BACHS_BASE_URL"] = baseUrl;
      try {
        const seen = {};
        await verifyPayment("chk_x", async (url) => {
          seen.url = url;
          return jsonResponse(validVerifyBody());
        });
        assert.equal(
          seen.url,
          "https://sandbox-api.bachs.io/v1/checkout-sessions/chk_x",
          baseUrl,
        );
      } finally {
        restoreEnv(saved);
      }
    }
  });

  it("rejects unsafe BACHS_BASE_URL overrides before any request", async () => {
    const saved = snapshotEnv();
    process.env["BACHS_API_KEY"] = FAKE_KEY;
    try {
      for (const baseUrl of [
        "https://evil.example.com/",
        "https://api.bachs.io/",
        "https://sandbox-api.bachs.io.evil.example.com/",
        "not-a-url",
        "ftp://localhost/x",
      ]) {
        process.env["BACHS_BASE_URL"] = baseUrl;
        await assert.rejects(
          verifyPayment("chk_x", async () => {
            throw new Error(`must not request ${baseUrl}`);
          }),
          (error) => {
            assert.ok(error instanceof BachsError);
            assert.equal(error.code, "config");
            return true;
          },
          `expected rejection for ${baseUrl}`,
        );
      }
    } finally {
      restoreEnv(saved);
    }
  });

  it("rejects credentials, paths, queries, and fragments in overrides", async () => {
    const saved = snapshotEnv();
    process.env["BACHS_API_KEY"] = FAKE_KEY;
    try {
      for (const baseUrl of [
        "https://user:pass@sandbox-api.bachs.io/",
        "http://user@localhost:8080/",
        "https://sandbox-api.bachs.io/evil-path",
        "https://sandbox-api.bachs.io/?x=1",
        "https://sandbox-api.bachs.io/#frag",
        "http://localhost:8080/?x=1",
        "http://localhost:8080/#frag",
      ]) {
        process.env["BACHS_BASE_URL"] = baseUrl;
        await assert.rejects(
          verifyPayment("chk_x", async () => {
            throw new Error(`must not request ${baseUrl}`);
          }),
          (error) => {
            assert.ok(error instanceof BachsError);
            assert.equal(error.code, "config");
            return true;
          },
          `expected rejection for ${baseUrl}`,
        );
      }
    } finally {
      restoreEnv(saved);
    }
  });

  it("requires the sandbox prefix without an override", async () => {
    const saved = snapshotEnv();
    process.env["BACHS_API_KEY"] = "weird-prefix-test-key";
    delete process.env["BACHS_BASE_URL"];
    try {
      await assert.rejects(
        verifyPayment("chk_x", async () => {
          throw new Error("must not reach the network");
        }),
        (error) => {
          assert.ok(error instanceof BachsError);
          assert.equal(error.code, "config");
          assert.match(error.message, /sk_sandbox_/);
          return true;
        },
      );
    } finally {
      restoreEnv(saved);
    }
  });

  it("preserves local test servers with any key on loopback", async () => {
    const saved = snapshotEnv();
    process.env["BACHS_API_KEY"] = "local-mock-key";
    process.env["BACHS_BASE_URL"] = "http://127.0.0.1:9999/mock/";
    try {
      const seen = {};
      await verifyPayment("chk_x", async (url) => {
        seen.url = url;
        return jsonResponse(validVerifyBody());
      });
      assert.equal(
        seen.url,
        "http://127.0.0.1:9999/mock/v1/checkout-sessions/chk_x",
      );
    } finally {
      restoreEnv(saved);
    }
  });

  it("supports short verification timeouts for webhook budgets", async () => {
    const saved = useSandboxEnv();
    try {
      const slow = async (_url, init) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        init.signal.throwIfAborted();
        return jsonResponse(validVerifyBody());
      };
      await assert.rejects(
        verifyPayment("chk_x", slow, { timeoutMs: 1000 }),
        (error) => {
          assert.ok(error instanceof BachsError);
          assert.equal(error.code, "timeout");
          assert.match(error.message, /1000ms/);
          assert.match(error.message, /uncertain/);
          return true;
        },
      );
    } finally {
      restoreEnv(saved);
    }
  });

  it("rejects absurd timeout values without touching the network", async () => {
    const saved = useSandboxEnv();
    try {
      for (const timeoutMs of [0, -1, 999, 30001, 2.5, Number.NaN]) {
        await assert.rejects(
          verifyPayment(
            "chk_x",
            async () => {
              throw new Error("must not reach the network");
            },
            { timeoutMs },
          ),
          /whole number of milliseconds/,
          `expected rejection for timeoutMs=${String(timeoutMs)}`,
        );
      }
    } finally {
      restoreEnv(saved);
    }
  });
});

describe("Bachs secret client-bundle boundary", () => {
  function listSourceFiles(directory, out = []) {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) listSourceFiles(full, out);
      else if (/\.tsx?$/.test(entry)) out.push(full.split(sep).join("/"));
    }
    return out;
  }

  it("keeps the server client and its secret out of client-reachable code", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
    // The webhook route is component-free (server handlers only), so its
    // dynamic import of the handler cannot reach the browser bundle. The
    // promotion server-function bridge is the client-safe RPC surface: the
    // client receives stubs, proven by the bundle scan in validation.
    const allowed = new Set([
      `${root.split(sep).join("/")}/routes/api.webhooks.promotions.ts`,
      `${root.split(sep).join("/")}/showcase/promotions/promotion-functions.ts`,
    ]);
    const offenders = [];
    for (const file of listSourceFiles(root)) {
      // Server-only modules may hold the client; everything else must not.
      if (file.endsWith(".server.ts") || file.endsWith(".server.tsx")) continue;
      if (file.includes("/integrations/bachs/")) continue;
      if (allowed.has(file)) continue;
      const text = readFileSync(file, "utf8");
      if (text.includes("integrations/bachs/client.server")) {
        offenders.push(`${file}: imports the Bachs server client`);
      }
      if (text.includes("showcase/promotions/bachs-webhook.server")) {
        offenders.push(`${file}: imports the Bachs webhook handler`);
      }
      if (text.includes("showcase/promotions/promotion-checkout.server")) {
        offenders.push(`${file}: imports the promotion checkout core`);
      }
      if (text.includes("showcase/promotions/promotion-orders.server")) {
        offenders.push(`${file}: imports the promotion orders core`);
      }
      if (text.includes("BACHS_API_KEY")) {
        offenders.push(`${file}: names the Bachs secret`);
      }
      if (text.includes("VITE_BACHS")) {
        offenders.push(`${file}: exposes Bachs config to the browser bundle`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});
