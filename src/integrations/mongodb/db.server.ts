// Server-only MongoDB access. Never import this from route files or *.functions.ts at the top
// level (those ship to the client bundle) — load it inside a server handler instead:
//   const { collections } = await import("@/integrations/mongodb/db.server");
import { MongoClient, type Db } from "mongodb";

import type {
  AdminDoc,
  ContactMessage,
  Doc,
  DistributionCenter,
  KitchenInventoryItem,
  MealLog,
  NgoRegistration,
  NotificationRow,
  ProfileDoc,
  Sponsorship,
  VolunteerSignup,
} from "./types";

type Cache = { client: MongoClient; db: Promise<Db> };

// Cached on globalThis so Vite's dev-server module reloads reuse one connection pool.
const globalCache = globalThis as typeof globalThis & { __fwcMongo?: Cache };

function connect(): Cache {
  const uri = process.env["MONGODB_URI"];
  if (!uri) {
    const message =
      "Missing environment variable MONGODB_URI. Add your MongoDB connection string to .env.";
    console.error(`[MongoDB] ${message}`);
    throw new Error(message);
  }
  const client = new MongoClient(uri);
  const db = client.connect().then(async (connected) => {
    // With no DB name in the URI (the Atlas default), fall back to MONGODB_DB.
    const database = connected.db(process.env["MONGODB_DB"] || undefined);
    await ensureIndexes(database);
    return database;
  });
  // Don't cache a failed connection — the next request retries.
  db.catch(() => {
    if (globalCache.__fwcMongo?.client === client) delete globalCache.__fwcMongo;
  });
  return { client, db };
}

export function getDb(): Promise<Db> {
  globalCache.__fwcMongo ??= connect();
  return globalCache.__fwcMongo.db;
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("profiles").createIndex({ google_sub: 1 }, { unique: true }),
    db.collection("profiles").createIndex({ created_at: -1 }),
    db.collection("notifications").createIndex({ user_id: 1, created_at: -1 }),
    db.collection("ngo_registrations").createIndex({ user_id: 1 }, { unique: true }),
    db.collection("ngo_registrations").createIndex({ created_at: -1 }),
    db.collection("kitchen_inventory").createIndex({ category: 1, item_name: 1 }),
    db.collection("distribution_centers").createIndex({ name: 1 }),
    db.collection("meal_logs").createIndex({ log_date: 1 }),
    db.collection("sponsorships").createIndex({ sponsor_id: 1, created_at: -1 }),
    db.collection("sponsorships").createIndex({ created_at: -1 }),
    db.collection("contact_messages").createIndex({ created_at: -1 }),
    db.collection("volunteer_signups").createIndex({ created_at: -1 }),
  ]);
}

export async function collections() {
  const db = await getDb();
  return {
    profiles: db.collection<ProfileDoc>("profiles"),
    admins: db.collection<AdminDoc>("admins"),
    notifications: db.collection<Doc<NotificationRow>>("notifications"),
    contactMessages: db.collection<Doc<ContactMessage>>("contact_messages"),
    volunteerSignups: db.collection<Doc<VolunteerSignup>>("volunteer_signups"),
    ngoRegistrations: db.collection<Doc<NgoRegistration>>("ngo_registrations"),
    kitchenInventory: db.collection<Doc<KitchenInventoryItem>>("kitchen_inventory"),
    distributionCenters: db.collection<Doc<DistributionCenter>>("distribution_centers"),
    mealLogs: db.collection<Doc<MealLog>>("meal_logs"),
    sponsorships: db.collection<Doc<Sponsorship>>("sponsorships"),
  };
}

export type Collections = Awaited<ReturnType<typeof collections>>;

/** Maps a stored document to the row shape the browser expects (`_id` → `id`, Date → ISO string). */
export function toRow<Row extends { id: string }>(doc: Doc<Row>): Row {
  const { _id, ...rest } = doc as { _id: string } & Record<string, unknown>;
  const row: Record<string, unknown> = { id: _id };
  for (const [key, value] of Object.entries(rest)) {
    row[key] = value instanceof Date ? value.toISOString() : value;
  }
  return row as Row;
}

export function newId() {
  return crypto.randomUUID();
}
