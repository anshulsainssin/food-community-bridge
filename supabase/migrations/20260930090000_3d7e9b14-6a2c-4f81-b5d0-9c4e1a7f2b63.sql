-- The donor UPDATE/INSERT policies on donations cover whole rows, so a donor could write status,
-- claimed_by, claimed_at or completed_at directly (e.g. set 'Picked Up' or 'Completed' without the
-- NGO scanning the pickup QR code). Those columns now change only through the workflow functions
-- (claim_donation, advance_donation_status, verify_pickup_code, expire_old_donations), which run as
-- the function owner. Donors can still create, edit and delete their own donations as before.
CREATE OR REPLACE FUNCTION public.guard_donation_workflow_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Only direct client writes are checked; SECURITY DEFINER functions and the cron job run as the owner.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'Available' OR NEW.claimed_by IS NOT NULL
       OR NEW.claimed_at IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'New donations must start as Available';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.claimed_by IS DISTINCT FROM OLD.claimed_by
     OR NEW.claimed_at IS DISTINCT FROM OLD.claimed_at OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'Donation status can only change through the claim and pickup steps';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_donation_workflow_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS donations_guard_workflow_columns ON public.donations;
CREATE TRIGGER donations_guard_workflow_columns
BEFORE INSERT OR UPDATE ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.guard_donation_workflow_columns();
