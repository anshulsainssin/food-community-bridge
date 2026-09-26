// Authorization for server functions. These checks replace the Postgres row-level-security
// policies the app used under Supabase: every server function must call one of these before
// touching data that isn't public.
import { collections } from "@/integrations/mongodb/db.server";

import { getSessionUserId, requireSessionUserId } from "./session.server";

export async function isAdmin(userId: string) {
  const { admins } = await collections();
  return (await admins.countDocuments({ _id: userId }, { limit: 1 })) > 0;
}

export async function requireUser() {
  const userId = requireSessionUserId();
  const db = await collections();
  return { userId, db };
}

export async function requireAdmin() {
  const { userId, db } = await requireUser();
  if (!(await isAdmin(userId))) throw new Error("Not authorized");
  return { userId, db };
}

export async function optionalUser() {
  const userId = getSessionUserId();
  const db = await collections();
  return { userId, db };
}
