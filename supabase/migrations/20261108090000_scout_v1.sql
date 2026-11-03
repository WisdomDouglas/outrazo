-- PROPOSED forward-only Supabase migration: Outrazo Scout v1 (S0).
--
-- STATUS: PROPOSAL ONLY — NOT REVIEWED, NOT APPLIED. Do not run this file
-- until it has been reviewed and explicitly approved. The Scout UI and server
-- functions depend on these tables; until applied, Scout surfaces report the
-- backend as unavailable instead of failing silently.
--
-- Why this migration is needed:
-- Scout discovers external events via web search and holds them in a
-- human review queue. Discoveries must live in separate tables (never in
-- public.events) with preserved source evidence, and approved discoveries
-- must be permanently fenced off from Outrazo ticket sales.
--
-- What it does:
-- * Creates public.scout_runs (admin-triggered discovery jobs with budgets).
-- * Creates public.scout_discoveries (extracted candidates + provenance).
-- * Creates public.scout_run_steps (per-request raw search evidence).
-- * Creates public.scout_run_coverage (per-state coverage ledger, 36 + FCT).
-- * Creates public.scout_event_links (approved discovery <-> event drafts).
-- * Adds public.events.external_ticket_url (nullable; external registration).
-- * Adds block_scout_ticket_sales() trigger: no ticket tiers for Scout events.
-- * Adds block_scout_paid_conversion() trigger: Scout events stay event_type free.
-- * Adds block_external_ticket_rsvp() trigger: no Outrazo RSVPs on externally
--   ticketed events (attendance happens on the organizer's own site).
-- * Enables RLS on all Scout tables with NO user policies: staff reads/writes
--   go through permission-checked server functions on service_role only.
--
-- Deliberately NOT included:
-- * No changes to existing tables other than the one nullable events column.
-- * No changes to any existing policy, index, trigger, or RPC.
-- * No seed data, no staff organizer, no scheduled jobs.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.events') IS NULL THEN
    RAISE EXCEPTION 'Scout v1 requires the existing public.events table.';
  END IF;
  IF to_regclass('public.event_ticket_tiers') IS NULL THEN
    RAISE EXCEPTION 'Scout v1 requires the existing public.event_ticket_tiers table.';
  END IF;
  IF to_regclass('public.event_attendees') IS NULL THEN
    RAISE EXCEPTION 'Scout v1 requires the existing public.event_attendees table.';
  END IF;
  IF to_regclass('public.admin_roles') IS NULL THEN
    RAISE EXCEPTION 'Scout v1 requires the Phase 1 public.admin_roles table. Apply that migration first.';
  END IF;
  IF to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION 'Scout v1 requires the Phase 1 public.audit_log table. Apply that migration first.';
  END IF;
END;
$$;

-- ── Run ledger ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scout_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'queued', 'searching', 'fetching', 'extracting',
      'validating', 'done', 'failed', 'cancelled',
      'paused', 'budget_stopped'
    )),
  scope jsonb NOT NULL DEFAULT '{"mode":"nationwide","states":[],"cities":[]}'::jsonb,
  categories text[] NOT NULL DEFAULT '{}',
  date_from date NULL,
  date_to date NULL,
  max_tool_calls integer NOT NULL DEFAULT 24 CHECK (max_tool_calls BETWEEN 1 AND 100),
  max_sources integer NOT NULL DEFAULT 60 CHECK (max_sources BETWEEN 1 AND 500),
  tool_calls_made integer NOT NULL DEFAULT 0 CHECK (tool_calls_made >= 0),
  sources_fetched integer NOT NULL DEFAULT 0 CHECK (sources_fetched >= 0),
  discoveries_created integer NOT NULL DEFAULT 0 CHECK (discoveries_created >= 0),
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  error text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  finished_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS scout_runs_status_created_idx
  ON public.scout_runs (status, created_at DESC);

-- ── Discovery queue ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scout_discoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.scout_runs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'dismissed', 'auto_rejected')),
  -- Extracted event fields (original values; never overwritten by review).
  title text NULL,
  summary text NULL,
  description text NULL,
  category text NULL,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  venue_name text NULL,
  address text NULL,
  city text NULL,
  state_code text NULL,
  event_type text NULL CHECK (event_type IS NULL OR event_type IN ('free', 'paid', 'unknown')),
  price_hint text NULL,
  external_ticket_url text NULL,
  capacity integer NULL CHECK (capacity IS NULL OR capacity >= 0),
  -- Per-field provenance: which fields were confirmed, missing, ambiguous.
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Original organizer identity (public info only; canonical provenance).
  external_organizer_name text NULL,
  external_organizer_info jsonb NULL,
  -- Source evidence (immutable once written).
  source_url text NOT NULL,
  source_domain text NOT NULL,
  source_snapshot text NULL,
  fetch_status text NULL,
  fetched_at timestamptz NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Dedupe (advisory; never auto-merges).
  dedupe_key text NULL,
  matched_event_id uuid NULL REFERENCES public.events(id) ON DELETE SET NULL,
  match_confidence text NULL CHECK (match_confidence IS NULL OR match_confidence IN ('low', 'medium', 'high')),
  -- Review outcome.
  reviewer_id uuid NULL,
  reviewed_at timestamptz NULL,
  dismissal_reason text NULL
    CHECK (dismissal_reason IS NULL OR dismissal_reason IN (
      'duplicate', 'expired', 'not_an_event', 'insufficient_evidence',
      'out_of_scope', 'other'
    )),
  auto_reject_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scout_discoveries_run_status_idx
  ON public.scout_discoveries (run_id, status);
CREATE INDEX IF NOT EXISTS scout_discoveries_city_starts_idx
  ON public.scout_discoveries (city, starts_at);
CREATE INDEX IF NOT EXISTS scout_discoveries_dedupe_idx
  ON public.scout_discoveries (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ── Per-request raw evidence ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scout_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.scout_runs(id) ON DELETE CASCADE,
  step_index integer NOT NULL CHECK (step_index >= 0),
  tier text NOT NULL CHECK (tier IN ('A', 'B', 'C')),
  label text NOT NULL,
  query text NOT NULL,
  city text NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'failed', 'skipped_budget')),
  tool_calls integer NOT NULL DEFAULT 0 CHECK (tool_calls >= 0),
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  CONSTRAINT scout_run_steps_unique UNIQUE (run_id, step_index)
);

CREATE INDEX IF NOT EXISTS scout_run_steps_run_idx
  ON public.scout_run_steps (run_id, step_index);

-- ── Coverage ledger (36 states + FCT) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scout_run_coverage (
  run_id uuid NOT NULL REFERENCES public.scout_runs(id) ON DELETE CASCADE,
  state_name text NOT NULL,
  status text NOT NULL DEFAULT 'unsearched'
    CHECK (status IN ('unsearched', 'nationwide_only', 'zone_only', 'targeted')),
  requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  tool_calls integer NOT NULL DEFAULT 0 CHECK (tool_calls >= 0),
  discoveries integer NOT NULL DEFAULT 0 CHECK (discoveries >= 0),
  useful_count integer NOT NULL DEFAULT 0 CHECK (useful_count >= 0),
  CONSTRAINT scout_run_coverage_pkey PRIMARY KEY (run_id, state_name)
);

-- ── Approval links (discovery <-> event draft) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.scout_event_links (
  discovery_id uuid PRIMARY KEY REFERENCES public.scout_discoveries(id) ON DELETE CASCADE,
  event_id uuid NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scout_event_links_event_idx
  ON public.scout_event_links (event_id);

-- ── External ticketing marker on events ──────────────────────────────────
-- Nullable: existing rows are unaffected. When set, Outrazo shows an external
-- registration link instead of RSVP/ticket actions (see UI phase), the tier
-- and paid-conversion triggers below stay dormant-safe, and RSVPs are blocked.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS external_ticket_url text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.events'::regclass
      AND conname = 'events_external_ticket_url_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_external_ticket_url_check
      CHECK (external_ticket_url IS NULL OR external_ticket_url LIKE 'https://%');
  END IF;
END;
$$;

-- ── Financial guard: Scout events can never sell Outrazo tickets ─────────
CREATE OR REPLACE FUNCTION public.block_scout_ticket_sales()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.scout_event_links l WHERE l.event_id = NEW.event_id
  ) THEN
    RAISE EXCEPTION 'Scout-sourced events cannot have Outrazo ticket tiers.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scout_block_ticket_sales ON public.event_ticket_tiers;
CREATE TRIGGER scout_block_ticket_sales
  BEFORE INSERT ON public.event_ticket_tiers
  FOR EACH ROW EXECUTE FUNCTION public.block_scout_ticket_sales();

CREATE OR REPLACE FUNCTION public.block_scout_paid_conversion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.event_type = 'paid' AND EXISTS (
    SELECT 1 FROM public.scout_event_links l WHERE l.event_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Scout-sourced events cannot convert to paid Outrazo events.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scout_block_paid_conversion ON public.events;
CREATE TRIGGER scout_block_paid_conversion
  BEFORE INSERT OR UPDATE OF event_type ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.block_scout_paid_conversion();

-- Externally ticketed events take attendance on the organizer's site, so
-- Outrazo RSVPs would inflate counts and mislead users. Ordinary events
-- (external_ticket_url IS NULL) are completely unaffected.
CREATE OR REPLACE FUNCTION public.block_external_ticket_rsvp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = NEW.event_id AND e.external_ticket_url IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This event takes registration on the organizer''s own site.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scout_block_external_rsvp ON public.event_attendees;
CREATE TRIGGER scout_block_external_rsvp
  BEFORE INSERT ON public.event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.block_external_ticket_rsvp();

-- ── RLS: staff-only via service_role; no user policies ───────────────────
ALTER TABLE public.scout_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_run_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_event_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_run_steps ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.scout_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scout_discoveries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scout_run_coverage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scout_event_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scout_run_steps FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.scout_runs TO service_role;
GRANT ALL ON public.scout_discoveries TO service_role;
GRANT ALL ON public.scout_run_coverage TO service_role;
GRANT ALL ON public.scout_event_links TO service_role;
GRANT ALL ON public.scout_run_steps TO service_role;

COMMIT;
