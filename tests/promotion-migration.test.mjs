// Event-promotions migration safeguard tests (Phase 2C-2, proposal).
//
// Scope, stated honestly: these tests read the PROPOSAL migration FILE and
// assert its safeguards are present and correctly ordered. They cannot execute
// SQL and do NOT prove live database behavior — that proof requires review,
// applying the migration, and exercising schedule-then-cancel plus an overlap
// race against a real database. What they do guarantee is that nobody can
// silently weaken or reorder the safeguards in a future edit without a test
// failing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261103090000_event_promotions_v1.sql",
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

const create = functionBody("create_event_promotion");
const cancel = functionBody("cancel_event_promotion");

describe("event_promotions table", () => {
  it("is marked reviewed-approved-not-applied and touches no existing table", () => {
    assert.match(sql, /STATUS: REVIEWED — APPROVED, NOT APPLIED/);
    assert.match(sql, /Do not execute it without explicit authorization/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.(events|profiles|organizers|admin_roles|audit_log|event_reports)/);
    assert.doesNotMatch(sql, /DROP POLICY/);
    assert.doesNotMatch(sql, /CREATE POLICY "(?!Active promotions are public)/);
  });

  it("constrains the window and the stored status", () => {
    assert.match(sql, /CHECK \(ends_at > starts_at\)/);
    assert.match(sql, /CHECK \(status IN \('active', 'cancelled'\)\)/);
  });

  it("preserves promotion history when events or profiles are deleted", () => {
    // Reported-promotion history is never destroyed by a delete: events with
    // promotions cannot be deleted at all, and deleted staff anonymize.
    assert.match(sql, /REFERENCES public\.events\(id\) ON DELETE RESTRICT/);
    assert.doesNotMatch(sql, /REFERENCES public\.events\(id\) ON DELETE CASCADE/);
    assert.match(sql, /created_by uuid REFERENCES public\.profiles\(id\) ON DELETE SET NULL/);
  });

  it("prevents overlapping live windows with a partial exclusion constraint", () => {
    // '[)' bounds: back-to-back windows are legal; only true overlaps fail.
    // Partial predicate: cancelled rows never block reuse of their window.
    assert.match(
      sql,
      /EXCLUDE USING gist \(tstzrange\(starts_at, ends_at, '\[\)'\) WITH &&\) WHERE \(status = 'active'\)/,
    );
  });

  it("enables RLS with an active-window public read policy and RPC-only writes", () => {
    assert.match(sql, /ALTER TABLE public\.event_promotions ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /CREATE POLICY "Active promotions are public"/);
    assert.match(sql, /FOR SELECT TO anon, authenticated/);
    assert.match(sql, /USING \(status = 'active' AND starts_at <= now\(\) AND ends_at > now\(\)\)/);
    assert.doesNotMatch(sql, /ON public\.event_promotions FOR (INSERT|UPDATE|DELETE)/);
  });

  it("exposes only scheduling columns publicly", () => {
    assert.match(sql, /REVOKE ALL ON public\.event_promotions FROM PUBLIC, anon, authenticated;/);
    assert.match(
      sql,
      /GRANT SELECT \(id, event_id, status, starts_at, ends_at\) ON public\.event_promotions TO anon, authenticated;/,
    );
    assert.match(sql, /GRANT ALL ON public\.event_promotions TO service_role;/);
  });
});

describe("create_event_promotion safeguards", () => {
  it("runs as SECURITY DEFINER with an empty search_path", () => {
    assert.match(create, /SECURITY DEFINER/);
    assert.match(create, /SET search_path = ''/);
  });

  it("checks auth, role, window, and eligibility before touching data", () => {
    const signin = create.indexOf("Sign in is required to manage promotions.");
    const role = create.indexOf("Only a super_admin or moderation_admin may manage promotions.");
    const window = create.indexOf("Promotion must start before it ends.");
    const ended = create.indexOf("That window already ended.");
    const gone = create.indexOf("That event no longer exists.");
    const eligible = create.indexOf("Only published, non-cancelled events can be promoted.");
    const overlap = create.indexOf("That window overlaps an existing promotion.");
    const insert = create.indexOf("INSERT INTO public.event_promotions");
    for (const [label, at] of [
      ["signin", signin],
      ["role", role],
      ["window", window],
      ["ended", ended],
      ["gone", gone],
      ["eligible", eligible],
      ["overlap", overlap],
      ["insert", insert],
    ]) {
      assert.notEqual(at, -1, `expected ${label} step in create_event_promotion`);
    }
    assert.ok(signin < role && role < window && window < ended);
    assert.ok(ended < gone && gone < eligible && eligible < overlap && overlap < insert);
  });

  it("audits the scheduled promotion in the same transaction", () => {
    const insert = create.indexOf("INSERT INTO public.event_promotions");
    const audit = create.indexOf("INSERT INTO public.audit_log");
    assert.ok(insert !== -1 && audit !== -1 && insert < audit);
    assert.match(create, /admin\.promotion\.schedule/);
    assert.match(
      create,
      /jsonb_build_object\('event_id', p_event_id, 'starts_at', p_starts_at::text, 'ends_at', p_ends_at::text\)/,
    );
  });
});

describe("cancel_event_promotion safeguards", () => {
  it("runs as SECURITY DEFINER with an empty search_path", () => {
    assert.match(cancel, /SECURITY DEFINER/);
    assert.match(cancel, /SET search_path = ''/);
  });

  it("rejects unsigned callers and non-moderators before touching data", () => {
    const signin = cancel.indexOf("Sign in is required to manage promotions.");
    const role = cancel.indexOf("Only a super_admin or moderation_admin may manage promotions.");
    const lock = cancel.indexOf("FOR UPDATE");
    assert.ok(signin !== -1 && role !== -1 && lock !== -1);
    assert.ok(signin < role && role < lock);
  });

  it("locks the row, then enforces the terminal states", () => {
    const lock = cancel.indexOf("FROM public.event_promotions WHERE id = p_promotion_id FOR UPDATE;");
    const gone = cancel.indexOf("That promotion no longer exists.");
    const cancelled = cancel.indexOf("That promotion was already cancelled.");
    const ended = cancel.indexOf("That promotion already ended.");
    const update = cancel.indexOf("UPDATE public.event_promotions");
    assert.notEqual(lock, -1, "expected FOR UPDATE row lock in cancel_event_promotion");
    assert.ok(lock < gone && gone < cancelled && cancelled < ended && ended < update);
  });

  it("applies cancellation and audit atomically in one transaction", () => {
    const update = cancel.indexOf("UPDATE public.event_promotions");
    const audit = cancel.indexOf("INSERT INTO public.audit_log");
    assert.ok(update !== -1 && audit !== -1 && update < audit);
    assert.match(cancel, /admin\.promotion\.cancel/);
  });

  it("never touches events, RSVPs, tiers, or orders", () => {
    assert.doesNotMatch(cancel, /UPDATE public\.events/);
    assert.doesNotMatch(cancel, /event_attendees/);
    assert.doesNotMatch(cancel, /event_ticket_tiers/);
    assert.doesNotMatch(cancel, /ticket_orders/);
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
    checkVariables("create_event_promotion", create);
    checkVariables("cancel_event_promotion", cancel);
  });
});

describe("promotion RPC shadowing resistance", () => {
  it("schema-qualifies every table and helper-function reference in both RPCs", () => {
    for (const [name, body] of [
      ["create_event_promotion", create],
      ["cancel_event_promotion", cancel],
    ]) {
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

describe("promotion RPC grants", () => {
  it("keeps filing for nobody and management for moderation staff", () => {
    // No public filing RPC exists for promotions: both RPCs require a staff
    // role. The grants below only control invocation; the role gates inside
    // control authorization.
    assert.match(create, /v_caller_role NOT IN \('super_admin', 'moderation_admin'\)/);
    assert.match(cancel, /v_caller_role NOT IN \('super_admin', 'moderation_admin'\)/);
  });

  it("keeps both RPCs away from anon and public callers", () => {
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.create_event_promotion\(uuid, timestamptz, timestamptz\) FROM PUBLIC, anon;/,
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.cancel_event_promotion\(uuid\) FROM PUBLIC, anon;/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.create_event_promotion\(uuid, timestamptz, timestamptz\) TO authenticated, service_role;/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.cancel_event_promotion\(uuid\) TO authenticated, service_role;/,
    );
  });
});
