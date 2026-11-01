// Provider-rename migration safeguard tests (P2 Step 1, proposal).
//
// Scope, stated honestly: these tests read the PROPOSAL migration FILE and
// assert its rename/drop/grants sequence. They cannot execute SQL and do NOT
// prove live database behavior. They do guarantee nobody can silently alter
// the rename sequence, drop the grant restoration, or smuggle behavioral
// changes into this rename without a test failing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261105090000_promotion_provider_bachs_v1.sql",
  import.meta.url,
);

const sql = readFileSync(MIGRATION_PATH, "utf8");

const P1_PATH = new URL(
  "../supabase/migrations/20261104090000_paid_promotions_v1.sql",
  import.meta.url,
);

const p1 = readFileSync(P1_PATH, "utf8");

function functionBody(name) {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `expected function ${name} in the migration`);
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `expected end of function ${name} in the migration`);
  return sql.slice(start, end);
}

const refund = functionBody("record_promotion_refund");

describe("provider rename proposal boundaries", () => {
  it("is marked proposed-pending-review and runs in one transaction", () => {
    assert.match(sql, /STATUS: PROPOSED — PENDING REVIEW\. NOT APPLIED/);
    assert.ok(sql.indexOf("BEGIN;") !== -1);
    assert.ok(sql.lastIndexOf("\nCOMMIT;") > sql.indexOf("BEGIN;"));
  });

  it("leaves no provider name behind in the resulting state", () => {
    // A rename must name the old identifiers in its RENAME/WHERE/precondition
    // mechanics — but nothing that survives the migration may reference them.
    // Every executable paystack mention must sit on a rename-mechanics line.
    for (const line of sql.split("\n")) {
      if (/^\s*--/.test(line)) continue;
      if (/paystack/i.test(line)) {
        assert.match(
          line,
          /RENAME|WHERE|attname|conname|RAISE EXCEPTION/,
          `stray provider reference: ${line.trim()}`,
        );
      }
    }
    assert.match(sql, /SET DEFAULT 'bachs'/);
    assert.doesNotMatch(refund, /paystack/i);
  });

  it("leaves the applied P1 migration byte-for-byte alone", () => {
    // These P1 strings must survive verbatim: if anyone "fixes" the old
    // provider name by editing history instead of this migration, fail.
    assert.match(p1, /paystack_reference text NOT NULL UNIQUE,/);
    assert.match(p1, /provider text NOT NULL DEFAULT 'paystack',/);
    assert.match(
      p1,
      /RAISE EXCEPTION 'Record the Paystack refund reference as evidence\.';/,
    );
  });
});

describe("provider rename preconditions", () => {
  it("requires the P1 tables, column, constraint, and function first", () => {
    assert.match(sql, /to_regclass\('public\.promotion_refunds'\)/);
    assert.match(sql, /to_regclass\('public\.promotion_orders'\)/);
    assert.match(sql, /to_regclass\('public\.promotion_webhook_events'\)/);
    assert.match(sql, /attname = 'paystack_reference'/);
    assert.match(sql, /attname = 'provider_reference'/);
    assert.match(sql, /conname = 'promotion_refunds_paystack_reference_key'/);
    assert.match(
      sql,
      /to_regprocedure\('public\.record_promotion_refund\(uuid, text, text\)'\)/,
    );
  });

  it("refuses to run when already applied", () => {
    assert.match(sql, /This rename already ran/);
  });

  it("aborts on unexpected live dependencies of any type before the DROP", () => {
    assert.match(sql, /FROM pg_catalog\.pg_depend d/);
    assert.match(sql, /string_agg\(d\.deptype::text/);
    assert.match(
      sql,
      /has % unexpected dependencies \(%\); investigate before renaming/,
    );
    assert.doesNotMatch(sql, /AND d\.deptype = '/);
    const guard = sql.indexOf("unexpected dependencies");
    const drop = sql.indexOf("DROP FUNCTION public.record_promotion_refund(uuid, text, text);");
    assert.ok(guard !== -1 && drop !== -1 && guard < drop);
  });

  it("rejects unknown provider values before the rewrite", () => {
    assert.match(
      sql,
      /FROM public\.promotion_orders WHERE provider NOT IN \('paystack', 'bachs'\);/,
    );
    assert.match(
      sql,
      /FROM public\.promotion_webhook_events WHERE provider NOT IN \('paystack', 'bachs'\);/,
    );
    assert.match(sql, /unexpected provider values; investigate before renaming/);
  });
});

describe("provider rename statements", () => {
  it("renames the column, constraint, and defaults in dependency order", () => {
    const column = sql.indexOf(
      "ALTER TABLE public.promotion_refunds RENAME COLUMN paystack_reference TO provider_reference;",
    );
    const constraint = sql.indexOf(
      "ALTER TABLE public.promotion_refunds RENAME CONSTRAINT promotion_refunds_paystack_reference_key TO promotion_refunds_provider_reference_key;",
    );
    const ordersDefault = sql.indexOf(
      "ALTER TABLE public.promotion_orders ALTER COLUMN provider SET DEFAULT 'bachs';",
    );
    const webhooksDefault = sql.indexOf(
      "ALTER TABLE public.promotion_webhook_events ALTER COLUMN provider SET DEFAULT 'bachs';",
    );
    const ordersUpdate = sql.indexOf(
      "UPDATE public.promotion_orders SET provider = 'bachs' WHERE provider = 'paystack';",
    );
    const webhooksUpdate = sql.indexOf(
      "UPDATE public.promotion_webhook_events SET provider = 'bachs' WHERE provider = 'paystack';",
    );
    for (const [label, at] of [
      ["column", column],
      ["constraint", constraint],
      ["orders default", ordersDefault],
      ["webhooks default", webhooksDefault],
      ["orders update", ordersUpdate],
      ["webhooks update", webhooksUpdate],
    ]) {
      assert.notEqual(at, -1, `expected ${label} rename step`);
    }
    assert.ok(column < constraint);
    assert.ok(ordersDefault < ordersUpdate);
    assert.ok(webhooksDefault < webhooksUpdate);
  });

  it("adds no tables, columns, policies, or constraints", () => {
    assert.doesNotMatch(sql, /CREATE TABLE/);
    assert.doesNotMatch(sql, /ADD COLUMN/);
    assert.doesNotMatch(sql, /CREATE POLICY/);
    assert.doesNotMatch(sql, /ADD CONSTRAINT/);
  });
});

describe("record_promotion_refund drop and recreate", () => {
  it("drops before creating (parameter renames need DROP + CREATE)", () => {
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.record_promotion_refund\(/);
    const drop = sql.indexOf(
      "DROP FUNCTION public.record_promotion_refund(uuid, text, text);",
    );
    const create = sql.indexOf("CREATE FUNCTION public.record_promotion_refund(");
    assert.ok(drop !== -1 && create !== -1 && drop < create);
  });

  it("renames the evidence parameter without touching the signature types", () => {
    assert.match(
      sql,
      /CREATE FUNCTION public\.record_promotion_refund\(\s+p_order_id uuid,\s+p_provider_reference text,\s+p_admin_note text DEFAULT NULL\s+\)/,
    );
    assert.doesNotMatch(refund, /p_paystack_reference/);
  });

  it("keeps every gate, check, and audit shape identical", () => {
    assert.match(refund, /SECURITY DEFINER/);
    assert.match(refund, /SET search_path = ''/);
    assert.match(refund, /Sign in is required to record promotion refunds\./);
    assert.match(
      refund,
      /v_caller_role NOT IN \('super_admin', 'finance_admin'\)/,
    );
    assert.match(refund, /Record the provider refund reference as evidence\./);
    assert.match(refund, /FROM public\.promotion_orders WHERE id = p_order_id FOR UPDATE/);
    assert.match(refund, /Only orders awaiting refund can be recorded as refunded\./);
    assert.match(
      refund,
      /INSERT INTO public\.promotion_refunds \(order_id, amount_kobo, currency, reason, provider_reference, admin_note, processed_by\)/,
    );
    assert.match(refund, /admin\.promotion\.refund/);
    assert.match(refund, /'provider_reference', btrim\(p_provider_reference\)/);
  });

  it("captures the live owner before the DROP and restores it after", () => {
    assert.match(
      sql,
      /CREATE TEMPORARY TABLE _record_refund_owner ON COMMIT DROP AS/,
    );
    assert.match(sql, /pg_catalog\.pg_get_userbyid\(p\.proowner\) AS owner_name/);
    assert.match(
      sql,
      /EXECUTE pg_catalog\.format\('ALTER FUNCTION public\.record_promotion_refund\(uuid, text, text\) OWNER TO %I', v_owner\);/,
    );
    assert.match(sql, /refusing to leave ownership to chance/);
    const capture = sql.indexOf("CREATE TEMPORARY TABLE _record_refund_owner");
    const drop = sql.indexOf("DROP FUNCTION public.record_promotion_refund(uuid, text, text);");
    const create = sql.indexOf("CREATE FUNCTION public.record_promotion_refund(");
    const restore = sql.indexOf("OWNER TO %I', v_owner");
    assert.ok(capture !== -1 && drop !== -1 && create !== -1 && restore !== -1);
    assert.ok(capture < drop && drop < create && create < restore);
  });

  it("restores the exact P1 grants after the DROP", () => {
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.record_promotion_refund\(uuid, text, text\) FROM PUBLIC, anon;/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.record_promotion_refund\(uuid, text, text\) TO authenticated, service_role;/,
    );
    const create = sql.indexOf("CREATE FUNCTION public.record_promotion_refund(");
    const revoke = sql.indexOf(
      "REVOKE ALL ON FUNCTION public.record_promotion_refund(uuid, text, text)",
    );
    const grant = sql.indexOf(
      "GRANT EXECUTE ON FUNCTION public.record_promotion_refund(uuid, text, text)",
    );
    assert.ok(create < revoke && revoke < grant);
  });
});

describe("rename plpgsql variable consistency", () => {
  it("declares every variable and argument the recreated body references", () => {
    const declareSection = refund.slice(refund.indexOf("DECLARE"), refund.indexOf("BEGIN"));
    const declared = new Set(
      [...declareSection.matchAll(/\b(v_\w+)\b/g)].map((match) => match[1]),
    );
    // Named parameters live on the CREATE line: the DROP above it carries
    // types only, so the helper must start there, not at first mention.
    const start = sql.indexOf("CREATE FUNCTION public.record_promotion_refund(");
    const params = new Set(
      [...sql.slice(start, sql.indexOf(")", start)).matchAll(/\b(p_\w+)\b/g)].map(
        (match) => match[1],
      ),
    );
    const code = refund
      .slice(refund.indexOf("BEGIN"))
      .replace(/--.*$/gm, "")
      .replace(/'([^']|'')*'/g, "''");
    for (const match of code.matchAll(/\bv_\w+\b/g)) {
      assert.ok(declared.has(match[0]), `uses undeclared variable ${match[0]}`);
    }
    for (const match of code.matchAll(/\bp_\w+\b/g)) {
      assert.ok(params.has(match[0]), `uses undeclared argument ${match[0]}`);
    }
  });
});

describe("rename RPC shadowing resistance", () => {
  it("schema-qualifies every table reference", () => {
    const body = refund.replace(/IS DISTINCT FROM/g, "");
    for (const keyword of ["FROM", "JOIN", "UPDATE"]) {
      assert.doesNotMatch(
        body,
        new RegExp(`\\b${keyword}\\s+(?!public\\.)[A-Za-z_"]`),
        `unqualified table after ${keyword}`,
      );
    }
    assert.doesNotMatch(
      body,
      /\bINSERT\s+INTO\s+(?!public\.)[A-Za-z_"]/,
      "unqualified table after INSERT INTO",
    );
    assert.doesNotMatch(body, /(?<!auth\.)\buid\(\)/, "unqualified uid() call");
  });
});
