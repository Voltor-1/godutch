BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_item_allocation(
  p_share_token TEXT,
  p_participant_token TEXT,
  p_item_id UUID,
  p_allocated_cents INTEGER
) RETURNS public.item_allocations
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_bill_id UUID;
  v_participant_id UUID;
  v_row public.item_allocations;
BEGIN
  PERFORM set_config('app.share_token', p_share_token, true);
  PERFORM set_config('app.participant_token', p_participant_token, true);

  SELECT b.id
    INTO v_bill_id
  FROM public.bills b
  JOIN public.bill_items bi ON bi.bill_id = b.id
  WHERE b.share_token = p_share_token
    AND b.status <> 'expired'
    AND bi.id = p_item_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_EXPIRED'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT bp.id
    INTO v_participant_id
  FROM public.bill_participants bp
  WHERE bp.bill_id = v_bill_id
    AND bp.participant_token = p_participant_token
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PARTICIPANT_NOT_FOUND_FOR_TOKEN'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.item_allocations (bill_id, item_id, participant_id, allocated_cents)
  VALUES (v_bill_id, p_item_id, v_participant_id, p_allocated_cents)
  ON CONFLICT (item_id, participant_id)
  DO UPDATE SET allocated_cents = EXCLUDED.allocated_cents
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMIT;
