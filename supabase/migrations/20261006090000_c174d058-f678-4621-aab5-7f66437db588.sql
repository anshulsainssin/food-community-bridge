-- Monthly donor certificate: a donor whose completed donations in one calendar month (India time)
-- add up to more than 100 kg earns a certificate of appreciation for that month.
-- Only completed donations with a recorded weight count. Safe to run more than once.

-- The signed-in donor's certificates, newest month first.
CREATE OR REPLACE FUNCTION public.my_certificates()
RETURNS TABLE (
  month DATE, total_kg NUMERIC, donations BIGINT, people_served BIGINT,
  certificate_no TEXT, recipient_name TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.month, m.total_kg, m.donations, m.people,
         'FWC-' || to_char(m.month, 'YYYYMM') || '-' || upper(left(replace(auth.uid()::text, '-', ''), 8)),
         COALESCE(NULLIF(btrim(p.organization), ''), NULLIF(btrim(p.full_name), ''), 'Food donor')
  FROM (
    SELECT date_trunc('month', d.completed_at AT TIME ZONE 'Asia/Kolkata')::date AS month,
           COALESCE(sum(d.weight_kg), 0)::NUMERIC AS total_kg,
           count(*) AS donations,
           COALESCE(sum(d.servings), 0)::BIGINT AS people
    FROM public.donations d
    WHERE auth.uid() IS NOT NULL AND d.donor_id = auth.uid()
      AND d.status = 'Completed' AND d.completed_at IS NOT NULL
    GROUP BY 1
  ) m
  JOIN public.profiles p ON p.id = auth.uid()
  WHERE m.total_kg > 100
  ORDER BY m.month DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.my_certificates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_certificates() TO authenticated;

-- Tell the donor the moment a completed donation takes their month past 100 kg.
CREATE OR REPLACE FUNCTION public.notify_monthly_certificate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month DATE;
  v_total NUMERIC;
BEGIN
  IF NEW.status <> 'Completed' OR OLD.status = 'Completed' OR NEW.weight_kg IS NULL OR NEW.completed_at IS NULL THEN
    RETURN NEW;
  END IF;
  v_month := date_trunc('month', NEW.completed_at AT TIME ZONE 'Asia/Kolkata')::date;
  SELECT COALESCE(sum(weight_kg), 0) INTO v_total
  FROM public.donations
  WHERE donor_id = NEW.donor_id AND status = 'Completed' AND completed_at IS NOT NULL
    AND date_trunc('month', completed_at AT TIME ZONE 'Asia/Kolkata')::date = v_month;
  -- This row is already counted (AFTER trigger), so the month crossed 100 kg with this donation.
  IF v_total > 100 AND v_total - NEW.weight_kg <= 100 THEN
    INSERT INTO public.notifications (user_id, title, body)
    VALUES (NEW.donor_id, 'You earned a certificate',
            'You donated ' || to_char(v_total, 'FM999990.##') || ' kg of food in ' || to_char(v_month, 'FMMonth YYYY')
              || '. Download your certificate of appreciation from your profile.');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_monthly_certificate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS donations_notify_monthly_certificate ON public.donations;
CREATE TRIGGER donations_notify_monthly_certificate
AFTER UPDATE OF status ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.notify_monthly_certificate();
