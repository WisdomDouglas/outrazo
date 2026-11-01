// Paid-promotions migration safeguard tests (P1, proposal).
//
// Scope, stated honestly: these tests read the PROPOSAL migration FILE and
// assert its safeguards are present and correctly ordered. They cannot execute
// SQL and do NOT prove live database behavior — that proof requires review,
// applying the migration, and exercising the reservation + state-machine
// drills against a real database. What they do guarantee is that nobody can
// silently weaken or reorder the safeguards in a future edit without a test
// failing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261104090000_paid_promotions_v1.sql",
  import.meta.url,
);

const sql = readFileSync(MIGRATION_PATH, "utf8");

function functionBody(name) {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `expected function ${name} in the migration`);
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `expected end of function ${name} in the migration`);
  return sql.slice(start, end);
}

const RPC_NAMES = [
  "move_order_to_refund_pending",
  "activate_paid_promotion",
  "cancel_promotion_order",
  "set_promotion_price",
  "record_promotion_refund",
  "create_event_promotion",
];

const bodies = Object.fromEntries(
  RPC_NAMES.map((name) => [name, functionBody(name)]),
);

describe("paid promotions proposal boundaries", () => {
  it("is marked proposed-pending-review and never applied silently", () => {
    assert.match(sql, /STATUS: PROPOSED — PENDING REVIEW\. NOT APPLIED/);
    assert.match(sql, /Do not execute it without/);
    assert.match(sql, /explicit authorization/);
  });

  it("touches no existing table except the two documented event_promotions changes", () => {
    // New tables legitimately use ALTER TABLE once for ENABLE ROW LEVEL
    // SECURITY (pinned per-table below); only pre-existing tables are
    // forbidden here, plus event_promotions beyond its two allowed changes
    // (order_id column + exclusion swap, pinned by their own tests).
    assert.doesNotMatch(
      sql,
      /ALTER TABLE public\.(events|profiles|organizers|admin_roles|audit_log|event_reports|event_attendees|ticket_orders|ticket_items)\b/,
    );
    assert.doesNotMatch(sql, /DROP POLICY/);
    assert.match(
      sql,
      /ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public\.promotion_orders\(id\) ON DELETE SET NULL;/,
    );
  });

  it("creates only the three documented new policies", () => {
    assert.match(sql, /CREATE POLICY "Authenticated organizers read promotion pricing"/);
    assert.match(sql, /CREATE POLICY "Organizers read own promotion orders"/);
    assert.match(sql, /CREATE POLICY "Organizers read own promotion refunds"/);
    assert.doesNotMatch(
      sql,
      /CREATE POLICY "(?!Authenticated organizers read promotion pricing|Organizers read own promotion orders|Organizers read own promotion refunds)/,
    );
    assert.doesNotMatch(
      sql,
      /ON public\.promotion_(pricing|orders|webhook_events|refunds) FOR (INSERT|UPDATE|DELETE)/,
    );
  });

  it("requires the Phase 2C-2 promotion foundation before doing anything", () => {
    assert.match(sql, /to_regclass\('public\.event_promotions'\)/);
    assert.match(
      sql,
      /to_regprocedure\('public\.create_event_promotion\(uuid, timestamptz, timestamptz\)'\)/,
    );
  });

  it("never cascades deletes into or out of money tables", () => {
    assert.doesNotMatch(sql, /ON DELETE CASCADE/);
    assert.match(
      sql,
      /event_id uuid NOT NULL REFERENCES public\.events\(id\) ON DELETE RESTRICT/,
    );
    assert.match(
      sql,
      /organizer_id uuid NOT NULL REFERENCES public\.profiles\(id\) ON DELETE RESTRICT/,
    );
  });
});

describe("promotion_pricing table", () => {
  it("stores an append-only kobo history readable by organizers", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.promotion_pricing \(/);
    assert.match(sql, /daily_amount_kobo integer NOT NULL CHECK \(daily_amount_kobo > 0\)/);
    assert.match(sql, /ALTER TABLE public\.promotion_pricing ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /GRANT SELECT ON public\.promotion_pricing TO authenticated;/);
    assert.match(sql, /GRANT ALL ON public\.promotion_pricing TO service_role;/);
  });
});

describe("promotion_orders table", () => {
  it("pins the seven-state lifecycle and duration bounds", () => {
    assert.match(
      sql,
      /CHECK \(status IN \('pending', 'paid', 'failed', 'expired', 'cancelled', 'refund_pending', 'refunded'\)\)/,
    );
    assert.match(sql, /days integer NOT NULL CHECK \(days BETWEEN 1 AND 30\)/);
  });

  it("keeps integer-kobo snapshots coherent with the NGN 100 floor", () => {
    assert.match(sql, /total_amount_kobo integer NOT NULL CHECK \(total_amount_kobo >= 10000\)/);
    assert.match(sql, /CHECK \(total_amount_kobo = days \* daily_amount_kobo\)/);
    assert.match(
      sql,
      /CHECK \(provider_reference ~ '\^\[A-Za-z0-9\._=-\]\+\$'\)/,
    );
  });

  it("reserves pending windows with a partial unique index", () => {
    // One live checkout per event: the second overlapping reservation fails
    // atomically on this index, whatever the concurrency.
    assert.match(
      sql,
      /CREATE UNIQUE INDEX IF NOT EXISTS promotion_orders_one_pending_per_event\s+ON public\.promotion_orders \(event_id\) WHERE \(status = 'pending'\);/,
    );
  });

  it("lets organizers read their own orders without staff-only columns", () => {
    assert.match(sql, /ALTER TABLE public\.promotion_orders ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /USING \(organizer_id = auth\.uid\(\)\)/);
    assert.match(
      sql,
      /GRANT SELECT \(id, event_id, days, daily_amount_kobo, total_amount_kobo, currency, status, status_reason, provider, provider_reference, promotion_id, paid_at, created_at\)\s+ON public\.promotion_orders TO authenticated;/,
    );
    assert.doesNotMatch(
      sql,
      /GRANT SELECT \([^)]*organizer_id[^)]*\)\s+ON public\.promotion_orders/,
    );
    assert.match(sql, /GRANT ALL ON public\.promotion_orders TO service_role;/);
  });
});

describe("webhook log and refunds tables", () => {
  it("deduplicates provider events for service-role eyes only", () => {
    assert.match(sql, /UNIQUE \(provider, provider_event_id\)/);
    assert.match(
      sql,
      /CHECK \(status IN \('received', 'processed', 'failed', 'ignored'\)\)/,
    );
    assert.match(sql, /ALTER TABLE public\.promotion_webhook_events ENABLE ROW LEVEL SECURITY;/);
    assert.match(
      sql,
      /REVOKE ALL ON public\.promotion_webhook_events FROM PUBLIC, anon, authenticated;/,
    );
    assert.match(sql, /GRANT ALL ON public\.promotion_webhook_events TO service_role;/);
  });

  it("records full-order refunds with owner-visible, staff-hidden columns", () => {
    assert.match(
      sql,
      /order_id uuid NOT NULL UNIQUE REFERENCES public\.promotion_orders\(id\) ON DELETE RESTRICT/,
    );
    // Each executed refund carries its own provider reference: recording the
    // same evidence twice (admin copy-paste across orders) must fail loudly
    // at the database instead of double-recording.
    assert.match(sql, /paystack_reference text NOT NULL UNIQUE,/);
    assert.match(sql, /o\.id = order_id AND o\.organizer_id = auth\.uid\(\)/);
    assert.match(
      sql,
      /GRANT SELECT \(id, order_id, amount_kobo, currency, reason, paystack_reference, processed_at\)\s+ON public\.promotion_refunds TO authenticated;/,
    );
  });
});

describe("exclusion swap", () => {
  it("enables btree_gist for per-event uuid equality", () => {
    assert.match(sql, /CREATE EXTENSION IF NOT EXISTS btree_gist;/);
  });

  it("drops the old global rule by looked-up name, never a guessed one", () => {
    assert.match(sql, /conrelid = 'public\.event_promotions'::pg_catalog\.regclass AND contype = 'x'/);
    assert.match(
      sql,
      /EXECUTE pg_catalog\.format\('ALTER TABLE public\.event_promotions DROP CONSTRAINT %I', v_old_name\);/,
    );
    assert.doesNotMatch(sql, /tstzrange_excl/);
  });

  it("requires exactly one old exclusion and skips cleanly when already swapped", () => {
    assert.match(sql, /IF v_old_count <> 1 THEN/);
    assert.match(sql, /Was 2C-2 applied\?/);
    assert.match(sql, /already present; skipping swap/);
  });

  it("adds a named per-event exclusion with '[)' bounds on active rows", () => {
    assert.match(
      sql,
      /ADD CONSTRAINT event_promotions_event_window_excl\s+EXCLUDE USING gist \(event_id WITH =, tstzrange\(starts_at, ends_at, '\[\)'\) WITH &&\) WHERE \(status = 'active'\);/,
    );
  });
});

describe("create_event_promotion replacement", () => {
  it("scopes the friendly overlap check to the same event", () => {
    const create = bodies.create_event_promotion;
    assert.match(create, /AND event_id = p_event_id/);
    assert.match(
      create,
      /That window overlaps an existing promotion for this event\./,
    );
  });

  it("keeps the client-facing message prefix and existing grants", () => {
    const create = bodies.create_event_promotion;
    // The organizer/admin friendly-error mapping matches on this prefix.
    assert.match(create, /overlaps an existing promotion/);
    assert.match(create, /v_caller_role NOT IN \('super_admin', 'moderation_admin'\)/);
    assert.doesNotMatch(
      sql,
      /ON FUNCTION public\.create_event_promotion\(uuid, timestamptz, timestamptz\) TO /,
    );
  });
});

describe("activate_paid_promotion safeguards", () => {
  const activate = bodies.activate_paid_promotion;

  it("runs as SECURITY DEFINER with an empty search_path", () => {
    assert.match(activate, /SECURITY DEFINER/);
    assert.match(activate, /SET search_path = ''/);
  });

  it("locks the row before running mismatch, lateness, and recovery checks", () => {
    const lock = activate.indexOf("FOR UPDATE");
    const mismatch = activate.indexOf("'amount_mismatch'");
    const late = activate.indexOf("make_interval(hours => 24)");
    const eligible = activate.indexOf("'event_ineligible'");
    const overlap = activate.indexOf("'slot_taken'");
    const pending = activate.indexOf("id <> p_order_id");
    const insert = activate.indexOf("INSERT INTO public.event_promotions");
    for (const [label, at] of [
      ["lock", lock],
      ["mismatch", mismatch],
      ["late", late],
      ["eligible", eligible],
      ["overlap", overlap],
      ["other-pending", pending],
      ["insert", insert],
    ]) {
      assert.notEqual(at, -1, `expected ${label} step in activate_paid_promotion`);
    }
    assert.ok(lock < mismatch && mismatch < late && late < eligible);
    assert.ok(eligible < overlap && overlap < pending && pending < insert);
  });

  it("excludes the current order from its own pending check (clarification A)", () => {
    assert.match(
      activate,
      /WHERE event_id = v_event_id AND status = 'pending'\s+AND created_at > v_now - make_interval\(hours => 24\)\s+AND id <> p_order_id/,
    );
  });

  it("sends late payments facing newer reservations to refund_pending (clarification B)", () => {
    const lateBranch = activate.indexOf("IF v_late THEN");
    const newer = activate.indexOf("'newer_reservation_exists'");
    const conflict = activate.indexOf("'concurrent_pending_conflict'");
    assert.ok(lateBranch !== -1 && newer !== -1 && conflict !== -1);
    assert.ok(lateBranch < newer && newer < conflict);
  });

  it("requires the verified payment to match the snapshot exactly", () => {
    assert.match(
      activate,
      /IF v_reference IS DISTINCT FROM p_provider_reference OR v_total IS DISTINCT FROM p_amount_kobo THEN/,
    );
  });

  it("rechecks event eligibility with database time", () => {
    assert.match(
      activate,
      /WHERE id = v_event_id AND published = true\s+AND COALESCE\(status, ''\) <> 'cancelled' AND ends_at > v_now/,
    );
  });

  it("catches exclusion races into the refund queue instead of stranding money", () => {
    assert.match(activate, /EXCEPTION WHEN exclusion_violation THEN/);
    assert.match(activate, /'overlap_race'/);
  });

  it("raises only for a missing order; every money failure refunds", () => {
    // The single RAISE below is the money invariant in testable form: once
    // the order row exists, all six failure reasons route to refund_pending.
    assert.equal(activate.match(/RAISE EXCEPTION/g)?.length ?? 0, 1);
    assert.match(activate, /RAISE EXCEPTION 'Promotion order not found\.'/);
    for (const reason of [
      "amount_mismatch",
      "event_ineligible",
      "slot_taken",
      "newer_reservation_exists",
      "concurrent_pending_conflict",
      "overlap_race",
    ]) {
      assert.ok(activate.includes(`'${reason}'`), `missing reason ${reason}`);
    }
  });

  it("returns paid, late-honored, or refund_pending and audits delivery", () => {
    assert.match(activate, /RETURN 'paid';/);
    assert.match(activate, /RETURN 'paid_late_honored';/);
    assert.match(activate, /RETURN 'refund_pending';/);
    const insert = activate.indexOf("INSERT INTO public.event_promotions");
    const audit = activate.indexOf("INSERT INTO public.audit_log");
    assert.ok(insert !== -1 && audit !== -1 && insert < audit);
    assert.match(activate, /promotion\.order\.paid/);
    assert.match(activate, /SET status = 'paid', status_reason = NULL, paid_at = v_now, promotion_id = v_promotion_id/);
  });

  it("audits delivery with promotion, provenance, and amount metadata", () => {
    // The paid audit row is the forensic record of delivery: which promotion
    // was created, which order state it came from, whether it was a late
    // honor, and what was paid for. Pin every key next to the action so a
    // future edit cannot silently drop evidence.
    const auditAt = activate.indexOf("promotion.order.paid");
    assert.notEqual(auditAt, -1, "expected promotion.order.paid audit action");
    const window = activate.slice(auditAt, auditAt + 600);
    for (const key of ["promotion_id", "from_status", "late", "days", "total_amount_kobo"]) {
      assert.ok(window.includes(`'${key}'`), `paid audit metadata is missing ${key}`);
    }
  });

  it("replays settled states idempotently without rewriting history", () => {
    assert.match(activate, /IF v_status = 'paid' THEN\s+RETURN 'paid';/);
    assert.match(
      activate,
      /IF v_status IN \('refund_pending', 'refunded'\) THEN\s+RETURN v_status;/,
    );
  });
});

describe("cancel_promotion_order safeguards", () => {
  const cancel = bodies.cancel_promotion_order;

  it("runs as SECURITY DEFINER with an empty search_path", () => {
    assert.match(cancel, /SECURITY DEFINER/);
    assert.match(cancel, /SET search_path = ''/);
  });

  it("locks, binds the organizer, and protects money states before cancelling", () => {
    const lock = cancel.indexOf("FOR UPDATE");
    const owner = cancel.indexOf("That order belongs to a different organizer.");
    const paid = cancel.indexOf("That order is already paid.");
    const refund = cancel.indexOf("That order is already in the refund process.");
    const noop = cancel.indexOf("RETURN v_status");
    const update = cancel.indexOf("UPDATE public.promotion_orders");
    const audit = cancel.indexOf("INSERT INTO public.audit_log");
    for (const [label, at] of [
      ["lock", lock],
      ["owner", owner],
      ["paid", paid],
      ["refund", refund],
      ["noop", noop],
      ["update", update],
      ["audit", audit],
    ]) {
      assert.notEqual(at, -1, `expected ${label} step in cancel_promotion_order`);
    }
    assert.ok(lock < owner && owner < paid && paid < refund);
    assert.ok(refund < noop && noop < update && update < audit);
    assert.match(cancel, /promotion\.order\.cancel/);
    assert.match(cancel, /RETURN 'cancelled';/);
  });
});

describe("set_promotion_price safeguards", () => {
  const pricing = bodies.set_promotion_price;

  it("runs as SECURITY DEFINER with an empty search_path", () => {
    assert.match(pricing, /SECURITY DEFINER/);
    assert.match(pricing, /SET search_path = ''/);
  });

  it("gates pricing to super/finance admins with the NGN 100 floor", () => {
    const signin = pricing.indexOf("Sign in is required to manage promotion pricing.");
    const role = pricing.indexOf(
      "Only a super_admin or finance_admin may manage promotion pricing.",
    );
    const floor = pricing.indexOf("at least 10000 kobo (NGN 100 minimum transaction).");
    const insert = pricing.indexOf("INSERT INTO public.promotion_pricing");
    const audit = pricing.indexOf("INSERT INTO public.audit_log");
    for (const [label, at] of [
      ["signin", signin],
      ["role", role],
      ["floor", floor],
      ["insert", insert],
      ["audit", audit],
    ]) {
      assert.notEqual(at, -1, `expected ${label} step in set_promotion_price`);
    }
    assert.ok(signin < role && role < floor && floor < insert && insert < audit);
    assert.match(pricing, /v_caller_role NOT IN \('super_admin', 'finance_admin'\)/);
    assert.match(pricing, /admin\.pricing\.set/);
    assert.match(pricing, /RETURN v_price_id;/);
  });
});

describe("record_promotion_refund safeguards", () => {
  const refund = bodies.record_promotion_refund;

  it("runs as SECURITY DEFINER with an empty search_path", () => {
    assert.match(refund, /SECURITY DEFINER/);
    assert.match(refund, /SET search_path = ''/);
  });

  it("requires evidence, locks, and the refund_pending gate before recording", () => {
    const signin = refund.indexOf("Sign in is required to record promotion refunds.");
    const role = refund.indexOf(
      "Only a super_admin or finance_admin may record promotion refunds.",
    );
    const evidence = refund.indexOf("Record the Paystack refund reference as evidence.");
    const lock = refund.indexOf("FOR UPDATE");
    const gate = refund.indexOf("Only orders awaiting refund can be recorded as refunded.");
    const insert = refund.indexOf("INSERT INTO public.promotion_refunds");
    const update = refund.indexOf("UPDATE public.promotion_orders");
    const audit = refund.indexOf("INSERT INTO public.audit_log");
    for (const [label, at] of [
      ["signin", signin],
      ["role", role],
      ["evidence", evidence],
      ["lock", lock],
      ["gate", gate],
      ["insert", insert],
      ["update", update],
      ["audit", audit],
    ]) {
      assert.notEqual(at, -1, `expected ${label} step in record_promotion_refund`);
    }
    assert.ok(signin < role && role < evidence && evidence < lock);
    assert.ok(lock < gate && gate < insert && insert < update && update < audit);
    assert.match(refund, /admin\.promotion\.refund/);
  });
});

describe("paid promotion RPC grants", () => {
  it("keeps money movers away from every browser token", () => {
    for (const signature of [
      "activate_paid_promotion(uuid, text, integer)",
      "cancel_promotion_order(uuid, uuid)",
      "move_order_to_refund_pending(uuid, text, jsonb)",
    ]) {
      assert.match(
        sql,
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${signature.replace(/([()])/g, "\\$1")} FROM PUBLIC, anon, authenticated;`,
        ),
      );
      assert.match(
        sql,
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${signature.replace(/([()])/g, "\\$1")} TO service_role;`,
        ),
      );
    }
    assert.doesNotMatch(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.(activate_paid_promotion|cancel_promotion_order|move_order_to_refund_pending)\([^)]*\) TO [^;]*authenticated/,
    );
  });

  it("keeps pricing and refunds staff-gated with internal role checks", () => {
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.set_promotion_price\(integer\) TO authenticated, service_role;/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.record_promotion_refund\(uuid, text, text\) TO authenticated, service_role;/,
    );
    assert.match(
      bodies.set_promotion_price,
      /v_caller_role NOT IN \('super_admin', 'finance_admin'\)/,
    );
    assert.match(
      bodies.record_promotion_refund,
      /v_caller_role NOT IN \('super_admin', 'finance_admin'\)/,
    );
  });
});

describe("plpgsql variable consistency", () => {
  function signatureParams(name) {
    const start = sql.indexOf(`FUNCTION public.${name}(`);
    const end = sql.indexOf(")", start);
    return new Set(
      [...sql.slice(start, end).matchAll(/\b(p_\w+)\b/g)].map((match) => match[1]),
    );
  }

  function checkVariables(name, body) {
    // Every v_* local referenced in executable code must be declared; every
    // p_* argument referenced must come from the signature. Comments and
    // string literals are stripped so prose cannot fake a declaration.
    const declareSection = body.slice(body.indexOf("DECLARE"), body.indexOf("BEGIN"));
    const declared = new Set(
      [...declareSection.matchAll(/\b(v_\w+)\b/g)].map((match) => match[1]),
    );
    const code = body
      .slice(body.indexOf("BEGIN"))
      .replace(/--.*$/gm, "")
      .replace(/'([^']|'')*'/g, "''");
    for (const match of code.matchAll(/\bv_\w+\b/g)) {
      assert.ok(
        declared.has(match[0]),
        `${name}: uses undeclared variable ${match[0]}`,
      );
    }
    const params = signatureParams(name);
    for (const match of code.matchAll(/\bp_\w+\b/g)) {
      assert.ok(params.has(match[0]), `${name}: uses undeclared argument ${match[0]}`);
    }
  }

  it("declares every variable and argument each RPC body references", () => {
    for (const name of RPC_NAMES) {
      checkVariables(name, bodies[name]);
    }
  });
});

describe("paid promotion RPC shadowing resistance", () => {
  it("schema-qualifies every table and helper-function reference", () => {
    for (const name of RPC_NAMES) {
      // IS DISTINCT FROM is a NULL-safe comparison operator, not a table
      // reference: strip it before scanning for FROM clauses.
      const body = bodies[name].replace(/IS DISTINCT FROM/g, "");
      for (const keyword of ["FROM", "JOIN", "UPDATE"]) {
        assert.doesNotMatch(
          body,
          new RegExp(`\\b${keyword}\\s+(?!public\\.)[A-Za-z_"]`),
          `${name}: unqualified table after ${keyword}`,
        );
      }
      assert.doesNotMatch(
        body,
        /\bINSERT\s+INTO\s+(?!public\.)[A-Za-z_"]/,
        `${name}: unqualified table after INSERT INTO`,
      );
      assert.doesNotMatch(body, /(?<!auth\.)\buid\(\)/, `${name}: unqualified uid() call`);
    }
  });
});
