import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  AuthUser,
  NgoRegistration,
  NotificationRow,
  Profile,
} from "@/integrations/mongodb/types";
import { lookupLocation } from "@/lib/geocode.functions";

// Server-only modules are loaded inside handlers — this file also ships to the client bundle.
const access = () => import("@/lib/auth/access.server");
const mongo = () => import("@/integrations/mongodb/db.server");

export type Account = { user: AuthUser; profile: Profile; isAdmin: boolean };

/** The signed-in account, or null when signed out (or the session's profile no longer exists). */
export const getAccount = createServerFn({ method: "GET" }).handler(
  async (): Promise<Account | null> => {
    const { optionalUser, isAdmin } = await access();
    const { toRow } = await mongo();
    const { userId, db } = await optionalUser();
    if (!userId) return null;
    const doc = await db.profiles.findOne({ _id: userId }, { projection: { google_sub: 0 } });
    if (!doc) return null;
    const profile = toRow<Profile>(doc);
    return {
      user: { id: profile.id, email: profile.email },
      profile,
      isAdmin: await isAdmin(userId),
    };
  },
);

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { clearSession } = await import("@/lib/auth/session.server");
  clearSession();
});

const nullableText = z.string().trim().max(200).nullable();

export const updateProfile = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        full_name: nullableText,
        role: nullableText,
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

export const getMyRegistration = createServerFn({ method: "GET" }).handler(
  async (): Promise<NgoRegistration | null> => {
    const { optionalUser } = await access();
    const { toRow } = await mongo();
    const { userId, db } = await optionalUser();
    if (!userId) return null;
    const doc = await db.ngoRegistrations.findOne({ user_id: userId });
    return doc ? toRow<NgoRegistration>(doc) : null;
  },
);

/**
 * Creates or updates the caller's distribution-partner registration. The PIN code is geocoded
 * here on the server, so "Verified" status can't be claimed by the client.
 */
export const saveMyRegistration = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        organization_name: z.string().trim().min(1).max(200),
        registration_80g: z.string().trim().min(1).max(100),
        contact_person: z.string().trim().min(1).max(200),
        contact_phone: z.string().trim().min(1).max(40),
        contact_email: z.string().trim().max(200),
        pincode: z.string().trim().min(2).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await access();
    const { newId } = await mongo();
    const { userId, db } = await requireUser();

    let place: { label: string; latitude: number; longitude: number } | null = null;
    try {
      place = await lookupLocation({ data: { query: data.pincode } });
    } catch (lookupError) {
      console.error(lookupError);
    }

    const now = new Date();
    await db.ngoRegistrations.updateOne(
      { user_id: userId },
      {
        $set: {
          ...data,
          contact_email: data.contact_email || null,
          area_label: place?.label ?? null,
          latitude: place?.latitude ?? null,
          longitude: place?.longitude ?? null,
          status: place ? "Verified" : "Pending",
          verified_at: place ? now : null,
          updated_at: now,
        },
        // user_id comes from the filter on insert.
        $setOnInsert: { _id: newId(), distribution_center_id: null, created_at: now },
      },
      { upsert: true },
    );
  });
