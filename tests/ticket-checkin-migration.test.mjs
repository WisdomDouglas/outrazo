// Ticket check-in migration safeguard tests (P3, proposal).
//
// Scope, stated honestly: these tests read the PROPOSAL migration FILE and
// assert its safeguards are present. They cannot execute SQL and do NOT
// prove live database behavior — that proof requires review, applying the
// migration, and exercising issue + check-in drills against a real database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261112090000_ticket_checkin_v1.sql",
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

const issueBody = functionBody("issue_ticket_codes");
const checkinBody = functionBody("check_in_ticket");

describe("ticket check-in proposal boundaries", () => {
  it("is marked proposed-pending-review and requires P1 first", () => {
    assert.match(sql, /STATUS: PROPOSED — PENDING REVIEW\. NOT APPLIED/);
    assert.match(sql, /needs the P1 columns first/);
    assert.match(sql, /do not apply Ticket check-in V1 twice/);
  });

  it("stores one unique code per ticket unit, service-role only", () => {
    assert.match(sql, /CREATE TABLE public\.ticket_codes/);
    assert.match(sql, /UNIQUE \(order_id, ticket_no\)/);
    assert.match(sql, /UNIQUE \(code\)/);
    assert.match(sql, /REVOKE ALL ON public\.ticket_codes FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /GRANT ALL ON public\.ticket_codes TO service_role/);
  });

  it("issues codes idempotently for paid orders only", () => {
    assert.match(issueBody, /LANGUAGE plpgsql SECURITY DEFINER/);
    assert.match(issueBody, /SET search_path = ''/);
    assert.match(issueBody, /Ticket codes are issued only for paid orders/);
    assert.match(issueBody, /ON CONFLICT \(order_id, ticket_no\) DO NOTHING/);
  });

  it("checks each code in exactly once with locked reads", () => {
    assert.match(checkinBody, /LANGUAGE plpgsql SECURITY DEFINER/);
    assert.match(checkinBody, /FROM public\.ticket_codes WHERE code = p_code FOR UPDATE/);
    assert.match(checkinBody, /RETURN QUERY SELECT 'already_checked_in'/);
    assert.match(checkinBody, /That ticket is for a different event/);
    assert.match(checkinBody, /That ticket is not paid for/);
    assert.match(checkinBody, /That event was cancelled/);
    assert.match(checkinBody, /SET status = 'checked_in', checked_in_at = now\(\), checked_in_by = p_actor/);
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.check_in_ticket\(text, uuid, uuid\) FROM PUBLIC, anon, authenticated/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.check_in_ticket\(text, uuid, uuid\) TO service_role/,
    );
  });

  it("verifies its own objects before committing", () => {
    assert.match(sql, /did not create ticket_codes/);
    assert.match(sql, /issue_ticket_codes must exist and be SECURITY DEFINER/);
    assert.match(sql, /check_in_ticket must exist and be SECURITY DEFINER/);
  });
});
