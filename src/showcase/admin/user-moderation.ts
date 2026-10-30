// Pure user-moderation helpers for the admin console (safe to import
// anywhere, including server functions and tests).
//
// Suspension model (verified against the repository and the Supabase Auth
// Admin API): suspending sets an Auth-level ban through the service-role
// server client, which blocks sign-in and token refresh at the auth server
// itself — no profiles flag, no RLS change, and nothing is ever deleted.
// Already-issued access tokens may remain valid until they expire or refresh,
// so a ban takes full effect on the user's next sign-in or refresh.

// Effectively indefinite ban (~100 years). Supabase has no permanent flag;
// this is the documented duration-string format.
export const INDEFINITE_BAN_DURATION = "876000h";

// Clears a ban. The Admin API treats the literal "none" as "unban".
export const CLEAR_BAN_DURATION = "none";

// Validates a suspend/restore request against the account's current ban state.
// Returns a friendly error message, or null when the transition may proceed.
// Pure so the invalid-transition matrix is unit-testable without a database.
export function checkSuspensionTransition(
  wantSuspended: boolean,
  banned: boolean,
): string | null {
  if (wantSuspended && banned) {
    return "That account is already suspended. Refresh to see its current state.";
  }
  if (!wantSuspended && !banned) {
    return "That account is not suspended, so there is nothing to restore.";
  }
  return null;
}
