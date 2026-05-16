"use client";

import AppShell from "@/components/AppShell";

export default function SoloDrinkTrackerPage() {
  return (
    <AppShell
      title="Drink Tracker · Solo"
      subtitle="Personal BAC · caffeine · hydration · substances"
    >
      <div className="overflow-hidden rounded-[1.5rem] border border-border/40 bg-[#080a0f]">
        <iframe
          src="/drink-tracker-solo.html"
          title="Drink Tracker (Solo)"
          className="block w-full"
          style={{ height: "calc(100vh - 14rem)", minHeight: "640px", border: 0 }}
        />
      </div>
    </AppShell>
  );
}
