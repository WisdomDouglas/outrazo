// Public active-promotion lookup for the homepage spotlight and Explore
// placements. Returns EVERY live promotion (staff-scheduled and paid),
// ending-soonest first — the old single-row lookup hid the whole section
// the moment two promotions overlapped.
//
// Minimum-field design: this query selects only scheduling columns.
// Row-Level Security re-checks the active window with database time, and
// creator identities are not granted to public roles at all. Event content
// arrives through the existing published-only catalog join, which hides
// drafts and cancelled events on its own.
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/external-client";
import {
  ACTIVE_PROMOTIONS_LIMIT,
  selectActivePromotions,
  type ActivePromotion,
  type PromotionRowLike,
} from "./active-promotions";

async function fetchPromotionRows(limit: number): Promise<PromotionRowLike[]> {
  // Local supabase-js types do not include event_promotions yet, so this one
  // public read is structurally typed instead of editing generated files.
  const client = supabase as unknown as {
    from(table: "event_promotions"): {
      select(columns: string): {
        eq(column: string, value: string): {
          lte(column: string, value: string): {
            gt(column: string, value: string): {
              order(column: string, options: { ascending: boolean }): {
                limit(count: number): Promise<{
                  data: PromotionRowLike[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
  };
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("event_promotions")
    .select("id, event_id, status, starts_at, ends_at")
    .eq("status", "active")
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso)
    .order("ends_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Loads all live promotions. Resolves to an empty list while loading, when
 * nothing is live, or when anything fails — discovery surfaces must never
 * break because of promotions, so failures stay silent apart from a console
 * entry. Consumers join `eventId` against the published event catalog.
 */
export function useActivePromotions(limit: number = ACTIVE_PROMOTIONS_LIMIT): {
  promotions: ActivePromotion[];
  loading: boolean;
} {
  const [promotions, setPromotions] = useState<ActivePromotion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await fetchPromotionRows(limit);
        if (!active) return;
        setPromotions(selectActivePromotions(rows, new Date().toISOString(), limit));
      } catch (caught) {
        if (!active) return;
        console.error(
          "[promotions] active-promotion lookup failed:",
          caught instanceof Error ? caught.message : caught,
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [limit]);

  return { promotions, loading };
}
