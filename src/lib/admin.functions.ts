import { createServerFn } from "@tanstack/react-start";

import type {
  ContactMessage,
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
};

const LIST_LIMIT = 500;

export const getAdminDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminDashboard> => {
    const { requireAdmin } = await access();
    const { toRow, PROFILE_PROJECTION } = await mongo();
    const { db } = await requireAdmin();
    const newestFirst = { created_at: -1 } as const;

    const [totalUsers, totalMessages, totalSignups, profiles, sponsorships, messages, signups] =
      await Promise.all([
        db.profiles.countDocuments(),
        db.contactMessages.countDocuments(),
        db.volunteerSignups.countDocuments(),
        db.profiles
          .find({}, { projection: PROFILE_PROJECTION })
          .sort(newestFirst)
          .limit(LIST_LIMIT)
          .toArray(),
        db.sponsorships.find().sort(newestFirst).limit(LIST_LIMIT).toArray(),
        db.contactMessages.find().sort(newestFirst).limit(LIST_LIMIT).toArray(),
        db.volunteerSignups.find().sort(newestFirst).limit(LIST_LIMIT).toArray(),
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
    };
  },
);
