-- Delete test donations without touching real user data.
--
-- Run by hand in the Supabase SQL editor. This is NOT a migration and never runs automatically.
--
-- How it decides what is "test": only donations POSTED BY the test accounts you list below are
-- deleted. Deleting a donation also removes its own claim, pickup timeline, pickup QR code and the
-- notifications about it (all ON DELETE CASCADE). Nothing else is touched: no user accounts, no
-- profiles, no NGO registrations, and no donation posted by any other account.
-- A real donation that a test account claimed is kept as it is.
--
-- 1. Put the email addresses of your test accounts in BOTH lists below (step 2 and step 3).
-- 2. Run step 2 alone and check the list it returns.
-- 3. Run step 3. It stops without deleting anything if an email isn't a real account (typo check).

-- STEP 2: preview (read-only)
WITH test_accounts AS (
  SELECT id, email FROM auth.users
  WHERE lower(email) = ANY (ARRAY[
    lower('put-test-account-email-here')
  ])
)
SELECT d.id, d.food_type, d.status, d.created_at, t.email AS posted_by
FROM public.donations d
JOIN test_accounts t ON t.id = d.donor_id
ORDER BY d.created_at;

-- STEP 3: delete
DO $$
DECLARE
  v_emails text[] := ARRAY[
    lower('put-test-account-email-here')
  ];
  v_found int;
  v_deleted int;
BEGIN
  SELECT count(*) INTO v_found FROM auth.users WHERE lower(email) = ANY (v_emails);
  IF v_found <> cardinality(v_emails) THEN
    RAISE EXCEPTION 'Only % of the % listed emails are existing accounts. Fix the list; nothing was deleted.',
      v_found, cardinality(v_emails);
  END IF;

  DELETE FROM public.donations
  WHERE donor_id IN (SELECT id FROM auth.users WHERE lower(email) = ANY (v_emails));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % test donation(s).', v_deleted;
END;
$$;
