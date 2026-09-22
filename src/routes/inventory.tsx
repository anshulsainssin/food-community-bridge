import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Plus, Wheat } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-admin";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { INVENTORY_CATEGORIES, stockStatus, type StockStatus } from "@/lib/kitchen";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Live Kitchen Inventory | Ratna Nidhi Central Kitchen" },
      { name: "description", content: "Daily raw ration stock for the Ratna Nidhi Central Kitchen: grains, pulses, vegetables, and cooking oil, with re-order alerts." },
      { property: "og:title", content: "Live Kitchen Inventory | Ratna Nidhi Central Kitchen" },
      { property: "og:description", content: "Track daily raw ration stock and re-order alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InventoryPage,
});

type InventoryItem = Tables<"kitchen_inventory">;

const STATUS_STYLE: Record<StockStatus, string> = {
  "Reorder Now": "bg-accent/15 text-accent",
  "Low Stock": "bg-amber-500/15 text-amber-700",
  "In Stock": "bg-primary/10 text-primary",
};

function InventoryPage() {
  const { user } = useProfile();
  const { isAdmin } = useIsAdmin(user?.id);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from("kitchen_inventory").select("*").order("category").order("item_name");
    setItems((data as InventoryItem[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("kitchen-inventory")
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_inventory" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const { error: insertError } = await supabase.from("kitchen_inventory").insert({
      category: String(form.get("category") ?? ""),
      item_name: String(form.get("item_name") ?? "").trim(),
      unit: String(form.get("unit") ?? "kg").trim() || "kg",
      current_stock: Number(form.get("current_stock") ?? 0),
      reorder_threshold: Number(form.get("reorder_threshold") ?? 0),
      updated_by: user?.id ?? null,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    (event.target as HTMLFormElement).reset();
    setShowAdd(false);
    await load();
  }

  async function saveStock(item: InventoryItem) {
    const draft = stockDrafts[item.id];
    if (draft == null) return;
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 0) return;
    setError(null);
    const { error: updateError } = await supabase
      .from("kitchen_inventory")
      .update({ current_stock: value, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
      .eq("id", item.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStockDrafts((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    await load();
  }

  const reorderItems = items.filter((item) => stockStatus(item.current_stock, item.reorder_threshold) !== "In Stock");

  return (
    <AppShell>
      <PageIntro
        eyebrow="Live Kitchen Inventory"
        title={<>Raw rations, <span className="italic">tracked daily.</span></>}
        description="Grains, pulses, vegetables, and cooking oil on hand at the Ratna Nidhi Central Kitchen, updated as stock moves, with automatic re-order alerts."
        action={
          isAdmin ? (
            <Button size="wide" onClick={() => setShowAdd((v) => !v)}>
              <Plus className="size-4" />
              {showAdd ? "Cancel" : "Add item"}
            </Button>
          ) : undefined
        }
      />

      {reorderItems.length > 0 && (
        <section className="border-b border-border bg-accent/5 px-4 py-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-accent" />
            <h2 className="label-caps text-accent">Re-order alerts · {reorderItems.length}</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {reorderItems.map((item) => item.item_name).join(", ")} {reorderItems.length === 1 ? "is" : "are"} at or below the re-order threshold.
          </p>
        </section>
      )}

      {isAdmin && showAdd && (
        <section className="border-b border-border px-4 py-6 sm:px-8 lg:px-12">
          <form onSubmit={addItem} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block">
              <span className="label-caps text-muted-foreground">Category</span>
              <select name="category" required className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground">
                {INVENTORY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label-caps text-muted-foreground">Item name</span>
              <input name="item_name" required placeholder="e.g. Rice" className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <label className="block">
              <span className="label-caps text-muted-foreground">Unit</span>
              <input name="unit" defaultValue="kg" className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <label className="block">
              <span className="label-caps text-muted-foreground">Current stock</span>
              <input name="current_stock" type="number" step="0.1" min="0" required className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <label className="block">
              <span className="label-caps text-muted-foreground">Re-order threshold</span>
              <input name="reorder_threshold" type="number" step="0.1" min="0" required className="mt-2 h-11 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
            </label>
            <div className="sm:col-span-2 lg:col-span-5">
              {error && <p className="mb-3 text-sm text-accent">{error}</p>}
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save item"}</Button>
            </div>
          </form>
        </section>
      )}

      {loading ? (
        <p className="p-10 text-sm text-muted-foreground">Loading inventory…</p>
      ) : items.length === 0 ? (
        <p className="p-10 text-sm text-muted-foreground">No inventory items recorded yet.</p>
      ) : (
        INVENTORY_CATEGORIES.map((category) => {
          const categoryItems = items.filter((item) => item.category === category);
          if (categoryItems.length === 0) return null;
          return (
            <section key={category} className="border-b border-border px-4 py-6 sm:px-8 lg:px-12">
              <div className="flex items-center gap-2">
                <Wheat className="size-4 text-accent" />
                <h2 className="label-caps text-foreground">{category}</h2>
              </div>
              <div className="mt-5 grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
                {categoryItems.map((item) => {
                  const status = stockStatus(item.current_stock, item.reorder_threshold);
                  const draft = stockDrafts[item.id];
                  return (
                    <article key={item.id} className="bg-background p-5">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                        <p className="min-w-0 truncate font-medium">{item.item_name}</p>
                        <span className={`label-caps shrink-0 rounded-sm px-2 py-1 ${STATUS_STYLE[status]}`}>{status}</span>
                      </div>
                      <p className="mt-3 font-display text-3xl">
                        {item.current_stock} <span className="text-base text-muted-foreground">{item.unit}</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Re-order at {item.reorder_threshold} {item.unit}</p>
                      {isAdmin && (
                        <div className="mt-4 flex items-center gap-2">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder="New stock"
                            value={draft ?? ""}
                            onChange={(event) => setStockDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))}
                            className="h-9 w-full min-w-0 border-b border-input bg-transparent text-sm outline-none focus:border-foreground"
                          />
                          <Button className="h-9 shrink-0 px-3 text-xs" disabled={draft == null || draft === ""} onClick={() => void saveStock(item)}>
                            Update
                          </Button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </AppShell>
  );
}
