// Static safeguards for the Step 4 checkout-columns migration (review-only).
//
// The migration must stay additive (nullable columns, partial unique index)
// and must never grant the checkout URL columns to client roles. These tests
// read the file; nothing touches a database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261106090000_promotion_checkout_columns_v1.sql",
  import.meta.url,
);

function migrationText() {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("promotion checkout-columns migration", () => {
  it("adds the three nullable checkout columns", () => {
    const text = migrationText();
    for (const column of [
      "checkout_id text",
      "checkout_url text",
      "checkout_expires_at timestamptz",
    ]) {
      assert.ok(
        text.includes(`ADD COLUMN IF NOT EXISTS ${column}`),
        `missing: ${column}`,
      );
    }
    assert.ok(!text.includes("SET NOT NULL"), "columns must stay nullable");
    assert.ok(!text.includes("DROP COLUMN"), "forward-only: no drops");
  });

  it("protects non-null checkout ids with a partial unique index", () => {
    const text = migrationText();
    assert.ok(
      text.includes("CREATE UNIQUE INDEX IF NOT EXISTS promotion_orders_checkout_id_key"),
    );
    assert.ok(text.includes("WHERE checkout_id IS NOT NULL"));
  });

  it("grants no checkout column to client roles", () => {
    const text = migrationText();
    const grants = text
      .split("\n")
      .filter((line) => line.trimStart().startsWith("GRANT"));
    assert.deepEqual(grants, []);
  });

  it("documents the server-only URL rule", () => {
    const text = migrationText();
    assert.ok(text.includes("checkout_url"));
    assert.ok(text.includes("server functions"));
  });
});
