// Server-only Meta Model API transport, shared by the AI Event Copilot, NL
// discovery, and Admin Intelligence.
//
// One module owns the request shape, timeout, and status mapping so every
// caller behaves identically at the boundary. Callers keep their own prompts,
// JSON schemas, token/timeout budgets, and user-facing messages: this module
// throws typed MetaError codes and each caller maps codes to its exact
// existing strings, so migrating a caller never changes what users see.
//
// SECURITY: this module reads MODEL_API_KEY. It is a *.server.ts module, so
// the existing privileged-client ESLint boundary applies automatically:
// UI code must go through server functions instead. Error messages and logs
// never carry the key, request bodies, or provider response bodies.
export const META_CHAT_COMPLETIONS_URL = "https://api.meta.ai/v1/chat/completions";
export const META_MODEL = "muse-spark-1.3";

export type MetaErrorCode =
  | "config"
  | "timeout"
  | "network"
  | "unauthorized"
  | "rate_limited"
  | "server"
  | "bad_request"
  | "malformed";

export class MetaError extends Error {
  readonly code: MetaErrorCode;
  readonly httpStatus?: number;

  constructor(code: MetaErrorCode, message: string, httpStatus?: number) {
    super(message);
    this.name = "MetaError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface MetaChatMessage {
  role: string;
  content: string;
}

export interface MetaChatJsonOptions {
  messages: MetaChatMessage[];
  /** Name attached to the structured-output schema (observability only). */
  schemaName: string;
  jsonSchema: unknown;
  maxTokens: number;
  timeoutMs: number;
  /** Log tag identifying the caller, e.g. "[copilot]". */
  logPrefix: string;
  /** Server fetch override (tests inject fakes; production uses fetch). */
  fetchImpl?: typeof fetch;
}

export interface MetaChatJsonResult {
  status: number;
  payload: unknown;
}

/**
 * POSTs one structured-output chat request and returns the parsed payload.
 * Callers extract and zod-validate the model's JSON themselves.
 */
export async function metaChatJson(
  options: MetaChatJsonOptions,
): Promise<MetaChatJsonResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = process.env["MODEL_API_KEY"];
  if (!apiKey) {
    console.error(
      `${options.logPrefix} MODEL_API_KEY is not set; refusing to call Meta API.`,
    );
    throw new MetaError("config", "Meta API key is not configured.");
  }

  let response: Response;
  try {
    response = await fetchImpl(META_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: META_MODEL,
        messages: options.messages,
        response_format: {
          type: "json_schema",
          json_schema: { name: options.schemaName, schema: options.jsonSchema },
        },
        max_completion_tokens: options.maxTokens,
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (caught) {
    console.error(`${options.logPrefix} Meta API request failed:`, caught);
    if (caught instanceof DOMException && caught.name === "TimeoutError") {
      throw new MetaError(
        "timeout",
        `Meta API request timed out after ${options.timeoutMs}ms.`,
      );
    }
    throw new MetaError(
      "network",
      "Meta API request failed before a response arrived.",
    );
  }

  if (!response.ok) {
    // Log only the status server-side. Provider bodies can echo request
    // details, so they are never forwarded to logs or the browser.
    console.error(
      `${options.logPrefix} Meta API responded with status ${response.status}.`,
    );
    if (response.status === 401 || response.status === 403) {
      throw new MetaError(
        "unauthorized",
        `Meta API refused the request (HTTP ${response.status}).`,
        response.status,
      );
    }
    if (response.status === 429) {
      throw new MetaError(
        "rate_limited",
        "Meta API rate limit reached (HTTP 429).",
        response.status,
      );
    }
    if (response.status >= 500) {
      throw new MetaError(
        "server",
        `Meta API is unavailable (HTTP ${response.status}).`,
        response.status,
      );
    }
    throw new MetaError(
      "bad_request",
      `Meta API rejected the request (HTTP ${response.status}).`,
      response.status,
    );
  }

  try {
    const payload: unknown = await response.json();
    return { status: response.status, payload };
  } catch {
    throw new MetaError(
      "malformed",
      "Meta API returned an unreadable (non-JSON) response.",
    );
  }
}
