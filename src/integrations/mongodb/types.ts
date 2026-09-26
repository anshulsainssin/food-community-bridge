// Row shapes returned to the browser by the server functions in src/lib/*.functions.ts.
// Each MongoDB document stores its string UUID as `_id`; `toRow()` in db.server.ts maps it to
// `id` and serializes Dates to ISO strings so these types match what the UI receives.

export type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
  organization: string | null;
  phone: string | null;
  email: string | null;
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
};

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at: string;
};

export type VolunteerSignup = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  location_label: string | null;
  message: string | null;
  created_at: string;
};

export type NgoRegistration = {
  id: string;
  user_id: string;
  organization_name: string;
  registration_80g: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string | null;
  pincode: string;
  area_label: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  verified_at: string | null;
  distribution_center_id: string | null;
  created_at: string;
  updated_at: string;
};

export type KitchenInventoryItem = {
  id: string;
  category: string;
  item_name: string;
  unit: string;
  current_stock: number;
  reorder_threshold: number;
  updated_at: string;
  updated_by: string | null;
};

export type DistributionCenter = {
  id: string;
  name: string;
  center_type: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  daily_meal_target: number;
  active: boolean;
  created_at: string;
};

export type MealLog = {
  id: string;
  center_id: string;
  /** Calendar day (UTC) as YYYY-MM-DD. */
  log_date: string;
  meals_cooked: number;
  children_served: number;
  logged_by: string | null;
  created_at: string;
};

export type Sponsorship = {
  id: string;
  sponsor_id: string | null;
  sponsor_name: string;
  sponsor_email: string | null;
  amount_inr: number;
  meals_sponsored: number;
  message: string | null;
  created_at: string;
};

/** The signed-in account as the browser sees it. */
export type AuthUser = {
  id: string;
  email: string | null;
};

/** Stored shape of a row: `id` becomes `_id`, ISO timestamps become Dates. */
export type Doc<Row extends { id: string }> = {
  _id: string;
} & {
  [K in Exclude<keyof Row, "id">]: K extends `${string}_at`
    ? null extends Row[K]
      ? Date | null
      : Date
    : Row[K];
};

/** Profiles double as the user record, keyed by our own UUID and linked to Google by `google_sub`. */
export type ProfileDoc = Doc<Profile> & { google_sub: string };
export type AdminDoc = { _id: string; created_at: Date };
