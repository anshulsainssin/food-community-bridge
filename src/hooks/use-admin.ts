import { useAccount } from "@/hooks/use-profile";
import { DEMO_ADMIN } from "@/lib/demo";

/** Whether the signed-in user is in the admins allowlist. Not self-service — see ADMIN_EMAILS in .env.example. */
export function useIsAdmin(userId: string | null | undefined) {
  const account = useAccount();

  // Demo admin bypasses the real DB check.
  if (userId === DEMO_ADMIN.id) return { isAdmin: true, loading: false };
  if (!userId) return { isAdmin: false, loading: false };
  return {
    isAdmin: account.data?.user.id === userId && account.data.isAdmin,
    loading: account.isPending,
  };
}
