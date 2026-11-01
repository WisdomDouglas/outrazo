// Moderation-reports migration safeguard tests (Phase 2C-1, proposal).
//
// Scope, stated honestly: these tests read the PROPOSAL migration FILE and
// assert its safeguards are present and correctly ordered. They cannot execute
// SQL and do NOT prove live database behavior — that proof requires review,
// applying the migration, and exercising file-then-resolve against a real
// database. What they do guarantee is that nobody can silently weaken or
// reorder the safeguards in a future edit without a test failing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261102090000_moderation_reports_v1.sql",
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

const file = functionBody("file_event_report");
const resolve = functionBody("resolve_event_report");

describe("event_reports table", () => {
  it("is marked proposal-only and touches no existing table", () => {
    assert.match(sql, /STATUS: PROPOSAL ONLY/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.(events|profiles|organizers|admin_roles|audit_log)/);
    assert.doesNotMatch(sql, /DROP POLICY/);
    assert.doesNotMatch(sql, /CREATE POLICY "(?!Reporters read own reports)/);
  });

  it("constrains reasons, statuses, and text lengths", () => {
    assert.match(sql, /CHECK \(reason IN \('spam', 'misleading', 'inappropriate', 'scam', 'other'\)\)/);
    assert.match(sql, /CHECK \(status IN \('pending', 'dismissed', 'actioned'\)\)/);
    assert.match(sql, /char_length\(details\) <= 1000/);
    assert.match(sql, /char_length\(resolution_note\) <= 500/);
  });

  it("preserves report history instead of cascading deletes away", () => {
    // Reported events cannot be deleted at all (RESTRICT): the moderation
    // history always keeps its event. No CASCADE from events to reports.
    assert.match(sql, /REFERENCES public\.events\(id\) ON DELETE RESTRICT/);
    assert.doesNotMatch(sql, /REFERENCES public\.events\(id\) ON DELETE CASCADE/);
    // Deleted reporters anonymize their reports (nullable + SET NULL) rather
    // than destroying them.
    assert.match(sql, /reporter_id uuid REFERENCES public\.profiles\(id\) ON DELETE SET NULL/);
    assert.doesNotMatch(sql, /reporter_id uuid NOT NULL/);
    assert.doesNotMatch(sql, /REFERENCES public\.profiles\(id\) ON DELETE CASCADE/);
    assert.match(
      sql,
      /CREATE UNIQUE INDEX IF NOT EXISTS event_reports_pending_unique\s+ON public\.event_reports \(event_id, reporter_id\) WHERE status = 'pending';/,
    );
  });

  it("enables RLS with an own-read policy and RPC-only writes", () => {
    assert.match(sql, /ALTER TABLE public\.event_reports ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /CREATE POLICY "Reporters read own reports"/);
    assert.match(sql, /FOR SELECT TO authenticated/);
    assert.match(sql, /USING \(auth\.uid\(\) = reporter_id\)/);
    assert.doesNotMatch(sql, /ON public\.event_reports FOR (INSERT|UPDATE|DELETE)/);
  });

  it("grants reads to reporters and full access to the service role only", () => {
    assert.match(sql, /REVOKE ALL ON public\.event_reports FROM PUBLIC, anon, authenticated;/);
    assert.match(sql, /GRANT SELECT ON public\.event_reports TO authenticated;/);
    assert.match(sql, /GRANT ALL ON public\.event_reports TO service_role;/);
  });
});

describe("file_event_report safeguards", () => {
  it("runs as SECURITY DEFINER with an empty search_path", () => {
    assert.match(file, /SECURITY DEFINER/);
    assert.match(file, /SET search_path = ''/);
  });

  it("validates reason, details, and event before touching data", () => {
    const signin = file.indexOf("Sign in is required to report an event.");
    const reason = file.indexOf("Unknown report reason.");
    const details = file.indexOf("Report details are too long");
    const event = file.indexOf("That event no longer exists.");
    const lock = file.indexOf("FOR UPDATE");
    assert.ok(signin !== -1 && reason !== -1 && details !== -1 && event !== -1);
    assert.ok(signin < reason && reason < details && details < event && event < lock);
  });

  it("serializes filings per reporter before enforcing the daily limit", () => {
    const lock = file.indexOf("FROM public.profiles WHERE id = v_reporter FOR UPDATE;");
    const count = file.indexOf("created_at > now() - interval '24 hours'");
    const limit = file.indexOf("Daily report limit reached. Try again tomorrow.");
    const duplicate = file.indexOf("You have already reported this event.");
    const insert = file.indexOf("INSERT INTO public.event_reports");
    assert.ok(lock !== -1 && count !== -1 && limit !== -1 && duplicate !== -1 && insert !== -1);
    assert.ok(lock < count, "daily count must happen under the profile lock");
    assert.ok(count < limit && limit < duplicate && duplicate < insert);
  });

  it("treats a missing profile as an error, never a silent pass", () => {
    assert.match(file, /IF NOT FOUND THEN\s+RAISE EXCEPTION 'No profile exists for this account.';/);
  });
});

describe("resolve_event_report safeguards", () => {
  it("runs as SECURITY DEFINER with an empty search_path", () => {
    assert.match(resolve, /SECURITY DEFINER/);
    assert.match(resolve, /SET search_path = ''/);
  });

  it("rejects unsigned callers and non-moderators before touching data", () => {
    const signin = resolve.indexOf("Sign in is required to resolve reports.");
    const role = resolve.indexOf("Only a super_admin or moderation_admin may resolve reports.");
    const lock = resolve.indexOf("FOR UPDATE");
    assert.ok(signin !== -1 && role !== -1 && lock !== -1);
    assert.ok(signin < role && role < lock);
  });

  it("locks the report row, then requires pending status", () => {
    const lock = resolve.indexOf("FROM public.event_reports WHERE id = p_report_id FOR UPDATE;");
    const gone = resolve.indexOf("That report no longer exists.");
    const terminal = resolve.indexOf("That report was already resolved.");
    const update = resolve.indexOf("UPDATE public.event_reports");
    assert.notEqual(lock, -1, "expected FOR UPDATE row lock in resolve_event_report");
    assert.ok(lock < gone && gone < terminal && terminal < update);
  });

  it("rejects dismissed-plus-unpublish inside the database, before locking", () => {
    const combo = resolve.indexOf("Dismissed reports cannot unpublish events.");
    const lock = resolve.indexOf("FOR UPDATE");
    assert.notEqual(combo, -1, "expected dismissed/unpublish rejection in resolve_event_report");
    assert.ok(combo < lock, "invalid combinations must fail before taking the row lock");
  });

  it("applies unpublish, resolution, and audit atomically in one transaction", () => {
    const unpublish = resolve.indexOf("UPDATE public.events SET published = false");
    const update = resolve.indexOf("UPDATE public.event_reports");
    const audit = resolve.indexOf("INSERT INTO public.audit_log");
    assert.ok(unpublish !== -1 && update !== -1 && audit !== -1);
    assert.ok(unpublish < update && update < audit);
    assert.match(resolve, /admin\.report\.dismiss/);
    assert.match(resolve, /admin\.report\.action/);
  });

  it("audits whether the event was actually unpublished, not merely requested", () => {
    // The audit must record the observed outcome (FOUND after the conditional
    // update), so an already-draft event is never logged as "unpublished".
    const update = resolve.indexOf("UPDATE public.events SET published = false");
    const found = resolve.indexOf("IF FOUND THEN", update);
    const audit = resolve.indexOf("INSERT INTO public.audit_log");
    assert.ok(update !== -1 && found !== -1 && audit !== -1);
    assert.ok(update < found && found < audit);
    assert.match(
      resolve,
      /jsonb_build_object\('event_id', v_event_id, 'reason', v_reason, 'unpublished', v_unpublished\)/,
    );
    assert.doesNotMatch(resolve, /'unpublished', p_unpublish/);
  });

  it("never touches RSVPs, tiers, or orders", () => {
    assert.doesNotMatch(resolve, /event_attendees/);
    assert.doesNotMatch(resolve, /event_ticket_tiers/);
    assert.doesNotMatch(resolve, /ticket_orders/);
  });
});

describe("shadowing resistance", () => {
  it("schema-qualifies every table and helper-function reference in both RPCs", () => {
    // Under an empty search_path only pg_catalog (built-ins, always searched)
    // plus explicitly qualified names resolve. An unqualified table reference
    // would fail loudly instead of reading the wrong object — but it must not
    // exist at all. INTO is excluded: in PL/pgSQL it targets variables.
    for (const [name, body] of [
      ["file_event_report", file],
      ["resolve_event_report", resolve],
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
      assert.doesNotMatch(
        body,
        /(?<!auth\.)\buid\(\)/,
        `${name}: unqualified uid() call`,
      );
    }
  });
});

describe("report RPC grants", () => {
  it("keeps filing for signed-in users and resolution for moderation staff", () => {
    assert.match(
      file,
      /IF v_reporter IS NULL THEN\s+RAISE EXCEPTION 'Sign in is required to report an event.';/,
    );
    assert.match(resolve, /v_caller_role NOT IN \('super_admin', 'moderation_admin'\)/);
    assert.match(resolve, /Only a super_admin or moderation_admin may resolve reports\./);
  });

  it("keeps both RPCs away from anon and public callers", () => {
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.file_event_report\(uuid, text, text\) FROM PUBLIC, anon;/,
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.resolve_event_report\(uuid, text, boolean, text\) FROM PUBLIC, anon;/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.file_event_report\(uuid, text, text\) TO authenticated, service_role;/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.resolve_event_report\(uuid, text, boolean, text\) TO authenticated, service_role;/,
    );
  });
});
