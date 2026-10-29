-- Forward-only Supabase migration: Admin Console Phase 1 (roles + audit).
--
-- Why this migration exists:
-- Phase 1 introduces staff administration with read-only global views and
-- audited role grants. It needs exactly two tables (role assignments and an
-- append-only audit log), two privilege helpers, and two guarded RPCs. It
-- deliberately changes nothing else.
--
-- What it does:
-- * Creates public.admin_roles (one row per staff user) and public.audit_log
--   (append-only: INSERT only, never UPDATE or DELETE).
-- * Enables RLS on both with NO policies and NO grants for authenticated
--   users: every direct client read or write is denied by default. Only the
--   service role (used exclusively by permission-checked server functions)
--   can touch these tables.
-- * Adds SECURITY DEFINER helpers is_admin() and my_admin_role() that report
--   only the CALLER's own status (no user-id argument, so nobody can probe
--   other users). Reserved for future RLS backstop policies.
-- * Adds grant_admin_role / revoke_admin_role RPCs enforcing: caller must be
--   super_admin; no self-grants or self-revokes; valid roles only; the last
--   super_admin cannot be removed. Revokes serialize on admin_roles so the
--   last-admin check is race-safe, and raise if the target row vanished.
--   Every grant/revoke writes its audit row in the same transaction.
--
-- Deliberately NOT included:
-- * No changes to events, profiles, organizers, tiers, attendees, RSVP
--   trigger/function, Realtime publication, or any existing policy.
-- * No bootstrap row: the first super_admin is created by the documented
--   one-time owner-run script (fails safe if any admin already exists),
--   never by this migration.
--
-- Do NOT replay Drizzle migrations against the existing database.
-- Review, then apply once via the Supabase dashboard SQL editor or CLI.
-- This file has NOT been applied by the implementation session.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Admin Phase 1 requires the existing public.profiles table.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.admin_roles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('super_admin', 'finance_admin', 'moderation_admin', 'support_readonly')),
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx
  ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON public.audit_log (entity_type, entity_id);

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_roles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.audit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_roles TO service_role;
GRANT ALL ON public.audit_log TO service_role;

-- Self-only helpers: reveal nothing about other users. Reserved for future
-- RLS backstop policies; Phase 1 authorization is enforced server-side.
CREATE OR REPLACE FUNCTION public.my_admin_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT role FROM public.admin_roles WHERE user_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = auth.uid()) $$;

REVOKE ALL ON FUNCTION public.my_admin_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_admin_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.grant_admin_role(
  p_user_id uuid,
  p_role text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to grant roles.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only a super_admin may grant roles.';
  END IF;
  IF p_user_id = v_caller THEN
    RAISE EXCEPTION 'Administrators cannot change their own role.';
  END IF;
  IF p_role NOT IN ('super_admin', 'finance_admin', 'moderation_admin', 'support_readonly') THEN
    RAISE EXCEPTION 'Unknown admin role: %', p_role;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'No such user.';
  END IF;
  INSERT INTO public.admin_roles (user_id, role, granted_by, note)
  VALUES (p_user_id, p_role, v_caller, p_note)
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by,
        granted_at = now(), note = EXCLUDED.note;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_caller, 'admin.role.grant', 'admin_roles', p_user_id::text,
    jsonb_build_object('role', p_role));
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_admin_role(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to revoke roles.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only a super_admin may revoke roles.';
  END IF;
  IF p_user_id = v_caller THEN
    RAISE EXCEPTION 'Administrators cannot change their own role.';
  END IF;
  -- Serialize revokes AFTER authorization passes, so the target read, the
  -- last-super-admin count, and the delete below are race-safe. Unauthorized
  -- callers are rejected above without ever taking the lock.
  LOCK TABLE public.admin_roles IN EXCLUSIVE MODE;
  SELECT role INTO v_target_role FROM public.admin_roles WHERE user_id = p_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'That user is not an administrator.';
  END IF;
  IF v_target_role = 'super_admin'
    AND (SELECT count(*) FROM public.admin_roles WHERE role = 'super_admin') <= 1
  THEN
    RAISE EXCEPTION 'Cannot remove the last super_admin.';
  END IF;
  DELETE FROM public.admin_roles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    -- The row vanished after our checks (e.g. the profile was deleted and the
    -- FK cascade removed it). Abort instead of auditing a revoke that removed
    -- nothing.
    RAISE EXCEPTION 'That user is not an administrator.';
  END IF;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_caller, 'admin.role.revoke', 'admin_roles', p_user_id::text,
    jsonb_build_object('role', v_target_role));
END;
$$;

REVOKE ALL ON FUNCTION public.grant_admin_role(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_admin_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_admin_role(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_admin_role(uuid) TO authenticated, service_role;

COMMIT;
