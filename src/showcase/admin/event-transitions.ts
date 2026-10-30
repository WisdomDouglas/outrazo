// Pure event-lifecycle helpers for admin event management (safe to import
// anywhere, including server functions and tests).
//
// Publication model (verified in the repository): public discovery shows
// events whose `published` flag is true; organizers toggle that flag only.
// `status` is a free-text label the app sets to "upcoming" at creation and
// nothing filters on, so "cancelled" is a safe terminal label for it.

export type EventMutationKind = "publish" | "unpublish" | "cancel" | "reopen";

export interface EventLifecycleState {
  published: boolean;
  status: string | null;
}

/** The terminal label an admin cancellation writes to events.status. */
export const CANCELLED_STATUS = "cancelled";

/** The label a reopen restores: the same value creation writes. */
export const ACTIVE_STATUS = "upcoming";

// Explains why a conditional admin update matched no row, after the server
// re-reads the event. Either the event is gone or a concurrent change already
// put it in (or out of) the target state; both cases need a refresh, not a
// retry of the same write.
export function describeStalledMutation(
  kind: EventMutationKind,
  event: EventLifecycleState | null,
): string {
  if (!event) {
    return "That event no longer exists. Refresh the list and try again.";
  }
  switch (kind) {
    case "publish":
      return "That event is already published. Refresh to see its current state.";
    case "unpublish":
      return "That event is already a draft. Refresh to see its current state.";
    case "cancel":
      return "That event is already cancelled. Refresh to see its current state.";
    case "reopen":
      return event.status === CANCELLED_STATUS
        ? "Could not reopen that event. Refresh and try again."
        : "That event is not cancelled, so there is nothing to reopen.";
  }
}

// Strips characters that would corrupt a PostgREST .or() search expression
// (commas split conditions; % _ \ ( ) alter matching) and enforces the same
// length cap as the server validator. An input of only stripped characters
// yields "", which the server treats as "no search".
export function sanitizeSearchTerm(input: string): string {
  return input.replace(/[%_,\\()]/g, "").trim().slice(0, 120);
}
