export const INVENTORY_CATEGORIES = ["Grains", "Pulses", "Vegetables", "Cooking Oil"] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export type StockStatus = "Reorder Now" | "Low Stock" | "In Stock";

/** Reorder Now at/under threshold, Low Stock within 25% above it, In Stock otherwise. */
export function stockStatus(currentStock: number, reorderThreshold: number): StockStatus {
  if (currentStock <= reorderThreshold) return "Reorder Now";
  if (reorderThreshold > 0 && currentStock <= reorderThreshold * 1.25) return "Low Stock";
  return "In Stock";
}

// ₹500 sponsors 50 meals, i.e. ₹10 per meal.
export const RUPEES_PER_MEAL = 10;
export const SPONSOR_QUICK_AMOUNTS = [500, 1000, 2500, 5000] as const;

export function mealsForAmount(amountInr: number) {
  return Math.floor(Math.max(0, amountInr) / RUPEES_PER_MEAL);
}

export function formatInr(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}
