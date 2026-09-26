import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Plus, Wheat } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-admin";
import { LIVE_REFRESH_MS, useKitchenStats } from "@/hooks/use-kitchen";
import { useProfile } from "@/hooks/use-profile";
import type { KitchenInventoryItem as InventoryItem } from "@/integrations/mongodb/types";
import { INVENTORY_CATEGORIES, stockStatus, type InventoryCategory, type StockStatus } from "@/lib/kitchen";
import { addInventoryItem, listInventory, updateInventoryStock } from "@/lib/kitchen.functions";
import { useLanguage } from "@/lib/i18n";
import { pageTitle } from "@/lib/brand";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: pageTitle("Live Kitchen Inventory") },
      { name: "description", content: "Surplus and donated food stock across community kitchens: grains, pulses, produce, and cooking essentials, with re-order alerts." },
      { property: "og:title", content: pageTitle("Live Kitchen Inventory") },
      { property: "og:description", content: "Track surplus food stock and re-order alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InventoryPage,
});

const STATUS_STYLE: Record<StockStatus, string> = {
  "Reorder Now": "bg-accent/15 text-accent",
  "Low Stock": "bg-amber-500/15 text-amber-700",
  "In Stock": "bg-primary/10 text-primary",
};

function InventoryPage() {
  const { user } = useProfile();
  const { isAdmin } = useIsAdmin(user?.id);
  const { reload: reloadStats } = useKitchenStats();
  const { t } = useLanguage();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});

  const STATUS_LABELS: Record<StockStatus, string> = {
    "Reorder Now": t("inventory.status.reorderNow"),
    "Low Stock": t("inventory.status.lowStock"),
    "In Stock": t("inventory.status.inStock"),
  };

  const load = useCallback(async () => {
    const data = await listInventory().catch(() => null);
    if (data) setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const insertError = await addInventoryItem({
      data: {
        category: String(form.get("category") ?? "") as InventoryCategory,
        item_name: String(form.get("item_name") ?? "").trim(),
        unit: String(form.get("unit") ?? "kg").trim() || "kg",
        current_stock: Number(form.get("current_stock") ?? 0),
        reorder_threshold: Number(form.get("reorder_threshold") ?? 0),
      },
    }).then(() => null, errorMessage);
    setSaving(false);
    if (insertError) {
      setError(insertError);
      return;
    }
    (event.target as HTMLFormElement).reset();
    setShowAdd(false);
    void reloadStats();
    await load();
  }

  async function saveStock(item: InventoryItem) {
    const draft = stockDrafts[item.id];
    if (draft == null) return;
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 0) return;
    setError(null);
    const updateError = await updateInventoryStock({ data: { id: item.id, current_stock: value } }).then(() => null, errorMessage);
    if (updateError) {
      setError(updateError);
      return;
    }
    void reloadStats();
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
        eyebrow={t("inventory.eyebrow")}
        title={<>{t("inventory.titleMain")} <span className="italic">{t("inventory.titleEmphasis")}</span></>}
        description={t("inventory.description")}
        action={
          isAdmin ? (
            <Button size="wide" onClick={() => setShowAdd((v) => !v)}>
              <Plus className="size-4" />
              {showAdd ? t("inventory.cancel") : t("inventory.addItem")}
            </Button>
          ) : undefined
        }
      />

      {reorderItems.length > 0 && (
        <section className="border-b border-border bg-accent/5 px-4 py-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-accent" />
            <h2 className="label-caps text-accent">{t("inventory.reorderAlerts")} · {reorderItems.length}</h2>
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
              <Button type="submit" disabled={saving}>{saving ? t("inventory.saving") : t("inventory.saveItem")}</Button>
            </div>
          </form>
        </section>
      )}

      {loading ? (
        <p className="p-10 text-sm text-muted-foreground">{t("inventory.loadingInventory")}</p>
      ) : items.length === 0 ? (
        <p className="p-10 text-sm text-muted-foreground">{t("inventory.noItems")}</p>
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
                        <span className={`label-caps shrink-0 rounded-sm px-2 py-1 ${STATUS_STYLE[status]}`}>{STATUS_LABELS[status]}</span>
                      </div>
                      <p className="mt-3 font-display text-3xl">
                        {item.current_stock} <span className="text-base text-muted-foreground">{item.unit}</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{t("inventory.reorderAt")} {item.reorder_threshold} {item.unit}</p>
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
                            {t("inventory.update")}
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
