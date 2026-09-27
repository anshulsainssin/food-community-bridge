REVOKE EXECUTE ON FUNCTION public.ngo_admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ngo_admin_stats() TO authenticated;