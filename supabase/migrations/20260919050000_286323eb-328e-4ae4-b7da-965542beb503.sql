-- Capture the role chosen at signup (Donor vs NGO/Volunteer) directly on the profile row,
-- the same way full_name is already carried through from auth signup metadata. profiles.role
-- stays a free-text column (unchanged) — this only makes the signup-time value land there
-- atomically, including for email-confirmation signups that never return a client session to
-- follow up with a separate update.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (NEW.id,
          COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
          NEW.email,
          NEW.raw_user_meta_data ->> 'role')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
