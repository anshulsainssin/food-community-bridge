import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { AuthUser, NotificationRow, Profile } from "@/integrations/mongodb/types";

// Server-only modules are loaded inside handlers — this file also ships to the client bundle.
const access = () => import("@/lib/auth/access.server");
const mongo = () => import("@/integrations/mongodb/db.server");

export type Account = { user: AuthUser; profile: Profile; isAdmin: boolean };

/** The signed-in account, or null when signed out (or the session's profile no longer exists). */
export const getAccount = createServerFn({ method: "GET" }).handler(
  async (): Promise<Account | null> => {
    const { optionalUser, isAdmin } = await access();
    const { toRow, PROFILE_PROJECTION } = await mongo();
    const { userId, db } = await optionalUser();
    if (!userId) return null;
    const doc = await db.profiles.findOne({ _id: userId }, { projection: PROFILE_PROJECTION });
    if (!doc) return null;
    const profile = toRow<Profile>(doc);
    return {
      user: { id: profile.id, email: profile.email },
      profile,
      isAdmin: await isAdmin(userId),
    };
  },
);

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

const INVALID_LOGIN = "Incorrect email or password.";

export const signUp = createServerFn({ method: "POST" })
  .validator((data) =>
    credentials.extend({ full_name: z.string().trim().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { collections, newId } = await mongo();
    const { hashPassword } = await import("@/lib/auth/password.server");
    const { startSession } = await import("@/lib/auth/session.server");
    const { profiles } = await collections();

    if (await profiles.countDocuments({ login_email: data.email }, { limit: 1 })) {
      throw new Error("An account with this email already exists. Please sign in.");
    }
    const now = new Date();
    const id = newId();
    try {
      await profiles.insertOne({
        _id: id,
        login_email: data.email,
        password_hash: await hashPassword(data.password),
        full_name: data.full_name,
        email: data.email,
        organization: null,
        phone: null,
        location_label: null,
        latitude: null,
        longitude: null,
        created_at: now,
        updated_at: now,
      });
    } catch (error) {
      // Unique index on login_email: a concurrent signup for the same address won the race.
      if ((error as { code?: number }).code === 11000) {
        throw new Error("An account with this email already exists. Please sign in.");
      }
      throw error;
    }
    startSession(id);
  });

export const signIn = createServerFn({ method: "POST" })
  .validator((data) => credentials.extend({ password: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { collections } = await mongo();
    const { verifyPassword } = await import("@/lib/auth/password.server");
    const { startSession } = await import("@/lib/auth/session.server");
    const { profiles } = await collections();

    const profile = await profiles.findOne(
      { login_email: data.email },
      { projection: { password_hash: 1 } },
    );
    if (!profile || !(await verifyPassword(data.password, profile.password_hash))) {
      throw new Error(INVALID_LOGIN);
    }
    startSession(profile._id);
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { clearSession } = await import("@/lib/auth/session.server");
  clearSession();
});

const nullableText = z.string().trim().max(200).nullable();

export const updateProfile = createServerFn({ method: "POST" })
  .validator((data) =>
    z
      .object({
        full_name: nullableText,
        organization: nullableText,
        phone: nullableText,
        email: nullableText,
        location_label: nullableText,
        latitude: z.number().min(-90).max(90).nullable(),
        longitude: z.number().min(-180).max(180).nullable(),
      })
      .partial()
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await access();
    const { userId, db } = await requireUser();
    // Only fields the caller actually sent — absent keys must not overwrite stored values.
    const changes = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    ) as Partial<Omit<Profile, "id" | "created_at" | "updated_at">>;
    await db.profiles.updateOne({ _id: userId }, { $set: { ...changes, updated_at: new Date() } });
  });

export const listNotifications = createServerFn({ method: "GET" }).handler(
  async (): Promise<NotificationRow[]> => {
    const { optionalUser } = await access();
    const { toRow } = await mongo();
    const { userId, db } = await optionalUser();
    if (!userId) return [];
    const docs = await db.notifications
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(30)
      .toArray();
    return docs.map((doc) => toRow<NotificationRow>(doc));
  },
);

export const markNotificationsRead = createServerFn({ method: "POST" }).handler(async () => {
  const { requireUser } = await access();
  const { userId, db } = await requireUser();
  await db.notifications.updateMany({ user_id: userId, read: false }, { $set: { read: true } });
});
