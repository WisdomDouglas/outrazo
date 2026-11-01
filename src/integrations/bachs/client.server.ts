// Server-only Bachs client for incoming promotion payments (P2 Step 2).
//
// Exactly two operations, native fetch, no SDK dependency:
//   createCheckout  — open a hosted Bachs checkout for a promotion order.
//   verifyPayment   — retrieve a checkout and normalize its payment evidence.
//
// SECURITY: this module reads BACHS_API_KEY. It is a *.server.ts module, so
// the existing privileged-client ESLint boundary applies automatically.
// Load inside server handlers:
//   const { createCheckout } = await import("@/integrations/bachs/client.server");
// Top-level import is safe only in other .server.ts modules — route files
// and UI components must go through server functions instead.
//
// Money: Outrazo keeps integer kobo everywhere internally. Conversion to and
// from Bachs decimal strings ("2000.00") happens ONLY at this boundary, with
// integer arithmetic — never floating point.
//
// Policy: sandbox keys only in this phase. Live keys are refused loudly;
// going live is a separately approved step, not a config accident.
import { z } from "zod";

import { ORDER_MIN_TOTAL_KOBO } from "@/showcase/promotions/paid-promotion-orders";

const BACHS_SANDBOX_BASE_URL = "https://sandbox-api.bachs.io";
const BACHS_SANDBOX_HOST = "sandbox-api.bachs.io";
const BACHS_REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_TIMEOUT_MS = 1_000;
const CHECKOUT_TTL_MINUTES = 1440;
const MAX_REFERENCE_LENGTH = 128;

export interface BachsRequestOptions {
  /**
   * Per-request timeout in whole milliseconds (1000–30000, default 30000).
   * Webhook handlers must pass a short budget (e.g. 8000) so signature
   * check + event log + verification + activation complete inside Bachs's
   * 10-second acknowledgement window.
   */
  timeoutMs?: number;
}

export type BachsErrorCode =
  | "config"
  | "validation"
  | "network"
  | "timeout"
  | "http"
  | "malformed";

export class BachsError extends Error {
  readonly code: BachsErrorCode;
  readonly httpStatus?: number;

  constructor(code: BachsErrorCode, message: string, httpStatus?: number) {
    super(message);
    this.name = "BachsError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

interface BachsConfig {
  apiKey: string;
  baseUrl: string;
}

// Read fresh on every call (never memoized): test-friendly, and a rotated
// key takes effect without a restart.
/**
 * A blank override line in `.env` loads as an empty string, not unset — and
 * an empty string is not a usable URL. Normalize empty/whitespace-only to
 * undefined so a verbatim `.env.example` copy behaves like "no override"
 * (sandbox default) instead of breaking every Bachs call.
 */
function normalizeBaseUrlOverride(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return raw.trim() === "" ? undefined : raw;
}

function getBachsConfig(): BachsConfig {
  const apiKey = process.env["BACHS_API_KEY"];
  const baseUrlOverride = normalizeBaseUrlOverride(process.env["BACHS_BASE_URL"]);

  if (!apiKey) {
    throw new BachsError(
      "config",
      "Missing Bachs environment variable(s): BACHS_API_KEY. Set it as a server-only variable: your local .env file for development, or environment settings on your hosting provider. Never expose a Bachs secret key to the browser.",
    );
  }
  if (apiKey.startsWith("sk_live_")) {
    throw new BachsError(
      "config",
      "Live Bachs keys are not enabled in this phase. Use a sandbox key (sk_sandbox_...) — going live is a separately approved step.",
    );
  }
  // Explicit sandbox-prefix validation for deployed configuration (no
  // override): only sk_sandbox_ keys reach the default endpoint. Local test
  // servers keep working through BACHS_BASE_URL with any key, since the
  // loopback-only host rule below is the guard there, not the key shape.
  if (baseUrlOverride === undefined && !apiKey.startsWith("sk_sandbox_")) {
    throw new BachsError(
      "config",
      "Unrecognized Bachs key prefix: deployed configuration requires a sandbox key (sk_sandbox_...). For a local test server, set BACHS_BASE_URL to a loopback address.",
    );
  }
  return { apiKey, baseUrl: resolveBaseUrl(apiKey, baseUrlOverride) };
}

// The API key travels on every request, so an override pointing at an
// attacker's host would exfiltrate it. Only the sandbox itself and local
// loopback test servers are accepted; anything else (including production,
// which this phase forbids) is refused before any request is built.
function resolveBaseUrl(apiKey: string, override: string | undefined): string {
  if (override === undefined) {
    // Key prefix already validated by getBachsConfig; default to sandbox.
    void apiKey;
    return BACHS_SANDBOX_BASE_URL;
  }
  let parsed: URL;
  try {
    parsed = new URL(override);
  } catch {
    throw new BachsError(
      "config",
      "BACHS_BASE_URL is not a valid URL. Use the Bachs sandbox or a local test server.",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BachsError(
      "config",
      "BACHS_BASE_URL must use http or https. Refusing to send the API key elsewhere.",
    );
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopback =
    host === "localhost" || host === "127.0.0.1" || host === "::1";
  // Shape hardening: credentials in the URL would ride along on every
  // request, and paths/queries corrupt the request URLs we append. Paths
  // stay allowed on loopback (local mock servers mount under prefixes);
  // userinfo, queries, and fragments are rejected everywhere — the API key
  // travels in the Authorization header, never in the URL.
  if (parsed.username !== "" || parsed.password !== "") {
    throw new BachsError(
      "config",
      "BACHS_BASE_URL must not embed credentials. The API key travels in the Authorization header.",
    );
  }
  if (parsed.pathname !== "" && parsed.pathname !== "/" && !isLoopback) {
    throw new BachsError(
      "config",
      "BACHS_BASE_URL must not include a path. Use the bare sandbox origin or a loopback test server.",
    );
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new BachsError(
      "config",
      "BACHS_BASE_URL must not include a query string or fragment.",
    );
  }
  const allowed = host === BACHS_SANDBOX_HOST || isLoopback;
  if (!allowed) {
    throw new BachsError(
      "config",
      "BACHS_BASE_URL must point at the Bachs sandbox (https://sandbox-api.bachs.io) or a local test server. Refusing to send the API key elsewhere.",
    );
  }
  return override.replace(/\/$/, "");
}

function resolveTimeoutMs(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return BACHS_REQUEST_TIMEOUT_MS;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_REQUEST_TIMEOUT_MS ||
    timeoutMs > BACHS_REQUEST_TIMEOUT_MS
  ) {
    throw new BachsError(
      "validation",
      `Request timeout must be a whole number of milliseconds from ${MIN_REQUEST_TIMEOUT_MS} to ${BACHS_REQUEST_TIMEOUT_MS}.`,
    );
  }
  return timeoutMs;
}

const DECIMAL_MONEY_RE = /^(\d+)\.(\d{2})$/;

/**
 * Integer kobo to a Bachs decimal string: 200000 -> "2000.00". Pure integer
 * math, exactly two fraction digits. Throws on anything that is not a
 * positive integer amount.
 */
export function koboToDecimalString(amountKobo: number): string {
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    throw new BachsError(
      "validation",
      "Bachs amount must be a positive integer kobo value.",
    );
  }
  const naira = Math.floor(amountKobo / 100);
  return `${naira}.${String(amountKobo % 100).padStart(2, "0")}`;
}

/**
 * Bachs decimal string to integer kobo: "2000.00" -> 200000. Returns null
 * for anything malformed (wrong shape, negatives, unsafe magnitudes) so
 * callers fail closed instead of delivering on a misread amount.
 */
export function decimalStringToKobo(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = DECIMAL_MONEY_RE.exec(value);
  if (!match) return null;
  const total = Number.parseInt(match[1], 10) * 100 + Number.parseInt(match[2], 10);
  return Number.isSafeInteger(total) ? total : null;
}

const checkoutInputSchema = z.object({
  orderReference: z.string().min(1).max(MAX_REFERENCE_LENGTH),
  amountKobo: z.number().int().positive(),
  currency: z.literal("NGN"),
  customerEmail: z.string().email().max(254),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  orderId: z.string().min(1).max(MAX_REFERENCE_LENGTH),
});

export interface CreateBachsCheckoutInput {
  /** Our provider_reference for this order (sent as Bachs `reference`). */
  orderReference: string;
  /** Order total snapshot in integer kobo (must meet the NGN 100 floor). */
  amountKobo: number;
  currency: "NGN";
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  /** Our internal order UUID. Sent as the `Idempotency-Key`. */
  orderId: string;
}

export interface BachsCheckout {
  checkoutId: string;
  checkoutUrl: string;
}

const checkoutResponseSchema = z
  .object({
    checkout_id: z.string().min(1),
    checkout_url: z.string().url(),
  })
  .passthrough();

const verifyResponseSchema = z
  .object({
    status: z.string(),
    payment_status: z.string().nullable().optional(),
    amount: z.string().nullable().optional(),
    currency: z.string().nullable().optional(),
    reference: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).nullable().optional(),
  })
  .passthrough();

export type BachsCheckoutStatus = "open" | "completed" | "expired" | "unknown";

export interface BachsPaymentVerification {
  checkoutId: string;
  /** Session lifecycle: open (awaiting payment), completed, expired. */
  status: BachsCheckoutStatus;
  /** Raw Bachs payment state (succeeded/failed/canceled/...) for mapping. */
  paymentStatus: string | null;
  /**
   * True ONLY when Bachs reports a succeeded NGN payment with a parseable
   * amount. A true value is evidence, not delivery: the caller must still
   * match amount/currency against the order snapshot before activating.
   */
  paid: boolean;
  amountKobo: number | null;
  currency: string | null;
  reference: string | null;
  metadata: Record<string, unknown>;
}

function isTimeoutError(caught: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" && caught instanceof DOMException &&
      (caught.name === "TimeoutError" || caught.name === "AbortError")) ||
    (caught instanceof Error && caught.name === "TimeoutError")
  );
}

function providerDetail(bodyText: string): string {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const parts = [record["detail"], record["error_code"]]
        .filter((part): part is string => typeof part === "string" && part.length > 0);
      if (parts.length > 0) return parts.join(" ").slice(0, 200);
    }
  } catch {
    // Fall through to the generic message below.
  }
  return "no usable error detail";
}

async function bachsRequest(
  config: BachsConfig,
  path: string,
  options: {
    method: "GET" | "POST";
    body?: Record<string, unknown>;
    idempotencyKey?: string;
    fetchImpl: typeof fetch;
    timeoutMs: number;
  },
): Promise<unknown> {
  const { method, body, idempotencyKey, fetchImpl, timeoutMs } = options;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };

  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (caught) {
    if (isTimeoutError(caught)) {
      console.error(`[bachs] request timed out: ${method} ${path}`);
      throw new BachsError(
        "timeout",
        `Bachs request timed out after ${timeoutMs}ms. Treat the outcome as uncertain and reconcile before retrying.`,
      );
    }
    console.error(`[bachs] request failed: ${method} ${path}`, caught);
    throw new BachsError(
      "network",
      "Bachs request failed before a response arrived. Treat the outcome as uncertain and reconcile before retrying.",
    );
  }

  const bodyText = await response.text();
  if (!response.ok) {
    console.error(`[bachs] error response: ${method} ${path} -> HTTP ${response.status}`);
    throw new BachsError(
      "http",
      `Bachs request failed (HTTP ${response.status}): ${providerDetail(bodyText)}`,
      response.status,
    );
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    throw new BachsError(
      "malformed",
      "Bachs returned an unreadable (non-JSON) success response. Treating it as unverified.",
    );
  }
}

function toCheckoutStatus(status: string): BachsCheckoutStatus {
  if (status === "open" || status === "completed" || status === "expired") {
    return status;
  }
  return "unknown";
}

/**
 * Open a hosted Bachs checkout for a promotion order. Dynamic pricing: the
 * amount travels as a raw `pricing` object, no catalog product needed.
 */
export async function createCheckout(
  input: CreateBachsCheckoutInput,
  fetchImpl: typeof fetch = fetch,
  options: BachsRequestOptions = {},
): Promise<BachsCheckout> {
  const parsed = checkoutInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BachsError(
      "validation",
      `Invalid checkout input: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  if (parsed.data.amountKobo < ORDER_MIN_TOTAL_KOBO) {
    throw new BachsError(
      "validation",
      `Promotion total must be at least ${ORDER_MIN_TOTAL_KOBO} kobo (NGN 100 minimum transaction).`,
    );
  }

  const config = getBachsConfig();
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const raw = await bachsRequest(config, "/v1/checkout-sessions", {
    method: "POST",
    body: {
      pricing: {
        currency: parsed.data.currency,
        amount: koboToDecimalString(parsed.data.amountKobo),
      },
      reference: parsed.data.orderReference,
      metadata: { order_id: parsed.data.orderId },
      customer: { email: parsed.data.customerEmail },
      success_url: parsed.data.successUrl,
      cancel_url: parsed.data.cancelUrl,
      expires_in_minutes: CHECKOUT_TTL_MINUTES,
    },
    idempotencyKey: parsed.data.orderId,
    fetchImpl,
    timeoutMs,
  });

  const response = checkoutResponseSchema.safeParse(raw);
  if (!response.success) {
    throw new BachsError(
      "malformed",
      "Bachs returned a checkout response without a usable checkout_id and checkout_url. Treating it as unverified.",
    );
  }
  return { checkoutId: response.data.checkout_id, checkoutUrl: response.data.checkout_url };
}

/**
 * Retrieve a checkout and normalize its payment evidence. `paid` is true
 * only for a succeeded NGN payment with a parseable amount; open, expired,
 * failed, and canceled states all report `paid: false` with their raw
 * states preserved for the caller to map.
 */
export async function verifyPayment(
  checkoutId: string,
  fetchImpl: typeof fetch = fetch,
  options: BachsRequestOptions = {},
): Promise<BachsPaymentVerification> {
  if (typeof checkoutId !== "string" || checkoutId.length === 0) {
    throw new BachsError("validation", "A checkout ID is required to verify payment.");
  }

  const config = getBachsConfig();
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const raw = await bachsRequest(
    config,
    `/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`,
    { method: "GET", fetchImpl, timeoutMs },
  );

  const response = verifyResponseSchema.safeParse(raw);
  if (!response.success) {
    throw new BachsError(
      "malformed",
      "Bachs returned a verification response without a usable status. Treating it as unverified.",
    );
  }

  const amountKobo = decimalStringToKobo(response.data.amount ?? null);
  const currency =
    typeof response.data.currency === "string" && response.data.currency.length > 0
      ? response.data.currency
      : null;
  const paid =
    response.data.payment_status === "succeeded" &&
    amountKobo !== null &&
    currency === "NGN";

  return {
    checkoutId,
    status: toCheckoutStatus(response.data.status),
    paymentStatus: response.data.payment_status ?? null,
    paid,
    amountKobo,
    currency,
    reference:
      typeof response.data.reference === "string" ? response.data.reference : null,
    metadata: response.data.metadata ?? {},
  };
}
