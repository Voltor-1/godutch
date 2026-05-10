BEGIN;

ALTER TABLE public.bill_participants
  ADD COLUMN participant_token TEXT NOT NULL DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_participants_participant_token
  ON public.bill_participants(participant_token);

COMMIT;
