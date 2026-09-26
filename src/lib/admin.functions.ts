import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  ContactMessage,
  NgoRegistration,
  Profile,
  Sponsorship,
  VolunteerSignup,
} from "@/integrations/mongodb/types";

// Server-only modules are loaded inside handlers — this file also ships to the client bundle.
const access = () => import("@/lib/auth/access.server");
const mongo = () => import("@/integrations/mongodb/db.server");

export type AdminDashboard = {
  stats: {
    total_users: number;
    pending_contact_messages: number;
    pending_volunteer_signups: number;
  };
  profiles: Profile[];
  sponsorships: Sponsorship[];
  messages: ContactMessage[];
  signups: VolunteerSignup[];
  registrations: NgoRegistration[];
};

const LIST_LIMIT = 500;

export const getAdminDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminDashboard> => {
    const { requireAdmin } = await access();
    const { toRow } = await mongo();
    const { db } = await requireAdmin();
    const newestFirst = { created_at: -1 } as const;

    const [
      totalUsers,
      totalMessages,
      totalSignups,
      profiles,
      sponsorships,
      messages,
      signups,
      registrations,
    ] = await Promise.all([
      db.profiles.countDocuments(),
      db.contactMessages.countDocuments(),
      db.volunteerSignups.countDocuments(),
      db.profiles
        .find({}, { projection: { google_sub: 0 } })
        .sort(newestFirst)
        .limit(LIST_LIMIT)
        .toArray(),
      db.sponsorships.find().sort(newestFirst).limit(LIST_LIMIT).toArray(),
      db.contactMessages.find().sort(newestFirst).limit(LIST_LIMIT).toArray(),
      db.volunteerSignups.find().sort(newestFirst).limit(LIST_LIMIT).toArray(),
      db.ngoRegistrations.find().sort(newestFirst).limit(LIST_LIMIT).toArray(),
    ]);

    return {
      stats: {
        total_users: totalUsers,
        pending_contact_messages: totalMessages,
        pending_volunteer_signups: totalSignups,
      },
      profiles: profiles.map((doc) => toRow<Profile>(doc)),
      sponsorships: sponsorships.map((doc) => toRow<Sponsorship>(doc)),
      messages: messages.map((doc) => toRow<ContactMessage>(doc)),
      signups: signups.map((doc) => toRow<VolunteerSignup>(doc)),
      registrations: registrations.map((doc) => toRow<NgoRegistration>(doc)),
    };
  },
);

/** Approves a partner registration by creating its distribution center and linking the two. */
export const approveRegistration = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { requireAdmin } = await access();
    const { newId } = await mongo();
    const { db } = await requireAdmin();

    const registration = await db.ngoRegistrations.findOne({ _id: data.id });
    if (!registration) throw new Error("Registration not found.");
    if (registration.distribution_center_id)
      throw new Error("This registration is already approved.");
    if (registration.latitude == null || registration.longitude == null) {
      throw new Error("This registration has no verified location yet.");
    }

    const centerId = newId();
    await db.distributionCenters.insertOne({
      _id: centerId,
      name: registration.organization_name,
      center_type: "Partner organization",
      address: registration.area_label,
      latitude: registration.latitude,
      longitude: registration.longitude,
      daily_meal_target: 0,
      active: true,
      created_at: new Date(),
    });
    await db.ngoRegistrations.updateOne(
      { _id: registration._id },
      { $set: { distribution_center_id: centerId, updated_at: new Date() } },
    );
  });
