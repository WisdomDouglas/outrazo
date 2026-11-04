// Pure ticket-code helpers (P3). Ticket codes look like "TKT-A1B2C3D4E5":
// a fixed prefix plus 10 uppercase hex characters carrying 40 bits of
// randomness. No I/O: shared by the check-in form, the scanner, and the
// server function so all three normalize input identically.

/** Normalized ticket-code shape: TKT- plus 10 uppercase hex chars. */
export const TICKET_CODE_RE = /^TKT-[0-9A-F]{10}$/;

export type NormalizedTicketCode =
  | { ok: true; code: string }
  | { ok: false; error: string };

/**
 * Normalizes raw scanner/keyboard input: trims whitespace (scanners often
 * add newlines), uppercases, and validates the shape. Returns a friendly
 * error instead of throwing so the door UI can show it inline.
 */
export function normalizeTicketCode(input: string): NormalizedTicketCode {
  const code = input.trim().toUpperCase();
  if (!code) {
    return { ok: false, error: "Enter or scan a ticket code." };
  }
  if (!TICKET_CODE_RE.test(code)) {
    return { ok: false, error: "That doesn't look like an Outrazo ticket code." };
  }
  return { ok: true, code };
}
