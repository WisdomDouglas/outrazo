// Pure multi-promotion storefront helpers (safe to import anywhere,
// including public UI and tests).
//
// These decide WHICH promotions are live, WHERE promoted cards land in
// Explore, and HOW the Spotlight carousel advances. They never touch the
// network or the DOM: the hooks and components own effects and rendering.

import { computePromotionStatus } from "./promotion-windows";

/** Raw promotion row shape used for storefront selection. */
export interface PromotionRowLike {
  id: string;
  event_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

/** A live promotion, resolved to the event it features. */
export interface ActivePromotion {
  id: string;
  eventId: string;
  startsAt: string;
  endsAt: string;
}

/** Sensible Spotlight/Explore cap: feeds stay browsable, never ad walls. */
export const ACTIVE_PROMOTIONS_LIMIT = 10;

/**
 * Live promotions, ending-soonest first. Applies the same '[)' window
 * semantics as the database (active from starts_at up to ends_at), dedupes
 * by event defensively (the per-event exclusion already forbids same-event
 * overlap), and caps the result for feed display.
 */
export function selectActivePromotions(
  rows: PromotionRowLike[],
  nowIso: string = new Date().toISOString(),
  limit: number = ACTIVE_PROMOTIONS_LIMIT,
): ActivePromotion[] {
  const live = rows.filter(
    (row) => computePromotionStatus(row, nowIso) === "active",
  );
  live.sort((a, b) => {
    const endOrder = a.ends_at.localeCompare(b.ends_at);
    if (endOrder !== 0) return endOrder;
    return a.starts_at.localeCompare(b.starts_at);
  });
  const seen = new Set<string>();
  const selected: ActivePromotion[] = [];
  for (const row of live) {
    if (seen.has(row.event_id)) continue;
    seen.add(row.event_id);
    selected.push({
      id: row.id,
      eventId: row.event_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    });
    if (selected.length >= limit) break;
  }
  return selected;
}

export interface FeedSlot<T> {
  item: T;
  promoted: boolean;
}

// Explore boost slots: the feed positions (0-based) where a late-matching
// promotion may move so at least one promoted card shows early. Moves are
// rare by design — natural order wins everywhere else.
const BOOST_SLOTS = [3, 11];

/**
 * Places promoted cards inside an Explore result list. Every matching
 * promoted event keeps its natural position and gains the promoted flag;
 * then, for each boost slot with no promoted neighbor, the earliest
 * later-matching promotion moves into the slot (leaving its old spot, so
 * nothing repeats). Never drops, duplicates, or creates consecutive
 * promoted cards.
 */
export function boostPromotedPlacement<T>(
  items: T[],
  isPromoted: (item: T) => boolean,
): FeedSlot<T>[] {
  const feed: FeedSlot<T>[] = items.map((item) => ({
    item,
    promoted: isPromoted(item),
  }));
  for (const slot of BOOST_SLOTS) {
    if (slot >= feed.length) continue;
    let neighborPromoted = false;
    for (let index = slot - 1; index <= slot + 1; index += 1) {
      if (index >= 0 && index < feed.length && feed[index].promoted) {
        neighborPromoted = true;
      }
    }
    if (neighborPromoted) continue;
    const candidate = feed.findIndex(
      (slotItem, index) => index > slot + 1 && slotItem.promoted,
    );
    if (candidate === -1) continue;
    const [moved] = feed.splice(candidate, 1);
    feed.splice(slot, 0, moved);
  }
  return feed;
}

/**
 * Carousel step with wraparound. Single-slide and empty carousels stay
 * put — callers render those without carousel chrome anyway.
 */
export function nextSlideIndex(
  current: number,
  total: number,
  step: 1 | -1,
): number {
  if (total <= 1) return 0;
  return (current + step + total) % total;
}

/** Autoplay runs only with several slides, motion allowed, and no pause. */
export function shouldAutoplay(
  slideCount: number,
  options: { reducedMotion: boolean; paused: boolean },
): boolean {
  return slideCount > 1 && !options.reducedMotion && !options.paused;
}
