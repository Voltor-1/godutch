CREATE OR REPLACE FUNCTION public.expire_session(p_share_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill bills%ROWTYPE;
BEGIN
  SELECT * INTO v_bill FROM bills
  WHERE share_token = p_share_token
    AND expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_EXPIRED';
  END IF;
  IF v_bill.status = 'finalized' THEN
    RAISE EXCEPTION 'ALREADY_FINALIZED';
  END IF;
  IF v_bill.status = 'expired' THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND_OR_EXPIRED';
  END IF;
  UPDATE bills SET status = 'expired', updated_at = now()
  WHERE id = v_bill.id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.expire_session(text) TO anon;
