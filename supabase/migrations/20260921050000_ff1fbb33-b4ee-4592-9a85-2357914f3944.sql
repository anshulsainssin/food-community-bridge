-- Central Kitchen Operations Model: raw ration inventory, distribution centers/schools,
-- daily meal production logs, and meal-sponsorship pledges. Additive — the existing
-- donations/pickup_events tables and their data are left untouched (not dropped), even
-- though the frontend no longer surfaces that flow, so no history is lost.

-- KITCHEN INVENTORY: raw ration stock by category. Read is public (operational transparency
-- for a donor-facing "Live Kitchen Inventory" page); writes are admin-only.
CREATE TABLE public.kitchen_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('Grains', 'Pulses', 'Vegetables', 'Cooking Oil')),
  item_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  current_stock NUMERIC NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  reorder_threshold NUMERIC NOT NULL DEFAULT 0 CHECK (reorder_threshold >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT ON public.kitchen_inventory TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.kitchen_inventory TO authenticated;
GRANT ALL ON public.kitchen_inventory TO service_role;
ALTER TABLE public.kitchen_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view kitchen inventory" ON public.kitchen_inventory FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage kitchen inventory" ON public.kitchen_inventory FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));
CREATE POLICY "Admins update kitchen inventory" ON public.kitchen_inventory FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));
CREATE POLICY "Admins delete kitchen inventory" ON public.kitchen_inventory FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

-- DISTRIBUTION CENTERS: schools/centers that receive daily cooked meals. Read is public
-- (the "Live Beneficiary & Distribution Tracker" map); writes are admin-only.
CREATE TABLE public.distribution_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  center_type TEXT NOT NULL DEFAULT 'School',
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  daily_meal_target INTEGER NOT NULL DEFAULT 0 CHECK (daily_meal_target >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.distribution_centers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.distribution_centers TO authenticated;
GRANT ALL ON public.distribution_centers TO service_role;
ALTER TABLE public.distribution_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view distribution centers" ON public.distribution_centers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage distribution centers" ON public.distribution_centers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));
CREATE POLICY "Admins update distribution centers" ON public.distribution_centers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));
CREATE POLICY "Admins delete distribution centers" ON public.distribution_centers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

-- MEAL LOGS: daily meals-cooked / children-served records per center. Read is public
-- (feeds the live counters); writes are admin-only.
CREATE TABLE public.meal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES public.distribution_centers(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meals_cooked INTEGER NOT NULL DEFAULT 0 CHECK (meals_cooked >= 0),
  children_served INTEGER NOT NULL DEFAULT 0 CHECK (children_served >= 0),
  logged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX meal_logs_log_date_idx ON public.meal_logs (log_date);
GRANT SELECT ON public.meal_logs TO anon, authenticated;
GRANT INSERT ON public.meal_logs TO authenticated;
GRANT ALL ON public.meal_logs TO service_role;
ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view meal logs" ON public.meal_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins record meal logs" ON public.meal_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

-- SPONSORSHIPS: "Sponsor a Meal" pledges. No payment processing — this only records a
-- sponsor's intent/pledge (amount + meal count) against their own signed-in account.
-- Sponsor identity (name/email) is PII, so unlike the tables above this is NOT public:
-- a sponsor sees only their own pledges, admins see all.
CREATE TABLE public.sponsorships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sponsor_name TEXT NOT NULL,
  sponsor_email TEXT,
  amount_inr NUMERIC NOT NULL CHECK (amount_inr > 0),
  meals_sponsored INTEGER NOT NULL CHECK (meals_sponsored > 0),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sponsorships TO authenticated;
GRANT ALL ON public.sponsorships TO service_role;
ALTER TABLE public.sponsorships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sponsors can record their own pledge" ON public.sponsorships FOR INSERT TO authenticated
  WITH CHECK (sponsor_id = auth.uid());
CREATE POLICY "Sponsors can view their own pledges" ON public.sponsorships FOR SELECT TO authenticated
  USING (sponsor_id = auth.uid());
CREATE POLICY "Admins can view all pledges" ON public.sponsorships FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid()));

-- Public, non-sensitive aggregate stats for the home page / distribution tracker — no admin
-- gate needed (unlike admin_dashboard_stats, nothing here is PII), open to signed-out visitors
-- too since these are the headline "Meals Cooked Today" / "Children Served" marketing numbers.
CREATE OR REPLACE FUNCTION public.kitchen_dashboard_stats()
RETURNS TABLE (
  meals_cooked_today BIGINT,
  children_served_today BIGINT,
  active_kitchen_centers BIGINT,
  meals_cooked_this_month BIGINT,
  total_sponsorships_amount NUMERIC,
  total_meals_sponsored BIGINT,
  low_stock_items BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COALESCE(SUM(meals_cooked), 0) FROM public.meal_logs WHERE log_date = CURRENT_DATE)::BIGINT,
    (SELECT COALESCE(SUM(children_served), 0) FROM public.meal_logs WHERE log_date = CURRENT_DATE)::BIGINT,
    (SELECT count(*) FROM public.distribution_centers WHERE active)::BIGINT,
    (SELECT COALESCE(SUM(meals_cooked), 0) FROM public.meal_logs WHERE log_date >= date_trunc('month', CURRENT_DATE)::date)::BIGINT,
    (SELECT COALESCE(SUM(amount_inr), 0) FROM public.sponsorships)::NUMERIC,
    (SELECT COALESCE(SUM(meals_sponsored), 0) FROM public.sponsorships)::BIGINT,
    (SELECT count(*) FROM public.kitchen_inventory WHERE current_stock <= reorder_threshold)::BIGINT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.kitchen_dashboard_stats() TO anon, authenticated;
