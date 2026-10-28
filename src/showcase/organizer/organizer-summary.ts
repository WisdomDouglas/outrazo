/** Genuine database-backed counts for the organizer overview. */
export interface OrganizerEventCounts {
  total: number;
  published: number;
  drafts: number;
  upcoming: number;
}

/**
 * Derives overview counts from organizer-owned event rows. `now` is
 * injectable so tests can pin the upcoming/past boundary.
 */
export function summarizeOrganizerEvents(
  events: Array<{ published: boolean; startsAt: string }>,
  now: number = Date.now(),
): OrganizerEventCounts {
  let published = 0;
  let upcoming = 0;
  for (const event of events) {
    if (event.published) published += 1;
    const startsAt = new Date(event.startsAt).getTime();
    if (Number.isFinite(startsAt) && startsAt >= now) upcoming += 1;
  }
  return { total: events.length, published, drafts: events.length - published, upcoming };
}
