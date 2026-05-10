BEGIN;

CREATE OR REPLACE FUNCTION public.get_session(p_share_token TEXT)
RETURNS public.bills
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_bill public.bills;
BEGIN
  PERFORM set_config('app.share_token', p_share_token, true);

  SELECT b.*
    INTO v_bill
  FROM public.bills b
  WHERE b.share_token = p_share_token
    AND b.status <> 'expired'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_EXPIRED'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_bill;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_session_full(p_share_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_bill public.bills;
  v_result JSONB;
BEGIN
  PERFORM set_config('app.share_token', p_share_token, true);

  SELECT b.*
    INTO v_bill
  FROM public.bills b
  WHERE b.share_token = p_share_token
    AND b.status <> 'expired'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_EXPIRED'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT jsonb_build_object(
    'bill', to_jsonb(v_bill),
    'participants', COALESCE((
      SELECT jsonb_agg(to_jsonb(bp) ORDER BY bp.participant_order, bp.created_at)
      FROM public.bill_participants bp
      WHERE bp.bill_id = v_bill.id
    ), '[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(bi) ORDER BY bi.created_at)
      FROM public.bill_items bi
      WHERE bi.bill_id = v_bill.id
    ), '[]'::jsonb),
    'split_rules', COALESCE((
      SELECT jsonb_agg(to_jsonb(sr) ORDER BY sr.created_at)
      FROM public.split_rules sr
      WHERE sr.bill_id = v_bill.id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_participant(p_share_token TEXT, p_display_name TEXT)
RETURNS public.bill_participants
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_bill public.bills;
  v_next_participant_order integer;
  v_row public.bill_participants;
BEGIN
  PERFORM set_config('app.share_token', p_share_token, true);

  SELECT b.*
    INTO v_bill
  FROM public.bills b
  WHERE b.share_token = p_share_token
    AND b.status <> 'expired'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_EXPIRED'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(bp.participant_order), -1) + 1
    INTO v_next_participant_order
  FROM public.bill_participants bp
  WHERE bp.bill_id = v_bill.id;

  INSERT INTO public.bill_participants (bill_id, display_name, participant_order)
  VALUES (v_bill.id, p_display_name, v_next_participant_order)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMIT;
