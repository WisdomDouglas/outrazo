// Pure Bachs webhook signature verification (no secrets at rest, no I/O).
//
// Implements the documented scheme: HMAC-SHA256 over "{timestamp}.{raw_body}",
// preferring X-Bachs-Signature-V2 (t={ts},v1={sig}[,v1=...], any-v1-wins for
// rotation) with the legacy X-Bachs-Signature + X-Bachs-Timestamp pair as
// fallback. node:crypto loads dynamically, matching the repo's precedent for
// server-side crypto.

export const BACHS_SIGNATURE_TOLERANCE_SECONDS = 300;

export interface BachsSignatureCheck {
  verified: boolean;
  /** Machine-readable reason, safe to log. Never includes secrets. */
  reason:
    | "ok"
    | "missing-signature"
    | "malformed-signature"
    | "stale-timestamp"
    | "mismatch";
  scheme: "v2" | "legacy" | "none";
}

export interface BachsSignatureInput {
  rawBody: string;
  headers: Headers;
  secret: string;
  /** Unix seconds. Defaults to the current time; injectable for tests. */
  nowSeconds?: number;
  toleranceSeconds?: number;
}

const HEX_RE = /^[0-9a-fA-F]+$/;

export async function verifyBachsSignature(
  input: BachsSignatureInput,
): Promise<BachsSignatureCheck> {
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const nowSeconds =
    input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? BACHS_SIGNATURE_TOLERANCE_SECONDS;

  const v2Header = input.headers.get("x-bachs-signature-v2");
  if (v2Header !== null) {
    const parts = v2Header
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const timestampPart = parts.find((part) => part.startsWith("t="));
    const signatures = parts
      .filter((part) => part.startsWith("v1="))
      .map((part) => part.slice("v1=".length));
    const timestamp =
      timestampPart === undefined
        ? Number.NaN
        : Number.parseInt(timestampPart.slice("t=".length), 10);
    if (!Number.isSafeInteger(timestamp) || signatures.length === 0) {
      return { verified: false, reason: "malformed-signature", scheme: "v2" };
    }
    if (Math.abs(nowSeconds - timestamp) > tolerance) {
      return { verified: false, reason: "stale-timestamp", scheme: "v2" };
    }
    const expected = createHmac("sha256", input.secret)
      .update(`${timestamp}.${input.rawBody}`, "utf8")
      .digest();
    for (const signature of signatures) {
      if (signature.length !== expected.length * 2 || !HEX_RE.test(signature)) {
        continue;
      }
      if (timingSafeEqual(expected, Buffer.from(signature, "hex"))) {
        return { verified: true, reason: "ok", scheme: "v2" };
      }
    }
    return { verified: false, reason: "mismatch", scheme: "v2" };
  }

  const legacySignature = input.headers.get("x-bachs-signature");
  const legacyTimestamp = input.headers.get("x-bachs-timestamp");
  if (legacySignature === null || legacyTimestamp === null) {
    return { verified: false, reason: "missing-signature", scheme: "none" };
  }
  const timestamp = Number.parseInt(legacyTimestamp.trim(), 10);
  if (!Number.isSafeInteger(timestamp)) {
    return { verified: false, reason: "malformed-signature", scheme: "legacy" };
  }
  if (Math.abs(nowSeconds - timestamp) > tolerance) {
    return { verified: false, reason: "stale-timestamp", scheme: "legacy" };
  }
  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.rawBody}`, "utf8")
    .digest();
  const candidate = legacySignature.trim();
  if (candidate.length !== expected.length * 2 || !HEX_RE.test(candidate)) {
    return { verified: false, reason: "malformed-signature", scheme: "legacy" };
  }
  if (!timingSafeEqual(expected, Buffer.from(candidate, "hex"))) {
    return { verified: false, reason: "mismatch", scheme: "legacy" };
  }
  return { verified: true, reason: "ok", scheme: "legacy" };
}
