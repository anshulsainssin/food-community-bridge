-- Reconciles the independently-built NGO registration/verification feature (organization
-- name, 80G tax certificate, contact info, pincode-verified location — table and RLS created
-- in 20260918045718/45745) with the Central Kitchen model. The old ngo_admin_stats() RPC and
-- the donation-claim workflow it served are NOT carried forward here — that workflow no longer
-- exists (the donations/claim pages were retired). What's preserved is the registration data
-- itself, repurposed as how an NGO/school registers to become a verified distribution partner:
-- once an admin approves a registration, it links to a real public.distribution_centers row.

ALTER TABLE public.ngo_registrations
  ADD COLUMN distribution_center_id UUID REFERENCES public.distribution_centers(id) ON DELETE SET NULL;

-- The existing policies only let a user see/edit their own registration. Admin review of
-- everyone's pending registrations needs its own explicit grant.
CREATE POLICY "Admins can view all NGO registrations" ON public.ngo_registrations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));
CREATE POLICY "Admins can update any NGO registration" ON public.ngo_registrations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));
