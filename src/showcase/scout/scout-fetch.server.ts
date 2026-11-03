// Server-only Scout page fetcher.
//
// Retrieves source pages for extraction with SSRF + DNS-rebinding
// protection: only http(s) on default ports, per-hop hostname resolution
// with private/reserved IP rejection, and connections pinned to the
// validated IP (TLS SNI + Host header preserve the original hostname, so a
// rebinding answer can never steer the socket elsewhere). Tight timeouts
// and a hard response cap bound every hop. Output is plain text — fetched
// HTML is never rendered.
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

export const SCOUT_FETCH_TIMEOUT_MS = 15_000;
export const SCOUT_FETCH_MAX_BYTES = 512 * 1024;
export const SCOUT_FETCH_MAX_REDIRECTS = 3;
export const SCOUT_FETCH_TEXT_LIMIT = 20_000;

export type FetchFailure =
  | "blocked"
  | "timeout"
  | "network"
  | "too_large"
  | "bad_status"
  | "bad_content";

export type FetchOutcome =
  | { ok: true; url: string; status: number; text: string; bytes: number }
  | { ok: false; reason: FetchFailure; detail: string };

export function isBlockedIp(address: string): boolean {
  if (address.includes(":")) {
    const lower = address.toLowerCase();
    return (
      lower === "::1" ||
      lower.startsWith("fe80:") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower === "::"
    );
  }
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0 ||
    a >= 224
  );
}

export interface PinnedGetResponse {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

export interface ScoutFetchDeps {
  resolveHost?: (hostname: string) => Promise<string>;
  /** Pinned GET: connects to ip, presents hostname via SNI/Host. */
  requestImpl?: (url: string, ip: string) => Promise<PinnedGetResponse>;
}

async function defaultResolve(hostname: string): Promise<string> {
  const result = await lookup(hostname);
  return result.address;
}

function defaultPinnedGet(url: string, ip: string): Promise<PinnedGetResponse> {
  const parsed = new URL(url);
  const useTls = parsed.protocol === "https:";
  const requestFn = useTls ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const request = requestFn(
      {
        host: ip,
        port: parsed.port ? Number(parsed.port) : useTls ? 443 : 80,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        servername: parsed.hostname,
        timeout: SCOUT_FETCH_TIMEOUT_MS,
        headers: {
          Host: parsed.hostname,
          "User-Agent": "OutrazoScout/1.0 (+https://outrazo.com)",
          Accept: "text/html,text/plain",
          Connection: "close",
        },
      },
      (response) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            for (const entry of value) headers.append(key, entry);
          } else if (value !== undefined) {
            headers.set(key, value);
          }
        }
        const body = response.statusCode === 204 || response.statusCode === 304
          ? null
          : Readable.toWeb(response) as ReadableStream<Uint8Array>;
        resolve({ status: response.statusCode ?? 0, headers, body });
      },
    );
    request.on("timeout", () => {
      request.destroy(new DOMException("Timed out", "TimeoutError"));
    });
    request.on("error", reject);
    request.end();
  });
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

/** Small dependency-free HTML-to-text: drops scripts/styles, keeps wording. */
export function scoutHtmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SCOUT_FETCH_TEXT_LIMIT);
}

async function readCapped(body: ReadableStream<Uint8Array> | null): Promise<{ text: string; bytes: number; over: boolean }> {
  if (!body) return { text: "", bytes: 0, over: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      bytes += value.byteLength;
      if (bytes > SCOUT_FETCH_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { text: "", bytes, over: true };
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(merged), bytes, over: false };
}

export async function fetchScoutSource(
  rawUrl: string,
  deps: ScoutFetchDeps = {},
): Promise<FetchOutcome> {
  const requestImpl = deps.requestImpl ?? defaultPinnedGet;
  const resolveHost = deps.resolveHost ?? defaultResolve;
  let current = rawUrl;
  for (let hop = 0; hop <= SCOUT_FETCH_MAX_REDIRECTS; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return { ok: false, reason: "blocked", detail: "Unparseable URL." };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, reason: "blocked", detail: `Scheme ${parsed.protocol} not allowed.` };
    }
    if (parsed.port !== "" && parsed.port !== "80" && parsed.port !== "443") {
      return { ok: false, reason: "blocked", detail: "Non-standard ports not allowed." };
    }
    if (!parsed.hostname || parsed.hostname.toLowerCase() === "localhost") {
      return { ok: false, reason: "blocked", detail: "Hostname not allowed." };
    }
    let address: string;
    try {
      address = await resolveHost(parsed.hostname);
    } catch {
      return { ok: false, reason: "blocked", detail: "Hostname did not resolve." };
    }
    if (isBlockedIp(address)) {
      return { ok: false, reason: "blocked", detail: "Target address is not public." };
    }
    let response: PinnedGetResponse;
    try {
      response = await requestImpl(current, address);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "TimeoutError") {
        return { ok: false, reason: "timeout", detail: "Source took too long." };
      }
      return { ok: false, reason: "network", detail: "Source unreachable." };
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get("location");
      if (response.body) await response.body.cancel().catch(() => undefined);
      if (!next) return { ok: false, reason: "network", detail: "Redirect without location." };
      try {
        current = new URL(next, current).toString();
      } catch {
        return { ok: false, reason: "blocked", detail: "Bad redirect target." };
      }
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      if (response.body) await response.body.cancel().catch(() => undefined);
      return { ok: false, reason: "bad_status", detail: `Source returned ${response.status}.` };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/(text\/html|text\/plain|application\/xhtml)/.test(contentType)) {
      if (response.body) await response.body.cancel().catch(() => undefined);
      return { ok: false, reason: "bad_content", detail: `Content type ${contentType} not readable.` };
    }
    const read = await readCapped(response.body);
    if (read.over) return { ok: false, reason: "too_large", detail: "Source exceeds size limit." };
    const text = contentType.includes("text/plain") && !contentType.includes("html")
      ? read.text.slice(0, SCOUT_FETCH_TEXT_LIMIT)
      : scoutHtmlToText(read.text);
    return { ok: true, url: current, status: response.status, text, bytes: read.bytes };
  }
  return { ok: false, reason: "network", detail: "Too many redirects." };
}
