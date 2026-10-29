// Migration safeguard regression tests.
//
// Scope, stated honestly: these tests read the Phase 1 migration FILE and
// assert its revocation safeguards are present and correctly ordered. They
// cannot execute SQL and do NOT prove live database behavior — that proof
// requires applying the migration and exercising grants/revokes against a
// real database. What they do guarantee is that nobody can silently weaken
// or reorder the safeguards in a future edit without a test failing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261031090000_admin_phase1_roles_audit_v1.sql",
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

const revoke = functionBody("revoke_admin_role");
const grant = functionBody("grant_admin_role");

describe("revoke_admin_role safeguards", () => {
  it("runs as SECURITY DEFINER with a safe search_path", () => {
    assert.match(revoke, /SECURITY DEFINER/);
    assert.match(revoke, /SET search_path = public, pg_temp/);
  });

  it("rejects unsigned callers and non-super-admins before touching data", () => {
    const signinCheck = revoke.indexOf("Sign in is required to revoke roles.");
    const callerCheck = revoke.indexOf("Only a super_admin may revoke roles.");
    const selfCheck = revoke.indexOf("Administrators cannot change their own role.");
    assert.ok(signinCheck !== -1 && callerCheck !== -1 && selfCheck !== -1);
    assert.ok(signinCheck < callerCheck && callerCheck < selfCheck);
  });

  it("serializes revokes with an EXCLUSIVE table lock before reading state", () => {
    const lock = revoke.indexOf("LOCK TABLE public.admin_roles IN EXCLUSIVE MODE;");
    const targetRead = revoke.indexOf("SELECT role INTO v_target_role");
    const countCheck = revoke.indexOf("Cannot remove the last super_admin.");
    const authzEnd = revoke.indexOf("Administrators cannot change their own role.");
    assert.notEqual(lock, -1, "expected LOCK TABLE in revoke_admin_role");
    // Ordered: authorize first (unauthorized callers never lock), then lock,
    // then read the target and count under the lock.
    assert.ok(authzEnd < lock, "lock must come after the authorization checks");
    assert.ok(lock < targetRead, "target read must happen under the lock");
    assert.ok(lock < countCheck, "last-admin count must happen under the lock");
  });

  it("raises instead of auditing when the delete removes no row", () => {
    const del = revoke.indexOf("DELETE FROM public.admin_roles WHERE user_id = p_user_id;");
    const found = revoke.indexOf("IF NOT FOUND THEN", del);
    const raise = revoke.indexOf("RAISE EXCEPTION 'That user is not an administrator.';", found);
    const audit = revoke.indexOf("INSERT INTO public.audit_log", del);
    assert.ok(del !== -1 && found !== -1 && raise !== -1 && audit !== -1);
    assert.ok(del < found && found < raise && raise < audit);
  });

  it("audits successful revokes in the same transaction with the true actor", () => {
    assert.match(
      revoke,
      /INSERT INTO public\.audit_log \(actor_id, action, entity_type, entity_id, metadata\)/,
    );
    assert.match(revoke, /VALUES \(v_caller, 'admin\.role\.revoke'/);
    assert.match(revoke, /jsonb_build_object\('role', v_target_role\)/);
  });
});

describe("grant_admin_role safeguards (unchanged, guarded against drift)", () => {
  it("keeps its authorization checks and atomic audit insert", () => {
    assert.match(grant, /SET search_path = public, pg_temp/);
    assert.match(grant, /Only a super_admin may grant roles\./);
    assert.match(grant, /Administrators cannot change their own role\./);
    assert.match(grant, /Unknown admin role:/);
    assert.match(grant, /No such user\./);
    assert.match(grant, /VALUES \(v_caller, 'admin\.role\.grant'/);
    assert.match(grant, /jsonb_build_object\('role', p_role\)/);
  });
});
