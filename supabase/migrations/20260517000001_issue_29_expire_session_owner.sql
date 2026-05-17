-- Migration: issue #29 — owner-only session expiry
-- Adds expire_session_as_owner RPC with participant_token ownership check

CREATE OR REPLACE FUNCTION public.expire_session_as_owner(
  p_share_token text,
  p_participant_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill bills%ROWTYPE;
  v_participant bill_participants%ROWTYPE;
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

  SELECT * INTO v_participant FROM bill_participants
  WHERE bill_id = v_bill.id
    AND participant_token = p_participant_token
    AND participant_order = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_SESSION_OWNER';
  END IF;

  UPDATE bills
  SET status = 'expired', updated_at = now()
  WHERE id = v_bill.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_session_as_owner(text, text) TO anon;
