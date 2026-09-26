import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  DistributionCenter,
  KitchenInventoryItem,
  Sponsorship,
} from "@/integrations/mongodb/types";
import { INVENTORY_CATEGORIES } from "@/lib/kitchen";

// Server-only modules are loaded inside handlers — this file also ships to the client bundle.
const access = () => import("@/lib/auth/access.server");
const mongo = () => import("@/integrations/mongodb/db.server");

export type KitchenStats = {
  meals_cooked_today: number;
  children_served_today: number;
  active_kitchen_centers: number;
  meals_cooked_this_month: number;
  total_sponsorships_amount: number;
  total_meals_sponsored: number;
  low_stock_items: number;
};

/** YYYY-MM-DD for today in UTC — meal logs are bucketed by UTC calendar day. */
function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** Live community kitchen totals — public, non-PII headline numbers. */
export const getKitchenStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<KitchenStats> => {
    const { collections } = await mongo();
    const db = await collections();
    const today = utcDay();
    const monthStart = `${today.slice(0, 7)}-01`;

    const [mealTotals, activeCenters, sponsorTotals, lowStock] = await Promise.all([
      db.mealLogs
        .aggregate<{ today_meals: number; today_children: number; month_meals: number }>([
          { $match: { log_date: { $gte: monthStart } } },
          {
            $group: {
              _id: null,
              today_meals: { $sum: { $cond: [{ $eq: ["$log_date", today] }, "$meals_cooked", 0] } },
              today_children: {
                $sum: { $cond: [{ $eq: ["$log_date", today] }, "$children_served", 0] },
              },
              month_meals: { $sum: "$meals_cooked" },
            },
          },
        ])
        .next(),
      db.distributionCenters.countDocuments({ active: true }),
      db.sponsorships
        .aggregate<{ amount: number; meals: number }>([
          {
            $group: {
              _id: null,
              amount: { $sum: "$amount_inr" },
              meals: { $sum: "$meals_sponsored" },
            },
          },
        ])
        .next(),
      db.kitchenInventory.countDocuments({
        $expr: { $lte: ["$current_stock", "$reorder_threshold"] },
      }),
    ]);

    return {
      meals_cooked_today: mealTotals?.today_meals ?? 0,
      children_served_today: mealTotals?.today_children ?? 0,
      active_kitchen_centers: activeCenters,
      meals_cooked_this_month: mealTotals?.month_meals ?? 0,
      total_sponsorships_amount: sponsorTotals?.amount ?? 0,
      total_meals_sponsored: sponsorTotals?.meals ?? 0,
      low_stock_items: lowStock,
    };
  },
);

// ---------------------------------------------------------------- Inventory (read public, write admin)

export const listInventory = createServerFn({ method: "GET" }).handler(
  async (): Promise<KitchenInventoryItem[]> => {
    const { collections, toRow } = await mongo();
    const db = await collections();
    const docs = await db.kitchenInventory.find().sort({ category: 1, item_name: 1 }).toArray();
    return docs.map((doc) => toRow<KitchenInventoryItem>(doc));
  },
);

const stockAmount = z.number().finite().min(0);

export const addInventoryItem = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        category: z.enum(INVENTORY_CATEGORIES),
        item_name: z.string().trim().min(1).max(120),
        unit: z.string().trim().min(1).max(20),
        current_stock: stockAmount,
        reorder_threshold: stockAmount,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await access();
    const { newId } = await mongo();
    const { userId, db } = await requireAdmin();
    await db.kitchenInventory.insertOne({
      _id: newId(),
      ...data,
      updated_at: new Date(),
      updated_by: userId,
    });
  });

export const updateInventoryStock = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ id: z.string().min(1), current_stock: stockAmount }).parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await access();
    const { userId, db } = await requireAdmin();
    const result = await db.kitchenInventory.updateOne(
      { _id: data.id },
      { $set: { current_stock: data.current_stock, updated_at: new Date(), updated_by: userId } },
    );
    if (result.matchedCount === 0) throw new Error("Inventory item not found.");
  });

// ---------------------------------------------------------------- Distribution centers & meal logs

export const listDistributionCenters = createServerFn({ method: "GET" }).handler(
  async (): Promise<DistributionCenter[]> => {
    const { collections, toRow } = await mongo();
    const db = await collections();
    const docs = await db.distributionCenters.find().sort({ name: 1 }).toArray();
    return docs.map((doc) => toRow<DistributionCenter>(doc));
  },
);

export const addDistributionCenter = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        name: z.string().trim().min(1).max(200),
        center_type: z.string().trim().min(1).max(100),
        address: z.string().trim().max(300).nullable(),
        latitude: z.number().min(-90).max(90).nullable(),
        longitude: z.number().min(-180).max(180).nullable(),
        daily_meal_target: z.number().int().min(0),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await access();
    const { newId } = await mongo();
    const { db } = await requireAdmin();
    await db.distributionCenters.insertOne({
      _id: newId(),
      ...data,
      active: true,
      created_at: new Date(),
    });
  });

export const logMeals = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        center_id: z.string().min(1),
        meals_cooked: z.number().int().min(0),
        children_served: z.number().int().min(0),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await access();
    const { newId } = await mongo();
    const { userId, db } = await requireAdmin();
    if (!(await db.distributionCenters.countDocuments({ _id: data.center_id }, { limit: 1 }))) {
      throw new Error("Distribution center not found.");
    }
    await db.mealLogs.insertOne({
      _id: newId(),
      ...data,
      log_date: utcDay(),
      logged_by: userId,
      created_at: new Date(),
    });
  });

// ---------------------------------------------------------------- Sponsorships (sponsor's own; admins see all)

export const listMySponsorships = createServerFn({ method: "GET" }).handler(
  async (): Promise<Sponsorship[]> => {
    const { optionalUser } = await access();
    const { toRow } = await mongo();
    const { userId, db } = await optionalUser();
    if (!userId) return [];
    const docs = await db.sponsorships
      .find({ sponsor_id: userId })
      .sort({ created_at: -1 })
      .toArray();
    return docs.map((doc) => toRow<Sponsorship>(doc));
  },
);

/** Records a pledge (no payment processing) against the signed-in sponsor's account. */
export const recordSponsorship = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        sponsor_name: z.string().trim().min(1).max(200),
        sponsor_email: z.string().trim().max(200).nullable(),
        amount_inr: z.number().finite().positive(),
        meals_sponsored: z.number().int().positive(),
        message: z.string().trim().max(1000).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await access();
    const { newId } = await mongo();
    const { userId, db } = await requireUser();
    await db.sponsorships.insertOne({
      _id: newId(),
      ...data,
      sponsor_id: userId,
      created_at: new Date(),
    });
  });

// ---------------------------------------------------------------- Contact & volunteer forms (open to visitors)

export const submitContactMessage = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        name: z.string().trim().min(1).max(200),
        email: z.string().trim().email().max(200),
        message: z.string().trim().min(1).max(5000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { collections, newId } = await mongo();
    const db = await collections();
    await db.contactMessages.insertOne({ _id: newId(), ...data, created_at: new Date() });
  });

export const submitVolunteerSignup = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        name: z.string().trim().min(1).max(200),
        email: z.string().trim().email().max(200),
        phone: z.string().trim().max(40).nullable(),
        location_label: z.string().trim().max(200).nullable(),
        message: z.string().trim().max(5000).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { collections, newId } = await mongo();
    const db = await collections();
    await db.volunteerSignups.insertOne({ _id: newId(), ...data, created_at: new Date() });
  });
