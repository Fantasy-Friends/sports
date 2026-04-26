"use client";

import { useState } from "react";
import { getErrorMessage } from "@/lib/error";
import { DERBY_HORSES, DERBY_CAP, DERBY_STABLE_SIZE, type DerbyHorse } from "@/lib/events/derbyHorses";

type Props = {
  slug: string;
  existing?: { horses: string[] } | null;
  locked?: boolean;
};

const PRICE_TIERS = [45, 35, 20, 10, 5];

function groupByPrice(horses: DerbyHorse[]): Map<number, DerbyHorse[]> {
  const map = new Map<number, DerbyHorse[]>();
  for (const h of horses) {
    const list = map.get(h.price) ?? [];
    list.push(h);
    map.set(h.price, list);
  }
  return map;
}

export default function DerbySalaryCapForm({ slug, existing, locked }: Props) {
  const [selected, setSelected] = useState<string[]>(existing?.horses ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"idle" | "ok">("idle");

  const spent = selected.reduce((sum, id) => {
    const h = DERBY_HORSES.find((x) => x.id === id);
    return sum + (h?.price ?? 0);
  }, 0);
  const remaining = DERBY_CAP - spent;
  const full = selected.length >= DERBY_STABLE_SIZE;

  function toggle(horse: DerbyHorse) {
    if (locked) return;
    setSelected((prev) => {
      if (prev.includes(horse.id)) return prev.filter((id) => id !== horse.id);
      if (prev.length >= DERBY_STABLE_SIZE) return prev;
      if (horse.price > remaining) return prev;
      return [...prev, horse.id];
    });
    setSaved("idle");
    setError(null);
  }

  async function submit() {
    if (selected.length !== DERBY_STABLE_SIZE) {
      setError(`Pick exactly ${DERBY_STABLE_SIZE} horses`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${slug}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: { horses: selected } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSaved("ok");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save entry"));
    } finally {
      setSaving(false);
    }
  }

  const grouped = groupByPrice(DERBY_HORSES);

  return (
    <div className="space-y-5">
      {/* Budget bar */}
      <div className="rounded-[1.5rem] border border-border/20 bg-surface/35 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Salary Cap
          </span>
          <span className={`text-sm font-bold tabular-nums ${remaining < 0 ? "text-red-500" : "text-info"}`}>
            ${remaining} remaining
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-border/30">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${Math.min(100, (spent / DERBY_CAP) * 100)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted">
          <span>${spent} spent</span>
          <span>${DERBY_CAP} cap · pick {DERBY_STABLE_SIZE}</span>
        </div>
      </div>

      {/* Selected stable */}
      <div className="rounded-[1.5rem] border border-border/20 bg-surface/35 p-4">
        <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-muted">
          Your Stable ({selected.length}/{DERBY_STABLE_SIZE})
        </div>
        {selected.length === 0 ? (
          <p className="text-sm text-muted">No horses selected yet.</p>
        ) : (
          <div className="space-y-1">
            {selected.map((id) => {
              const h = DERBY_HORSES.find((x) => x.id === id);
              if (!h) return null;
              return (
                <div key={id} className="flex items-center justify-between rounded-xl bg-accent/10 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text">{h.name}</span>
                    {h.longshot && (
                      <span className="rounded-md bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-yellow-600 dark:text-yellow-400">
                        2x Eligible
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted">{h.odds}</span>
                    <span className="text-xs font-semibold text-info">${h.price}</span>
                    {!locked && (
                      <button onClick={() => toggle(h)} className="text-xs text-muted hover:text-red-500">
                      <button
                        onClick={() => toggle(h)}
                        className="text-xs text-muted hover:text-red-500"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Field by price tier */}
      <div className="space-y-4">
        {PRICE_TIERS.map((price) => {
          const horses = grouped.get(price);
          if (!horses) return null;
          return (
            <div key={price}>
              <div className="mb-2 text-[11px] uppercase tracking-[0.28em] text-muted">
                ${price} horses
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {horses.map((horse) => {
                  const isSelected = selected.includes(horse.id);
                  const canAfford = horse.price <= remaining;
                  const isDisabled = locked || (!isSelected && (full || !canAfford));

                  return (
                    <button
                      key={horse.id}
                      onClick={() => toggle(horse)}
                      disabled={isDisabled}
                      className={[
                        "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all",
                        isSelected
                          ? "border-accent bg-accent/10 text-text"
                          : isDisabled
                            ? "cursor-not-allowed border-border/10 bg-surface/20 opacity-40"
                            : "border-border/20 bg-surface/35 hover:border-accent/50 hover:bg-surface/60",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{horse.name}</span>
                        {horse.longshot && (
                          <span className="rounded-md bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-yellow-600 dark:text-yellow-400">
                            2x
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted">{horse.odds}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Submit */}
      {!locked && (
        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={saving || selected.length !== DERBY_STABLE_SIZE}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Stable"}
          </button>
          {saved === "ok" && <span className="text-sm text-green-500">Saved!</span>}
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      )}

      {locked && <p className="text-sm text-muted">Entries are locked.</p>}
      {locked && (
        <p className="text-sm text-muted">Entries are locked.</p>
      )}

      <p className="text-[11px] text-muted">
        2x Eligible horses (40-1 or greater) earn double points if they finish in the top 3.
      </p>
    </div>
  );
}
