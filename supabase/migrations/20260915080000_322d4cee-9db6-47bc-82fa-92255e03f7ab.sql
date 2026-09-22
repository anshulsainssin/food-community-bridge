-- Enable real-time delivery for the pickup-status flow: donors and claimants now see
-- Available -> Claimed -> Pickup in Progress -> Picked Up -> Completed changes live instead
-- of needing to refresh.
--
-- donations is added with an explicit column list (PostgreSQL 15 partial-column
-- publications) that excludes contact_info. Logical replication publishes the full row
-- regardless of ordinary table/column GRANTs, so without this the column-level SELECT
-- restriction from the previous migration would be bypassed by anyone subscribing to
-- postgres_changes on this table directly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'donations'
  ) THEN
    EXECUTE $sql$ALTER PUBLICATION supabase_realtime ADD TABLE public.donations (
      id, donor_id, food_type, diet, quantity, servings, weight_kg, prepared_at, pickup_deadline,
      notes, status, pickup_address, pickup_latitude, pickup_longitude, claimed_by, claimed_at,
      completed_at, created_at, updated_at
    )$sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pickup_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pickup_events';
  END IF;
END $$;
