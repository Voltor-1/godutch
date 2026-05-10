BEGIN;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participant_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_owner_select ON public.users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY users_owner_insert ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY users_owner_update ON public.users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY bills_owner_select ON public.bills
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY bills_owner_insert ON public.bills
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY bills_owner_update ON public.bills
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY bills_owner_delete ON public.bills
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY bills_guest_select ON public.bills
  FOR SELECT TO anon
  USING (
    share_token = current_setting('app.share_token', true)
    AND status != 'expired'
  );

CREATE POLICY bill_participants_owner_select ON public.bill_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = bill_participants.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY bill_participants_owner_insert ON public.bill_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = bill_participants.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY bill_participants_owner_update ON public.bill_participants
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = bill_participants.bill_id
        AND b.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = bill_participants.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY bill_participants_owner_delete ON public.bill_participants
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = bill_participants.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY bill_participants_guest_select ON public.bill_participants
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = bill_participants.bill_id
        AND b.share_token = current_setting('app.share_token', true)
        AND b.status != 'expired'
    )
  );

CREATE POLICY bill_participants_guest_insert ON public.bill_participants
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = bill_participants.bill_id
        AND b.share_token = current_setting('app.share_token', true)
        AND b.status != 'expired'
    )
  );

CREATE POLICY bill_items_owner_select ON public.bill_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = bill_items.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY bill_items_owner_insert ON public.bill_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = bill_items.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY bill_items_owner_update ON public.bill_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = bill_items.bill_id
        AND b.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = bill_items.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY bill_items_owner_delete ON public.bill_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = bill_items.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY bill_items_guest_select ON public.bill_items
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = bill_items.bill_id
        AND b.share_token = current_setting('app.share_token', true)
        AND b.status != 'expired'
    )
  );

CREATE POLICY item_allocations_owner_select ON public.item_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bill_items bi
      JOIN public.bills b ON b.id = bi.bill_id
      WHERE bi.id = item_allocations.item_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY item_allocations_owner_insert ON public.item_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bill_items bi
      JOIN public.bills b ON b.id = bi.bill_id
      WHERE bi.id = item_allocations.item_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY item_allocations_owner_update ON public.item_allocations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bill_items bi
      JOIN public.bills b ON b.id = bi.bill_id
      WHERE bi.id = item_allocations.item_id
        AND b.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bill_items bi
      JOIN public.bills b ON b.id = bi.bill_id
      WHERE bi.id = item_allocations.item_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY item_allocations_owner_delete ON public.item_allocations
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bill_items bi
      JOIN public.bills b ON b.id = bi.bill_id
      WHERE bi.id = item_allocations.item_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY item_allocations_guest_select ON public.item_allocations
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.bill_items bi
      JOIN public.bills b ON b.id = bi.bill_id
      WHERE bi.id = item_allocations.item_id
        AND b.share_token = current_setting('app.share_token', true)
        AND b.status != 'expired'
    )
  );

CREATE POLICY item_allocations_guest_insert ON public.item_allocations
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bill_items bi
      JOIN public.bills b ON b.id = bi.bill_id
      WHERE bi.id = item_allocations.item_id
        AND b.share_token = current_setting('app.share_token', true)
        AND b.status != 'expired'
    )
    AND participant_id IN (
      SELECT bp.id
      FROM public.bill_participants bp
      WHERE bp.participant_token = current_setting('app.participant_token', true)
    )
  );

CREATE POLICY item_allocations_guest_update ON public.item_allocations
  FOR UPDATE TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.bill_items bi
      JOIN public.bills b ON b.id = bi.bill_id
      WHERE bi.id = item_allocations.item_id
        AND b.share_token = current_setting('app.share_token', true)
        AND b.status != 'expired'
    )
    AND participant_id IN (
      SELECT bp.id
      FROM public.bill_participants bp
      WHERE bp.participant_token = current_setting('app.participant_token', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bill_items bi
      JOIN public.bills b ON b.id = bi.bill_id
      WHERE bi.id = item_allocations.item_id
        AND b.share_token = current_setting('app.share_token', true)
        AND b.status != 'expired'
    )
    AND participant_id IN (
      SELECT bp.id
      FROM public.bill_participants bp
      WHERE bp.participant_token = current_setting('app.participant_token', true)
    )
  );

CREATE POLICY split_rules_owner_select ON public.split_rules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = split_rules.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY split_rules_owner_insert ON public.split_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = split_rules.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY split_rules_owner_update ON public.split_rules
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = split_rules.bill_id
        AND b.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = split_rules.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY split_rules_owner_delete ON public.split_rules
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = split_rules.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY split_rules_guest_select ON public.split_rules
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = split_rules.bill_id
        AND b.share_token = current_setting('app.share_token', true)
        AND b.status != 'expired'
    )
  );

CREATE POLICY participant_totals_owner_select ON public.participant_totals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = participant_totals.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY participant_totals_owner_insert ON public.participant_totals
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = participant_totals.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY participant_totals_owner_update ON public.participant_totals
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = participant_totals.bill_id
        AND b.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = participant_totals.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY participant_totals_owner_delete ON public.participant_totals
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = participant_totals.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY participant_totals_guest_select ON public.participant_totals
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = participant_totals.bill_id
        AND b.share_token = current_setting('app.share_token', true)
        AND b.status != 'expired'
    )
  );

CREATE POLICY audit_events_owner_select ON public.audit_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = audit_events.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY audit_events_owner_insert ON public.audit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = audit_events.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

CREATE POLICY audit_events_guest_insert ON public.audit_events
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = audit_events.bill_id
        AND b.share_token = current_setting('app.share_token', true)
        AND b.status != 'expired'
    )
  );

CREATE POLICY settlements_owner_select ON public.settlements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.id = settlements.bill_id
        AND b.owner_user_id = auth.uid()
    )
  );

COMMIT;
