CREATE TABLE public.ngo_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_name TEXT NOT NULL,
  registration_80g TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_email TEXT,
  pincode TEXT NOT NULL,
  area_label TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'Pending',
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ngo_registrations TO authenticated;
GRANT ALL ON public.ngo_registrations TO service_role;

ALTER TABLE public.ngo_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own NGO registration"
ON public.ngo_registrations FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users create their own NGO registration"
ON public.ngo_registrations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own NGO registration"
ON public.ngo_registrations FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER ngo_registrations_set_updated_at
BEFORE UPDATE ON public.ngo_registrations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.ngo_admin_stats()
RETURNS TABLE(
  food_claimed_kg NUMERIC,
  meals_claimed BIGINT,
  total_claims BIGINT,
  active_distributions BIGINT,
  pending_pickups BIGINT,
  delivered BIGINT,
  people_served BIGINT,
  open_requests BIGINT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(SUM(d.weight_kg) FILTER (WHERE d.claimed_by = auth.uid()), 0)::NUMERIC,
    COALESCE(SUM(d.servings) FILTER (WHERE d.claimed_by = auth.uid()), 0)::BIGINT,
    COUNT(*) FILTER (WHERE d.claimed_by = auth.uid())::BIGINT,
    COUNT(*) FILTER (WHERE d.claimed_by = auth.uid() AND d.status IN ('Claimed', 'Pickup in Progress', 'Picked Up'))::BIGINT,
    COUNT(*) FILTER (WHERE d.claimed_by = auth.uid() AND d.status = 'Claimed')::BIGINT,
    COUNT(*) FILTER (WHERE d.claimed_by = auth.uid() AND d.status = 'Completed')::BIGINT,
    COALESCE(SUM(d.servings) FILTER (WHERE d.claimed_by = auth.uid() AND d.status = 'Completed'), 0)::BIGINT,
    COUNT(*) FILTER (WHERE d.status = 'Available' AND d.created_at > now() - interval '24 hours')::BIGINT
  FROM public.donations d
  WHERE auth.uid() IS NOT NULL;
$$;

ALTER TABLE public.donations REPLICA IDENTITY FULL;
ALTER TABLE public.pickup_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.donations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pickup_events;