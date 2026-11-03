// Static safeguards for the organizer order-read grants migration (review-only).
//
// The organizer-facing order queries (promotion success/cancelled pages and
// the Promotions list) read promotion_orders through the caller's own user
// client and select organizer_id (explicit ownership re-check + list filter)
// plus checkout_expires_at (resume display). The base P2 grant omitted both
// columns, so every organizer read failed with "permission denied" while the
// service-role checkout/webhook paths kept working. This migration completes
// the read grant with exactly those two columns.
//
// These tests read the migration and source files; nothing touches a database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const GRANTS_MIGRATION_PATH = new URL(
  "../supabase/migrations/20261107090000_promotion_order_read_grants_v1.sql",
  import.meta.url,
);
const BASE_MIGRATION_PATH = new URL(
  "../supabase/migrations/20261104090000_paid_promotions_v1.sql",
  import.meta.url,
);
const ORDERS_SOURCE_PATH = new URL(
  "../src/showcase/promotions/promotion-orders.server.ts",
  import.meta.url,
);

function grantsText() {
  return readFileSync(GRANTS_MIGRATION_PATH, "utf8");
}

/** Columns in every GRANT SELECT (<cols>) ... promotion_orders TO authenticated. */
function grantedColumns(sql) {
  const granted = new Set();
  const pattern =
    /GRANT SELECT \(([^)]*)\)\s+ON public\.promotion_orders TO authenticated;/g;
  for (const match of sql.matchAll(pattern)) {
    for (const column of match[1].split(",")) granted.add(column.trim());
  }
  return granted;
}

/**
 * The shared select list behind both organizer-facing user-client reads
 * (getOwnPromotionOrder + listOwnPromotionOrders). The list filter also
 * constrains organizer_id, which is inside this same list.
 */
function userClientSelectColumns() {
  const source = readFileSync(ORDERS_SOURCE_PATH, "utf8");
  const match = /const ORDER_SUMMARY_COLUMNS =\s*"([^"]+)"/.exec(source);
  assert.ok(
    match,
    "ORDER_SUMMARY_COLUMNS literal not found in promotion-orders.server.ts",
  );
  return match[1].split(",").map((column) => column.trim());
}

describe("promotion order-read grants migration", () => {
  it("grants exactly the two missing read columns to authenticated", () => {
    const text = grantsText();
    const grantLines = text
      .split("\n")
      .filter((line) => line.trimStart().startsWith("GRANT"));
    assert.deepEqual(grantLines, [
      "GRANT SELECT (organizer_id) ON public.promotion_orders TO authenticated;",
      "GRANT SELECT (checkout_expires_at) ON public.promotion_orders TO authenticated;",
    ]);
  });

  it("introduces no table-level SELECT grant", () => {
    const text = grantsText();
    assert.doesNotMatch(text, /GRANT SELECT ON public\.promotion_orders/);
    assert.doesNotMatch(text, /GRANT ALL ON public\.promotion_orders/);
  });

  it("keeps checkout identifiers and hosted URLs server-only", () => {
    const text = grantsText();
    const grantLines = text
      .split("\n")
      .filter((line) => line.trimStart().startsWith("GRANT"));
    for (const line of grantLines) {
      assert.ok(!line.includes("checkout_id"), `must not grant: ${line}`);
      assert.ok(!line.includes("checkout_url"), `must not grant: ${line}`);
    }
  });

  it("changes no policy, function, grant removal, or data", () => {
    const text = grantsText();
    for (const forbidden of [
      "CREATE POLICY",
      "DROP POLICY",
      "ALTER POLICY",
      "ROW LEVEL SECURITY",
      "CREATE FUNCTION",
      "CREATE OR REPLACE FUNCTION",
      "DROP FUNCTION",
      "REVOKE",
      "INSERT INTO",
      "UPDATE public",
      "DELETE FROM",
      "ALTER TABLE",
    ]) {
      assert.ok(!text.includes(forbidden), `must not contain ${forbidden}`);
    }
  });

  it("fails loudly when the base table or columns are missing", () => {
    const text = grantsText();
    assert.ok(text.includes("to_regclass('public.promotion_orders')"));
    assert.ok(text.includes("organizer_id"));
    assert.ok(text.includes("checkout_expires_at"));
    assert.ok(text.includes("RAISE EXCEPTION"));
  });

  it("covers every organizer-facing select column (base + fix grants)", () => {
    const base = readFileSync(BASE_MIGRATION_PATH, "utf8");
    const fix = grantsText();
    const baseGranted = grantedColumns(base);
    const fixGranted = grantedColumns(fix);
    const granted = new Set([...baseGranted, ...fixGranted]);
    for (const column of userClientSelectColumns()) {
      assert.ok(
        granted.has(column),
        `organizer reads select ${column} but authenticated lacks SELECT on it`,
      );
    }
    // The fix is exactly the two missing columns — no more, no less.
    assert.deepEqual([...fixGranted].sort(), [
      "checkout_expires_at",
      "organizer_id",
    ]);
    for (const column of fixGranted) {
      assert.ok(
        !baseGranted.has(column),
        `${column} was already granted; the fix grant is redundant`,
      );
    }
  });

  it("leaves checkout secrets and table-wide reads ungranted end to end", () => {
    const base = readFileSync(BASE_MIGRATION_PATH, "utf8");
    const fix = grantsText();
    const granted = new Set([
      ...grantedColumns(base),
      ...grantedColumns(fix),
    ]);
    assert.ok(!granted.has("checkout_id"));
    assert.ok(!granted.has("checkout_url"));
    assert.doesNotMatch(base, /GRANT SELECT ON public\.promotion_orders/);
    assert.doesNotMatch(base, /GRANT ALL ON public\.promotion_orders TO authenticated/);
  });
});
