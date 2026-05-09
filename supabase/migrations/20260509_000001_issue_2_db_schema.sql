-- GoDutch MVP foundational schema (Issue #2)
-- Notes:
-- - Monetary values stored as integer minor units (cents).
-- - Includes forward-compatible settlements schema only (no MVP runtime wiring).
-- - Down migration strategy is documented in docs/db_down_migration_strategy.md.

BEGIN;

-- =========================
-- Core tables
-- =========================

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  share_token TEXT NOT NULL UNIQUE,
  title TEXT,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',

  subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  tip_cents INTEGER NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
  service_charge_cents INTEGER NOT NULL DEFAULT 0 CHECK (service_charge_cents >= 0),
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'expired')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),

  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  read_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bill_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  participant_order INTEGER NOT NULL CHECK (participant_order >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bill_participants_bill_order_uniq UNIQUE (bill_id, participant_order)
);

CREATE TABLE IF NOT EXISTS public.bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.item_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.bill_items(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.bill_participants(id) ON DELETE CASCADE,
  allocated_cents INTEGER NOT NULL CHECK (allocated_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT item_allocations_item_participant_uniq UNIQUE (item_id, participant_id)
);

CREATE TABLE IF NOT EXISTS public.split_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  split_mode TEXT NOT NULL CHECK (split_mode IN ('items', 'percentage', 'fixed')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  config_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.participant_totals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.bill_participants(id) ON DELETE CASCADE,
  subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  tip_cents INTEGER NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
  service_charge_cents INTEGER NOT NULL DEFAULT 0 CHECK (service_charge_cents >= 0),
  total_owed_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_owed_cents >= 0),
  remainder_cents INTEGER NOT NULL DEFAULT 0,
  remainder_policy TEXT NOT NULL DEFAULT 'largest_remainder',
  remainder_trace JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT participant_totals_bill_participant_uniq UNIQUE (bill_id, participant_id),
  CONSTRAINT participant_totals_remainder_policy_chk CHECK (remainder_policy IN ('largest_remainder'))
);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_participant_id UUID REFERENCES public.bill_participants(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Forward-compatible schema only (out of MVP runtime scope)
CREATE TABLE IF NOT EXISTS public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  from_participant_id UUID NOT NULL REFERENCES public.bill_participants(id) ON DELETE CASCADE,
  to_participant_id UUID NOT NULL REFERENCES public.bill_participants(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT settlements_not_self CHECK (from_participant_id <> to_participant_id)
);

-- =========================
-- Indexes
-- =========================

CREATE INDEX IF NOT EXISTS idx_bills_share_token ON public.bills(share_token);
CREATE INDEX IF NOT EXISTS idx_bills_status_updated_at ON public.bills(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_expires_at ON public.bills(expires_at);

CREATE INDEX IF NOT EXISTS idx_bill_participants_bill_id ON public.bill_participants(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_participants_user_id ON public.bill_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON public.bill_items(bill_id);

CREATE INDEX IF NOT EXISTS idx_item_allocations_bill_id ON public.item_allocations(bill_id);
CREATE INDEX IF NOT EXISTS idx_item_allocations_item_id ON public.item_allocations(item_id);
CREATE INDEX IF NOT EXISTS idx_item_allocations_participant_id ON public.item_allocations(participant_id);

CREATE INDEX IF NOT EXISTS idx_split_rules_bill_id ON public.split_rules(bill_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_split_rules_bill_active ON public.split_rules (bill_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_participant_totals_bill_id ON public.participant_totals(bill_id);
CREATE INDEX IF NOT EXISTS idx_participant_totals_participant_id ON public.participant_totals(participant_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_bill_id_created_at ON public.audit_events(bill_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON public.audit_events(event_type);

CREATE INDEX IF NOT EXISTS idx_settlements_bill_id ON public.settlements(bill_id);

COMMIT;
